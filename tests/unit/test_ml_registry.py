"""Model registry lifecycle guards."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
from aeropulse_ml.registry import (
    ALLOWED_TRANSITIONS,
    ModelRecord,
    ModelRegistry,
    ModelStage,
    PromotionError,
)


@pytest.fixture
def registry(tmp_path: Path) -> ModelRegistry:
    """Registry rooted in a temporary directory."""
    return ModelRegistry(tmp_path / "models")


def _record(model_id: str, name: str = "pm25_estimator", **kw: object) -> ModelRecord:
    payload: dict[str, object] = {
        "model_id": model_id,
        "model_name": name,
        "version": model_id,
        "training_time": datetime(2026, 9, 8, tzinfo=UTC),
    }
    payload.update(kw)
    return ModelRecord(**payload)  # type: ignore[arg-type]


def test_registry_starts_empty(registry: ModelRegistry) -> None:
    """A fresh registry must not claim any model."""
    assert registry.list_models() == []
    assert registry.champion("pm25_estimator") is None


def test_register_then_read_back(registry: ModelRegistry) -> None:
    """Records must survive a round trip through the index file."""
    registry.register(_record("v1"))
    fetched = registry.get("v1")
    assert fetched is not None
    assert fetched.model_name == "pm25_estimator"


def test_new_models_are_not_production(registry: ModelRegistry) -> None:
    """A freshly trained model must never serve traffic by default."""
    registry.register(_record("v1"))
    assert registry.get("v1").stage is ModelStage.TRAINING  # type: ignore[union-attr]
    assert registry.champion("pm25_estimator") is None


def test_cannot_jump_straight_to_production(registry: ModelRegistry) -> None:
    """Skipping shadow and canary would make the lifecycle decorative."""
    registry.register(_record("v1"))
    with pytest.raises(PromotionError, match="cannot move"):
        registry.transition("v1", ModelStage.PRODUCTION)


def test_full_promotion_path_reaches_production(registry: ModelRegistry) -> None:
    """The documented path must actually be walkable."""
    registry.register(_record("v1"))
    record = registry.promote_to_production("v1")
    assert record.stage is ModelStage.PRODUCTION
    champion = registry.champion("pm25_estimator")
    assert champion is not None
    assert champion.model_id == "v1"


def test_promoting_a_successor_retires_the_incumbent(registry: ModelRegistry) -> None:
    """Exactly one champion per family, or serving becomes ambiguous."""
    registry.register(_record("v1"))
    registry.register(_record("v2", training_time=datetime(2026, 9, 9, tzinfo=UTC)))
    registry.promote_to_production("v1")
    registry.promote_to_production("v2")
    assert registry.get("v1").stage is ModelStage.RETIRED  # type: ignore[union-attr]
    assert registry.champion("pm25_estimator").model_id == "v2"  # type: ignore[union-attr]


def test_promotion_does_not_touch_other_families(registry: ModelRegistry) -> None:
    """Promoting a forecast model must not retire the estimator champion."""
    registry.register(_record("est1", "pm25_estimator"))
    registry.register(_record("fc1", "propagation_forecast"))
    registry.promote_to_production("est1")
    registry.promote_to_production("fc1")
    assert registry.champion("pm25_estimator").model_id == "est1"  # type: ignore[union-attr]
    assert registry.champion("propagation_forecast").model_id == "fc1"  # type: ignore[union-attr]


def test_retired_is_terminal(registry: ModelRegistry) -> None:
    """A retired model must not be silently resurrected."""
    registry.register(_record("v1"))
    registry.transition("v1", ModelStage.RETIRED)
    with pytest.raises(PromotionError):
        registry.transition("v1", ModelStage.VALIDATION)
    assert ALLOWED_TRANSITIONS[ModelStage.RETIRED] == frozenset()


def test_force_allows_a_rollback_drill(registry: ModelRegistry) -> None:
    """Operators need an escape hatch for incident response."""
    registry.register(_record("v1"))
    record = registry.transition("v1", ModelStage.PRODUCTION, force=True)
    assert record.stage is ModelStage.PRODUCTION


def test_unknown_model_id_raises(registry: ModelRegistry) -> None:
    """Silent no-ops would hide a broken promotion script."""
    with pytest.raises(KeyError):
        registry.transition("nope", ModelStage.VALIDATION)


def test_champion_ignores_non_production_stages(registry: ModelRegistry) -> None:
    """A canary must not be mistaken for the champion."""
    registry.register(_record("v1"))
    registry.transition("v1", ModelStage.VALIDATION)
    registry.transition("v1", ModelStage.SHADOW)
    registry.transition("v1", ModelStage.CANARY)
    assert registry.champion("pm25_estimator") is None


def test_lld_metadata_fields_are_present(registry: ModelRegistry) -> None:
    """LLD section 19 names the metadata a record must carry."""
    registry.register(
        _record(
            "v1",
            feature_version="grid-features-0.4.0",
            code_commit="abc1234",
            metrics={"temporal": {"mae": 1.0}},
            artifact_uri="models/v1.joblib",
        )
    )
    record = registry.get("v1")
    assert record is not None
    for attribute in (
        "model_id",
        "model_name",
        "version",
        "feature_version",
        "code_commit",
        "training_time",
        "geography",
        "metrics",
        "artifact_uri",
    ):
        assert hasattr(record, attribute)
    assert record.metrics["temporal"]["mae"] == 1.0
