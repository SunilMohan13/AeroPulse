# ADR-0004: Baseline IDW estimator instead of LightGBM in Phase 3

## Status

Accepted

## Context

LLD §18.1 specifies LightGBM/XGBoost for hyper-local PM2.5. Phase 2 only ingested CPCB, FIRMS, and IMD replay fixtures (two stations, two fires). There is no AOD, no multi-week history, and no spatial holdout set.

LLD §5.4 requires deterministic calculations before probabilistic models.

## Decision

Ship `baseline-idw-0.1` (inverse-distance weighting of CPCB PM2.5) plus `quantile-baseline-0.1` anomaly. Record model versions on every event. Do not train LightGBM until a historical archive exists.

## Consequences

Events are reproducible from fixtures. Upgrading to LightGBM later does not change `event.v1` or `/api/v1/events` — only `model_versions`.
