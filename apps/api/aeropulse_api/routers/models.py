"""Model registry listing (LLD section 19)."""

from typing import Annotated

from aeropulse_auth.jwt import TokenClaims
from aeropulse_intelligence.model_registry import list_production_models
from fastapi import APIRouter, Depends

from aeropulse_api.deps import get_claims

router = APIRouter(prefix="/api/v1/models", tags=["models"])


@router.get("")
def list_models(_claims: Annotated[TokenClaims, Depends(get_claims)]) -> dict:
    """List production model versions used by detection and forecast."""
    return {"items": [m.model_dump(mode="json") for m in list_production_models()]}
