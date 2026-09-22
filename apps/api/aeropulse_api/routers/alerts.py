"""Alert listing (LLD section 29). Delivery adapters are not implemented."""

from typing import Annotated

from aeropulse_auth.jwt import TokenClaims
from fastapi import APIRouter, Depends, Query

from aeropulse_api.deps import get_claims
from aeropulse_api.event_store import EVENT_STORE

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
    _claims: Annotated[TokenClaims, Depends(get_claims)],
    limit: Annotated[int | None, Query(ge=1, le=500)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    """List alerts generated from HIGH/CRITICAL events.

    Args:
        _claims: Authenticated caller.
        limit: Maximum alerts to return. Omitting it returns all of them,
            which reproduces the previous response exactly.
        offset: Alerts to skip.

    Returns:
        ``items``/``total``/``limit``/``offset``, matching the convention the
        other collection endpoints follow.
    """
    alerts = list(EVENT_STORE.alerts.values())
    total = len(alerts)
    window = alerts[offset : offset + limit] if limit is not None else alerts[offset:]
    return {
        "items": [a.model_dump(mode="json") for a in window],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
