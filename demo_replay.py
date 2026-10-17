"""
Kavach-VoIP — Phase 5: Demo Replay & Scenario Injector.

Supports 3 realistic threat scenarios for live judge presentations:
  1. "NORMAL_CALL": Benign bilingual conversation, organic vocal dynamics.
  2. "ELEVENLABS_DIGITAL_ARREST": Multi-stage coercion progression impersonating
     CBI/Cybercrime officers with ElevenLabs cloned voice characteristics.
  3. "FAMILY_EMERGENCY_CLONE": Distressed voice clone demanding urgent UPI bail/hospital funds.

Also includes `stream_wav_file_to_session` for slicing and streaming 16kHz .wav
audio files through CallRingBuffer and ml_engine live.
"""

from __future__ import annotations

import asyncio
import os
import random
import time
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

import numpy as np

from audio_buffer import CallRingBuffer
from ml_engine import ml_engine
from schemas import (
    AcousticMetrics,
    CompositeRisk,
    RecommendedAction,
    RiskLevel,
    ScamCategory,
    SemanticMetrics,
    TelemetryFrame,
)

# ═══════════════════════════════════════════════════════════════════════════
# Scenario Definitions
# ═══════════════════════════════════════════════════════════════════════════

SCENARIOS: Dict[str, List[Dict[str, Any]]] = {
    "NORMAL_CALL": [
        {
            "transcript": "Hello! Can you hear me clearly? Just wanted to follow up on the project proposal.",
            "synth": 0.08, "flat": 0.20, "jitter": 3.6, "breath": True, "vocoder": "none",
            "coercion": 0.03, "keywords": [], "category": ScamCategory.NONE.value,
        },
        {
            "transcript": "Yes, I went through the presentation slides. The architecture section is very clear.",
            "synth": 0.11, "flat": 0.22, "jitter": 3.4, "breath": True, "vocoder": "none",
            "coercion": 0.04, "keywords": [], "category": ScamCategory.NONE.value,
        },
        {
            "transcript": "Haan, kal team meeting 11 baje schedule kar di hai, will share the calendar invite.",
            "synth": 0.09, "flat": 0.19, "jitter": 3.8, "breath": True, "vocoder": "none",
            "coercion": 0.02, "keywords": [], "category": ScamCategory.NONE.value,
        },
        {
            "transcript": "No problem at all, I will update the ticket on Jira shortly before heading out.",
            "synth": 0.12, "flat": 0.24, "jitter": 3.2, "breath": True, "vocoder": "none",
            "coercion": 0.05, "keywords": [], "category": ScamCategory.NONE.value,
        },
        {
            "transcript": "Great, sounds good. Let's catch up over coffee before the demo session tomorrow.",
            "synth": 0.10, "flat": 0.21, "jitter": 3.5, "breath": True, "vocoder": "none",
            "coercion": 0.03, "keywords": [], "category": ScamCategory.NONE.value,
        },
    ],

    "ELEVENLABS_DIGITAL_ARREST": [
        {
            # Frame 1: Benign greeting
            "transcript": "Hello, am I speaking with the resident of this registered address?",
            "synth": 0.14, "flat": 0.22, "jitter": 3.2, "breath": True, "vocoder": "none",
            "coercion": 0.05, "keywords": [], "category": ScamCategory.NONE.value,
        },
        {
            # Frame 2: Formal escalation
            "transcript": "This call is being recorded and encrypted from Central Cyber Division headquarters.",
            "synth": 0.36, "flat": 0.30, "jitter": 2.2, "breath": True, "vocoder": "none",
            "coercion": 0.28, "keywords": ["cyber division"], "category": ScamCategory.NONE.value,
        },
        {
            # Frame 3: Authority Impersonation (Cloned Voice Engaged)
            "transcript": "I am Senior Inspector R.K. Rathore, Central Bureau of Investigation cyber division.",
            "synth": 0.84, "flat": 0.44, "jitter": 0.85, "breath": False, "vocoder": "ElevenLabs-Turbo-v2.5",
            "coercion": 0.74, "keywords": ["CBI", "inspector", "cyber division"],
            "category": ScamCategory.DIGITAL_ARREST_COERCION.value,
        },
        {
            # Frame 4: Fabricated Parcel & Customs Seizure
            "transcript": "Your Aadhaar identity has been linked to a 38 crore illegal parcel seizure containing contraband at customs.",
            "synth": 0.89, "flat": 0.48, "jitter": 0.70, "breath": False, "vocoder": "ElevenLabs-Turbo-v2.5",
            "coercion": 0.88, "keywords": ["Aadhaar", "customs", "illegal parcel", "seizure"],
            "category": ScamCategory.DIGITAL_ARREST_COERCION.value,
        },
        {
            # Frame 5: Non-bailable Digital Arrest Warrant
            "transcript": "Under Supreme Court guidelines, a non-bailable digital arrest warrant is issued against you immediately.",
            "synth": 0.92, "flat": 0.51, "jitter": 0.65, "breath": False, "vocoder": "ElevenLabs-Turbo-v2.5",
            "coercion": 0.94, "keywords": ["digital arrest", "immediately", "warrant", "non-bailable"],
            "category": ScamCategory.DIGITAL_ARREST_COERCION.value,
        },
        {
            # Frame 6: Total Isolation Threat
            "transcript": "Do not disconnect or speak to anyone. You are placed under 24-hour secret digital arrest camera surveillance.",
            "synth": 0.94, "flat": 0.52, "jitter": 0.60, "breath": False, "vocoder": "ElevenLabs-Turbo-v2.5",
            "coercion": 0.96, "keywords": ["do not disconnect", "surveillance", "digital arrest"],
            "category": ScamCategory.DIGITAL_ARREST_COERCION.value,
        },
        {
            # Frame 7+: Financial Coercion Demand
            "transcript": "Transfer the full balance immediately to the RBI safe verification account via RTGS to clear your name.",
            "synth": 0.96, "flat": 0.55, "jitter": 0.55, "breath": False, "vocoder": "ElevenLabs-Turbo-v2.5",
            "coercion": 0.98, "keywords": ["RBI", "safe verification account", "immediately", "RTGS"],
            "category": ScamCategory.DIGITAL_ARREST_COERCION.value,
        },
    ],

    "FAMILY_EMERGENCY_CLONE": [
        {
            "transcript": "Papa... please don't hang up, I am in big trouble near the highway junction!",
            "synth": 0.72, "flat": 0.38, "jitter": 1.1, "breath": False, "vocoder": "XTTS-v2-suspected",
            "coercion": 0.60, "keywords": ["emergency"], "category": ScamCategory.IMPERSONATION_GENERIC.value,
        },
        {
            "transcript": "My car had a terrible accident, a police officer has seized my phone and documents!",
            "synth": 0.85, "flat": 0.45, "jitter": 0.9, "breath": False, "vocoder": "XTTS-v2-suspected",
            "coercion": 0.78, "keywords": ["accident", "police"], "category": ScamCategory.IMPERSONATION_GENERIC.value,
        },
        {
            "transcript": "They are saying if we don't pay forty thousand rupees right now they will lock me up in the police station!",
            "synth": 0.89, "flat": 0.49, "jitter": 0.8, "breath": False, "vocoder": "XTTS-v2-suspected",
            "coercion": 0.88, "keywords": ["police station", "immediately"], "category": ScamCategory.IMPERSONATION_GENERIC.value,
        },
        {
            "transcript": "Please send thirty-five thousand rupees immediately to this hospital medical counter UPI ID!",
            "synth": 0.91, "flat": 0.52, "jitter": 0.75, "breath": False, "vocoder": "XTTS-v2-suspected",
            "coercion": 0.92, "keywords": ["UPI", "immediately", "hospital"], "category": ScamCategory.IMPERSONATION_GENERIC.value,
        },
        {
            "transcript": "Do not tell mom about the accident, her heart cannot take this shock! Transfer the UPI money immediately please!",
            "synth": 0.93, "flat": 0.53, "jitter": 0.70, "breath": False, "vocoder": "XTTS-v2-suspected",
            "coercion": 0.95, "keywords": ["UPI", "immediately", "transfer"], "category": ScamCategory.IMPERSONATION_GENERIC.value,
        },
    ],
}


