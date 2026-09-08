# ADR-0006: Copilot is evidence retrieval, not an LLM in this build

## Status

Accepted

## Context

LLD §24 requires an LLM behind a policy/validator. Invented sensor readings would violate §5.3 and §24.3. No production LLM key is in the Compose stack.

## Decision

Implement `POST /api/v1/copilot/*` as deterministic retrieval over `EventStore`. `llm_used` is always false. Numeric claims are copied from `event.v1` / `forecast.v1` / evidence.

## Consequences

The UI can wire Copilot now. A later LLM step can wrap the same schema after a validator that rejects ungrounded numbers.
