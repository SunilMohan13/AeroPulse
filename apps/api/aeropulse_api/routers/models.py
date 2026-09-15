"""Model registry listing (LLD section 19)."""

from typing import Annotated

from aeropulse_auth.jwt import TokenClaims
from aeropulse_intelligence.model_registry import list_production_models
from aeropulse_ml.registry import ModelRegistry, ModelStage
from fastapi import APIRouter, Depends

from aeropulse_api.deps import get_claims

router = APIRouter(prefix="/api/v1/models", tags=["models"])


@router.get("")
def list_models(_claims: Annotated[TokenClaims, Depends(get_claims)]) -> dict:
    """List serving baselines and all filesystem-registered trained models."""
    registry = ModelRegistry()
    baselines = [
        {
            **model.model_dump(mode="json"),
            "stage": model.approval_status,
            "runtime_role": "PRIMARY_BASELINE",
            "artifact_uri": None,
            "artifact_available": False,
            "metrics": {},
        }
        for model in list_production_models()
    ]
    trained = [
        {
            **record.model_dump(mode="json"),
            "approval_status": record.stage.value,
            "runtime_role": (
                "PRIMARY_MODEL" if record.stage is ModelStage.PRODUCTION else "REGISTERED_ONLY"
            ),
            "artifact_available": registry.artifact_path(record).is_file(),
        }
        for record in registry.list_models()
    ]
    return {"items": [*baselines, *trained], "total": len(baselines) + len(trained)}
