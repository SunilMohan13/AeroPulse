"""Deterministic grid-hour feature builder (LLD §15, §17)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from aeropulse_contracts.feature import FEATURE_VERSION, GridFeature
from aeropulse_contracts.raster import RasterObservation

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
#: Meteorology older than this is not attached to a feature row. Wind and
#: boundary-layer height change materially within a few hours, so a stale
#: record would misinform advection rather than merely add noise.
WEATHER_MAX_AGE_HOURS = 3.0
#: Satellite point samples are matched to a cell within this radius. Kept tight
#: because AOD varies over short distances and a loose match would smear an
#: unrelated column into the cell.
RASTER_RADIUS_KM = 25.0


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
    # Selection is by cell AND hour. Without the hour filter a multi-hour
    # snapshot (backfill, replay or training window) collapses to whichever
    # observation happened to be last in the list, producing a feature row that
    # is constant in time. The snapshot indexes itself so this stays O(1).
    aq = snapshot.air_quality_at(grid_id, ts)
    pollutants: dict[str, float] = {}
    station_distance: float | None = None
    quality_scores: list[float] = []
    for obs in aq:
        pollutants[obs.measurement.parameter] = obs.measurement.value
        dist = haversine_km(center_lat, center_lon, obs.location.lat, obs.location.lon)
        station_distance = dist if station_distance is None else min(station_distance, dist)
        quality_scores.append(obs.quality.quality_score)

    nearest_wx = _nearest_weather(center_lat, center_lon, ts, snapshot)
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

    satellite = _nearest_raster(center_lat, center_lon, ts, snapshot)

    pm25 = pollutants.get("pm25")
    lag_1h = _lag_pm25(snapshot, grid_id, ts, hours=1)
    lag_3h = _lag_pm25(snapshot, grid_id, ts, hours=3)
    lag_6h = _lag_pm25(snapshot, grid_id, ts, hours=6)
    lag_24h = _lag_pm25(snapshot, grid_id, ts, hours=24)
    roll_6h = _roll_pm25(snapshot, grid_id, ts, hours=6)
    roll_24h = _roll_pm25(snapshot, grid_id, ts, hours=24)

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
        aod=satellite.sample_aod if satellite else None,
        satellite_no2=satellite.sample_no2 if satellite else None,
        cloud_fraction=satellite.cloud_fraction if satellite else None,
        wind_u=wu,
        wind_v=wv,
        wind_speed=speed,
        wind_direction=wdir_from,
        temperature=nearest_wx.temperature if nearest_wx else None,
        humidity=nearest_wx.humidity if nearest_wx else None,
        pressure=nearest_wx.pressure if nearest_wx else None,
        rainfall=nearest_wx.rainfall if nearest_wx else None,
        boundary_layer_height=nearest_wx.boundary_layer_height if nearest_wx else None,
        fire_count=fire_count,
        fire_frp=fire_frp,
        fire_confidence=fire_conf,
        upwind_fire_score=round(upwind, 4),
        pm25_lag_1h=lag_1h,
        pm25_lag_3h=lag_3h,
        pm25_lag_6h=lag_6h,
        pm25_lag_24h=lag_24h,
        pm25_roll_6h=roll_6h,
        pm25_roll_24h=roll_24h,
        quality_score=sum(quality_scores) / len(quality_scores) if quality_scores else None,
        source_count=sources,
        missing_feature_count=missing,
        feature_version=FEATURE_VERSION,
        feature_generated_at=datetime.now(UTC),
    )


def _nearest_weather(
    lat: float,
    lon: float,
    ts: datetime,
    snapshot: FeatureSnapshot,
):
    """Return the closest weather observation in space, then in time.

    Selection is time-aware: the same-hour record wins, and older records are
    only used within :data:`WEATHER_MAX_AGE_HOURS`. A time-blind nearest-station
    lookup would attach an arbitrary hour's meteorology to every feature row,
    which is invisible in a single-hour snapshot but corrupts any window.

    Args:
        lat: Cell centroid latitude.
        lon: Cell centroid longitude.
        ts: Hour-floored feature timestamp.
        snapshot: In-scope observations.

    Returns:
        The best weather observation, or None when none is close enough.
    """
    best = None
    best_key: tuple[float, float] | None = None
    for wx in snapshot.weather_within(ts, WEATHER_MAX_AGE_HOURS):
        distance = haversine_km(lat, lon, wx.location.lat, wx.location.lon)
        if distance > WEATHER_RADIUS_KM:
            continue
        age_hours = abs((hour_bucket(wx.observed_at) - ts).total_seconds()) / 3600.0
        if age_hours > WEATHER_MAX_AGE_HOURS:
            continue
        # Time proximity dominates: stale meteorology is worse than distant
        # meteorology for advection and stability features.
        key = (age_hours, distance)
        if best_key is None or key < best_key:
            best, best_key = wx, key
    return best


def _nearest_raster(
    lat: float,
    lon: float,
    ts: datetime,
    snapshot: FeatureSnapshot,
) -> RasterObservation | None:
    """Return the closest satellite sample for this cell-hour, if any.

    Matching is on the same hour bucket and on centroid proximity. Satellite
    products are sparse and cloud-limited, so an unmatched cell keeps an
    explicit null rather than borrowing a neighbouring hour's value.

    Args:
        lat: Cell centroid latitude.
        lon: Cell centroid longitude.
        ts: Hour-floored feature timestamp.
        snapshot: In-scope observations.

    Returns:
        Nearest in-hour raster sample within :data:`RASTER_RADIUS_KM`, else None.
    """
    best: RasterObservation | None = None
    best_d = RASTER_RADIUS_KM
    for raster in snapshot.rasters_at(ts):
        min_lon, min_lat, max_lon, max_lat = raster.bbox
        centre_lat = (min_lat + max_lat) / 2.0
        centre_lon = (min_lon + max_lon) / 2.0
        distance = haversine_km(lat, lon, centre_lat, centre_lon)
        if distance <= best_d:
            best, best_d = raster, distance
    return best


def _cell_pm25_history(
    snapshot: FeatureSnapshot, grid_id: str, ts: datetime
) -> dict[datetime, float]:
    """Return this cell's PM2.5 by hour bucket, strictly before ``ts``.

    Excluding the current hour keeps every derived lag and window usable at
    inference time without peeking at the value being predicted.

    Args:
        snapshot: In-scope observations.
        grid_id: H3 cell.
        ts: Hour-floored reference timestamp.

    Returns:
        Hour bucket to PM2.5 value. Later observations win within an hour.
    """
    return {
        bucket: value for bucket, value in snapshot.pm25_history(grid_id).items() if bucket < ts
    }


def _roll_pm25(snapshot: FeatureSnapshot, grid_id: str, ts: datetime, hours: int) -> float | None:
    """Mean PM2.5 over the ``hours`` buckets immediately preceding ``ts``.

    Args:
        snapshot: In-scope observations.
        grid_id: H3 cell.
        ts: Hour-floored feature timestamp, excluded from the window.
        hours: Window length in hours.

    Returns:
        Trailing mean, or ``None`` when the window holds no observation.
    """
    history = _cell_pm25_history(snapshot, grid_id, ts)
    window = [
        value for bucket, value in history.items() if ts - timedelta(hours=hours) <= bucket < ts
    ]
    if not window:
        return None
    return round(sum(window) / len(window), 4)


def _lag_pm25(snapshot: FeatureSnapshot, grid_id: str, ts: datetime, hours: int) -> float | None:
    """Return this cell's PM2.5 exactly ``hours`` before ``ts``.

    Args:
        snapshot: In-scope observations.
        grid_id: H3 cell.
        ts: Hour-floored feature timestamp.
        hours: Lag in hours.

    Returns:
        The lagged value, or None when that hour was not observed.
    """
    return snapshot.pm25_history(grid_id).get(ts - timedelta(hours=hours))
