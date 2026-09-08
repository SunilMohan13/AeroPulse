"""Map tile/query APIs (LLD §25.1)."""

from __future__ import annotations

from datetime import UTC, datetime

from aeropulse_auth.jwt import TokenClaims
from fastapi import APIRouter, Depends, Query

from aeropulse_api.deps import get_claims
from aeropulse_api.event_store import EVENT_STORE

router = APIRouter(prefix="/api/v1/map", tags=["map"])

# Seed points matching fixtures so the UI has data before Timescale is populated.
_AQ = [
    {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [77.241, 28.628]},
        "properties": {
            "source_id": "cpcb",
            "parameter": "pm25",
            "value": 142.3,
            "unit": "ug/m3",
            "observed_at": "2026-09-08T05:15:00Z",
        },
    },
    {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [75.857, 30.901]},
        "properties": {
            "source_id": "cpcb",
            "parameter": "pm25",
            "value": 186.0,
            "unit": "ug/m3",
            "observed_at": "2026-09-08T05:15:00Z",
        },
    },
]
_FIRE = [
    {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [75.71, 30.12]},
        "properties": {
            "source_id": "firms",
            "frp": 82.4,
            "confidence": 0.91,
            "observed_at": "2026-09-08T04:40:00Z",
        },
    }
]
_WEATHER = [
    {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [77.206, 28.585]},
        "properties": {
            "source_id": "imd",
            "wind_u": -2.1,
            "wind_v": 3.4,
            "temperature": 25.1,
            "observed_at": "2026-09-08T05:00:00Z",
        },
    }
]


def _in_bbox(feature: dict, bbox: list[float] | None) -> bool:
    if not bbox or len(bbox) != 4:
        return True
    min_lon, min_lat, max_lon, max_lat = bbox
    lon, lat = feature["geometry"]["coordinates"]
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def _collection(features: list[dict], bbox: list[float] | None) -> dict:
    return {
        "type": "FeatureCollection",
        "generated_at": datetime.now(UTC).isoformat(),
        "features": [f for f in features if _in_bbox(f, bbox)],
    }


@router.get("/air-quality")
def air_quality(
    bbox: str | None = Query(default=None, description="min_lon,min_lat,max_lon,max_lat"),
    _claims: TokenClaims = Depends(get_claims),
) -> dict:
    """Return recent air-quality points as GeoJSON."""
    parsed = [float(p) for p in bbox.split(",")] if bbox else None
    return _collection(_AQ, parsed)


@router.get("/fire")
def fire(
    bbox: str | None = Query(default=None),
    _claims: TokenClaims = Depends(get_claims),
) -> dict:
    """Return recent fire detections as GeoJSON."""
    parsed = [float(p) for p in bbox.split(",")] if bbox else None
    return _collection(_FIRE, parsed)


@router.get("/weather")
def weather(
    bbox: str | None = Query(default=None),
    _claims: TokenClaims = Depends(get_claims),
) -> dict:
    """Return recent meteorological points as GeoJSON."""
    parsed = [float(p) for p in bbox.split(",")] if bbox else None
    return _collection(_WEATHER, parsed)


@router.get("/satellite")
def satellite(_claims: TokenClaims = Depends(get_claims)) -> dict:
    """Return fixture satellite product footprints (metadata only, not AOD-as-PM2.5)."""
    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [76.0, 30.0]},
            "properties": {
                "source_id": "modis",
                "product": "MCD19A2 AOD metadata",
                "note": "AOD is not surface PM2.5",
            },
        },
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [76.5, 29.5]},
            "properties": {
                "source_id": "sentinel5p",
                "product": "S5P NO2 metadata",
            },
        },
    ]
    return _collection(features, None)


@router.get("/forecast")
def forecast(_claims: TokenClaims = Depends(get_claims)) -> dict:
    """Return advection forecast points as GeoJSON."""
    features: list[dict] = []
    for forecast in EVENT_STORE.forecasts.values():
        for cell in forecast.grid_predictions:
            if cell.center_lon is None or cell.center_lat is None:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [cell.center_lon, cell.center_lat],
                    },
                    "properties": {
                        "grid_id": cell.grid_id,
                        "pm25": cell.pm25,
                        "confidence": cell.confidence,
                        "event_id": forecast.event_id,
                        "model_version": forecast.model_version,
                        "cams_applied": forecast.cams_applied,
                    },
                }
            )
    return _collection(features, None)


@router.get("/grid")
def grid(_claims: TokenClaims = Depends(get_claims)) -> dict:
    """Grid polygons are materialized in a later story. Empty collection."""
    return _collection([], None)
