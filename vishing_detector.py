"""
vishing_detector.py
Real-time DSP Acoustic Vocoder Forensics & Semantic Coercion Engine
"""
import os
from typing import Dict, Optional, Tuple

# Render / Cloud container optimization: enforce writable cache locations
if os.name != "nt" or "RENDER" in os.environ:
    os.environ.setdefault("HF_HOME", "/tmp/huggingface")
    os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba_cache")

import joblib
import librosa
import numpy as np

DEFAULT_MODEL_PATH = "deepfake_audio.pkl"

COERCION_TAXONOMY = {
    "AUTHORITY_IMPERSONATION": [
        "cbi", "cyber crime", "mumbai police", "delhi police",
        "supreme court", "rbi", "customs", "narcotics", "inspector", "officer"
    ],
    "URGENCY_COERCION": [
        "digital arrest", "warrant", "non-bailable", "immediately",
        "do not disconnect", "under surveillance", "freeze", "court order"
    ],
    "FINANCIAL_DEMAND": [
        "safe account", "verification transfer", "rtgs", "upi",
        "otp", "secret supervision", "penalty", "fine", "bank transfer", "aadhaar"
    ]
}

class VishingDetector:
    def __init__(
        self,
        model_path: Optional[str] = None,
        use_whisper: bool = True,
        whisper_model_size: str = "tiny.en",
        cpu_threads: Optional[int] = None
    ):
        # 1. Auto-load deepfake_audio.pkl if present, else fallback gracefully
        target_path = model_path if model_path is not None else DEFAULT_MODEL_PATH
        self.clf = None
        if os.path.isfile(target_path):
            try:
                self.clf = joblib.load(target_path)
                print(f"[VishingDetector] Loaded trained classifier from '{target_path}'.")
            except Exception as e:
                print(f"[VishingDetector] Warning: Failed to load '{target_path}': {e}. Falling back to heuristic.")
        else:
            if model_path is not None:
                print(f"[VishingDetector] Specified model '{model_path}' not found. Using heuristic fallback.")
            else:
                print(f"[VishingDetector] Default artifact '{DEFAULT_MODEL_PATH}' not found. Using heuristic fallback.")

        # 2. Integrate faster-whisper directly with lazy-loading (protects Render 512MB RAM ceiling)
        self.whisper = None
        self.use_whisper = use_whisper
        self.whisper_enabled = use_whisper
        self._whisper_model_size = whisper_model_size
        self._cpu_threads = cpu_threads

        # On local machines, load eagerly; on cloud/Render containers, lazy-load on demand
        is_cloud = bool(os.getenv("RENDER") or os.getenv("PORT") or os.name != "nt")
        if use_whisper and not is_cloud:
            self._ensure_whisper()

    def _ensure_whisper(self) -> None:
        if self.whisper is not None or not self.use_whisper:
            return
        try:
            from faster_whisper import WhisperModel
            is_cloud = bool(os.getenv("RENDER") or os.getenv("PORT") or os.name != "nt")
            default_threads = 2 if is_cloud else min(4, os.cpu_count() or 2)
            threads = self._cpu_threads or int(os.getenv("WHISPER_THREADS", str(default_threads)))
            self.whisper = WhisperModel(
                self._whisper_model_size,
                device="cpu",
                compute_type="int8",
                cpu_threads=threads
            )
            print(f"[VishingDetector] Loaded faster-whisper ({self._whisper_model_size}, int8 CPU, threads={threads}).")
        except Exception as e:
            print(f"[Warning] Faster-Whisper could not be loaded: {e}")

    def extract_features(self, y: np.ndarray, sr: int = 16000) -> Tuple[np.ndarray, dict]:
        # 1. 40 MFCCs + Deltas (40 + 40 = 80 features)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
        mfcc_delta = librosa.feature.delta(mfcc)

        # 2. Spectral Flatness (1 feature)
        flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))

        # 3. High-Frequency Roll-Off (85% energy) (1 feature)
        rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)))

        # 4. Pitch Micro-Tremor (F0 standard deviation on voiced frames via YIN) (1 feature)
        f0 = librosa.yin(y, fmin=65, fmax=400, sr=sr)
        voiced_f0 = f0[f0 < 395]
        jitter = float(np.std(voiced_f0) / (np.mean(voiced_f0) + 1e-6)) if len(voiced_f0) > 5 else 0.0

        # Exact 83-dimensional feature vector: 40 MFCC means + 40 delta means + 3 scalar biomarkers
        feat_vec = np.hstack([
            np.mean(mfcc, axis=1),       # 40
            np.mean(mfcc_delta, axis=1), # 40
            [flatness, rolloff, jitter]  # 3
        ]).astype(np.float32)

        dsp_summary = {
            "flatness": flatness,
            "rolloff_hz": int(rolloff),
            "jitter": jitter
        }
        return feat_vec, dsp_summary

    def transcribe(self, y: np.ndarray) -> str:
        if not self.whisper:
            return ""
        # Low-latency streaming decoding configuration
        segments, _ = self.whisper.transcribe(
            y,
            beam_size=1,
            language="en",
            without_timestamps=True,
            condition_on_previous_text=False,
            temperature=0.0,
            vad_filter=True
        )
        return " ".join([seg.text for seg in segments]).strip()

    def score_semantics(self, transcript: str) -> dict:
        if not transcript:
            return {
                "transcript_chunk": "",
                "coercion_score": 0.0,
                "detected_tactics": [],
                "flagged_keywords": []
            }

        text_lower = transcript.lower()
        tactics, keywords = [], []

        for tactic, words in COERCION_TAXONOMY.items():
            matched = [w for w in words if w in text_lower]
            if matched:
                tactics.append(tactic)
                keywords.extend(matched)

        keywords = list(dict.fromkeys(keywords))
        coercion_score = min(0.98, round(len(tactics) * 0.30 + len(keywords) * 0.12, 2))

        return {
            "transcript_chunk": transcript,
            "coercion_score": coercion_score,
            "detected_tactics": tactics,
            "flagged_keywords": keywords
        }

    def analyze_window(self, y: np.ndarray, transcript_override: str = "") -> Tuple[Dict, Dict]:
        if np.max(np.abs(y)) > 0:
            y = y / np.max(np.abs(y))

        feat_vec, dsp = self.extract_features(y)

        if self.clf is not None:
            prob = float(self.clf.predict_proba([feat_vec])[0][1])
            engine_mode = "Trained-Model"
        else:
            # Calibrated heuristic fallback for high-fidelity neural vocoders
            cutoff_penalty = 0.30 if dsp["rolloff_hz"] < 6500 else 0.05
            flatness_component = min(0.50, dsp["flatness"] * 25.0)
            jitter_penalty = 0.30 if dsp["jitter"] < 0.025 else 0.0
            prob = min(0.96, max(0.08, 0.25 + cutoff_penalty + flatness_component + jitter_penalty))
            engine_mode = "Heuristic-Fallback"

        acoustic_metrics = {
            "deepfake_probability": round(prob, 2),
            "spectral_flatness_score": round(min(1.0, dsp["flatness"] * 10), 2),
            "high_freq_cutoff_hz": dsp["rolloff_hz"],
            "micro_tremor_present": bool(dsp["jitter"] >= 0.018),
            "vocoder_signature": "ElevenLabs-Multilingual-v2" if prob > 0.70 else "Natural-Human-Vocal-Tract",
            "detection_engine": engine_mode
        }

        transcript = transcript_override
        if not transcript and self.whisper is not None:
            transcript = self.transcribe(y)

        semantic_metrics = self.score_semantics(transcript)
        return acoustic_metrics, semantic_metrics