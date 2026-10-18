"""
Kavach-VoIP — Phase 3: Dual-mode persistence layer.

Supabase (primary)
    When ``SUPABASE_URL`` and ``SUPABASE_KEY`` are set, all writes go to the
    hosted Postgres database via the ``supabase-py`` SDK.

In-Memory Fallback (hackathon fail-safe)
    If either env var is empty **or** any Supabase call raises a network error,
    the layer silently switches to an in-memory dictionary store so the backend
    and REST APIs work 100 % offline without blocking the demo.

Every public method is a plain (sync) function.  The WebSocket loop wraps them
in ``asyncio.create_task(asyncio.to_thread(...))`` so they never block the
event loop.
"""

from __future__ import annotations

import json
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from config import settings

# ═══════════════════════════════════════════════════════════════════════════
# Supabase client (best-effort initialisation)
# ═══════════════════════════════════════════════════════════════════════════

_supabase_client = None
_use_supabase: bool = False

if settings.SUPABASE_URL and settings.SUPABASE_KEY:
    try:
        from supabase import create_client
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        _use_supabase = True
        print("[DB] Supabase client initialised successfully.")
    except Exception as exc:
        print(f"[DB] Supabase init failed ({exc}); falling back to in-memory store.")
else:
    print("[DB] SUPABASE_URL / SUPABASE_KEY not set; using in-memory store.")


# ═══════════════════════════════════════════════════════════════════════════
# In-memory fallback store
# ═══════════════════════════════════════════════════════════════════════════

_mem_sessions: Dict[str, Dict[str, Any]] = {}          # session_id → row
_mem_alerts: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
_mem_actions: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

# Track whether an autonomous firewall block was already issued for a session
# so we don't flood firewall_actions on every critical frame.
_block_issued: set[str] = set()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ═══════════════════════════════════════════════════════════════════════════
# Safe Supabase wrapper — falls back on any exception
# ═══════════════════════════════════════════════════════════════════════════

def _sb_execute(table: str, operation: str, payload: dict | None = None,
                filters: dict | None = None, limit: int | None = None,
                order: str | None = None, order_desc: bool = True) -> Any:
    """
    Thin wrapper around Supabase table operations.

    Returns the ``.data`` list on success, or ``None`` if Supabase is
    unavailable / errors out (caller falls back to in-memory).
    """
    global _use_supabase
    if not _use_supabase or _supabase_client is None:
        return None
    try:
        tbl = _supabase_client.table(table)
        if operation == "insert":
            res = tbl.insert(payload).execute()
        elif operation == "upsert":
            on_conflict = filters.get("on_conflict", "session_id") if filters else "session_id"
            res = tbl.upsert(payload, on_conflict=on_conflict).execute()
        elif operation == "update":
            q = tbl.update(payload)
            if filters:
                for col, val in filters.items():
                    q = q.eq(col, val)
            res = q.execute()
        elif operation == "select":
            q = tbl.select("*")
            if filters:
                for col, val in filters.items():
                    q = q.eq(col, val)
            if order:
                q = q.order(order, desc=order_desc)
            if limit:
                q = q.limit(limit)
            res = q.execute()
        else:
            return None
        return res.data
    except Exception as exc:
        print(f"[DB] Supabase {operation} on '{table}' failed: {exc}")
        return None


# ═══════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════

def start_session(
    session_id: str,
    caller_number: str = "+91-98765-43210",
) -> None:
    """Register a new call session."""
    row = {
        "session_id": session_id,
        "caller_number": caller_number,
        "started_at": _now_iso(),
        "peak_risk_score": 0.0,
        "final_verdict": "SAFE",
        "call_status": "ACTIVE",
    }

    result = _sb_execute("call_sessions", "upsert", payload=row)
    if result is None:
        # In-memory fallback
        _mem_sessions[session_id] = {
            "id": str(uuid.uuid4()),
            **row,
            "ended_at": None,
        }


