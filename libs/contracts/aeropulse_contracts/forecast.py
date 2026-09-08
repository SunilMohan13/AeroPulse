"""Canonical forecast contract (forecast.v1, LLD section 22.3)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

FORECAST_VERSION = "wind-advection-0.1"


class GridCellForecast(BaseModel):
    """Predicted PM2.5 for one H3 cell at one horizon."""

    model_config = {"extra": "forbid"}

    grid_id: str
    pm25: float
    confidence: float = Field(..., ge=0.0, le=1.0)
    center_lat: float | None = None
    center_lon: float | None = None


class ForecastResult(BaseModel):
    """Event-scoped advection forecast. CAMS is not applied in this version."""

    model_config = {"extra": "forbid"}

    schema_version: Literal["forecast.v1"] = "forecast.v1"
    model_version: str = FORECAST_VERSION
    event_id: str | None = None
    origin_grid_id: str
    generated_at: datetime
    cams_applied: bool = False
    horizons: list[int] = Field(default_factory=lambda: [3, 6, 12, 24, 48])
    grid_predictions: list[GridCellForecast] = Field(default_factory=list)
    horizon_hours: int | None = None
