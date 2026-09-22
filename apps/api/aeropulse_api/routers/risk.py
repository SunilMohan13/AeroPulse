"""Exposure/risk query (LLD section 18.5)."""

from aeropulse_auth.jwt import TokenClaims
from aeropulse_intelligence.risk import score_risk
from fastapi import APIRouter, Depends, Query

from aeropulse_api.deps import get_claims

router = APIRouter(prefix="/api/v1/risk", tags=["risk"])


@router.get("")
def get_risk(
    pm25: float = Query(..., ge=0),
    exposure_hours: float = Query(6.0, ge=0),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    population_density: float | None = Query(None, ge=0),
    _claims: TokenClaims = Depends(get_claims),
) -> dict:
    """Return pollution_severity vs population_risk for a location.

    Supplying ``lat``/``lon`` resolves population density from the reference
    layer. Without them the response still answers, using the documented
    fallback, and reports ``population_measured: false`` so the caller can
    tell an exposure estimate from an exposure assumption.
    """
    return score_risk(
        pm25,
        exposure_duration_hours=exposure_hours,
        population_density_per_km2=population_density,
        lat=lat,
        lon=lon,
    ).model_dump(mode="json")
