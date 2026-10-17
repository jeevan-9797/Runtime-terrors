"""
Kavach-VoIP — Phase 2 FastAPI backend.

Provides:
  GET  /health                         → server status + active WS count
  WS   /ws/call-stream/{session_id}    → real-time audio analysis stream

The WebSocket accepts:
  • **binary frames** (raw 16-bit LE PCM) → fed into ``CallRingBuffer``;
    every 0.5 s of new audio triggers ``VishingDetector.analyze_window()``
    off the event loop via ``asyncio.to_thread()``.
  • **text frames** (JSON commands) → ``SIMULATE_SAFE`` / ``SIMULATE_SCAM``
    switch the fallback mock telemetry engine.

When real audio is flowing, telemetry is driven by the detector pipeline.
When no audio arrives, the Phase 1 mock engine emits synthetic frames every
500 ms so the frontend never stalls.
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from contextlib import asynccontextmanager
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from audio_buffer import CallRingBuffer
from config import settings
from detector_stub import VishingDetector
from schemas import (
    AcousticMetrics,
    CompositeRisk,
    InboundCommand,
    RecommendedAction,
    RiskLevel,
    ScamCategory,
    SemanticMetrics,
    TelemetryFrame,
)

# ═══════════════════════════════════════════════════════════════════════════
# Application state
# ═══════════════════════════════════════════════════════════════════════════

_active_sessions: Set[str] = set()

# Single shared detector instance (stateless per-call, thread-safe).
_detector = VishingDetector(sample_rate=16_000)


# ═══════════════════════════════════════════════════════════════════════════
# Composite risk computation
# ═══════════════════════════════════════════════════════════════════════════

def _compute_composite_risk(
    synthetic_probability: float,
    coercion_score: float,
) -> CompositeRisk:
    """
    Fuse acoustic + semantic scores into a single composite risk assessment.

    Formula:
        overall_score = round((0.60 * synthetic_probability
                             + 0.40 * coercion_score) * 100, 1)

    Thresholds:
        < 40   → SAFE    / NONE
        40-74  → WARNING / WARN_USER
        >= 75  → CRITICAL / DROP_CALL_OR_ALERT
    """
    overall = round(
        (0.60 * synthetic_probability + 0.40 * coercion_score) * 100, 1
    )
    # Clamp to [0, 100]
    overall = max(0.0, min(overall, 100.0))

    if overall >= 75:
        level = RiskLevel.CRITICAL
        action = RecommendedAction.DROP_CALL_OR_ALERT
    elif overall >= 40:
        level = RiskLevel.HIGH
        action = RecommendedAction.WARN_USER
    else:
        level = RiskLevel.SAFE
        action = RecommendedAction.NONE

    return CompositeRisk(
        overall_score=overall,
        risk_level=level,
        recommended_action=action,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Lifespan (startup / shutdown hooks)
# ═══════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def _lifespan(app: FastAPI):
    print("Kavach-VoIP backend starting (Phase 2) ...")
    yield
    print("Kavach-VoIP backend shutting down ...")


# ═══════════════════════════════════════════════════════════════════════════
# FastAPI application
# ═══════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Kavach-VoIP",
    description="Real-time Deepfake Voice & Vishing Call Firewall — Phase 2",
    version="0.2.0",
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════════════════
# REST endpoints
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "kavach-voip",
        "version": app.version,
        "active_sessions": len(_active_sessions),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Phase 1 Mock Telemetry Engine  (kept as simulation fallback)
# ═══════════════════════════════════════════════════════════════════════════

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


class _MockTelemetryEngine:
    """
    EMA-smoothed mock telemetry (Phase 1 fallback).

    Used when:
      • No binary audio is flowing (pure simulation mode).
      • ``SIMULATE_SAFE`` / ``SIMULATE_SCAM`` text commands are sent.
    """

    _ALPHA = 0.25

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.chunk_id = 0
        self.mode: str = "safe"

        self._synth_prob = 0.08
        self._spectral_flat = 0.25
        self._pitch_jitter = 3.5
        self._coercion = 0.05

    def set_mode(self, mode: str) -> None:
        self.mode = mode

    def next_frame(self) -> TelemetryFrame:
        self.chunk_id += 1

        if self.mode == "scam":
            t_synth = random.uniform(0.78, 0.96)
            t_flat = random.uniform(0.35, 0.55)
            t_jitter = random.uniform(0.4, 1.6)
            t_coercion = random.uniform(0.80, 0.98)
            breath = random.random() < 0.10
            vocoder = random.choice(_VOCODER_LABELS)
            transcript = random.choice(_SCAM_PHRASES)
            keywords = random.sample(
                _SCAM_KEYWORDS_POOL, k=random.randint(2, 5)
            )
            category = random.choice([
                ScamCategory.DIGITAL_ARREST_COERCION,
                ScamCategory.OTP_PHISHING,
                ScamCategory.KYC_EXPIRY_FRAUD,
                ScamCategory.PARCEL_CUSTOMS_SCAM,
            ])
        else:
            t_synth = random.uniform(0.02, 0.15)
            t_flat = random.uniform(0.15, 0.30)
            t_jitter = random.uniform(2.5, 5.0)
            t_coercion = random.uniform(0.01, 0.10)
            breath = random.random() < 0.75
            vocoder = "none"
            transcript = random.choice(_SAFE_PHRASES)
            keywords = []
            category = ScamCategory.NONE

        a = self._ALPHA
        self._synth_prob = a * t_synth + (1 - a) * self._synth_prob
        self._spectral_flat = a * t_flat + (1 - a) * self._spectral_flat
        self._pitch_jitter = a * t_jitter + (1 - a) * self._pitch_jitter
        self._coercion = a * t_coercion + (1 - a) * self._coercion

        synth_p = round(self._synth_prob, 2)
        coerce_s = round(self._coercion, 2)
        risk = _compute_composite_risk(synth_p, coerce_s)

        return TelemetryFrame(
            session_id=self.session_id,
            timestamp=round(time.time(), 2),
            chunk_id=self.chunk_id,
            acoustic_metrics=AcousticMetrics(
                synthetic_probability=synth_p,
                spectral_flatness=round(self._spectral_flat, 2),
                pitch_jitter_hz=round(self._pitch_jitter, 2),
                breath_detected=breath,
                vocoder_signature=vocoder,
            ),
            semantic_metrics=SemanticMetrics(
                transcript_delta=transcript,
                coercion_score=coerce_s,
                flagged_keywords=keywords,
                scam_category=category,
            ),
            composite_risk=risk,
        )


# ═══════════════════════════════════════════════════════════════════════════
# WebSocket endpoint
# ═══════════════════════════════════════════════════════════════════════════

@app.websocket("/ws/call-stream/{session_id}")
async def call_stream(websocket: WebSocket, session_id: str):
    """
    Bi-directional call-analysis stream.

    **Inbound** (client -> server):
      Binary frame  -> raw PCM-16 LE audio → ring buffer → detector
      Text frame    -> JSON command (SIMULATE_SAFE / SIMULATE_SCAM)

    **Outbound** (server -> client):
      JSON ``TelemetryFrame`` driven by real audio analysis OR the mock
      engine fallback (~500 ms cadence).
    """
    await websocket.accept()
    _active_sessions.add(session_id)

    # Per-session state.
    ring = CallRingBuffer(
        sample_rate=16_000,
        window_duration_sec=2.0,
        stride_duration_sec=0.5,
    )
    mock_engine = _MockTelemetryEngine(session_id)
    chunk_id = 0                    # shared counter across both paths
    audio_active = False            # True once first binary frame arrives

    print(f"[+] Session connected: {session_id}")

    # ── Background: mock-engine fallback loop ─────────────────────────
    async def _mock_fallback_loop():
        """
        Emit mock telemetry every 500 ms while no real audio is flowing.
        Automatically pauses when ``audio_active`` is set.
        """
        nonlocal chunk_id
        try:
            while True:
                if not audio_active:
                    chunk_id += 1
                    mock_engine.chunk_id = chunk_id
                    frame = mock_engine.next_frame()
                    await websocket.send_text(frame.model_dump_json())
                await asyncio.sleep(settings.TELEMETRY_INTERVAL_SEC)
        except asyncio.CancelledError:
            pass

    fallback_task = asyncio.create_task(_mock_fallback_loop())

    try:
        while True:
            message = await websocket.receive()

            # ── Binary: real PCM audio ────────────────────────────────
            if "bytes" in message and message["bytes"]:
                raw: bytes = message["bytes"]
                audio_active = True

                ring.append_pcm16_bytes(raw)

                # Check if the stride boundary was crossed.
                window = ring.pop_window_if_ready()
                if window is not None:
                    # Run the (potentially heavy) detector off the event loop.
                    result = await asyncio.to_thread(
                        _detector.analyze_window, window, session_id
                    )

                    chunk_id += 1

                    # Unpack detector output.
                    am = result["acoustic_metrics"]
                    sm = result["semantic_metrics"]

                    risk = _compute_composite_risk(
                        am["synthetic_probability"],
                        sm["coercion_score"],
                    )

                    frame = TelemetryFrame(
                        session_id=session_id,
                        timestamp=round(time.time(), 2),
                        chunk_id=chunk_id,
                        acoustic_metrics=AcousticMetrics(**am),
                        semantic_metrics=SemanticMetrics(**sm),
                        composite_risk=risk,
                    )
                    await websocket.send_text(frame.model_dump_json())

            # ── Text: JSON command ────────────────────────────────────
            elif "text" in message and message["text"]:
                try:
                    cmd = InboundCommand.model_validate_json(message["text"])
                except Exception:
                    await websocket.send_text(
                        json.dumps({"error": "Invalid command JSON."})
                    )
                    continue

                if cmd.command == "SIMULATE_SCAM":
                    audio_active = False
                    mock_engine.set_mode("scam")
                elif cmd.command == "SIMULATE_SAFE":
                    audio_active = False
                    mock_engine.set_mode("safe")
                else:
                    await websocket.send_text(
                        json.dumps(
                            {"error": f"Unknown command: {cmd.command}"}
                        )
                    )

    except WebSocketDisconnect:
        pass
    finally:
        fallback_task.cancel()
        _active_sessions.discard(session_id)
        ring.reset()
        print(f"[-] Session disconnected: {session_id}")


# ═══════════════════════════════════════════════════════════════════════════
# Entrypoint
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
