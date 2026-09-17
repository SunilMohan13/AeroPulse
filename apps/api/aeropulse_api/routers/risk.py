"""Exposure/risk query (LLD section 18.5)."""

import json
from pathlib import Path

from aeropulse_auth.jwt import TokenClaims
from aeropulse_intelligence.risk import score_risk
from fastapi import APIRouter, Depends, Query

from aeropulse_api.deps import get_claims

router = APIRouter(prefix="/api/v1/risk", tags=["risk"])


def _population_fixture() -> dict:
    """Load the provider-neutral population contract used by local E2E."""
    for root in (Path("/app"), Path(".")):
        path = root / "fixtures" / "population" / "density.json"
        if path.exists():
            return json.loads(path.read_text())
    return {"cells": [], "provider": "unavailable"}


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


@router.get("/areas")
def get_risk_areas(
    pm25: float = Query(180.0, ge=0),
    exposure_hours: float = Query(6.0, ge=0),
    _claims: TokenClaims = Depends(get_claims),
) -> dict:
    """Score each population cell with provider and provenance metadata."""
    population = _population_fixture()
    areas = []
    for cell in population.get("cells", []):
        result = score_risk(
            pm25,
            exposure_duration_hours=exposure_hours,
            population_density=float(cell["density_per_km2"]),
        )
        areas.append(
            {
                "cell_id": cell["cell_id"],
                "name": cell["name"],
                "lat": cell["lat"],
                "lon": cell["lon"],
                "population": cell["population"],
                "population_density": cell["density_per_km2"],
                "risk": "SEVERE"
                if result.population_risk >= 0.5
                else "HIGH"
                if result.population_risk >= 0.2
                else "MEDIUM"
                if result.population_risk >= 0.05
                else "LOW",
                "population_risk": result.population_risk,
                "pollution_severity": result.pollution_severity,
            }
        )
    areas.sort(key=lambda area: area["population_risk"], reverse=True)
    for rank, area in enumerate(areas, start=1):
        area["rank"] = rank
    return {
        "items": areas,
        "total": len(areas),
        "population_source": {
            "provider": population.get("provider"),
            "provider_version": population.get("provider_version"),
            "license": population.get("license"),
            "source_uri": population.get("source_uri"),
        },
    }
