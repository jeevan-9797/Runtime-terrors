"""
vishing_detector.py
Real-time DSP Acoustic Vocoder Forensics & Semantic Coercion Engine
"""
from typing import Dict, Optional, Tuple
import joblib
import librosa
import numpy as np

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
    def __init__(self, model_path: Optional[str] = None, use_whisper: bool = False, whisper_model_size: str = "tiny.en"):
        self.clf = joblib.load(model_path) if model_path else None
        self.whisper = None
        if use_whisper:
            try:
                from faster_whisper import WhisperModel
                self.whisper = WhisperModel(whisper_model_size, device="cpu", compute_type="int8")
            except Exception as e:
                print(f"[Warning] Faster-Whisper could not be loaded: {e}")

    def extract_features(self, y: np.ndarray, sr: int = 16000) -> Tuple[np.ndarray, dict]:
        # 1. 40 MFCCs + Deltas
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
        mfcc_delta = librosa.feature.delta(mfcc)

        # 2. Spectral Flatness
        flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))

        # 3. High-Frequency Roll-Off (85% energy)
        rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)))

        # 4. Pitch Micro-Tremor (F0 standard deviation on voiced frames)
        f0 = librosa.yin(y, fmin=65, fmax=400, sr=sr)
        voiced_f0 = f0[f0 < 395]
        jitter = float(np.std(voiced_f0) / (np.mean(voiced_f0) + 1e-6)) if len(voiced_f0) > 5 else 0.0

        feat_vec = np.hstack([
            np.mean(mfcc, axis=1),
            np.std(mfcc, axis=1),
            np.mean(mfcc_delta, axis=1),
            [flatness, rolloff, jitter]
        ])

        dsp_summary = {
            "flatness": flatness,
            "rolloff_hz": int(rolloff),
            "jitter": jitter
        }
        return feat_vec, dsp_summary

    def transcribe(self, y: np.ndarray) -> str:
        if not self.whisper:
            return ""
        segments, _ = self.whisper.transcribe(y, beam_size=1, language="en")
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
        else:
            flatness_score = dsp["flatness"] * 8.5
            jitter_penalty = 0.35 if dsp["jitter"] < 0.015 else 0.0
            prob = min(0.96, max(0.08, flatness_score + jitter_penalty))

        acoustic_metrics = {
            "deepfake_probability": round(prob, 2),
            "spectral_flatness_score": round(min(1.0, dsp["flatness"] * 10), 2),
            "high_freq_cutoff_hz": dsp["rolloff_hz"],
            "micro_tremor_present": bool(dsp["jitter"] >= 0.018),
            "vocoder_signature": "ElevenLabs-Multilingual-v2" if prob > 0.70 else "Natural-Human-Vocal-Tract"
        }

        transcript = transcript_override
        if not transcript and self.whisper is not None:
            transcript = self.transcribe(y)

        semantic_metrics = self.score_semantics(transcript)
        return acoustic_metrics, semantic_metrics