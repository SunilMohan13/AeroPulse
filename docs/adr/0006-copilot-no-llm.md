# ADR-0006: Copilot is evidence retrieval, not an LLM in this build

## Status

Superseded by ADR-0007 (Gemini answers the copilot, behind a grounding validator)

## Context

LLD §24 requires an LLM behind a policy/validator. Invented sensor readings would violate §5.3 and §24.3. No production LLM key is in the Compose stack.

## Decision

Implement `POST /api/v1/copilot/*` as deterministic retrieval over `EventStore`. `llm_used` is always false. Numeric claims are copied from `event.v1` / `forecast.v1` / evidence.

## Consequences

The UI can wire Copilot now. A later LLM step can wrap the same schema after a validator that rejects ungrounded numbers.


## Superseded

ADR-0007 replaces this decision. Its condition for allowing an LLM —
"a validator that rejects ungrounded numbers" — is now implemented in
`libs/copilot/aeropulse_copilot/grounding.py`, and the LLM is confined to
a separate package so the event path stays deterministic. The claim below
that `llm_used` is always false no longer holds: it is now true exactly
when a model produced the text and its numbers passed validation.
