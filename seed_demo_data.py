"""
Kavach-VoIP — Phase 5: Demo Data Seeder.

Populates Supabase (and the in-memory fallback store) with 4 realistic
historical call sessions so that the SOC incident response dashboard is
populated for judge demonstrations:
  1. +91-98201-44120: Digital Arrest Coercion (QUARANTINED, Peak: 94.6%)
  2. +91-88002-19301: OTP Phishing Fraud (COMPLETED / Blocked, Peak: 88.2%)
  3. +91-94480-22119: Benign Business Call (COMPLETED, Peak: 14.2%)
  4. +91-70112-88921: Family Voice Clone Emergency (QUARANTINED, Peak: 91.8%)
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import database as db


def _time_str(minutes_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


DEMO_SESSIONS = [
    # ── Session 1: Digital Arrest Coercion (Quarantined by SOC) ─────────
    {
        "session": {
            "session_id": "call-da-98201",
            "caller_number": "+91-98201-44120",
            "started_at": _time_str(45),
            "ended_at": _time_str(41),
            "peak_risk_score": 94.6,
            "final_verdict": "CRITICAL",
            "call_status": "QUARANTINED",
        },
        "alerts": [
            {
                "session_id": "call-da-98201",
                "chunk_id": 4,
                "synthetic_probability": 0.88,
                "coercion_score": 0.90,
                "overall_score": 88.8,
                "transcript_snippet": "Your Aadhaar has been implicated in a 38 crore money laundering parcel at customs.",
                "scam_category": "DIGITAL_ARREST_COERCION",
                "vocoder_signature": "ElevenLabs-Turbo-v2.5",
                "created_at": _time_str(44),
            },
            {
                "session_id": "call-da-98201",
                "chunk_id": 6,
                "synthetic_probability": 0.94,
                "coercion_score": 0.96,
                "overall_score": 94.6,
                "transcript_snippet": "Transfer funds to the RBI safe verification account immediately under digital arrest warrant.",
                "scam_category": "DIGITAL_ARREST_COERCION",
                "vocoder_signature": "ElevenLabs-Turbo-v2.5",
                "created_at": _time_str(42),
            },
        ],
        "actions": [
            {
                "session_id": "call-da-98201",
                "action_taken": "BLOCK_RTP_STREAM",
                "rule_payload": json.dumps({
                    "type": "iptables_drop",
                    "rule": "iptables -A INPUT -p udp --dport 10000:20000 -m string --string 'call-da-' --algo bm -j DROP",
                    "webrtc_action": "RTCPeerConnection.close()",
                    "reason": "overall_score=88.8, autonomous_block",
                    "triggered_at": _time_str(44),
                }),
                "triggered_at": _time_str(44),
            },
            {
                "session_id": "call-da-98201",
                "action_taken": "MANUAL_QUARANTINE_DROP",
                "rule_payload": json.dumps({
                    "type": "soc_manual_block",
                    "rule": "iptables -A INPUT -p udp --dport 10000:20000 -m string --string 'call-da-' --algo bm -j DROP",
                    "webrtc_action": "RTCPeerConnection.close()",
                    "reason": "MANUAL_SOC_KILLSWITCH",
                    "triggered_at": _time_str(41),
                }),
                "triggered_at": _time_str(41),
            },
        ],
    },
    # ── Session 2: OTP Phishing Scam (Autonomous Block) ─────────────────
    {
        "session": {
            "session_id": "call-otp-88002",
            "caller_number": "+91-88002-19301",
            "started_at": _time_str(120),
            "ended_at": _time_str(116),
            "peak_risk_score": 88.2,
            "final_verdict": "CRITICAL",
            "call_status": "COMPLETED",
        },
        "alerts": [
            {
                "session_id": "call-otp-88002",
                "chunk_id": 3,
                "synthetic_probability": 0.84,
                "coercion_score": 0.91,
                "overall_score": 86.8,
                "transcript_snippet": "Your credit card reward points are expiring today. Read out the 6 digit verification OTP.",
                "scam_category": "OTP_PHISHING",
                "vocoder_signature": "VALL-E-suspected",
                "created_at": _time_str(118),
            },
            {
                "session_id": "call-otp-88002",
                "chunk_id": 5,
                "synthetic_probability": 0.86,
                "coercion_score": 0.92,
                "overall_score": 88.2,
                "transcript_snippet": "Without immediate OTP confirmation your bank account will be blocked by midnight.",
                "scam_category": "OTP_PHISHING",
                "vocoder_signature": "VALL-E-suspected",
                "created_at": _time_str(117),
            },
        ],
        "actions": [
            {
                "session_id": "call-otp-88002",
                "action_taken": "BLOCK_RTP_STREAM",
                "rule_payload": json.dumps({
                    "type": "iptables_drop",
                    "rule": "iptables -A INPUT -p udp --dport 10000:20000 -m string --string 'call-otp' --algo bm -j DROP",
                    "webrtc_action": "RTCPeerConnection.close()",
                    "reason": "overall_score=86.8, autonomous_block",
                    "triggered_at": _time_str(118),
                }),
                "triggered_at": _time_str(118),
            },
        ],
    },
    # ── Session 3: Benign Normal Call (Clean Verdict) ───────────────────
    {
        "session": {
            "session_id": "call-safe-94480",
            "caller_number": "+91-94480-22119",
            "started_at": _time_str(180),
            "ended_at": _time_str(170),
            "peak_risk_score": 14.2,
            "final_verdict": "SAFE",
            "call_status": "COMPLETED",
        },
        "alerts": [],
        "actions": [],
    },
    # ── Session 4: Family Voice Clone Emergency (Quarantined) ───────────
    {
        "session": {
            "session_id": "call-clone-70112",
            "caller_number": "+91-70112-88921",
            "started_at": _time_str(300),
            "ended_at": _time_str(295),
            "peak_risk_score": 91.8,
            "final_verdict": "CRITICAL",
            "call_status": "QUARANTINED",
        },
        "alerts": [
            {
                "session_id": "call-clone-70112",
                "chunk_id": 3,
                "synthetic_probability": 0.89,
                "coercion_score": 0.85,
                "overall_score": 87.4,
                "transcript_snippet": "Papa my car had a serious accident near the highway junction, police have detained me!",
                "scam_category": "IMPERSONATION_GENERIC",
                "vocoder_signature": "XTTS-v2-suspected",
                "created_at": _time_str(298),
            },
            {
                "session_id": "call-clone-70112",
                "chunk_id": 5,
                "synthetic_probability": 0.91,
                "coercion_score": 0.93,
                "overall_score": 91.8,
                "transcript_snippet": "Send forty thousand rupees immediately to this hospital UPI ID or they will lock me up!",
                "scam_category": "IMPERSONATION_GENERIC",
                "vocoder_signature": "XTTS-v2-suspected",
                "created_at": _time_str(296),
            },
        ],
        "actions": [
            {
                "session_id": "call-clone-70112",
                "action_taken": "BLOCK_RTP_STREAM",
                "rule_payload": json.dumps({
                    "type": "iptables_drop",
                    "rule": "iptables -A INPUT -p udp --dport 10000:20000 -m string --string 'call-clo' --algo bm -j DROP",
                    "webrtc_action": "RTCPeerConnection.close()",
                    "reason": "overall_score=87.4, autonomous_block",
                    "triggered_at": _time_str(298),
                }),
                "triggered_at": _time_str(298),
            },
            {
                "session_id": "call-clone-70112",
                "action_taken": "MANUAL_QUARANTINE_DROP",
                "rule_payload": json.dumps({
                    "type": "soc_manual_block",
                    "rule": "iptables -A INPUT -p udp --dport 10000:20000 -m string --string 'call-clo' --algo bm -j DROP",
                    "webrtc_action": "RTCPeerConnection.close()",
                    "reason": "MANUAL_SOC_KILLSWITCH",
                    "triggered_at": _time_str(295),
                }),
                "triggered_at": _time_str(295),
            },
        ],
    },
]


def seed_demo_database() -> Dict[str, Any]:
    """
    Seed all 4 historical sessions into Supabase / in-memory DB.
    Idempotent: skips sessions already present.
    """
    seeded_count = 0
    total_alerts = 0
    total_actions = 0

    for item in DEMO_SESSIONS:
        db.seed_demo_session(item["session"], item["alerts"], item["actions"])
        seeded_count += 1
        total_alerts += len(item["alerts"])
        total_actions += len(item["actions"])

    db_mode = "supabase" if db.is_using_supabase() else "in-memory"
    print(
        f"[Seed] Successfully seeded {seeded_count} demo sessions "
        f"({total_alerts} alerts, {total_actions} actions) into {db_mode}."
    )

    return {
        "status": "success",
        "seeded_sessions": seeded_count,
        "seeded_alerts": total_alerts,
        "seeded_actions": total_actions,
        "db_mode": db_mode,
    }


if __name__ == "__main__":
    result = seed_demo_database()
    print("Seed result:", json.dumps(result, indent=2))