def log_telemetry_if_risky(frame_dict: dict) -> None:
    """
    Process a telemetry frame:
      1. Always update ``peak_risk_score`` / ``final_verdict`` for the session.
      2. Insert into ``telemetry_alerts`` only when ``overall_score >= 50``.
      3. When ``overall_score >= 85`` (once per session), insert an autonomous
         ``BLOCK_RTP_STREAM`` entry into ``firewall_actions``.
    """
    sid = frame_dict["session_id"]
    overall = frame_dict["composite_risk"]["overall_score"]
    synth_p = frame_dict["acoustic_metrics"]["synthetic_probability"]
    coercion = frame_dict["semantic_metrics"]["coercion_score"]
    transcript = frame_dict["semantic_metrics"].get("transcript_delta", "")
    category = frame_dict["semantic_metrics"].get("scam_category", "NONE")
    vocoder = frame_dict["acoustic_metrics"].get("vocoder_signature", "none")
    chunk_id = frame_dict["chunk_id"]

    # Derive verdict from current score.
    if overall >= 75:
        verdict = "CRITICAL"
    elif overall >= 40:
        verdict = "WARNING"
    else:
        verdict = "SAFE"

    # ── 1. Update session peak score / verdict ────────────────────────
    sb_updated = _sb_execute(
        "call_sessions", "update",
        payload={
            "peak_risk_score": overall,
            "final_verdict": verdict,
        },
        filters={"session_id": sid},
    )
    if sb_updated is None and sid in _mem_sessions:
        if overall > _mem_sessions[sid].get("peak_risk_score", 0):
            _mem_sessions[sid]["peak_risk_score"] = overall
        _mem_sessions[sid]["final_verdict"] = verdict

    # ── 2. Log alert only when overall >= 50 ──────────────────────────
    if overall >= 50.0:
        alert_row = {
            "session_id": sid,
            "chunk_id": chunk_id,
            "synthetic_probability": synth_p,
            "coercion_score": coercion,
            "overall_score": overall,
            "transcript_snippet": transcript[:500] if transcript else "",
            "scam_category": category,
            "vocoder_signature": vocoder,
            "created_at": _now_iso(),
        }

        result = _sb_execute("telemetry_alerts", "insert", payload=alert_row)
        if result is None:
            _mem_alerts[sid].append({"id": str(uuid.uuid4()), **alert_row})

    # ── 3. Autonomous firewall block at >= 85 (once per session) ──────
    if overall >= 85.0 and sid not in _block_issued:
        _block_issued.add(sid)
        action_row = {
            "session_id": sid,
            "action_taken": "BLOCK_RTP_STREAM",
            "rule_payload": json.dumps({
                "type": "iptables_drop",
                "rule": f"iptables -A INPUT -p udp --dport 10000:20000 "
                        f"-m string --string \"{sid[:8]}\" --algo bm -j DROP",
                "webrtc_action": "RTCPeerConnection.close()",
                "reason": f"overall_score={overall}, autonomous_block",
                "triggered_at": _now_iso(),
            }),
            "triggered_at": _now_iso(),
        }

        result = _sb_execute("firewall_actions", "insert", payload=action_row)
        if result is None:
            _mem_actions[sid].append({"id": str(uuid.uuid4()), **action_row})


def end_session(
    session_id: str,
    status: str = "COMPLETED",
) -> None:
    """Mark a call session as ended."""
    current_status = None
    if _use_supabase and _supabase_client is not None:
        try:
            res = _supabase_client.table("call_sessions").select("call_status").eq("session_id", session_id).execute()
            if res.data:
                current_status = res.data[0].get("call_status")
        except Exception:
            pass

    if current_status is None and session_id in _mem_sessions:
        current_status = _mem_sessions[session_id].get("call_status")

    final_status = "QUARANTINED" if current_status == "QUARANTINED" else status

    payload = {
        "ended_at": _now_iso(),
        "call_status": final_status,
    }

    result = _sb_execute(
        "call_sessions", "update",
        payload=payload, filters={"session_id": session_id},
    )
    if result is None and session_id in _mem_sessions:
        _mem_sessions[session_id].update(payload)


