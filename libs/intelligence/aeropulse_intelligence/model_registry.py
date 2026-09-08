"""Minimal model registry metadata (LLD section 19). No MLflow required."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel


class RegisteredModel(BaseModel):
    """One registered estimator/anomaly/forecast version."""

    model_id: str
    model_name: str
    version: str
    approval_status: str = "PRODUCTION"
    geography: str = "punjab-haryana-delhi-ncr"
    registered_at: datetime


PRODUCTION_MODELS = [
    RegisteredModel(
        model_id="baseline-idw-0.1",
        model_name="pm25_estimator",
        version="baseline-idw-0.1",
        registered_at=datetime(2026, 9, 1, tzinfo=UTC),
    ),
    RegisteredModel(
        model_id="quantile-baseline-0.1",
        model_name="anomaly",
        version="quantile-baseline-0.1",
        registered_at=datetime(2026, 9, 1, tzinfo=UTC),
    ),
    RegisteredModel(
        model_id="wind-advection-0.1",
        model_name="forecast",
        version="wind-advection-0.1",
        registered_at=datetime(2026, 9, 1, tzinfo=UTC),
    ),
]


def list_production_models() -> list[RegisteredModel]:
    """Return the in-process registry. MLflow URI is optional overlay."""
    return list(PRODUCTION_MODELS)
