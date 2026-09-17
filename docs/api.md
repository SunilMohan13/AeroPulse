# AeroPulse HTTP API

Base URL (local): `http://127.0.0.1:8000`

Interactive: `GET /docs` (Swagger UI), machine contract: `GET /openapi.json` and `docs/openapi/openapi.v1.json`.

## Auth

`Authorization: Bearer <JWT>`

Mint a token:

```bash
uv run python -c "from aeropulse_auth import encode_token, Role; print(encode_token('ui', [Role.VIEWER]))"
```

Roles: `ADMIN`, `SCIENTIST`, `AUTHORITY`, `OPERATOR`, `ANALYST`, `VIEWER`, `CITIZEN`.  
VIEWER may GET map/events/sources. ADMIN/OPERATOR may POST sources and backfill.

Unauthenticated: `GET /health`, `GET /ready`, `GET /openapi.json`.

Prometheus scrape: unauthenticated `GET /metrics`. It exports API request counts, duration buckets,
and in-flight requests using low-cardinality route-template labels.

## Map (`/api/v1/map`)

Query `bbox=min_lon,min_lat,max_lon,max_lat` (optional on AQ/fire/weather) and `limit` (1–2000).
When a database URL is configured, operational layers read the latest persisted source records;
without one they use committed fixture fallbacks. Invalid bbox values return 422.

| Path | Returns |
| --- | --- |
| `/air-quality` | Latest Timescale station/pollutant points (`parameter`, value, quality, grid); fixture fallback without DB |
| `/fire` | Latest Timescale fire detections with FRP/confidence; fixture fallback without DB |
| `/weather` | Latest Timescale wind/temperature observations; fixture fallback without DB |
| `/forecast` | Latest persisted event/horizon forecasts as H3-center points |
| `/satellite` | Latest persisted `raster.v1` metadata footprints; arrays stay in object storage and AOD is explicitly not surface PM2.5 |
| `/grid` | Latest persisted `grid_feature` cells as closed H3 GeoJSON polygons |

## Events (`/api/v1/events`)

When `AEROPULSE_DATABASE_URL` is configured, these routes read worker-persisted TimescaleDB rows.
Without a database URL they use the process-local in-memory test/development store. A configured
but unavailable database returns 503 rather than silently returning an empty list.

| Path | Notes |
| --- | --- |
| `GET /` | `?status=ACTIVE` filter; `?limit=&offset=` pagination (added 2026-09-09; `limit` omitted = no limit, response adds `total`/`limit`/`offset`) |
| `GET /{id}` | `event.v1` |
| `GET /{id}/evidence` | Evidence list |
| `GET /{id}/forecast` | Latest persisted forecast generation as `forecast.v1`; `horizon_hours=12` convenience field |
| `GET /{id}/graph` | Latest persisted `graph.v1` edge snapshot (Timescale lineage, not Arango) |

Missing event → 404. Forecast/graph are **not** 501 when the event exists in the store.

## Sources

`GET /api/v1/sources` (`?limit=&offset=` pagination, added 2026-09-09), `GET /{id}`, `POST /` (ADMIN), `POST /{id}/backfill` (ADMIN/OPERATOR) runs fixture replay with `processing_mode=BACKFILL`.

## Models

`GET /api/v1/models` returns both deterministic serving baselines and filesystem-registry records.
Use `runtime_role` to distinguish `PRIMARY_BASELINE`, `PRIMARY_MODEL`, and `REGISTERED_ONLY`;
`artifact_available` reports whether the local artifact resolves. Registry visibility does not
change serving: only a `PRODUCTION` record may be labelled `PRIMARY_MODEL`.

## Grid intelligence

These authenticated routes require `AEROPULSE_DATABASE_URL`; missing/unavailable storage returns
503 rather than fabricated or fixture data.

| Path | Filters / response |
|---|---|
| `GET /api/v1/grid-features` | `grid_id`, ISO-8601 `start`/`end`, `limit` (1–500), `offset`; returns `grid-features.v1` items |
| `GET /api/v1/grid-features/{grid_id}/latest` | Latest persisted feature vector or 404 |
| `GET /api/v1/grid-predictions` | `grid_id`, `model_version`, ISO-8601 `start`/`end`, `limit`, `offset`; returns `prediction.v1` items |
| `GET /api/v1/grid-predictions/{grid_id}/latest` | Optional `model_version`; latest persisted prediction or 404 |

Local populated-DB smoke test (2026-09-14, 50 sequential requests per route): events p95 15.88 ms,
grid features p95 11.47 ms, grid predictions p95 18.74 ms. This is developer-machine evidence,
not a production concurrency/SLO certification.

## Drift

`GET /api/v1/drift` compares two required, non-overlapping time windows using PSI and a two-sample
KS statistic. Supported signals are a fixed whitelist of persisted feature fields plus prediction
PM2.5/confidence. Optional `grid_id` and prediction-only `model_version` narrow the scope.

The response is `STABLE`, `WARNING`, `DRIFT`, or `INSUFFICIENT_DATA`. PSI warning/drift thresholds
are 0.10/0.25; KS uses the sample-size-dependent 5% critical value. Distribution drift does not
prove quality degradation, and error drift remains unavailable until delayed ground-truth labels
are persisted.

## Copilot (`/api/v1/copilot`)

`POST /query`, `/investigate`, `/explain-event`. Response is `copilot.v1`. `llm_used` is always `false` in this build: numbers are copied from stored events. Missing event → answer states not found; no invented PM2.5.

## Citizen (`/api/v1/citizen`)

`POST /reports`, `POST /reports/{id}/media`, `GET /reports/{id}`. Reports stay `moderation=pending`, `cv_class=unknown`. They never open a HIGH event.

## Alerts and risk

`GET /api/v1/alerts` — HIGH/CRITICAL events only, `channel=log`.
`GET /api/v1/risk?pm25=` — `pollution_severity` vs `population_risk` (`risk-0.1`).

## Errors

FastAPI validation → 422. Auth → 401/403. Rate limit on `/api/v1/*` → 429.
