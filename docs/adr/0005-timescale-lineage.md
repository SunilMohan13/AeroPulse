# ADR-0005: Timescale evidence lineage instead of ArangoDB in Phase 4

## Status

Accepted

## Context

LLD §14 specifies ArangoDB for environmental reasoning. Phase 4 needs a graph JSON contract for the UI colleague without adding another always-on store to the slim Compose stack.

## Decision

Persist lineage as `evidence_edge` rows and serve `graph.v1` from `GET /api/v1/events/{id}/graph`. Arango remains a later optional profile.

## Consequences

Multi-hop AQL queries are not available. The UI can still render vertices/edges. A later Arango writer can project the same edges.
