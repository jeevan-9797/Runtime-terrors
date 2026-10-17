-- ═══════════════════════════════════════════════════════════════════════════
-- Kavach-VoIP — Phase 3: Supabase / PostgreSQL schema
--
-- Run this in the Supabase SQL Editor (or any Postgres 15+ instance).
-- All tables use IF NOT EXISTS so the script is safely re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Call Sessions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS call_sessions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id        TEXT        UNIQUE NOT NULL,
    caller_number     TEXT        DEFAULT '+91-98XXX-XXXXX',
    started_at        TIMESTAMPTZ DEFAULT now(),
    ended_at          TIMESTAMPTZ,
    peak_risk_score   FLOAT       DEFAULT 0.0,
    final_verdict     TEXT        DEFAULT 'SAFE',
    call_status       TEXT        DEFAULT 'ACTIVE'
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_session_id
    ON call_sessions (session_id);

CREATE INDEX IF NOT EXISTS idx_call_sessions_started_at
    ON call_sessions (started_at DESC);


-- ── 2. Telemetry Alerts (only high-risk frames are stored) ───────────────

CREATE TABLE IF NOT EXISTS telemetry_alerts (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id            TEXT        NOT NULL,
    chunk_id              INT         NOT NULL,
    synthetic_probability FLOAT       NOT NULL,
    coercion_score        FLOAT       NOT NULL,
    overall_score         FLOAT       NOT NULL,
    transcript_snippet    TEXT,
    scam_category         TEXT,
    vocoder_signature     TEXT,
    created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_alerts_session_id
    ON telemetry_alerts (session_id);


-- ── 3. Firewall Actions (autonomous + manual SOC actions) ────────────────

CREATE TABLE IF NOT EXISTS firewall_actions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT        NOT NULL,
    action_taken    TEXT        NOT NULL,
    rule_payload    TEXT        NOT NULL,
    triggered_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firewall_actions_session_id
    ON firewall_actions (session_id);
