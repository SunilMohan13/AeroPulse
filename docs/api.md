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

## Map (`/api/v1/map`)

Query `bbox=min_lon,min_lat,max_lon,max_lat` (optional).

| Path | Returns |
| --- | --- |
| `/air-quality` | GeoJSON points (PM2.5 fixture or Timescale) |
| `/fire` | Active fires |
| `/weather` | Wind/temperature |
| `/forecast` | Advection predictions (`cams_applied` on properties) |
| `/satellite` | Empty FeatureCollection |
| `/grid` | Empty FeatureCollection |

## Events (`/api/v1/events`)

| Path | Notes |
| --- | --- |
| `GET /` | `?status=ACTIVE` filter |
| `GET /{id}` | `event.v1` |
| `GET /{id}/evidence` | Evidence list |
| `GET /{id}/forecast` | `forecast.v1`, `horizon_hours=12` convenience field |
| `GET /{id}/graph` | `graph.v1` vertices/edges (Timescale lineage, not Arango) |

Missing event → 404. Forecast/graph are **not** 501 when the event exists in the store.

## Sources

`GET /api/v1/sources`, `GET /{id}`, `POST /` (ADMIN), `POST /{id}/backfill` (ADMIN/OPERATOR) runs fixture replay with `processing_mode=BACKFILL`.

## Copilot (`/api/v1/copilot`)

`POST /query`, `/investigate`, `/explain-event`. Response is `copilot.v1`. `llm_used` is always `false` in this build: numbers are copied from stored events. Missing event → answer states not found; no invented PM2.5.

## Citizen (`/api/v1/citizen`)

`POST /reports`, `POST /reports/{id}/media`, `GET /reports/{id}`. Reports stay `moderation=pending`, `cv_class=unknown`. They never open a HIGH event.

## Alerts and risk

`GET /api/v1/alerts` — HIGH/CRITICAL events only, `channel=log`.
`GET /api/v1/risk?pm25=` — `pollution_severity` vs `population_risk` (`risk-0.1`).

## Models

`GET /api/v1/models` — in-process registry (`baseline-idw-0.1`, `quantile-baseline-0.1`, `wind-advection-0.1`). Optional MLflow via Compose profile `ml`.

## Errors

FastAPI validation → 422. Auth → 401/403. Rate limit on `/api/v1/*` → 429.
