# AeroPulse Production Integration Plan

## Objective

Make the AeroPulse stack demonstrable end to end through Docker, authenticated API, live-capable frontend services, persisted operational data, and a complete Bruno API collection. Keep provenance honest: reference fixtures are integration assets, not production ground truth.

## Completed in this implementation pass

- Docker web service receives `VITE_API_BASE` and a development-only viewer token, overridable with `AEROPULSE_WEB_TOKEN`.
- Frontend live adapters for events, sources, event evidence, event forecasts, grid, fire, weather, copilot, citizen reports, evidence graphs, risk areas, and industry assets.
- `GET /api/v1/citizen/reports` list endpoint.
- `GET /api/v1/risk/areas` differentiated population-cell scoring endpoint with source/license/provenance metadata.
- `GET /api/v1/map/industry` GeoJSON endpoint.
- Versioned population-density reference fixture at `fixtures/population/density.json`.
- Population source registration in `config/sources.yaml` and the API source registry.
- OpenAPI export updated after route changes.
- Bruno collection created at `bruno/aeropulse` with requests for all documented API operations, a local environment, and usage notes.
- Browser validation against Docker confirmed live requests for overview, event detail, map, evidence graph, copilot, citizen reports, and risk/industry paths.

## Production handoff still required

1. Replace `fixtures/population/density.json` with a licensed WorldPop or Census extract while preserving `population-density.v1`, provider version, license, source URI, and acquisition timestamp.
2. Add a scheduled population ingestion connector that validates coverage, CRS, spatial resolution, checksum, and freshness before replacing the active population snapshot.
3. Persist population cells and industry assets in Timescale/PostGIS or the selected geospatial store; the current reference adapter is deterministic and API-visible but not a long-term population warehouse.
4. Add population data-quality metrics: coverage, stale cells, missing density, invalid geometry, and provider version.
5. Replace the development HS256 token with OIDC/JWKS and a deployment secret store.
6. Add alert delivery, OTLP export, dashboards, SLOs, concurrent load tests, and disaster-recovery rehearsal.
7. Expand credentialed live connectors and retrain/validate ML candidates only when CPCB ground truth and operator false-alert budgets are available.

## Validation commands

- `uv run ruff check .`
- `uv run pytest -q`
- `cd frontend/web && npm run build`
- `docker compose -f infrastructure/docker/compose.yaml config --quiet`
- `python scripts/export_openapi.py`
- Open `bruno/aeropulse` in Bruno and run the `local` environment requests.
- Run Docker browser checks at `http://127.0.0.1:5173/` and inspect API calls under `/api/v1`.

## Release gate

Do not call the population numbers operationally valid until the reference fixture is replaced with licensed provider data and the provider metadata, validation report, and freshness checks are committed with the deployment artifact.
