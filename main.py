"""
Kavach-VoIP — Phase 3 FastAPI backend.

Provides:
  GET   /health                              → server status + DB mode
  GET   /api/sessions                        → recent call sessions
  GET   /api/sessions/{session_id}/alerts    → full session detail + alerts
  POST  /api/sessions/{session_id}/quarantine→ SOC kill-switch
  WS    /ws/call-stream/{session_id}         → real-time audio analysis stream

Phase 3 additions:
  • Supabase persistence with automatic in-memory fallback.
  • Non-blocking DB logging via asyncio.create_task(asyncio.to_thread(...)).
  • Autonomous BLOCK_RTP_STREAM at overall_score >= 85.
  • SOC quarantine endpoint that pushes CALL_TERMINATED to the live WebSocket.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import time
from contextlib import asynccontextmanager
from typing import Dict, Set

# Render / Cloud container optimization: enforce writable cache locations
if os.name != "nt" or "RENDER" in os.environ:
    os.environ.setdefault("HF_HOME", "/tmp/huggingface")
    os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba_cache")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from audio_buffer import CallRingBuffer
from config import settings
import database as db
from demo_replay import ScenarioInjector
from ml_engine import ml_engine
from pydantic import BaseModel
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

# Map session_id → live WebSocket so the quarantine endpoint can push events.
_live_sockets: Dict[str, WebSocket] = {}

# Map session_id → active scenario injector for demo control.
_scenario_injectors: Dict[str, ScenarioInjector] = {}

# Map session_id → active CallRingBuffer
_session_rings: Dict[str, CallRingBuffer] = {}

# Map session_id → active WAV playback Task
_wav_playback_tasks: Dict[str, asyncio.Task] = {}

# Map session_id → bool indicating if audio or WAV playback is currently active
_session_audio_active: Dict[str, bool] = {}


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
        < 40   -> SAFE    / NONE
        40-74  -> WARNING / WARN_USER
        >= 75  -> CRITICAL / DROP_CALL_OR_ALERT
    """
    overall = round(
        (0.60 * synthetic_probability + 0.40 * coercion_score) * 100, 1
    )
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
    db_mode = "Supabase" if db.is_using_supabase() else "in-memory"
    print(f"Kavach-VoIP backend starting (Phase 5) ... [DB: {db_mode}]")
    await asyncio.to_thread(ml_engine.warmup)
    yield
    print("Kavach-VoIP backend shutting down ...")


# ═══════════════════════════════════════════════════════════════════════════
# FastAPI application
# ═══════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Kavach-VoIP",
    description="Real-time Deepfake Voice & Vishing Call Firewall — Phase 5",
    version="0.5.0",
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
        "db_mode": "supabase" if db.is_using_supabase() else "in-memory",
        "ml_mode": ml_engine.mode,
        "weights_loaded": ml_engine.weights_loaded,
        "whisper_enabled": ml_engine.whisper_enabled,
        "warmup_latency_ms": ml_engine.warmup_latency_ms,
    }


@app.get("/api/sessions")
async def list_sessions(limit: int = 20):
    """Return recent call sessions ordered by started_at descending."""
    sessions = await asyncio.to_thread(db.get_recent_sessions, limit)
    return {"sessions": sessions}


@app.get("/api/sessions/{session_id}/alerts")
async def session_alerts(session_id: str):
    """Return full session info, all high-risk alerts, and firewall actions."""
    details = await asyncio.to_thread(db.get_session_details, session_id)
    return details


@app.post("/api/sessions/{session_id}/quarantine")
async def quarantine_session(session_id: str):
    """
    SOC kill-switch:
      1. Log MANUAL_QUARANTINE_DROP in firewall_actions.
      2. Mark the session QUARANTINED.
      3. If a live WebSocket exists, push a CALL_TERMINATED event before
         closing / freezing the stream.
    """
    await asyncio.to_thread(
        db.quarantine_session, session_id, "MANUAL_SOC_KILLSWITCH"
    )

    # Push termination event to live WebSocket if connected.
    ws = _live_sockets.get(session_id)
    if ws is not None:
        try:
            await ws.send_text(json.dumps({
                "event": "CALL_TERMINATED",
                "session_id": session_id,
                "action": "QUARANTINED_BY_SOC",
            }))
            await ws.close(code=1000, reason="QUARANTINED_BY_SOC")
        except Exception:
            pass  # Socket may already be closed.

    return {
        "status": "quarantined",
        "session_id": session_id,
        "action": "MANUAL_QUARANTINE_DROP",
    }


class ScenarioTriggerRequest(BaseModel):
    session_id: str
    scenario: str


