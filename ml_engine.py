"""
Kavach-VoIP — Phase 4: Real AI/ML Integration Wrapper & Fault-Tolerant Engine.

Provides:
  • MLEngineManager: dynamically loads real VishingDetector from vishing_detector.py
    (or KAVACH_MODEL_DIR), adapting signatures automatically via inspect.signature.
  • Output normalizer: guarantees exact schemas.py Pydantic compliance across different
    engine return types (tuple or dict).
  • warmup(): runs dummy 2-second 16kHz silent audio at startup so Librosa/Numba JIT compiles.
  • analyze_window_safe(): runs inference off the event loop with a 1.2s timeout guardrail
    and seamless fallback to detector_stub.py.
"""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import inspect
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Render / Cloud container optimization: enforce writable cache locations
if os.name != "nt" or "RENDER" in os.environ:
    os.environ.setdefault("HF_HOME", "/tmp/huggingface")
    os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba_cache")

import numpy as np

from config import settings
from detector_stub import VishingDetector as StubDetector
from schemas import (
    AcousticMetrics,
    ScamCategory,
    SemanticMetrics,
)


def _adapt_and_invoke(detector: Any, audio_np: np.ndarray, session_id: str) -> Any:
    """
    Inspect the exact signature of detector.analyze_window and invoke accordingly:
      - (audio_chunk, session_id) if session_id is accepted
      - (audio_chunk) otherwise
    """
    sig = inspect.signature(detector.analyze_window)
    param_names = list(sig.parameters.keys())

    if "session_id" in param_names:
        return detector.analyze_window(audio_np, session_id=session_id)
    elif len(param_names) >= 2 and param_names[1] not in ("transcript_override", "kwargs"):
        return detector.analyze_window(audio_np, session_id)
    else:
        return detector.analyze_window(audio_np)


def _normalize_detector_output(raw_output: Any, audio_np: np.ndarray) -> Dict[str, Any]:
    """
    Normalize diverse detector return structures (tuple vs dict) into exact
    validated AcousticMetrics and SemanticMetrics dictionaries.
    """
    # 1. Unpack tuple (acoustic_dict, semantic_dict) or dict
    if isinstance(raw_output, tuple) and len(raw_output) == 2:
        raw_acoustic, raw_semantic = raw_output
    elif isinstance(raw_output, dict):
        raw_acoustic = raw_output.get("acoustic_metrics", {})
        raw_semantic = raw_output.get("semantic_metrics", {})
    else:
        raw_acoustic, raw_semantic = {}, {}

    # 2. Normalize Acoustic Metrics
    # Synthetic probability: check deepfake_probability or synthetic_probability
    raw_synth = raw_acoustic.get("deepfake_probability", raw_acoustic.get("synthetic_probability", 0.08))
    try:
        synth_prob = float(np.clip(float(raw_synth), 0.0, 1.0))
    except (ValueError, TypeError):
        synth_prob = 0.08

    # Spectral flatness: check spectral_flatness_score or spectral_flatness
    raw_flatness = raw_acoustic.get("spectral_flatness_score", raw_acoustic.get("spectral_flatness", 0.25))
    try:
        spectral_flatness = float(np.clip(float(raw_flatness), 0.0, 1.0))
    except (ValueError, TypeError):
        spectral_flatness = 0.25

    # Pitch jitter (Hz)
    raw_jitter = raw_acoustic.get("pitch_jitter_hz", raw_acoustic.get("jitter", 1.5))
    try:
        pitch_jitter = max(0.0, round(float(raw_jitter), 2))
    except (ValueError, TypeError):
        pitch_jitter = 1.5

    # Breath detected
    breath = bool(raw_acoustic.get("breath_detected", raw_acoustic.get("micro_tremor_present", False)))

    # Vocoder signature
    vocoder = str(raw_acoustic.get("vocoder_signature", "none"))
    if not vocoder:
        vocoder = "none"

    norm_acoustic = {
        "synthetic_probability": round(synth_prob, 2),
        "spectral_flatness": round(spectral_flatness, 2),
        "pitch_jitter_hz": round(pitch_jitter, 2),
        "breath_detected": breath,
        "vocoder_signature": vocoder,
    }

    # 3. Normalize Semantic Metrics
    transcript = str(raw_semantic.get("transcript_delta", raw_semantic.get("transcript_chunk", "")))

    raw_coercion = raw_semantic.get("coercion_score", 0.0)
    try:
        coercion_score = float(np.clip(float(raw_coercion), 0.0, 1.0))
    except (ValueError, TypeError):
        coercion_score = 0.0

    flagged_kw = raw_semantic.get("flagged_keywords", [])
    if not isinstance(flagged_kw, list):
        flagged_kw = []
    flagged_kw = [str(k) for k in flagged_kw]

    # Map detected tactics or scam category to valid ScamCategory Enum
    raw_cat = raw_semantic.get("scam_category", "")
    tactics = raw_semantic.get("detected_tactics", [])
    if raw_cat in ScamCategory.__members__:
        category = raw_cat
    elif "AUTHORITY_IMPERSONATION" in tactics or "URGENCY_COERCION" in tactics:
        category = ScamCategory.DIGITAL_ARREST_COERCION.value
    elif "FINANCIAL_DEMAND" in tactics:
        category = ScamCategory.OTP_PHISHING.value
    elif coercion_score > 0.6:
        category = ScamCategory.DIGITAL_ARREST_COERCION.value
    else:
        category = ScamCategory.NONE.value

    norm_semantic = {
        "transcript_delta": transcript,
        "coercion_score": round(coercion_score, 2),
        "flagged_keywords": flagged_kw,
        "scam_category": category,
    }

    # Verify Pydantic compatibility
    AcousticMetrics(**norm_acoustic)
    SemanticMetrics(**norm_semantic)

    return {
        "acoustic_metrics": norm_acoustic,
        "semantic_metrics": norm_semantic,
    }


