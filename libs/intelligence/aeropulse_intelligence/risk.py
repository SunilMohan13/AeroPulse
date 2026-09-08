"""Exposure / risk scoring (LLD section 18.5). Configuration-driven."""

from __future__ import annotations

from pydantic import BaseModel, Field

DEFAULT_POPULATION_DENSITY = 5000.0
DEFAULT_SENSITIVE = 1.1


class RiskResult(BaseModel):
    """Separated pollution severity vs population risk."""

    model_config = {"extra": "forbid"}

    pollution_severity: float = Field(..., ge=0.0, le=1.0)
    population_risk: float = Field(..., ge=0.0, le=1.0)
    exposure_duration_hours: float
    population_density: float
    confidence: float
    formula_version: str = "risk-0.1"


def score_risk(
    pm25: float,
    *,
    exposure_duration_hours: float = 6.0,
    population_density: float = DEFAULT_POPULATION_DENSITY,
    sensitive_population_factor: float = DEFAULT_SENSITIVE,
    confidence: float = 0.7,
) -> RiskResult:
    """Compute severity and risk. Missing population uses a documented default."""
    severity = max(0.0, min(1.0, pm25 / 300.0))
    duration = max(0.0, min(1.0, exposure_duration_hours / 24.0))
    density = max(0.0, min(1.0, population_density / 20000.0))
    risk = min(
        1.0,
        severity * duration * density * sensitive_population_factor * confidence,
    )
    return RiskResult(
        pollution_severity=round(severity, 4),
        population_risk=round(risk, 4),
        exposure_duration_hours=exposure_duration_hours,
        population_density=population_density,
        confidence=confidence,
    )
