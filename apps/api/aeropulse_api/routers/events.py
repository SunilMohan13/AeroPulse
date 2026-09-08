"""Event APIs (LLD §25.2). Forecast/graph remain Phase 4/5."""

from aeropulse_auth.jwt import TokenClaims
from aeropulse_contracts.event import EventStatus
from fastapi import APIRouter, Depends, HTTPException, Query

from aeropulse_api.deps import get_claims
from aeropulse_api.event_store import EVENT_STORE

router = APIRouter(prefix="/api/v1/events", tags=["events"])


@router.get("")
def list_events(
    _claims: TokenClaims = Depends(get_claims),
    status: str | None = Query(default=None),
) -> dict:
    """List pollution events from the in-process store (Timescale when wired)."""
    items = list(EVENT_STORE.events.values())
    if status:
        try:
            wanted = EventStatus(status)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid status") from exc
        items = [e for e in items if e.status == wanted]
    items.sort(key=lambda e: e.updated_at, reverse=True)
    return {"items": [e.model_dump(mode="json") for e in items]}


@router.get("/{event_id}")
def get_event(event_id: str, _claims: TokenClaims = Depends(get_claims)) -> dict:
    """Fetch a single event.v1 payload."""
    event = EVENT_STORE.events.get(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    return event.model_dump(mode="json")


@router.get("/{event_id}/evidence")
def get_evidence(event_id: str, _claims: TokenClaims = Depends(get_claims)) -> dict:
    """List evidence items for an event."""
    if event_id not in EVENT_STORE.events:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    items = EVENT_STORE.evidence.get(event_id, [])
    return {"items": [e.model_dump(mode="json") for e in items]}


@router.get("/{event_id}/forecast")
def get_forecast(event_id: str, _claims: TokenClaims = Depends(get_claims)) -> dict:
    """Event forecast is Phase 4."""
    raise HTTPException(status_code=501, detail="Forecast is not enabled in this stack")


@router.get("/{event_id}/graph")
def get_graph(event_id: str, _claims: TokenClaims = Depends(get_claims)) -> dict:
    """ArangoDB graph is out of scope. Returns 501."""
    raise HTTPException(status_code=501, detail="Evidence graph is not enabled in this stack")