class MLEngineManager:
    """
    Fault-tolerant manager for acoustic and semantic vishing detection.

    Loads real ML model from vishing_detector.py if available, adapts signature
    and output shape, provides startup warmup, and enforces timeout guardrails.
    """

    def __init__(self, sample_rate: int = 16_000) -> None:
        self.sample_rate = sample_rate
        self.mode: str = "dsp_stub"
        self.warmup_latency_ms: float = 0.0
        self.weights_loaded: bool = False
        self.whisper_enabled: bool = False
        self._stub_detector = StubDetector(sample_rate=sample_rate)
        self._detector: Any = self._stub_detector

        self._init_engine()

    def _init_engine(self) -> None:
        """Attempt to load real ML detector; fallback to DSP stub on failure."""
        real_detector_cls = None

        # 1. Attempt standard module import (vishing_detector.py in workspace)
        try:
            import vishing_detector  # type: ignore
            if hasattr(vishing_detector, "VishingDetector"):
                real_detector_cls = getattr(vishing_detector, "VishingDetector")
                print("[ML Engine] Found vishing_detector module in workspace.")
        except ImportError:
            pass
        except Exception as exc:
            print(f"[ML Engine] Error loading vishing_detector module: {exc}")

        # 2. Attempt loading from KAVACH_MODEL_DIR if configured and not yet found
        if real_detector_cls is None and settings.MODEL_DIR:
            model_dir = Path(settings.MODEL_DIR)
            candidate_file = model_dir / "vishing_detector.py"
            if candidate_file.is_file():
                try:
                    spec = importlib.util.spec_from_file_location(
                        "vishing_detector_external", candidate_file
                    )
                    if spec and spec.loader:
                        ext_module = importlib.util.module_from_spec(spec)
                        sys.modules["vishing_detector_external"] = ext_module
                        spec.loader.exec_module(ext_module)
                        if hasattr(ext_module, "VishingDetector"):
                            real_detector_cls = getattr(ext_module, "VishingDetector")
                            print(f"[ML Engine] Loaded vishing_detector from {candidate_file}")
                except Exception as exc:
                    print(f"[ML Engine] Error loading from {candidate_file}: {exc}")

        # 3. Instantiate detector with model weights and faster-whisper if present
        if real_detector_cls is not None:
            # Check candidate model paths
            model_path = None
            for cand in ["deepfake_audio.pkl", "models/deepfake_audio.pkl"]:
                if os.path.isfile(cand):
                    model_path = cand
                    break
            if not model_path and settings.MODEL_DIR:
                cand_dir = Path(settings.MODEL_DIR) / "deepfake_audio.pkl"
                if cand_dir.is_file():
                    model_path = str(cand_dir)

            try:
                # In cloud/Render containers (or when WHISPER_THREADS is set), limit threads to 2
                is_cloud = bool(os.getenv("RENDER") or os.getenv("PORT") or os.name != "nt")
                default_threads = 2 if is_cloud else min(4, os.cpu_count() or 2)
                threads = int(os.getenv("WHISPER_THREADS", str(default_threads)))

                try:
                    self._detector = real_detector_cls(
                        model_path=model_path,
                        use_whisper=True,
                        cpu_threads=threads,
                    )
                except TypeError:
                    try:
                        self._detector = real_detector_cls(
                            model_path=model_path,
                            use_whisper=True,
                        )
                    except TypeError:
                        try:
                            self._detector = real_detector_cls(sample_rate=self.sample_rate)
                        except TypeError:
                            self._detector = real_detector_cls()

                self.mode = "real_ml"
                self.weights_loaded = getattr(self._detector, "clf", None) is not None
                self.whisper_enabled = getattr(self._detector, "whisper", None) is not None

                print(
                    f"[ML Engine] Active engine mode: {self.mode} "
                    f"(weights_loaded: {self.weights_loaded}, whisper_enabled: {self.whisper_enabled}, threads: {threads})"
                )
                return
            except Exception as exc:
                print(f"[ML Engine] Failed to instantiate real detector: {exc}")

        # Fallback
        self._detector = self._stub_detector
        self.mode = "dsp_stub"
        self.weights_loaded = False
        self.whisper_enabled = False
        print(f"[ML Engine] Active engine mode: {self.mode}")

    def warmup(self) -> float:
        """
        Run a dummy 2-second 16kHz silent audio array through the detector.
        Pre-compiles Librosa/Numba JIT methods and caches model weights into RAM,
        then triggers gc.collect() to minimize container memory footprint.
        """
        dummy_audio = np.zeros(int(self.sample_rate * 2.0), dtype=np.float32)
        start_t = time.perf_counter()
        try:
            raw = _adapt_and_invoke(self._detector, dummy_audio, session_id="warmup")
            _normalize_detector_output(raw, dummy_audio)
        except Exception as exc:
            print(f"[ML Engine] Warmup warning: {exc}")

        self.warmup_latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
        import gc
        gc.collect()
        print(
            f"[ML Engine] Warmup completed in {self.warmup_latency_ms}ms "
            f"(mode: {self.mode}), RAM freed with gc.collect()"
        )
        return self.warmup_latency_ms

    async def analyze_window_safe(
        self,
        audio_np: np.ndarray,
        session_id: str,
        timeout_sec: float = 3.0,
    ) -> Tuple[Dict[str, Any], float]:
        """
        Run inference off the event loop with strict timeout guardrail (default 2.5s
        to accommodate Faster-Whisper CPU transcription).
        Adapts signature, validates outputs against Pydantic schema,
        and falls back to DSP stub if timeout or error occurs.

        Returns:
            (result_dict, processing_latency_ms)
        """
        start_t = time.perf_counter()

        def _run_inference() -> Dict[str, Any]:
            raw = _adapt_and_invoke(self._detector, audio_np, session_id)
            return _normalize_detector_output(raw, audio_np)

        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(_run_inference),
                timeout=timeout_sec,
            )
            latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
            return result, latency_ms

        except asyncio.TimeoutError:
            latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
            print(
                f"[ML Engine] Timeout ({timeout_sec}s exceeded, took {latency_ms}ms) "
                f"on session {session_id}. Falling back to DSP stub."
            )
            raw_stub = self._stub_detector.analyze_window(audio_np, session_id)
            stub_res = _normalize_detector_output(raw_stub, audio_np)
            return stub_res, latency_ms

        except Exception as exc:
            latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
            print(
                f"[ML Engine] Inference error on session {session_id} ({exc}). "
                f"Falling back to DSP stub."
            )
            raw_stub = self._stub_detector.analyze_window(audio_np, session_id)
            stub_res = _normalize_detector_output(raw_stub, audio_np)
            return stub_res, latency_ms


# Global singleton instance
ml_engine = MLEngineManager()
