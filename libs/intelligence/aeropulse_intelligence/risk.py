"""Exposure / risk scoring (LLD section 18.5). Configuration-driven.

The LLD requires pollution severity and population risk to be reported
*separately*. That only means something if the two are computed from
different information. With a single hardcoded density for the whole corridor
they were not: risk was severity multiplied by constants, so the second number
told a reader nothing the first had not. Density now comes from a reference
layer (:mod:`aeropulse_geospatial.population`), and every result states
whether it was measured or assumed.
"""

from __future__ import annotations

from aeropulse_geospatial.population import (
    FALLBACK_DENSITY_PER_KM2,
    population_density,
)
from pydantic import BaseModel, Field

#: Retained for callers that must score without a location. Every result built
#: from it reports ``population_measured=False``.
DEFAULT_POPULATION_DENSITY = FALLBACK_DENSITY_PER_KM2
DEFAULT_SENSITIVE = 1.1

#: Density treated as the top of the scale. Central Delhi districts exceed
#: 30,000/km2, so the previous 20,000 ceiling saturated on real values and
#: compressed the distinction between dense and very dense areas.
DENSITY_SCALE_PER_KM2 = 40000.0


class RiskResult(BaseModel):
    """Separated pollution severity vs population risk."""

    model_config = {"extra": "forbid"}

    pollution_severity: float = Field(..., ge=0.0, le=1.0)
    population_risk: float = Field(..., ge=0.0, le=1.0)
    exposure_duration_hours: float
    population_density: float
    confidence: float
    formula_version: str = "risk-0.2"
    #: False when density came from the documented fallback rather than the
    #: reference layer. A consumer must be able to tell an exposure estimate
    #: from an exposure assumption.
    population_measured: bool = False
    population_source: str = "fallback"
    population_reference: str | None = None


def score_risk(
    pm25: float,
    *,
    exposure_duration_hours: float = 6.0,
    population_density_per_km2: float | None = None,
    lat: float | None = None,
    lon: float | None = None,
    sensitive_population_factor: float = DEFAULT_SENSITIVE,
    confidence: float = 0.7,
) -> RiskResult:
    """Compute severity and population risk for one location.

    Density is resolved in priority order: an explicit value if the caller
    supplied one, otherwise the reference layer if a location was given,
    otherwise the documented fallback.

    Args:
        pm25: Concentration in ug/m3.
        exposure_duration_hours: Hours of exposure being scored.
        population_density_per_km2: Explicit density, overriding the lookup.
        lat: Latitude, used to resolve density when no explicit value is given.
        lon: Longitude, likewise.
        sensitive_population_factor: Multiplier for sensitive groups.
        confidence: Confidence in the inputs, folded into the risk score.

    Returns:
        A :class:`RiskResult` whose ``population_measured`` flag states
        whether the density behind it was real.
    """
    if population_density_per_km2 is not None:
        density_value = population_density_per_km2
        measured = True
        source = "caller-supplied"
        reference = None
    elif lat is not None and lon is not None:
        estimate = population_density(lat, lon)
        density_value = estimate.density_per_km2
        measured = estimate.measured
        source = estimate.source
        reference = estimate.reference_name
    else:
        density_value = DEFAULT_POPULATION_DENSITY
        measured = False
        source = "fallback"
        reference = None

    severity = max(0.0, min(1.0, pm25 / 300.0))
    duration = max(0.0, min(1.0, exposure_duration_hours / 24.0))
    density = max(0.0, min(1.0, density_value / DENSITY_SCALE_PER_KM2))
    risk = min(
        1.0,
        severity * duration * density * sensitive_population_factor * confidence,
    )
    return RiskResult(
        pollution_severity=round(severity, 4),
        population_risk=round(risk, 4),
        exposure_duration_hours=exposure_duration_hours,
        population_density=density_value,
        confidence=confidence,
        population_measured=measured,
        population_source=source,
        population_reference=reference,
    )
