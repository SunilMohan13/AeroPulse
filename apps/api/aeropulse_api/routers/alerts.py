"""Alert listing (LLD section 29). Delivery adapters are not implemented."""

from aeropulse_auth.jwt import TokenClaims
from fastapi import APIRouter, Depends

from aeropulse_api.deps import get_claims
from aeropulse_api.event_store import EVENT_STORE

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


@router.get("")
def list_alerts(_claims: TokenClaims = Depends(get_claims)) -> dict:
    """List alerts generated from HIGH/CRITICAL events."""
    items = [a.model_dump(mode="json") for a in EVENT_STORE.alerts.values()]
    return {"items": items}
