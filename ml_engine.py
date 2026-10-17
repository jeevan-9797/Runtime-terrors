"""
Kavach-VoIP — Phase 4: Fault-Tolerant ML Engine Adapter.

Provides:
  • MLEngineManager: dynamically loads real ML models (e.g. from vishing_detector.py
    or KAVACH_MODEL_DIR), seamlessly falls back to detector_stub.VishingDetector.
  • warmup(): pre-compiles JIT and loads weights using dummy audio at startup.
  • analyze_window_safe(): runs inference inside asyncio.wait_for with a 1.2s timeout
    guardrail and automatic fallback to DSP stub if timeout or error occurs.
"""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np

from config import settings
from detector_stub import VishingDetector as StubDetector


class MLEngineManager:
    """
    Fault-tolerant manager for acoustic and semantic vishing detection.

    Attempts to dynamically bind to a production ML detector (e.g. PyTorch/ONNX/Librosa
    pipeline in vishing_detector.py). If missing, incompatible, or failing, it
    gracefully uses the DSP-based detector stub.
    """

    def __init__(self, sample_rate: int = 16_000) -> None:
        self.sample_rate = sample_rate
        self.mode: str = "dsp_stub"
        self.warmup_latency_ms: float = 0.0
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

        # 3. Instantiate detector or fallback
        if real_detector_cls is not None:
            try:
                try:
                    self._detector = real_detector_cls(sample_rate=self.sample_rate)
                except TypeError:
                    self._detector = real_detector_cls()
                self.mode = "real_ml"
                print(f"[ML Engine] Active engine mode: {self.mode}")
                return
            except Exception as exc:
                print(f"[ML Engine] Failed to instantiate real detector: {exc}")

        # Fallback
        self._detector = self._stub_detector
        self.mode = "dsp_stub"
        print(f"[ML Engine] Active engine mode: {self.mode}")

    def warmup(self) -> float:
        """
        Run a dummy 2-second 16kHz audio array through the detector.
        Pre-compiles Numba/JIT methods and caches model weights into RAM.
        """
        dummy_audio = np.zeros(int(self.sample_rate * 2.0), dtype=np.float32)
        start_t = time.perf_counter()
        try:
            self._detector.analyze_window(dummy_audio, session_id="warmup")
        except Exception as exc:
            print(f"[ML Engine] Warmup warning: {exc}")

        self.warmup_latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
        print(f"[ML Engine] Warmup completed in {self.warmup_latency_ms}ms (mode: {self.mode})")
        return self.warmup_latency_ms

    async def analyze_window_safe(
        self,
        audio_np: np.ndarray,
        session_id: str,
        timeout_sec: float = 1.2,
    ) -> Tuple[Dict[str, Any], float]:
        """
        Run inference off the event loop with strict timeout guardrail.

        Returns:
            (result_dict, processing_latency_ms)
        """
        start_t = time.perf_counter()

        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(self._detector.analyze_window, audio_np, session_id),
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
            # Run fast stub synchronously to prevent pipeline stall
            stub_res = self._stub_detector.analyze_window(audio_np, session_id)
            return stub_res, latency_ms

        except Exception as exc:
            latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
            print(
                f"[ML Engine] Inference error on session {session_id} ({exc}). "
                f"Falling back to DSP stub."
            )
            stub_res = self._stub_detector.analyze_window(audio_np, session_id)
            return stub_res, latency_ms


# Global singleton instance
ml_engine = MLEngineManager()
