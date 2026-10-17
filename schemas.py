"""
Kavach-VoIP — Frozen JSON data-contract (Pydantic v2 models).

Every WebSocket outbound frame MUST serialise to the exact shape defined here.
Do **not** rename fields, add ``Optional`` wrappers, or reorder keys without
a coordinated frontend+backend migration.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# ── Enumerations ──────────────────────────────────────────────────────────


class RiskLevel(str, Enum):
    """Discrete risk tiers shown in the frontend dashboard."""

    SAFE = "SAFE"
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RecommendedAction(str, Enum):
    """Machine-suggested action for the user / gateway."""

    NONE = "NONE"
    MONITOR = "MONITOR"
    WARN_USER = "WARN_USER"
    DROP_CALL_OR_ALERT = "DROP_CALL_OR_ALERT"


class ScamCategory(str, Enum):
    """Known vishing / social-engineering archetypes."""

    NONE = "NONE"
    DIGITAL_ARREST_COERCION = "DIGITAL_ARREST_COERCION"
    OTP_PHISHING = "OTP_PHISHING"
    KYC_EXPIRY_FRAUD = "KYC_EXPIRY_FRAUD"
    PARCEL_CUSTOMS_SCAM = "PARCEL_CUSTOMS_SCAM"
    LOTTERY_PRIZE_SCAM = "LOTTERY_PRIZE_SCAM"
    TECH_SUPPORT_SCAM = "TECH_SUPPORT_SCAM"
    IMPERSONATION_GENERIC = "IMPERSONATION_GENERIC"


# ── Sub-models ────────────────────────────────────────────────────────────


class AcousticMetrics(BaseModel):
    """
    Low-level audio-signal features extracted per chunk.

    * ``synthetic_probability`` — 0-1 likelihood the voice is AI-generated.
    * ``spectral_flatness``     — Wiener entropy; near 1 = noise-like.
    * ``pitch_jitter_hz``       — Micro-variation in F0; near 0 = robotic.
    * ``breath_detected``       — True if a natural breath pause was found.
    * ``vocoder_signature``     — Suspected vocoder fingerprint label, or
                                  ``"none"`` if the voice appears organic.
    """

    synthetic_probability: float = Field(
        ..., ge=0.0, le=1.0, description="Probability that the voice is synthetic."
    )
    spectral_flatness: float = Field(
        ..., ge=0.0, le=1.0, description="Spectral flatness (Wiener entropy)."
    )
    pitch_jitter_hz: float = Field(
        ..., ge=0.0, description="Pitch jitter in Hz."
    )
    breath_detected: bool = Field(
        ..., description="Whether a natural breath pause was detected."
    )
    vocoder_signature: str = Field(
        ..., description="Suspected vocoder fingerprint or 'none'."
    )


class SemanticMetrics(BaseModel):
    """
    NLP / transcript-level features extracted per chunk.

    * ``transcript_delta``  — Incremental transcript text for this chunk.
    * ``coercion_score``    — 0-1 measure of psychological pressure.
    * ``flagged_keywords``  — Trigger words that raised the score.
    * ``scam_category``     — Best-match archetype from ``ScamCategory``.
    """

    transcript_delta: str = Field(
        ..., description="Incremental transcript text for this chunk."
    )
    coercion_score: float = Field(
        ..., ge=0.0, le=1.0, description="Coercion / urgency score."
    )
    flagged_keywords: List[str] = Field(
        default_factory=list, description="Keywords that triggered the score."
    )
    scam_category: ScamCategory = Field(
        ..., description="Best-match scam archetype."
    )


class CompositeRisk(BaseModel):
    """
    Fused risk assessment combining acoustic + semantic signals.

    * ``overall_score``       — 0-100 composite risk score.
    * ``risk_level``          — Bucketed risk tier.
    * ``recommended_action``  — What the gateway should do.
    """

    overall_score: float = Field(
        ..., ge=0.0, le=100.0, description="Composite risk score (0-100)."
    )
    risk_level: RiskLevel = Field(
        ..., description="Discrete risk tier."
    )
    recommended_action: RecommendedAction = Field(
        ..., description="Recommended action for the gateway."
    )


# ── Top-level WebSocket payload ───────────────────────────────────────────


class TelemetryFrame(BaseModel):
    """
    **The** outbound WebSocket payload — sent once every ~500 ms.

    This is the frozen contract between the backend and the frontend.
    """

    session_id: str = Field(..., description="Unique call-session identifier.")
    timestamp: float = Field(
        ..., description="UNIX epoch (seconds) when this frame was generated."
    )
    chunk_id: int = Field(
        ..., ge=1, description="Monotonically increasing chunk counter."
    )
    acoustic_metrics: AcousticMetrics
    semantic_metrics: SemanticMetrics
    composite_risk: CompositeRisk
    processing_latency_ms: float = Field(
        default=0.0, description="Processing latency of the inference window in milliseconds."
    )


# ── Inbound WebSocket commands ────────────────────────────────────────────


class InboundCommand(BaseModel):
    """Text-mode message the frontend can send to control the mock engine."""

    command: str = Field(
        ...,
        description=(
            "One of SIMULATE_SAFE, SIMULATE_SCAM, or future commands."
        ),
    )
