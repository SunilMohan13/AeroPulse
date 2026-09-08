# AeroPulse India

Evidence-fused environmental intelligence for the Punjab–Haryana–Delhi NCR corridor.

This repository is a **Phase 1–3** implementation of `AeroPulse_India_Low_Level_Design.md`: platform foundation, CPCB / FIRMS / IMD replay connectors, and a **deterministic event engine**. Docker Compose is the only local runtime. The MapLibre shell is unchanged in Phase 3.

## Architecture (this pass)

```
Connector replay (CPCB, FIRMS, IMD)
        → canonical contracts
        → quality + H3 grid
        → grid features + IDW PM2.5 + anomaly + source likelihood
        → pollution events (event.v1)
FastAPI /api/v1/events  (forecast/graph still 501)
```

Logical services are Python packages; they pack into `api`, `worker`, and `connector` containers.

## Prerequisites

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Docker + Compose
- Node 22 (frontend)

## Quick start (libraries / tests)

```bash
uv sync
uv run ruff check .
uv run pytest tests/unit tests/contract -q
```

Mint a VIEWER or ADMIN JWT:

```bash
uv run python -c "from aeropulse_auth import encode_token, Role; print(encode_token('dev', [Role.VIEWER]))"
```

Run the API locally:

```bash
uv run aeropulse-api
# GET http://127.0.0.1:8000/health
# GET http://127.0.0.1:8000/api/v1/sources  (Bearer token)
```

Replay connectors (no network, no secrets):

```bash
uv run aeropulse-connector
```

## Docker slim stack

```bash
docker compose -f infrastructure/docker/compose.yaml up --build
```

Published on localhost only:

| Service | URL |
|---|---|
| API | http://127.0.0.1:8000/docs |
| Web | http://127.0.0.1:5173 |
| MinIO console | http://127.0.0.1:9001 |

Optional connector profile: `--profile connectors`.

## Adding a source

1. Create `connectors/<name>` implementing `DataConnector`.
2. Map payloads to `libs/contracts` (never leak source JSON past `normalize`).
3. Add a fixture under `fixtures/` and a contract test.
4. Register the source in `config/sources.yaml` (`auth_ref` only — no secrets).
5. No changes to event engine, UI, or forecast unless the data type is new.

## Logging

JSON logs via structlog. Required fields: `timestamp`, `level`, `service.name`, `event`, `correlation.id` (when bound). Do not log credentials or citizen PII.

## Out of scope (later phases)

Satellite connectors, LightGBM/MLflow, forecast/plume, Copilot, citizen reports, ArangoDB graph, SigNoz UI, OIDC, Kubernetes. Event detection uses `baseline-idw-0.1` (ADR-0004).
