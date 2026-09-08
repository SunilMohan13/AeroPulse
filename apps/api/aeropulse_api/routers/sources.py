"""Source registry API (LLD §25.3)."""

from __future__ import annotations

from aeropulse_auth.jwt import Role, TokenClaims
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from aeropulse_api.deps import get_claims, require

router = APIRouter(prefix="/api/v1/sources", tags=["sources"])

_SOURCES: dict[str, dict] = {
    "cpcb": {
        "source_id": "cpcb",
        "provider": "CPCB",
        "connector_id": "cpcb_caaqms",
        "display_name": "CPCB CAAQMS",
        "data_type": "air_quality",
        "enabled": True,
        "status": "replay",
        "schema_version": "observation.v1",
    },
    "firms": {
        "source_id": "firms",
        "provider": "NASA",
        "connector_id": "firms_viirs",
        "display_name": "NASA FIRMS VIIRS",
        "data_type": "active_fire",
        "enabled": True,
        "status": "replay",
        "schema_version": "fire_observation.v1",
    },
    "imd": {
        "source_id": "imd",
        "provider": "IMD",
        "connector_id": "imd_weather",
        "display_name": "IMD Weather",
        "data_type": "weather",
        "enabled": True,
        "status": "replay",
        "schema_version": "meteo.v1",
    },
    "sentinel5p": {
        "source_id": "sentinel5p",
        "provider": "Copernicus",
        "connector_id": "sentinel5p",
        "display_name": "Sentinel-5P",
        "data_type": "satellite_gas",
        "enabled": True,
        "status": "replay",
        "schema_version": "raster.v1",
    },
    "modis": {
        "source_id": "modis",
        "provider": "NASA",
        "connector_id": "modis_maiac",
        "display_name": "MODIS MAIAC AOD",
        "data_type": "aod",
        "enabled": True,
        "status": "replay",
        "schema_version": "raster.v1",
    },
    "cams": {
        "source_id": "cams",
        "provider": "ECMWF",
        "connector_id": "cams",
        "display_name": "CAMS composition",
        "data_type": "composition_forecast",
        "enabled": True,
        "status": "replay",
        "schema_version": "raster.v1",
    },
}


class SourceWrite(BaseModel):
    """Payload for creating or updating a source (no secrets)."""

    source_id: str
    provider: str
    connector_id: str
    display_name: str
    data_type: str
    enabled: bool = True
    auth_ref: str | None = Field(default=None, description="Secret name, never the value")


class BackfillRequest(BaseModel):
    """Historical replay window (LLD §38)."""

    start: str
    end: str
    bbox: list[float] | None = None


@router.get("")
def list_sources(
    _claims: TokenClaims = Depends(get_claims),
    limit: int | None = Query(default=None, ge=1, le=500, description="Max items to return"),
    offset: int = Query(default=0, ge=0, description="Items to skip"),
) -> dict:
    """List registered data sources."""
    items = list(_SOURCES.values())
    total = len(items)
    page = items[offset : offset + limit] if limit is not None else items[offset:]
    return {"items": page, "total": total, "limit": limit, "offset": offset}


@router.get("/{source_id}")
def get_source(source_id: str, _claims: TokenClaims = Depends(get_claims)) -> dict:
    """Return a single source or 404."""
    source = _SOURCES.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


@router.post("", status_code=201)
def create_source(
    body: SourceWrite,
    _claims: TokenClaims = Depends(require(Role.ADMIN)),
) -> dict:
    """Register a source. Secrets must be referenced by ``auth_ref`` only."""
    record = body.model_dump()
    record["status"] = "registered"
    _SOURCES[body.source_id] = record
    return record


@router.put("/{source_id}")
def update_source(
    source_id: str,
    body: SourceWrite,
    _claims: TokenClaims = Depends(require(Role.ADMIN)),
) -> dict:
    """Update source configuration."""
    if source_id not in _SOURCES:
        raise HTTPException(status_code=404, detail="Source not found")
    record = body.model_dump()
    record["status"] = "updated"
    _SOURCES[source_id] = record
    return record


@router.post("/{source_id}/test")
def test_source(
    source_id: str,
    _claims: TokenClaims = Depends(require(Role.ADMIN, Role.OPERATOR)),
) -> dict:
    """Run a connector health check (replay-mode stub)."""
    if source_id not in _SOURCES:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"source_id": source_id, "healthy": True, "mode": "replay"}


@router.post("/{source_id}/backfill")
def backfill_source(
    source_id: str,
    body: BackfillRequest,
    _claims: TokenClaims = Depends(require(Role.ADMIN, Role.OPERATOR)),
) -> dict:
    """Run fixture replay for a source with processing_mode=BACKFILL."""
    if source_id not in _SOURCES:
        raise HTTPException(status_code=404, detail="Source not found")
    from pathlib import Path

    from aeropulse_connector_app.runner import replay_all
    from aeropulse_contracts.envelope import KafkaEnvelope, ProcessingMode

    published = 0

    def _count(_topic: str, envelope: KafkaEnvelope) -> None:
        nonlocal published
        if envelope.source_id == source_id:
            published += 1

    root = Path("/app/fixtures") if Path("/app/fixtures").exists() else Path("fixtures")
    if root.exists():
        replay_all(root, _count, processing_mode=ProcessingMode.BACKFILL)
    return {
        "source_id": source_id,
        "accepted": True,
        "processing_mode": "BACKFILL",
        "start": body.start,
        "end": body.end,
        "records": published,
    }