def quarantine_session(
    session_id: str,
    reason: str = "MANUAL_SOC_KILLSWITCH",
) -> None:
    """
    SOC-triggered quarantine: mark session QUARANTINED and log a firewall
    action.
    """
    # Update session status.
    payload = {
        "call_status": "QUARANTINED",
        "ended_at": _now_iso(),
        "final_verdict": "QUARANTINED",
    }
    result = _sb_execute(
        "call_sessions", "update",
        payload=payload, filters={"session_id": session_id},
    )
    if result is None and session_id in _mem_sessions:
        _mem_sessions[session_id].update(payload)

    # Log firewall action.
    action_row = {
        "session_id": session_id,
        "action_taken": "MANUAL_QUARANTINE_DROP",
        "rule_payload": json.dumps({
            "type": "soc_manual_block",
            "rule": f"iptables -A INPUT -p udp --dport 10000:20000 "
                    f"-m string --string \"{session_id[:8]}\" --algo bm -j DROP",
            "webrtc_action": "RTCPeerConnection.close()",
            "reason": reason,
            "triggered_at": _now_iso(),
        }),
        "triggered_at": _now_iso(),
    }
    result = _sb_execute("firewall_actions", "insert", payload=action_row)
    if result is None:
        _mem_actions[session_id].append({"id": str(uuid.uuid4()), **action_row})


def get_recent_sessions(limit: int = 20) -> List[Dict[str, Any]]:
    """Return recent call sessions, newest first."""
    result = _sb_execute(
        "call_sessions", "select",
        order="started_at", order_desc=True, limit=limit,
    )
    if result is not None:
        return result

    # In-memory fallback: sort by started_at descending.
    rows = sorted(
        _mem_sessions.values(),
        key=lambda r: r.get("started_at", ""),
        reverse=True,
    )
    return rows[:limit]


def get_session_details(session_id: str) -> Dict[str, Any]:
    """
    Return full session info including alerts and firewall actions.

    Shape:
        {
            "session": { ... },
            "alerts": [ ... ],
            "firewall_actions": [ ... ],
        }
    """
    # Session metadata.
    sb_session = _sb_execute(
        "call_sessions", "select", filters={"session_id": session_id},
    )
    if sb_session:
        session = sb_session[0] if sb_session else {}
    elif session_id in _mem_sessions:
        session = _mem_sessions[session_id]
    else:
        session = {}

    # Alerts.
    sb_alerts = _sb_execute(
        "telemetry_alerts", "select",
        filters={"session_id": session_id},
        order="created_at", order_desc=True,
    )
    alerts = sb_alerts if sb_alerts is not None else _mem_alerts.get(session_id, [])

    # Firewall actions.
    sb_actions = _sb_execute(
        "firewall_actions", "select",
        filters={"session_id": session_id},
        order="triggered_at", order_desc=True,
    )
    actions = sb_actions if sb_actions is not None else _mem_actions.get(session_id, [])

    return {
        "session": session,
        "alerts": alerts,
        "firewall_actions": actions,
    }


def is_using_supabase() -> bool:
    """Return True if Supabase is the active backend."""
    return _use_supabase


def seed_demo_session(
    session_data: Dict[str, Any],
    alerts: List[Dict[str, Any]],
    actions: List[Dict[str, Any]],
) -> bool:
    """
    Seed a historical demo session into Supabase (if not already existing)
    and into the in-memory fallback store.
    """
    sid = session_data["session_id"]

    # 1. Supabase persistence
    if _use_supabase and _supabase_client is not None:
        try:
            existing = _sb_execute("call_sessions", "select", filters={"session_id": sid})
            if existing is not None and len(existing) == 0:
                _sb_execute("call_sessions", "insert", payload=session_data)
                for a in alerts:
                    _sb_execute("telemetry_alerts", "insert", payload=a)
                for act in actions:
                    _sb_execute("firewall_actions", "insert", payload=act)
        except Exception as exc:
            print(f"[DB] Supabase seed failed for {sid}: {exc}")

    # 2. In-memory persistence (always available for fallback)
    _mem_sessions[sid] = {"id": str(uuid.uuid4()), **session_data}
    _mem_alerts[sid] = [{"id": str(uuid.uuid4()), **a} for a in alerts]
    _mem_actions[sid] = [{"id": str(uuid.uuid4()), **act} for act in actions]
    return True