async def play_cbi_wav_stream(
    session_id: str,
    wav_path: str = "audio_samples/02_cbi_digital_arrest.wav",
) -> bool:
    """
    Stream 0.5-second (8000-sample / 16000-byte) chunks from audio_samples/02_cbi_digital_arrest.wav
    through the session's CallRingBuffer and ml_engine live into the WebSocket and Supabase.
    """
    ws = _live_sockets.get(session_id)
    if ws is None:
        return False

    ring = _session_rings.get(session_id)
    if ring is None:
        ring = CallRingBuffer(
            sample_rate=16_000,
            window_duration_sec=2.0,
            stride_duration_sec=0.5,
        )
        _session_rings[session_id] = ring

    # Flag audio as active so mock fallback loop is suppressed
    _session_audio_active[session_id] = True

    # Cancel previous playback task if still running
    old_task = _wav_playback_tasks.get(session_id)
    if old_task and not old_task.done():
        old_task.cancel()

    async def _stream_runner():
        try:
            from demo_replay import load_cbi_pcm_chunks
            chunks = await asyncio.to_thread(load_cbi_pcm_chunks, wav_path)
            chunk_counter = 0

            for chunk in chunks:
                if session_id not in _live_sockets:
                    break
                ring.append_pcm16_bytes(chunk)
                window = ring.pop_window_if_ready()
                if window is not None:
                    chunk_counter += 1
                    result, latency_ms = await ml_engine.analyze_window_safe(
                        window, session_id, timeout_sec=3.0
                    )
                    am = result["acoustic_metrics"]
                    sm = result["semantic_metrics"]
                    risk = _compute_composite_risk(
                        am["synthetic_probability"],
                        sm["coercion_score"],
                    )
                    frame = TelemetryFrame(
                        session_id=session_id,
                        timestamp=round(time.time(), 2),
                        chunk_id=chunk_counter,
                        acoustic_metrics=AcousticMetrics(**am),
                        semantic_metrics=SemanticMetrics(**sm),
                        composite_risk=risk,
                        processing_latency_ms=latency_ms,
                    )
                    try:
                        await ws.send_text(frame.model_dump_json())
                        # Asynchronous non-blocking Supabase / in-memory DB logging
                        frame_dict = json.loads(frame.model_dump_json())
                        asyncio.create_task(
                            asyncio.to_thread(db.log_telemetry_if_risky, frame_dict)
                        )
                    except Exception:
                        break
                    await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            print(f"[WAV Stream] Playback error on {session_id}: {exc}")
        finally:
            _session_audio_active[session_id] = False

    task = asyncio.create_task(_stream_runner())
    _wav_playback_tasks[session_id] = task
    return True


@app.post("/api/demo/trigger-scenario")
async def trigger_scenario(req: ScenarioTriggerRequest):
    """
    Inject a pre-recorded threat scenario or real WAV audio stream into an active WebSocket session:
      - NORMAL_CALL / SCENARIO_NORMAL
      - ELEVENLABS_DIGITAL_ARREST / SCENARIO_DIGITAL_ARREST
      - FAMILY_EMERGENCY_CLONE / SCENARIO_FAMILY_CLONE
      - REAL_WAV_CBI / PLAY_REAL_WAV
    """
    scenario_clean = req.scenario.upper().strip()
    if scenario_clean in ("REAL_WAV_CBI", "PLAY_REAL_WAV", "CBI_REAL_WAV", "REAL_WAV"):
        if req.session_id not in _live_sockets:
            return {
                "status": "session_not_found",
                "session_id": req.session_id,
                "active_sessions": list(_active_sessions),
            }
        started = await play_cbi_wav_stream(req.session_id)
        return {
            "status": "scenario_triggered",
            "session_id": req.session_id,
            "scenario": "REAL_WAV_CBI",
            "playing_real_wav": started,
            "details": "Streaming audio_samples/02_cbi_digital_arrest.wav with real LightGBM + Faster-Whisper",
        }

    # Cancel any running WAV playback when switching scenarios
    playback_task = _wav_playback_tasks.get(req.session_id)
    if playback_task and not playback_task.done():
        playback_task.cancel()
    _session_audio_active[req.session_id] = False

    if req.session_id in _scenario_injectors:
        _scenario_injectors[req.session_id].set_scenario(req.scenario)
        return {
            "status": "scenario_triggered",
            "session_id": req.session_id,
            "scenario": _scenario_injectors[req.session_id].scenario_name,
        }
    return {
        "status": "session_not_found",
        "session_id": req.session_id,
        "active_sessions": list(_active_sessions),
    }


