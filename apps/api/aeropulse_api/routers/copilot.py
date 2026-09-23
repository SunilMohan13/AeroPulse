"""Copilot APIs (LLD section 25.4). Evidence retrieval only; llm_used is always false."""

from aeropulse_auth.jwt import TokenClaims
from aeropulse_intelligence.copilot import explain_event, query_store
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from aeropulse_api.deps import get_claims
from aeropulse_api.event_store import current_store

router = APIRouter(prefix="/api/v1/copilot", tags=["copilot"])


class CopilotQuery(BaseModel):
    """Natural-language question. Only retrieved evidence is used."""

    question: str = Field(..., min_length=1)


class ExplainBody(BaseModel):
    """Explain a stored event by id."""

    event_id: str


@router.post("/query")
def copilot_query(body: CopilotQuery, _claims: TokenClaims = Depends(get_claims)) -> dict:
    """Answer from the event store. Does not invent sensor readings."""
    return query_store(current_store(), body.question).model_dump(mode="json")


@router.post("/investigate")
def copilot_investigate(body: CopilotQuery, _claims: TokenClaims = Depends(get_claims)) -> dict:
    """Same retrieval path as query (investigate intent)."""
    return query_store(current_store(), body.question).model_dump(mode="json")


@router.post("/explain-event")
def copilot_explain(body: ExplainBody, _claims: TokenClaims = Depends(get_claims)) -> dict:
    """Explain one event using stored evidence, forecast, and confidence."""
    return explain_event(current_store(), body.event_id).model_dump(mode="json")
