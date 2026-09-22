# AeroPulse India

Evidence-fused environmental intelligence for the Punjab–Haryana–Delhi NCR corridor.

This repository implements **Phases 1–4 of the LLD (backend only)** plus a trained ML layer: connectors, quality, H3 grid, event engine, evidence lineage, OpenAPI 3, and four models trained on live data with a gated model registry. The MapLibre UI is owned separately.

## Architecture (this pass)

```text
Connector replay (CPCB, FIRMS, IMD)  +  LIVE Open-Meteo (no credential)
        → canonical contracts (observation.v1 / meteo.v1 / raster.v1)
        → quality + H3 grid
        → grid features (shared feature spec, point-in-time safe)
        → trained models: PM2.5 estimator · anomaly · source likelihood
                        · forecast · 24h peak · 24h hazard
        → model registry with an enforced promotion gate
        → shadow serving: challengers scored beside the champion, never served
        → pollution events (event.v1) → forecast.v1 + graph.v1 + hazard.v1
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
# GET http://127.0.0.1:8000/api/v1/grid-features?limit=100  (Bearer token, DB required)
# GET http://127.0.0.1:8000/api/v1/grid-predictions?limit=100  (Bearer token, DB required)
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

The API exposes Prometheus text metrics at `GET /metrics` (request counts, latency histogram, and
in-flight requests). Route labels use FastAPI templates rather than concrete IDs.

Optional connector profile: `--profile connectors`.

Verified 2026-09-09: all 7 services (`timescaledb`, `redpanda`, `redis`, `minio`, `api`, `worker`,
`web`) come up healthy from a clean `up --build`. `connector` is a one-shot replay job: it runs one
cycle and exits 0 with `restart: "no"`, preventing repeated fixture ingestion. See
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

Six models train on **live, credential-free** Open-Meteo data and register with full provenance:

```bash
# Offline, from the committed fixture (no network)
uv run aeropulse-ml train --model all

# Live: 90 days across 5 Indo-Gangetic corridor cells
AEROPULSE_CONNECTOR_MODE=live uv run aeropulse-ml train --model all --live --days 90 --promote

