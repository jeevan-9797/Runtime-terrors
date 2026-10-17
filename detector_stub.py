"""
Kavach-VoIP — Mock ML detector stub (Phase 2).

Computes **real** acoustic features from the raw audio window:
  • RMS energy            → maps to ``synthetic_probability``
  • Zero-crossing rate    → maps to ``pitch_jitter_hz``
  • Spectral flatness     → used directly (geometric / arithmetic mean of
                            magnitude spectrum — Wiener entropy)

Semantic metrics (transcript, coercion, keywords) remain mocked until the
NLP pipeline is integrated in a later phase.

The public entry point is ``analyze_window()``, which returns a ``dict``
matching the ``TelemetryFrame`` sub-model shapes so the caller can build
a validated Pydantic object with zero transformation.
"""

from __future__ import annotations

import random
import time
from typing import Any, Dict, List

import numpy as np


# ── Phrase / keyword banks (shared with the old mock engine) ──────────────

_SCAM_PHRASES: list[str] = [
    "this is the Central Bureau of Investigation calling",
    "your Aadhaar has been linked to a money-laundering case",
    "transfer the amount to the RBI safe verification account immediately",
    "if you do not comply within one hour you will be arrested",
    "do not tell anyone about this call, it is a matter of national security",
    "share your OTP for verification purposes only",
    "your KYC is expiring today, update it now or your account will be frozen",
    "a parcel in your name has been seized at customs containing illegal items",
]

_SAFE_PHRASES: list[str] = [
    "hi, just checking in about our meeting tomorrow",
    "could you share the project timeline when you get a chance?",
    "the quarterly report looks great, nice work",
    "let me know a good time for the team standup",
    "I'll send the documents over email later today",
    "thanks for the update, talk soon",
]

_VOCODER_LABELS: list[str] = [
    "ElevenLabs-v2-suspected",
    "VALL-E-suspected",
    "Bark-suspected",
    "XTTS-v2-suspected",
    "RVC-suspected",
]

_SCAM_KEYWORDS_POOL: list[str] = [
    "RBI", "CBI", "arrest", "immediately", "verification account",
    "OTP", "Aadhaar", "KYC", "customs", "national security",
    "freeze", "money laundering", "parcel", "seized", "comply",
]

_SCAM_CATEGORIES: list[str] = [
    "DIGITAL_ARREST_COERCION",
    "OTP_PHISHING",
    "KYC_EXPIRY_FRAUD",
    "PARCEL_CUSTOMS_SCAM",
]


# ── DSP helpers ───────────────────────────────────────────────────────────

def _rms_energy(audio: np.ndarray) -> float:
    """Root-mean-square energy of the signal."""
    return float(np.sqrt(np.mean(audio ** 2)))


def _zero_crossing_rate(audio: np.ndarray) -> float:
    """Fraction of successive samples that cross zero."""
    signs = np.sign(audio)
    crossings = np.sum(np.abs(np.diff(signs)) > 0)
    return float(crossings / max(len(audio) - 1, 1))


def _spectral_flatness(audio: np.ndarray) -> float:
    """
    Wiener entropy: geometric mean / arithmetic mean of the power spectrum.

    Returns a value in [0, 1].  Values near 1 indicate noise-like signals;
    values near 0 indicate tonal / harmonic signals.
    """
    magnitude = np.abs(np.fft.rfft(audio))
    # Avoid log(0) by adding a tiny floor.
    magnitude = np.maximum(magnitude, 1e-10)

    log_mean = np.mean(np.log(magnitude))
    geometric_mean = np.exp(log_mean)
    arithmetic_mean = np.mean(magnitude)

    if arithmetic_mean < 1e-10:
        return 0.0
    return float(np.clip(geometric_mean / arithmetic_mean, 0.0, 1.0))


# ── Detector class ────────────────────────────────────────────────────────

class VishingDetector:
    """
    Stub detector that blends **real** audio features with **mock** semantic
    outputs.

    This class is intentionally stateless per-call so it is safe to share
    across sessions or run inside ``asyncio.to_thread()``.

    Parameters
    ----------
    sample_rate : int
        Sample rate of the incoming audio (default 16 000 Hz).
    """

    def __init__(self, sample_rate: int = 16_000) -> None:
        self.sample_rate = sample_rate

    def analyze_window(
        self,
        audio_np: np.ndarray,
        session_id: str,
    ) -> Dict[str, Any]:
        """
        Analyse a single audio window and return a dict that maps 1-to-1
        onto the ``TelemetryFrame`` sub-models.

        Parameters
        ----------
        audio_np : np.ndarray
            Float32 audio in [-1.0, 1.0], shape ``(window_size,)``.
        session_id : str
            The call session identifier (passed through to output).

        Returns
        -------
        dict
            Keys: ``acoustic_metrics``, ``semantic_metrics``.
            The caller is responsible for building ``composite_risk``.
        """

        # ── Real acoustic features ────────────────────────────────────
        rms = _rms_energy(audio_np)
        zcr = _zero_crossing_rate(audio_np)
        spec_flat = _spectral_flatness(audio_np)

        # Map RMS → synthetic_probability heuristic:
        #   Very quiet or perfectly constant signals are suspicious.
        #   Normal speech RMS ~0.01-0.15 at 16-bit normalised scale.
        if rms < 0.005:
            # Near-silence or DC offset — suspicious (possibly injected)
            synth_prob = random.uniform(0.55, 0.75)
        elif rms > 0.25:
            # Clipping / abnormally loud — slightly suspicious
            synth_prob = random.uniform(0.30, 0.50)
        else:
            # Normal speech range — low suspicion
            synth_prob = random.uniform(0.03, 0.18)

        # Map ZCR → pitch_jitter_hz heuristic:
        #   Human speech ZCR ~0.04-0.12.  TTS tends to be very stable.
        pitch_jitter = zcr * self.sample_rate * random.uniform(0.008, 0.015)
        pitch_jitter = max(0.3, min(pitch_jitter, 8.0))  # clamp

        # Breath detection heuristic: short low-energy segments in real speech
        breath_detected = rms > 0.005 and random.random() < 0.65

        # Vocoder signature: flag if spectral flatness is high AND rms is low
        if spec_flat > 0.45 and rms < 0.02:
            vocoder_sig = random.choice(_VOCODER_LABELS)
        else:
            vocoder_sig = "none"

        acoustic = {
            "synthetic_probability": round(float(np.clip(synth_prob, 0.0, 1.0)), 2),
            "spectral_flatness": round(spec_flat, 2),
            "pitch_jitter_hz": round(pitch_jitter, 2),
            "breath_detected": breath_detected,
            "vocoder_signature": vocoder_sig,
        }

        # ── Mock semantic features (until NLP pipeline lands) ─────────
        # Randomly pick safe vs. scam so the frontend always has data.
        is_scam_mock = random.random() < 0.35  # 35 % chance of scam text

        if is_scam_mock:
            transcript = random.choice(_SCAM_PHRASES)
            coercion = random.uniform(0.60, 0.95)
            keywords = random.sample(
                _SCAM_KEYWORDS_POOL, k=random.randint(2, 5)
            )
            category = random.choice(_SCAM_CATEGORIES)
        else:
            transcript = random.choice(_SAFE_PHRASES)
            coercion = random.uniform(0.01, 0.12)
            keywords: List[str] = []
            category = "NONE"

        semantic = {
            "transcript_delta": transcript,
            "coercion_score": round(coercion, 2),
            "flagged_keywords": keywords,
            "scam_category": category,
        }

        return {
            "acoustic_metrics": acoustic,
            "semantic_metrics": semantic,
        }
