"""Canonical grid-hour feature contract (grid-features.v1, LLD §15)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

FEATURE_VERSION = "grid-features-0.3.0"


class SourceLikelihood(BaseModel):
    """Independent source likelihoods (LLD §18.3). Not a softmax."""

    model_config = {"extra": "forbid"}

    biomass_burning: float = Field(0.0, ge=0.0, le=1.0)
    industrial: float = Field(0.0, ge=0.0, le=1.0)
    traffic: float = Field(0.0, ge=0.0, le=1.0)
    dust: float = Field(0.0, ge=0.0, le=1.0)
    regional_transport: float = Field(0.0, ge=0.0, le=1.0)


class GridFeature(BaseModel):
    """One H3 cell at one timestamp. Null satellite/urban fields are explicit."""

    model_config = {"extra": "forbid"}

    schema_version: Literal["grid-features.v1"] = "grid-features.v1"
    feature_version: str = FEATURE_VERSION
    grid_id: str
    timestamp: datetime
    center_lat: float
    center_lon: float

    pm25: float | None = None
    pm10: float | None = None
    no2: float | None = None
    so2: float | None = None
    co: float | None = None
    o3: float | None = None
    station_distance: float | None = None

    aod: float | None = None
    satellite_no2: float | None = None
    satellite_so2: float | None = None
    satellite_co: float | None = None
    cloud_fraction: float | None = None

    wind_u: float | None = None
    wind_v: float | None = None
    wind_speed: float | None = None
    wind_direction: float | None = None
    temperature: float | None = None
    humidity: float | None = None
    pressure: float | None = None
    rainfall: float | None = None
    boundary_layer_height: float | None = None

    fire_count: int = 0
    fire_frp: float = 0.0
    fire_confidence: float | None = None
    fire_persistence: float = 0.0
    upwind_fire_score: float = Field(0.0, ge=0.0, le=1.0)

    crop_probability: float | None = None
    harvested_area_proxy: float | None = None
    agricultural_burning_score: float | None = None
    industrial_density: float | None = None
    road_density: float | None = None
    built_up_fraction: float | None = None
    population: float | None = None

    pm25_lag_1h: float | None = None
    pm25_lag_3h: float | None = None

    pm25_estimate: float | None = None
    estimate_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    anomaly_score: float | None = Field(default=None, ge=0.0, le=1.0)
    source_likelihood: SourceLikelihood | None = None
    quality_score: float | None = Field(default=None, ge=0.0, le=1.0)
    source_count: int = 0
    missing_feature_count: int = 0
    data_freshness_seconds: float | None = None
    feature_generated_at: datetime | None = None