@app.post("/api/demo/seed")
async def seed_demo():
    """Trigger the Supabase demo seeder on demand."""
    from seed_demo_data import seed_demo_database
    res = await asyncio.to_thread(seed_demo_database)
    return res


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
    """EMA-smoothed mock telemetry (Phase 1 fallback for simulation mode)."""

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
    Bi-directional call-analysis stream with DB logging.

    Lifecycle:
      connect   → db.start_session()
      each frame→ db.log_telemetry_if_risky()  (fire-and-forget task)
      disconnect→ db.end_session()
    """
    await websocket.accept()
    _active_sessions.add(session_id)
    _live_sockets[session_id] = websocket

    # Per-session state.
    ring = CallRingBuffer(
        sample_rate=16_000,
        window_duration_sec=2.0,
        stride_duration_sec=0.5,
    )
    _session_rings[session_id] = ring
    _session_audio_active[session_id] = False

    injector = ScenarioInjector(session_id, scenario="NORMAL_CALL")
    _scenario_injectors[session_id] = injector

    chunk_id = 0
    audio_active = False

    print(f"[+] Session connected: {session_id}")

    # Register session in DB (non-blocking).
    asyncio.create_task(asyncio.to_thread(db.start_session, session_id))

    # ── Helper: log frame to DB (fire-and-forget) ─────────────────────
    def _fire_and_forget_log(frame: TelemetryFrame) -> None:
        """Schedule DB logging without awaiting — zero WS latency."""
        frame_dict = json.loads(frame.model_dump_json())
        asyncio.create_task(
            asyncio.to_thread(db.log_telemetry_if_risky, frame_dict)
        )

    # ── Background: scenario / fallback loop ──────────────────────────
    async def _mock_fallback_loop():
        nonlocal chunk_id
        try:
            while True:
                if not audio_active and not _session_audio_active.get(session_id, False):
                    chunk_id += 1
                    injector.chunk_id = chunk_id
                    frame = injector.next_frame()
                    await websocket.send_text(frame.model_dump_json())
                    _fire_and_forget_log(frame)
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

                # If a synthetic WAV replay is running, cancel it so live mic takes over
                running_wav = _wav_playback_tasks.get(session_id)
                if running_wav and not running_wav.done():
                    running_wav.cancel()
                _session_audio_active[session_id] = True

                ring.append_pcm16_bytes(raw)

                window = ring.pop_window_if_ready()
                if window is not None:
                    result, latency_ms = await ml_engine.analyze_window_safe(
                        window, session_id, timeout_sec=3.0
                    )

                    chunk_id += 1

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
                        processing_latency_ms=latency_ms,
                    )
                    await websocket.send_text(frame.model_dump_json())
                    _fire_and_forget_log(frame)

            # ── Text: JSON command ────────────────────────────────────
            elif "text" in message and message["text"]:
                try:
                    cmd = InboundCommand.model_validate_json(message["text"])
                except Exception:
                    await websocket.send_text(
                        json.dumps({"error": "Invalid command JSON."})
                    )
                    continue

                cmd_upper = cmd.command.upper().strip()
                if cmd_upper in ("PLAY_REAL_WAV", "REAL_WAV_CBI", "CBI_REAL_WAV", "REAL_WAV"):
                    audio_active = False
                    await play_cbi_wav_stream(session_id)
                elif cmd_upper in ("SIMULATE_SCAM", "SCENARIO_DIGITAL_ARREST"):
                    running_wav = _wav_playback_tasks.get(session_id)
                    if running_wav and not running_wav.done():
                        running_wav.cancel()
                    _session_audio_active[session_id] = False
                    audio_active = False
                    injector.set_scenario("ELEVENLABS_DIGITAL_ARREST")
                elif cmd_upper in ("SIMULATE_SAFE", "SCENARIO_NORMAL"):
                    running_wav = _wav_playback_tasks.get(session_id)
                    if running_wav and not running_wav.done():
                        running_wav.cancel()
                    _session_audio_active[session_id] = False
                    audio_active = False
                    injector.set_scenario("NORMAL_CALL")
                elif cmd_upper in ("SCENARIO_FAMILY_CLONE", "FAMILY_EMERGENCY_CLONE"):
                    running_wav = _wav_playback_tasks.get(session_id)
                    if running_wav and not running_wav.done():
                        running_wav.cancel()
                    _session_audio_active[session_id] = False
                    audio_active = False
                    injector.set_scenario("FAMILY_EMERGENCY_CLONE")
                else:
                    await websocket.send_text(
                        json.dumps(
                            {"error": f"Unknown command: {cmd.command}"}
                        )
                    )

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[WS] Session {session_id} ended: {exc}")
    finally:
        fallback_task.cancel()
        playback_task = _wav_playback_tasks.pop(session_id, None)
        if playback_task and not playback_task.done():
            playback_task.cancel()
        _session_rings.pop(session_id, None)
        _session_audio_active.pop(session_id, None)
        _active_sessions.discard(session_id)
        _live_sockets.pop(session_id, None)
        _scenario_injectors.pop(session_id, None)
        ring.reset()
        # End session in DB (non-blocking).
        asyncio.create_task(asyncio.to_thread(db.end_session, session_id))
        print(f"[-] Session disconnected: {session_id}")


# ═══════════════════════════════════════════════════════════════════════════
# Entrypoint
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", str(settings.PORT)))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=settings.DEBUG,
    )
