"""Canonical air-quality observation contract (observation.v1)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Location(BaseModel):
    """WGS84 point location."""

    model_config = {"extra": "forbid"}

    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class Measurement(BaseModel):
    """A single measured parameter."""

    model_config = {"extra": "forbid"}

    parameter: str
    value: float
    unit: str


class Quality(BaseModel):
    """Quality assessment attached to an observation."""

    model_config = {"extra": "forbid"}

    quality_flag: Literal["valid", "suspect", "invalid", "missing"] = "valid"
    quality_score: float = Field(..., ge=0.0, le=1.0)


class Provenance(BaseModel):
    """Lineage of an observation back to the connector and raw object."""

    model_config = {"extra": "forbid"}

    provider: str
    connector_version: str
    raw_object_uri: str | None = None


class Observation(BaseModel):
    """Canonical observation independent of the originating source payload."""

    model_config = {"extra": "forbid"}

    observation_id: str
    source_id: str
    source_record_id: str
    schema_version: Literal["observation.v1"] = "observation.v1"
    observed_at: datetime
    received_at: datetime
    location: Location
    measurement: Measurement
    quality: Quality
    provenance: Provenance
    grid_id: str | None = None
    dedup_key: str | None = None
