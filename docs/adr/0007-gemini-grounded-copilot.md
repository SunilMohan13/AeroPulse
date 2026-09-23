# ADR-0007: Gemini answers the copilot, behind a grounding validator

Status: Accepted
Supersedes: ADR-0006 (Copilot is evidence retrieval, not an LLM in this build)

## Context

ADR-0006 implemented `POST /api/v1/copilot/*` as deterministic retrieval and
fixed `llm_used` to false. Its reasoning still holds: LLD §5.3 and §24.3
forbid invented sensor readings, and an ungrounded model in front of
air-quality data can state a confident number that no instrument measured.

Two things changed.

1. The deterministic implementation answered exactly two question shapes. It
   keyed on `"explain" in question or "event" in question` and otherwise
   returned a count of open events. "What is the PM2.5 in Karnal?" matched
   neither branch and returned `"5 open event(s) in the store."` It also read
   the in-process `EventStore` unconditionally, so it could never see a
   worker-produced event even with Timescale populated.

2. ADR-0006 named the condition under which an LLM becomes acceptable: "a
   later LLM step can wrap the same schema after a validator that rejects
   ungrounded numbers." That validator now exists.

The previous build also shipped `libs/intelligence/llm.py`, which set
`llm_used=True` and prefixed `[llm-rewrite-pending]` whenever
`AEROPULSE_OPENAI_API_KEY` held any non-empty string — with no network call.
That violated ADR-0006's own contract and is removed.

## Decision

Google Gemini answers copilot questions, under four constraints.

**Tool-only grounding.** The model is never given observation data in its
prompt. Its only route to a value is a typed tool in
`libs/copilot/aeropulse_copilot/tools.py`, each backed by the same readers
the REST API serves. Every call and result is recorded in a ledger.

**A numeric validator gates every answer.** `grounding.validate_answer`
extracts each number from the prose and requires it to trace to a tool
result. A failure gets one corrective regeneration; a second failure falls
back to deterministic retrieval. An unvalidated number never reaches a user.

**`llm_used` reports what happened.** True only when a model produced the
text and it passed grounding. A missing key, an upstream error or a
grounding failure all yield false plus a `degraded_reason`.

**The event path stays deterministic.** The LLM lives in a new package,
`libs/copilot`, and `libs/intelligence` gains no LLM dependency. Detection,
scoring, anomaly and forecast are unchanged and LLM-free. The copilot only
explains what they already computed. AGENTS.md's "No LLM on the event path"
survives intact — this ADR narrows it to what it always meant.

## Consequences

- The copilot can answer "what is the air quality in Delhi", wind, fire,
  hazard and event questions against live data.
- Place names resolve through a committed gazetteer
  (`libs/geospatial/gazetteer.py`). An unknown place returns
  `unknown_location`; it is never silently mapped to a default city.
- Air quality bands use the CPCB National Air Quality Index, not US EPA.
  The same concentration carries a different label on each scale.
- Running the copilot costs money per question. `AEROPULSE_GEMINI_API_KEY`
  is server-side only and must never reach the browser bundle.
- Without a key the platform behaves exactly as it did before, with the
  reason stated on every response.
- `copilot.v1` becomes `copilot.v2`: the contract is `extra="forbid"`, so
  adding `tool_calls`, `grounding`, `model` and `degraded_reason` required a
  version bump.
