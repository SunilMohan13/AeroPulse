# AeroPulse India

Evidence-fused environmental intelligence for the Punjab–Haryana–Delhi NCR corridor.

This repository implements **Phases 1–4 of the LLD (backend only)** plus a trained ML layer: connectors, quality, H3 grid, event engine, evidence lineage, OpenAPI 3, and four models trained on live data with a gated model registry. The MapLibre UI is owned separately.

## Architecture (this pass)

```text
Connector replay (CPCB, FIRMS, IMD)  +  LIVE Open-Meteo (no credential)
        → canonical contracts (observation.v1 / meteo.v1 / raster.v1)
        → quality + H3 grid
        → grid features (shared feature spec, point-in-time safe)
        → trained models: PM2.5 estimator · anomaly · source likelihood · forecast
        → model registry with an enforced promotion gate
        → pollution events (event.v1) → forecast.v1 + graph.v1
FastAPI /api/v1  (OpenAPI at /openapi.json)
```

Read `docs/AeroPulse_Architecture_Review.md` for the full state of play, including what does **not** work.

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
| --- | --- |
| API | <http://127.0.0.1:8000/docs> |
| Web | <http://127.0.0.1:5173> |
| MinIO console | <http://127.0.0.1:9001> |
| Redis | `127.0.0.1:6380` (mapped off the default 6379 to avoid host conflicts) |

Optional connector profile: `--profile connectors`.

Verified 2026-09-09: all 7 services (`timescaledb`, `redpanda`, `redis`, `minio`, `api`, `worker`,
`web`) come up healthy from a clean `up --build`. `connector` is a one-shot replay job — it exits 0
after each cycle and `restart: unless-stopped` relaunches it; that is expected, not a crash. See
`docs/AeroPulse_Production_Readiness.md` for the container fixes that made this true.

## Adding a source

1. Create `connectors/<name>` implementing `DataConnector`.
2. Map payloads to `libs/contracts` (never leak source JSON past `normalize`).
3. Add a fixture under `fixtures/` and a contract test.
4. Register the source in `config/sources.yaml` (`auth_ref` only — no secrets).
5. No changes to event engine, UI, or forecast unless the data type is new.

## Logging

JSON logs via structlog. Required fields: `timestamp`, `level`, `service.name`, `event`, `correlation.id` (when bound). Do not log credentials or citizen PII.

## Machine learning

Four models train on **live, credential-free** Open-Meteo data and register with full provenance:

```bash
# Offline, from the committed fixture (no network)
uv run aeropulse-ml train --model all

# Live: 90 days across 5 Indo-Gangetic corridor cells
AEROPULSE_CONNECTOR_MODE=live uv run aeropulse-ml train --model all --live --days 90 --promote

uv run aeropulse-ml models          # registry and stages
uv run aeropulse-ml predict --live  # champion inference, JSON on stdout
```

Evaluation uses temporal, spatial and seasonal holdouts only — LLD §19 forbids random splits on
spatially and temporally correlated data, and no random split is reachable in this codebase.

A **promotion gate** blocks any model that fails its own metrics. On the 2026-09-08 run only the
PM2.5 estimator earned `PRODUCTION` (temporal MAE 3.90 µg/m³, R² 0.975, skill +0.435 vs
persistence); the other three were held at `VALIDATION` with reasons recorded. That is the intended
behaviour — see `docs/AeroPulse_ML_Architecture.md` for every metric and caveat.

> **Scientific caveat.** Open-Meteo air quality is CAMS-derived **model output, not ground
> measurement**. It validates the pipeline end to end; it does not validate accuracy against CPCB
> stations. Retrain on CPCB before any operational claim.

## Out of scope (later phases)

Live satellite HTTP (Sentinel-5P/MODIS/CAMS are **replay fixtures**), MLflow, live LLM Copilot,
citizen CV models, ArangoDB client, SigNoz, OIDC, Kubernetes. CAMS blend is optional `cams_applied`.

**Known not working:** the API reads a process-local store, not the database the worker writes to, so
`/api/v1/events` is empty under Compose; and the frontend uses mock data and never calls the API.
Both are scoped in `docs/AeroPulse_Production_Readiness.md`.

Docs: `docs/architecture.md`, `docs/api.md`, `docs/openapi/openapi.v1.json`, and the six review
documents under `docs/AeroPulse_*.md`.
