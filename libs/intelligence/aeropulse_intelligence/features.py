"""Deterministic grid-hour feature builder (LLD §15, §17)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from aeropulse_contracts.feature import FEATURE_VERSION, GridFeature
from aeropulse_geospatial.grid import to_grid_id

from aeropulse_intelligence.geometry import (
    bearing_deg,
    cosine_alignment,
    haversine_km,
    wind_direction_from,
    wind_direction_to,
    wind_speed,
)
from aeropulse_intelligence.snapshot import FeatureSnapshot

FIRE_RADIUS_KM = 100.0
WEATHER_RADIUS_KM = 300.0


def hour_bucket(ts: datetime) -> datetime:
    """Floor a timestamp to the UTC hour."""
    aware = ts if ts.tzinfo else ts.replace(tzinfo=UTC)
    return aware.replace(minute=0, second=0, microsecond=0)


def build_features(
    grid_id: str,
    timestamp: datetime,
    snapshot: FeatureSnapshot,
    *,
    center_lat: float,
    center_lon: float,
) -> GridFeature:
    """Assemble a grid-hour feature vector from available observations.

    Satellite, industry, urban, and population fields stay explicit nulls.

    Args:
        grid_id: H3 cell.
        timestamp: Feature timestamp (floored to hour).
        snapshot: In-scope observations.
        center_lat: Cell centroid latitude.
        center_lon: Cell centroid longitude.

    Returns:
        ``GridFeature`` with ``feature_version`` set.
    """
    ts = hour_bucket(timestamp)
    aq = [
        o
        for o in snapshot.air_quality
        if o.grid_id == grid_id or to_grid_id(o.location.lat, o.location.lon) == grid_id
    ]
    pollutants: dict[str, float] = {}
    station_distance: float | None = None
    quality_scores: list[float] = []
    for obs in aq:
        pollutants[obs.measurement.parameter] = obs.measurement.value
        dist = haversine_km(center_lat, center_lon, obs.location.lat, obs.location.lon)
        station_distance = dist if station_distance is None else min(station_distance, dist)
        quality_scores.append(obs.quality.quality_score)

    nearest_wx = _nearest_weather(center_lat, center_lon, snapshot)
    wu = nearest_wx.wind_u if nearest_wx else None
    wv = nearest_wx.wind_v if nearest_wx else None
    speed = wind_speed(wu, wv) if wu is not None and wv is not None else None
    wdir_from = wind_direction_from(wu, wv) if wu is not None and wv is not None else None
    wdir_to = wind_direction_to(wu, wv) if wu is not None and wv is not None else None

    nearby_fires = [
        f
        for f in snapshot.fires
        if haversine_km(center_lat, center_lon, f.location.lat, f.location.lon) <= FIRE_RADIUS_KM
    ]
    fire_count = len(nearby_fires)
    fire_frp = sum(f.fire.frp for f in nearby_fires)
    fire_conf = sum(f.fire.confidence for f in nearby_fires) / fire_count if fire_count else None
    upwind = 0.0
    if wdir_to is not None and nearby_fires:
        scores = []
        for fire in nearby_fires:
            bearing_to_cell = bearing_deg(
                fire.location.lat, fire.location.lon, center_lat, center_lon
            )
            scores.append(cosine_alignment(wdir_to, bearing_to_cell))
        upwind = sum(scores) / len(scores)

    pm25 = pollutants.get("pm25")
    lag_1h = _lag_pm25(snapshot, grid_id, ts, hours=1)
    lag_3h = _lag_pm25(snapshot, grid_id, ts, hours=3)

    nullable = [
        pollutants.get("pm25"),
        nearest_wx,
        fire_count or None,
        lag_1h,
        lag_3h,
    ]
    missing = sum(1 for v in nullable if v is None)
    sources = sum(
        [
            1 if aq else 0,
            1 if nearest_wx else 0,
            1 if nearby_fires else 0,
        ]
    )

    return GridFeature(
        grid_id=grid_id,
        timestamp=ts,
        center_lat=center_lat,
        center_lon=center_lon,
        pm25=pm25,
        pm10=pollutants.get("pm10"),
        no2=pollutants.get("no2"),
        so2=pollutants.get("so2"),
        co=pollutants.get("co"),
        o3=pollutants.get("o3"),
        station_distance=station_distance,
        wind_u=wu,
        wind_v=wv,
        wind_speed=speed,
        wind_direction=wdir_from,
        temperature=nearest_wx.temperature if nearest_wx else None,
        humidity=nearest_wx.humidity if nearest_wx else None,
        pressure=nearest_wx.pressure if nearest_wx else None,
        boundary_layer_height=nearest_wx.boundary_layer_height if nearest_wx else None,
        fire_count=fire_count,
        fire_frp=fire_frp,
        fire_confidence=fire_conf,
        upwind_fire_score=round(upwind, 4),
        pm25_lag_1h=lag_1h,
        pm25_lag_3h=lag_3h,
        quality_score=sum(quality_scores) / len(quality_scores) if quality_scores else None,
        source_count=sources,
        missing_feature_count=missing,
        feature_version=FEATURE_VERSION,
        feature_generated_at=datetime.now(UTC),
    )


def _nearest_weather(lat: float, lon: float, snapshot: FeatureSnapshot):
    best = None
    best_d = WEATHER_RADIUS_KM
    for wx in snapshot.weather:
        d = haversine_km(lat, lon, wx.location.lat, wx.location.lon)
        if d <= best_d:
            best, best_d = wx, d
    return best


def _lag_pm25(snapshot: FeatureSnapshot, grid_id: str, ts: datetime, hours: int) -> float | None:
    target = ts - timedelta(hours=hours)
    values = [
        o.measurement.value
        for o in snapshot.air_quality
        if o.measurement.parameter == "pm25"
        and (o.grid_id == grid_id or to_grid_id(o.location.lat, o.location.lon) == grid_id)
        and hour_bucket(o.observed_at) == target
    ]
    if not values:
        return None
    return values[-1]