def _canonical_scenario_name(scenario: str) -> str:
    """Map flexible aliases to canonical scenario keys."""
    upper = scenario.upper().strip()
    if "DIGITAL" in upper or "ARREST" in upper or "SCAM" in upper:
        return "ELEVENLABS_DIGITAL_ARREST"
    if "FAMILY" in upper or "CLONE" in upper:
        return "FAMILY_EMERGENCY_CLONE"
    return "NORMAL_CALL"


class ScenarioInjector:
    """
    Stateful injector that steps through realistic demo scenarios,
    producing calibrated TelemetryFrame objects for judge presentations.
    """

    def __init__(self, session_id: str, scenario: str = "NORMAL_CALL") -> None:
        self.session_id = session_id
        self.scenario_name = _canonical_scenario_name(scenario)
        self.step_idx = 0
        self.chunk_id = 0

    def set_scenario(self, scenario: str) -> None:
        self.scenario_name = _canonical_scenario_name(scenario)
        self.step_idx = 0

    def next_frame(self) -> TelemetryFrame:
        self.chunk_id += 1
        scenario_steps = SCENARIOS.get(self.scenario_name, SCENARIOS["NORMAL_CALL"])

        # Clamp to the last frame once the scenario reaches peak threat
        current_step = scenario_steps[min(self.step_idx, len(scenario_steps) - 1)]
        self.step_idx += 1

        # Add small natural jitter to floating values for chart realism
        jitter = random.uniform(-0.02, 0.02)
        synth_p = round(float(np.clip(current_step["synth"] + jitter, 0.0, 1.0)), 2)
        flatness = round(float(np.clip(current_step["flat"] + jitter, 0.0, 1.0)), 2)
        pitch_jitter = round(max(0.1, current_step["jitter"] + random.uniform(-0.1, 0.1)), 2)
        coercion = round(float(np.clip(current_step["coercion"] + jitter, 0.0, 1.0)), 2)

        # Composite score calculation: 0.60 * synth + 0.40 * coercion
        overall = round((0.60 * synth_p + 0.40 * coercion) * 100, 1)
        overall = max(0.0, min(overall, 100.0))

        if overall >= 75.0:
            level = RiskLevel.CRITICAL
            action = RecommendedAction.DROP_CALL_OR_ALERT
        elif overall >= 40.0:
            level = RiskLevel.HIGH
            action = RecommendedAction.WARN_USER
        else:
            level = RiskLevel.SAFE
            action = RecommendedAction.NONE

        return TelemetryFrame(
            session_id=self.session_id,
            timestamp=round(time.time(), 2),
            chunk_id=self.chunk_id,
            acoustic_metrics=AcousticMetrics(
                synthetic_probability=synth_p,
                spectral_flatness=flatness,
                pitch_jitter_hz=pitch_jitter,
                breath_detected=current_step["breath"],
                vocoder_signature=current_step["vocoder"],
            ),
            semantic_metrics=SemanticMetrics(
                transcript_delta=current_step["transcript"],
                coercion_score=coercion,
                flagged_keywords=current_step["keywords"],
                scam_category=current_step["category"],
            ),
            composite_risk=CompositeRisk(
                overall_score=overall,
                risk_level=level,
                recommended_action=action,
            ),
            processing_latency_ms=round(random.uniform(28.0, 42.0), 2),
        )


