# AeroPulse architecture (implemented)

Logical services from the LLD pack into three app containers (`api`, `worker`, `connector`) plus TimescaleDB+PostGIS, Redpanda, Redis, and MinIO.

```text
Connectors (CPCB, FIRMS, IMD replay)
    → MinIO s3://aeropulse/raw/<source>/...  (soft-fail)
    → Kafka aero.observation.*
Worker
    → quality → H3 grid → Timescale observations
    → grid features → IDW PM2.5 → anomaly → source likelihood
    → pollution events + evidence + lineage graph
    → wind-advection forecast.v1
    → shadow scoring of registered challengers -> shadow_prediction
API FastAPI /api/v1
```

## Intelligence versions

| Component | Version |
| --- | --- |
| Grid features | `grid-features-0.5.0` |
| PM2.5 estimator | `baseline-idw-0.1` |
| Anomaly | `quantile-baseline-0.1` |
| Source likelihood | `source-likelihood-0.1` |
| Forecast | `wind-advection-0.1` (`cams_applied: false`) |
| 24h hazard (served) | `persistence-hazard-0.1` (deterministic, `degraded: true`) |
| 24h peak (served) | `persistence-peak-0.1` (deterministic, `degraded: true`) |
| ML feature spec | `ml-features-2.0.0` |

Trained models are registered but serve only when promoted. A model at `SHADOW` is scored on
live traffic and written to `shadow_prediction`; it never reaches a response. The hazard and peak
routes therefore answer from the deterministic rules above and label every item `degraded`.

LLM Copilot is **not** on this path (LLD §5.4 / §61 Decision 6).

## Not in this runtime

UI (colleague), ArangoDB client, live satellite HTTP (replay fixtures only), LightGBM, SigNoz, citizen CV models, OIDC.
