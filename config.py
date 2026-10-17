"""
Kavach-VoIP — Configuration loader.

Reads environment variables from a .env file (if present) and exposes them as
typed attributes on a single ``Settings`` instance.  Import ``settings``
anywhere else in the project instead of calling ``os.getenv`` directly.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (same directory as this file).
_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)


# Set cloud container cache paths if running in Linux or Render
if os.name != "nt" or "RENDER" in os.environ:
    os.environ.setdefault("HF_HOME", "/tmp/huggingface")
    os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba_cache")


class Settings:
    """Centralised, typed application settings."""

    # ── Server ────────────────────────────────────────────────────────
    HOST: str = os.getenv("KAVACH_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", os.getenv("KAVACH_PORT", "8000")))
    DEBUG: bool = os.getenv("KAVACH_DEBUG", "false").lower() in ("1", "true", "yes")

    # ── WebSocket telemetry ───────────────────────────────────────────
    TELEMETRY_INTERVAL_SEC: float = float(
        os.getenv("KAVACH_TELEMETRY_INTERVAL_SEC", "0.5")
    )

    # ── Supabase (Phase 2+ persistence) ──────────────────────────────
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    # ── Future: ML model paths ────────────────────────────────────────
    MODEL_DIR: str = os.getenv("KAVACH_MODEL_DIR", "./models")


settings = Settings()