# ═══════════════════════════════════════════════════════════════════════════
# Live .wav File Streamer
# ═══════════════════════════════════════════════════════════════════════════

async def stream_wav_file_to_session(
    wav_path: str,
    session_id: str,
    target_sample_rate: int = 16_000,
    chunk_sec: float = 0.5,
) -> AsyncGenerator[TelemetryFrame, None]:
    """
    Read any .wav file from disk, slice it into 0.5s PCM-16 chunks, and stream
    it through CallRingBuffer and ml_engine live.
    """
    path = Path(wav_path)
    if not path.is_file():
        raise FileNotFoundError(f"Audio file not found: {wav_path}")

    import soundfile as sf
    data, sr = sf.read(str(path), dtype="float32")

    # Mono conversion
    if data.ndim > 1:
        data = np.mean(data, axis=1)

    # Resample to 16kHz if needed
    if sr != target_sample_rate:
        import librosa
        data = librosa.resample(data, orig_sr=sr, target_sr=target_sample_rate)

    # Pad with zeros if shorter than 2.0s window size
    min_samples = int(target_sample_rate * 2.0)
    if len(data) < min_samples:
        data = np.pad(data, (0, min_samples - len(data)))

    # Convert to 16-bit PCM bytes
    pcm16 = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16).tobytes()

    ring = CallRingBuffer(
        sample_rate=target_sample_rate,
        window_duration_sec=2.0,
        stride_duration_sec=chunk_sec,
    )

    chunk_bytes_size = int(target_sample_rate * chunk_sec) * 2
    chunk_counter = 0

    for offset in range(0, len(pcm16), chunk_bytes_size):
        chunk = pcm16[offset:offset + chunk_bytes_size]
        ring.append_pcm16_bytes(chunk)

        window = ring.pop_window_if_ready()
        if window is not None:
            chunk_counter += 1
            result, latency_ms = await ml_engine.analyze_window_safe(window, session_id)

            am = result["acoustic_metrics"]
            sm = result["semantic_metrics"]

            overall = round((0.60 * am["synthetic_probability"] + 0.40 * sm["coercion_score"]) * 100, 1)
            level = RiskLevel.CRITICAL if overall >= 75 else (RiskLevel.HIGH if overall >= 40 else RiskLevel.SAFE)
            action = RecommendedAction.DROP_CALL_OR_ALERT if overall >= 75 else (RecommendedAction.WARN_USER if overall >= 40 else RecommendedAction.NONE)

            frame = TelemetryFrame(
                session_id=session_id,
                timestamp=round(time.time(), 2),
                chunk_id=chunk_counter,
                acoustic_metrics=AcousticMetrics(**am),
                semantic_metrics=SemanticMetrics(**sm),
                composite_risk=CompositeRisk(
                    overall_score=overall,
                    risk_level=level,
                    recommended_action=action,
                ),
                processing_latency_ms=latency_ms,
            )
            yield frame
            await asyncio.sleep(chunk_sec)
