"""Deterministic data-quality rules (LLD §16).

Weights are constants here; a later story may load them from config.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import BaseModel

QUALITY_WEIGHTS = {
    "range": 0.25,
    "temporal": 0.20,
    "sensor": 0.20,
    "spatial": 0.15,
    "source": 0.10,
    "freshness": 0.10,
}

PM25_MAX = 2000.0
HUMIDITY_MIN = 0.0
HUMIDITY_MAX = 100.0


class QualityResult(BaseModel):
    """Outcome of quality evaluation for a single observation."""

    quality_flag: Literal["valid", "suspect", "invalid"]
    quality_score: float
    reasons: list[str] = []


def _clip(value: float) -> float:
    return max(0.0, min(1.0, value))


def evaluate_observation(
    *,
    parameter: str,
    value: float,
    lat: float,
    lon: float,
    observed_at: datetime,
    received_at: datetime | None = None,
    source_reliability: float = 0.9,
) -> QualityResult:
    """Score a scalar observation using range, temporal, and spatial rules.

    Args:
        parameter: Canonical parameter name (``pm25``, ``humidity``, ...).
        value: Measured value.
        lat: Latitude.
        lon: Longitude.
        observed_at: Source timestamp (timezone-aware preferred).
        received_at: Ingest timestamp. Defaults to now (UTC).
        source_reliability: Prior in [0, 1] from the source registry.

    Returns:
        Combined flag and score. ``invalid`` observations should go to DLQ.
    """
    received = received_at or datetime.now(UTC)
    reasons: list[str] = []

    range_q = 1.0
    if parameter in {"pm25", "pm10"} and value < 0:
        range_q = 0.0
        reasons.append("negative_concentration")
    if parameter in {"pm25", "pm10"} and value > PM25_MAX:
        range_q = 0.0
        reasons.append("implausible_concentration")
    if parameter == "humidity" and not HUMIDITY_MIN <= value <= HUMIDITY_MAX:
        range_q = 0.0
        reasons.append("humidity_out_of_range")

    spatial_q = 1.0
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        spatial_q = 0.0
        reasons.append("invalid_coordinates")

    obs = observed_at if observed_at.tzinfo else observed_at.replace(tzinfo=UTC)
    recv = received if received.tzinfo else received.replace(tzinfo=UTC)
    temporal_q = 1.0
    if obs > recv + timedelta(minutes=5):
        temporal_q = 0.0
        reasons.append("future_timestamp")

    freshness_q = 1.0
    lag = recv - obs
    if lag > timedelta(hours=24):
        freshness_q = 0.3
        reasons.append("stale_observation")

    sensor_q = 1.0  # stuck/flatline needs history; Phase 2 uses a neutral prior
    source_q = _clip(source_reliability)

    score = (
        QUALITY_WEIGHTS["range"] * range_q
        + QUALITY_WEIGHTS["temporal"] * temporal_q
        + QUALITY_WEIGHTS["sensor"] * sensor_q
        + QUALITY_WEIGHTS["spatial"] * spatial_q
        + QUALITY_WEIGHTS["source"] * source_q
        + QUALITY_WEIGHTS["freshness"] * freshness_q
    )
    score = round(_clip(score), 4)

    if range_q == 0.0 or spatial_q == 0.0 or temporal_q == 0.0:
        flag: Literal["valid", "suspect", "invalid"] = "invalid"
    elif score < 0.7:
        flag = "suspect"
    else:
        flag = "valid"
    return QualityResult(quality_flag=flag, quality_score=score, reasons=reasons)
