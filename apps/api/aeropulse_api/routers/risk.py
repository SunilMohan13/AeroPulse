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
    population_density: float = Query(5000.0, ge=0),
    _claims: TokenClaims = Depends(get_claims),
) -> dict:
    """Return pollution_severity vs population_risk. Defaults are documented."""
    return score_risk(
        pm25,
        exposure_duration_hours=exposure_hours,
        population_density=population_density,
    ).model_dump(mode="json")