uv run aeropulse-ml models          # registry and stages
uv run aeropulse-ml predict --live  # champion inference, JSON on stdout
uv run aeropulse-ml parity          # offline/online feature parity gate
uv run aeropulse-ml drift           # one scheduled drift sweep (exits 2 on drift)
```

`parity` is the gate that makes every other number meaningful. Training builds a grid-hour from a
snapshot holding the whole window; online inference only has data up to that hour. The harness
rebuilds each grid-hour from a truncated snapshot and diffs, so a feature that reads the future
into training, or that is missing at inference, is measured rather than assumed. Measured
2026-09-22: **144 grid-hours, zero divergence across 47 features.**

Evaluation uses temporal, spatial and seasonal holdouts only — LLD §19 forbids random splits on
spatially and temporally correlated data, and no random split is reachable in this codebase.

A **promotion gate** blocks any model that fails its own metrics. On the 2026-09-22 live 90-day
run (10,920 rows, 5 corridor cells):

| Model | Stage | Gate outcome |
|---|---|---|
| `pm25_estimator` | `PRODUCTION` | skill +0.409 vs persistence, R² 0.975 |
| `source_likelihood` | `PRODUCTION` | macro F1 0.592 |
| `anomaly_detector` | `VALIDATION` | detection F1 0.145 < 0.30 |
| `propagation_forecast` | `VALIDATION` | 24 h skill −0.106 |
| `pm25_peak_24h` | `VALIDATION` | extreme recall 0.049 < 0.70; extreme bias −41.4 µg/m³ |
| `pm25_hazard_24h` | `VALIDATION` | PR-AUC 0.334 does not beat reading current PM2.5 (0.380) |

Four of six refusing to serve, each with its reason recorded, is the intended behaviour. The
hazard result is the one to read: the classifier **loses to simply reading the current
concentration**, and the gate blocks it rather than shipping it. See
`docs/AeroPulse_ML_Architecture.md` for every metric and caveat.

> **Scientific caveat.** Open-Meteo air quality is CAMS-derived **model output, not ground
> measurement**. It validates the pipeline end to end; it does not validate accuracy against CPCB
> stations. Retrain on CPCB before any operational claim.

## Out of scope (later phases)

Live satellite HTTP (Sentinel-5P/MODIS/CAMS are **replay fixtures**), MLflow, live LLM Copilot,
citizen CV models, ArangoDB client, SigNoz, OIDC, Kubernetes. CAMS blend is optional `cams_applied`.

**Shadow serving.** A model held at `VALIDATION` can be moved to `SHADOW`
(`uv run aeropulse-ml promote <id> --stage SHADOW`). The worker then scores it on live traffic
beside the deterministic champion and writes both to `shadow_prediction`, with a hash of the
feature vector both saw. A challenger never affects the served answer: its exceptions become
error rows. Measured: 960 rows over 480 grid-hours, zero failures, 19 ms warm-up.

## Frontend: Demo and Live

The UI ships a **Demo / Live** switch in the top bar, and both modes are supported paths.

| | Demo | Live |
|---|---|---|
| Source | `frontend/web/src/data/mock*.ts` | the AeroPulse API |
| Needs a backend | no | yes, plus `VITE_API_TOKEN` |
| Timeline scrubber | scrubs the scripted episode | inert — the API serves one snapshot |
| Coverage | 5 events, 8 evidence items, 10 citizen reports, 8 exposure areas | whatever is persisted |

Demo is the default and is a product feature: a scripted Punjab stubble-burning episode
transporting into Delhi NCR, reproducible with no network. Live reads the API and is bounded by
what the backend actually holds.

```bash
cp frontend/web/.env.example frontend/web/.env.local
# then put a token in it:
uv run python -c "from aeropulse_auth import encode_token, Role; print(encode_token('ui', [Role.VIEWER]))"
cd frontend/web && npm install && npm run dev
```

Under Compose, export `AEROPULSE_UI_TOKEN` before `up` to enable live mode in the container.

**What live mode will not show you, and says so.** The API supplies less than the demo
narrative, and the UI marks each gap rather than filling it:

| Surface | In live mode | Why |
|---|---|---|
| Population at risk | live, with a caveat | `/api/v1/risk/areas` supplies real headcounts, but its population layer ships as a fixture licensed `replace-before-production` |
| Recommended actions | explained absence | No API route supplies them |
| Source freshness / latency / quality | `unknown` | `/api/v1/sources` is a registry, not a health feed |
| Citizen reports | live, with a caveat | Reports are real; no CV model runs, so every one is `cv_class=unknown`, `moderation=pending` |
| Evidence graph | demo data, labelled | `graph.v1` has no layout coordinates for this diagram |
| Hazard / peak | `baseline` badge | Both models are withheld by the promotion gate |

Population coverage is corridor-urban only: five Delhi-to-Karnal cells. A point in Punjab
resolves no reference cell and correctly reports `population_measured: false` rather than
stretching a nearest neighbour 200 km. Replacing the fixture with a licensed WorldPop or Census
extract closes this.

Where a live call fails, the UI serves demo data **and names the endpoint and reason in a
banner**. It never substitutes silently — verified by stopping the database with the API up:
health returns 200, the storage routes return 503, and the banner reads
`risk-areas — backend storage unavailable (503) — showing demo data`.

**Known not working:** nothing in the UI writes to the API; it is read-only. Event, evidence,
forecast, graph, grid-feature, grid-prediction, and model-catalog APIs now read persisted/runtime
state. Operational air-quality, fire, weather, forecast, and H3 grid map layers are database-backed;
satellite/raster metadata is persisted and served as product footprints. Live satellite HTTP is
still deferred; current raster rows come from replay connectors. See `docs/AeroPulse_Production_Readiness.md`.

Docs: `docs/architecture.md`, `docs/api.md`, `docs/openapi/openapi.v1.json`, and the six review
documents under `docs/AeroPulse_*.md`.
