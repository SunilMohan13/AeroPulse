# AeroPulse India — Production Readiness

**Date:** 2026-09-08 (Docker/wiring fixes added 2026-09-09)
**Verdict: not production ready.** Suitable for a technical demonstration of the ML pipeline via the CLI. Not suitable for operational air-quality decisions.

### 2026-09-13 ML notebook and registry update

- Read-only audit found 369/375 notebook code cells executed, 367 with saved outputs, and zero saved
  errors. The 1.7M-row canonical dataset and 256 MB event-aware dataset physically exist outside
  the repository and pass their manifest gates.
- No notebook-track model bundle is physically present. Saved output metrics therefore remain
  research evidence; they are not loadable serving candidates.
- `GET /api/v1/models` now exposes both deterministic serving baselines and filesystem-registry
  records with truthful lifecycle stage, runtime role and artifact availability. This closes the
  two-registry visibility gap without changing prediction routing.
- Google AI integration remains gated on the TimescaleDB-backed API read path and a grounded,
  schema-validated evidence envelope. Gemini must not be wired to the process-local event store.

### Honest remaining work (updated 2026-09-15)

The backend is materially closer to a working system, but the remaining work is still real and specific:

1. Error-drift monitoring (needs delayed ground truth) and pager routing beyond structured logs. Hourly PSI/KS already runs as `aeropulse-drift-monitor`.
2. Provider-aware checkpoint resume logic beyond the shared cursor contract.
3. OIDC and production secret-store hardening.
4. Quantile P10/P90 fitting, hazard calibration, and worker champion materialisation so served hazard/peak leave the persistence baseline.
5. Replace the integrated population reference fixture with a licensed WorldPop/Census extract and validate its spatial/temporal provenance.
6. Production load testing, SLOs, and dashboard/alert coverage.
7. Live Sentinel/MODIS/CAMS (OpenAQ, Open-Meteo, and FIRMS are live-capable when keys are set).

This list is intentionally narrow and honest. It is not a blanket "everything is missing" note; it is
what still requires deliberate work after the implemented backend fixes.

### 2026-09-14 persisted API and real-input E2E update

- **P0-1 fixed:** event list/detail, evidence, latest forecast generation, and latest lineage graph
  now read TimescaleDB when `AEROPULSE_DATABASE_URL` is configured. The in-memory store remains the
  test/DB-free fallback; configured database failures return 503.
- **Replay amplification:** the Compose connector is now a scheduled loop (`restart: unless-stopped`)
  on `interval_seconds` from `config/sources.yaml`. It is not a one-shot job and there is no
  `--profile connectors`.
- **Container model registry fixed:** the 2.6 MB checked-in `models/` registry/artifacts are copied
  into runtime images. `/api/v1/models` returns 3 `PRIMARY_BASELINE` plus 4 `REGISTERED_ONLY`
  records. `source_likelihood` earned PRODUCTION; hazard/peak remain unpromoted and serve the
  persistence baseline with `degraded: true`.
- **Actual-input validation passed:** committed CPCB/FIRMS/IMD/satellite fixtures flowed through
  connector -> Kafka -> worker -> TimescaleDB -> authenticated API. Event detail, evidence,
  forecast, graph, and models returned HTTP 200. The latest forecast response contained exactly six
  cells with horizons `[3, 6, 12, 24, 48]` after latest-generation filtering.
- Existing local volumes contain historical duplicated replay snapshots created before the restart
  fix. They were preserved deliberately. A clean environment will not recreate that amplification;
  pruning old local development rows is optional maintenance, not part of this change.

### 2026-09-14 grid intelligence read API update

- Persisted `grid_feature` and `grid_prediction` rows are now queryable through four authenticated
  endpoints: paginated/filterable lists and latest-per-grid lookups.
- The APIs return canonical `grid-features.v1` / `prediction.v1` contracts and never substitute
  fixture data. Missing/unavailable database configuration returns 503.
- Verified against actual preserved connector-produced rows: 2 feature rows and 2 prediction rows;
  list/latest routes returned HTTP 200 with PM2.5 142.3 and baseline confidence 0.9168.
- Populated local DB smoke check over 50 sequential requests: event list p95 15.88 ms, feature list
  p95 11.47 ms, prediction list p95 18.74 ms. This does not replace concurrent production load tests.

### 2026-09-14 operational map persistence update

- `/api/v1/map/air-quality`, `/fire`, and `/weather` now return each source record's latest
  Timescale observation, with optional validated bbox and bounded limit. DB-free development keeps
  the committed fixture fallback.
- `/api/v1/map/forecast` now returns each event/horizon's latest persisted forecast and derives
  coordinates from canonical H3 cell IDs.
- `/api/v1/map/grid` now returns latest persisted feature cells as closed H3 polygons.
- Real-data E2E: AQ returned 8 CPCB measurements, fire 2 FIRMS detections, weather 2 IMD points,
  forecast returned horizons 0/3/6/12/24/48 with valid coordinates, and grid returned 2 closed
  seven-point polygons with PM2.5 values 142.3 and 186.0.
- Satellite map metadata remains fixture-backed because raster observations are currently held only
  in the worker snapshot and are not persisted to a queryable table.

### 2026-09-14 raster persistence update

- Added migration `0004_raster_observation.sql`; worker raster envelopes now upsert metadata while
  large arrays remain in object storage as required by `raster.v1`.
- `/api/v1/map/satellite` reads latest persisted source/product footprints and retains the explicit
  `AOD is not surface PM2.5` warning.
- Actual replay E2E persisted 8 rows: Sentinel-5P, MODIS, CAMS, INSAT, Bhuvan, ICAR, industry and
  OSM. The API returned 8 closed polygon footprints; MODIS retained sample AOD 0.62.
- This closes raster metadata persistence, not live satellite acquisition. Those connectors remain
  replay-only and their referenced object URIs may still be logical when raw-object storage fails.

### 2026-09-14 drift monitoring update

- Added an authenticated `/api/v1/drift` endpoint for whitelisted feature and prediction signals.
- Computes PSI and two-sample KS over caller-supplied non-overlapping reference/current windows.
- Enforces minimum sample counts and returns `INSUFFICIENT_DATA` with null metrics rather than a
  false stability claim. Actual local data correctly returned reference 0/current 2.
- Synthetic tests cover stable, shifted, constant and insufficient distributions.
- **Partial, not complete:** error drift still requires delayed CPCB ground-truth labels; source
  coverage drift can be monitored through `feature.source_count`, but no scheduler/alert sink calls
  this endpoint automatically yet.

### 2026-09-16 scheduled drift monitoring update

- `aeropulse-drift-monitor` now runs as a separate Compose service every hour. It compares the
  preceding 24-hour current window with the prior 7-day reference window for all allowlisted
  feature and prediction signals.
- `WARNING` and `DRIFT` produce structured `drift.monitor.alert` logs with signal, sample counts,
  PSI, and KS values. Insufficient samples remain an explicit non-alert outcome.
- This is scheduled monitoring, not an external paging solution: alert routing, error drift, and
  operator-owned thresholds remain open work.

### 2026-09-14 API metrics update

- Added Prometheus `/metrics` with HTTP request counters, request-duration histograms, and in-flight
  gauge. Labels use method, FastAPI route template and status; concrete event/grid IDs are excluded.
- Verified against real persisted event, grid-feature and satellite requests: each emitted request
  count and latency histogram series under its route template.
- This partially closes observability only. Worker ingestion/quality/ML metrics, OTLP collector
  deployment, dashboards and alerts remain open; `/metrics` is intentionally not included in OpenAPI.

## 2026-09-09 update — Docker Compose now boots clean, four small wiring gaps closed

Running `docker compose -f infrastructure/docker/compose.yaml up --build` previously crash-looped
`worker` and `connector`, and OOM-killed `web`. Root causes and fixes:

- **`worker`/`connector` crash-looped with `Permission denied` removing `.venv` files.** The image
  is built as root, then switches to a non-root user without `chown`ing `/app`; `uv run` at container
  start re-syncs the environment and cannot write to root-owned files. Fixed in
  `infrastructure/docker/Dockerfile`: `chown -R aeropulse:aeropulse /app` after the build-time sync,
  plus `UV_FROZEN=1`/`UV_NO_SYNC=1` so `uv run` never mutates the env at runtime.
- **`web` was OOM-killed during Vite dependency bundling** (`mem_limit: 256m`). Raised to `1g` in
  `infrastructure/docker/compose.yaml`.
- **`redis` host port 6379 can collide with unrelated local containers.** Remapped the host side to
  `6380` (`127.0.0.1:6380:6379`); internal `redis:6379` traffic between containers is unaffected.

Also closed this pass (small, test-covered, no behavior change to the demo path):

- **P1-11 fixed — `config/sources.yaml` is now load-bearing.** `apps/connector/aeropulse_connector_app/runner.py`
  reads it and skips any source marked `enabled: false`; a missing/malformed file falls back to
  "everything enabled" rather than silently stopping ingestion. The file now lists all 11 replayed
  sources (previously only 6 of 12 appeared in it).
- **P1-3 partially fixed — `forecast_confidence` and `impact_confidence` are no longer hardcoded `0.0`.**
  `libs/intelligence/aeropulse_intelligence/detect.py` now reuses the per-cell confidence the
  forecast module already computes (previously discarded) and the PM2.5 estimator's own
  `estimate_confidence`.
- **P1-8 partially fixed — MinIO no-op is now logged, not silent.** `libs/common/aeropulse_common/objects.py`
  emits a structured `objects.raw_copy_not_stored` warning (reason: `no_credentials` or
  `minio_error`) whenever a raw copy is not actually written, instead of swallowing the failure.
  The function still returns a logical URI for backward compatibility — nothing consumes it as a
  guarantee of a stored object yet, so this is observability, not a full fix.

Verified: `uv run ruff check .`, `uv run pyright`, and `uv run pytest tests/unit tests/contract -q`
all pass (183 tests, up from 178), and a full `docker compose up --build` brings up all 7 services
healthy with the connector replaying the same 11-source counts as before.

## 2026-09-09 update (2) — four more low-effort gaps closed

- **P1-9 partially fixed — `trace_id`/`span_id` now bind onto log lines.** `libs/observability/aeropulse_observability/logging.py`
  adds a structlog processor that reads the active OTel span context and sets `trace_id`/`span_id`
  when a span is active; a no-op outside of a traced request. Traces still export nowhere unless
  `AEROPULSE_OTEL_EXPORTER_OTLP_ENDPOINT` is set (unchanged) — this only fixes the log-correlation
  half of the gap, not the missing custom metrics or exporter wiring. Tests:
  `tests/unit/test_logging_trace_context.py`.
- **P2 fixed — API list endpoints now support pagination.** `GET /api/v1/events` and
  `GET /api/v1/sources` accept `limit`/`offset` query params and return `total`/`limit`/`offset`
  alongside `items`; omitting both preserves the previous full-list response shape exactly (`limit`
  defaults to `null`, meaning "no limit"). Verified over live HTTP and in
  `tests/unit/test_api.py::test_sources_pagination` /
  `test_events_rejects_invalid_pagination_params`.
- **P2 fixed — quality-score weights are now configuration-driven (LLD §16.2).**
  `libs/connector_sdk/aeropulse_connector_sdk/quality.py`'s `QUALITY_WEIGHTS` can be overridden via
  the `AEROPULSE_QUALITY_WEIGHTS` env var (a JSON object of a subset of keys); malformed or absent
  input falls back to the documented defaults. Tests: `tests/unit/test_quality.py::test_weights_configurable_via_env`,
  `test_weights_fall_back_to_defaults_on_malformed_env`.

Verified again after these four: `uv run ruff check .`, `uv run pyright` (0 errors), and
`uv run pytest tests/unit tests/contract -q` all pass — **189 tests**, up from 183.

**Still explicitly not attempted** (each is a real project, not a quick fix): P0-1 (API↔DB), P1-1
(frontend wiring), P1-4 (population source), P1-5/P1-6/P1-7
(ML calibration — these require an operator-agreed false-alert budget and/or real ground truth, not
an arbitrary constant change), P1-10 (unused Kafka topics/DLQ), drift monitoring, checkpointing,
Redis caching, OIDC.

## 2026-09-09 update (3) — P1-2 fixed: `grid_feature`/`grid_prediction` are now persisted

This was the single highest-leverage remaining item — repeatedly flagged in this document and in
`AeroPulse_Architecture_Review.md` as unblocking four downstream gaps at once (feature store, API
read path, post-hoc error measurement, drift detection). It turned out to be tractable: the worker
already had a full `TimescaleRepository` for observations/events/forecasts/lineage; only the two
hypertables that back grid-hour intelligence were never written to.

**What changed:**

- `libs/intelligence/aeropulse_intelligence/engine.py`'s `EventStore` gained `latest_features` and
  `latest_predictions` dicts, keyed by `grid_id`.
- `libs/intelligence/aeropulse_intelligence/detect.py`'s `process_snapshot` now records every
  processed cell's `GridFeature`/`GridPrediction` there **unconditionally** — not only the cells
  that happened to trigger a `PollutionEvent` as before. This was the actual bug: `store.features`
  (the old dict) was only ever populated inside the `if event is not None:` branch.
- `apps/worker/aeropulse_worker/db.py`'s `TimescaleRepository` gained `upsert_grid_feature` and
  `upsert_grid_prediction`, matching the existing `grid_feature`/`grid_prediction` schema exactly
  (`ON CONFLICT (time, grid_id[, model_version]) DO UPDATE`, so a cell reprocessed within the same
  hour refines its row instead of erroring or silently skipping).
- `apps/worker/aeropulse_worker/main.py`'s `_persist_intelligence` now flushes both dicts after
  every detection pass, guarded by `hasattr` like the rest of that function (so the in-memory test
  double is unaffected).

**Verified end-to-end, not just unit-tested:** a full `docker compose up --build`, followed by
`SELECT count(*) FROM grid_feature` / `grid_prediction` directly against the running TimescaleDB
container, returned real rows with sane values (e.g. `pm25=142.3`, `model_version=baseline-idw-0.1`,
`confidence=0.95`) — the tables that were empty by construction on every previous pass now hold
data from a single replay cycle.

Tests: `tests/unit/test_event_engine.py::test_latest_features_populated_for_every_cell_not_just_events`,
`tests/unit/test_worker_db_grid_persistence.py` (fake-cursor SQL/parameter assertions for both new
repository methods), `tests/unit/test_worker_persist_intelligence.py` (proves `_persist_intelligence`
actually calls the new methods, and is a no-op when the writer doesn't support them).

`uv run ruff check .`, `uv run pyright` (0 errors), `uv run pytest tests/unit tests/contract -q` —
**194 tests**, up from 189.

**Updated 2026-09-14:** persisted events, features and predictions now have Timescale-backed read
APIs. The remaining feature-store gap is an automated drift/error consumer, not storage or access.

---

## 1. Readiness by area

| Area | Ready | Blocking issues |
|---|---|---|
| Contracts & schema versioning | **Yes** | — |
| Connector extension model | **Yes** | — |
| Idempotency & dedup | **Yes** | — |
| ML training & evaluation | **Yes (methodology)** | Trained on model output, not ground truth |
| Model registry & promotion gate | **Yes** | Shadow scoring writes `shadow_prediction`; challengers never reach a response |
| Docker Compose stack | **Yes** | API, worker, connector loop, web, Timescale, Redpanda, Redis, MinIO |
| Source registry (`config/sources.yaml`) | **Yes** | Load-bearing for enabled/interval/live_capable; `GET /api/v1/sources` joins yaml + specs + health |
| Live ingestion | **Partial** | Open-Meteo, OpenAQ, and FIRMS are live-capable; Sentinel/MODIS/CAMS remain replay |
| Feature pipeline | **Partial** | `grid_feature`/`grid_prediction` persisted; hourly drift monitor consumes them; error drift still needs labels |
| Event confidences | **Partial** | `forecast_confidence`/`impact_confidence` wired; shadow rows are comparison-only |
| API | **Partial** | Timescale-backed events/grid/map; satellite acquisition remains replay-only |
| UI | **Partial** | Demo/Live switch; Live reads the API through `services/resolve.ts` and never silently substitutes demo |
| Observability | **Partial** | API `/metrics` and worker `:9090/metrics`; no default OTLP exporter |
| Drift monitoring | **Partial** | On-demand `/api/v1/drift` plus hourly Compose monitor; error drift still needs delayed labels |
| Security | **Partial** | Dev-only JWT by design; no OIDC |
| Disaster recovery | **Partial** | Documented; untested |
| SLO monitoring | **No** | Nothing measurable |

---

## 2. Sequenced remediation

Dependency-ordered. Each item states why it comes when it does.

### Stage 1 — make the pipeline observable end to end

**1.1 [DONE 2026-09-14] Persist and expose `grid_feature` / `grid_prediction`.** Worker upserts and authenticated filterable list/latest APIs are implemented and verified against persisted connector input. Drift/error jobs remain separate work.

**1.2 [DONE 2026-09-14] Give the API a database read path.** `TimescaleEventReader` now reads persisted events, evidence, latest forecast generation and latest graph snapshot; `InMemoryEventReader` remains the test double. Database connection failure returns 503.

**1.3 [PARTIAL 2026-09-14] Wire observability.** API latency/count/in-flight Prometheus metrics and log trace IDs are implemented. Remaining: OTLP collector/export, ingestion/quality/ML metrics, dashboards, alerts and SLO automation.

### Stage 2 — make the science defensible

**2.1 Obtain CPCB ground truth and retrain.** Every current metric describes reconstruction of CAMS-derived model output. This is the single highest-value scientific action; no modelling change substitutes for it. Only after this can the PM2.5 estimator's accuracy be stated operationally.

**2.2 Calibrate the anomaly alert threshold.** Measured recall is 0.046 against the CPCB "Very Poor" exceedance label — roughly 95% of exceedances missed — with a false-alert rate of 0.003. The residual model is sound (R² 0.84); the alert rule is not. Tune the margin against an explicit false-alert budget agreed with operators, then re-run the gate. Requires no retraining.

**2.3 Per-horizon forecast promotion.** 3/6/12 h show real skill (+0.17 to +0.46); 24 h is worse than persistence (−0.119). Promote per horizon rather than per model so the useful horizons ship. Do not tune until the aggregate looks acceptable — that hides the 24 h regression.

**2.4 Source attribution needs labels, not a better model.** `traffic` scores F1 = 0.000. The labels are heuristics; a larger model would reproduce the heuristic with more parameters. Either obtain labelled attribution data or reduce scope to the classes that validate (`regional_transport`, F1 0.84) and state the limitation. Per LLD §5.4, complexity is not the missing ingredient.

**2.5 Population source plumbing is integrated; production data handoff remains.** `/api/v1/risk/areas` now scores versioned population cells independently per area and returns provider/license/source metadata. The checked-in `reference-fixture` is deliberately marked `replace-before-production`; operational deployment must replace it with a licensed WorldPop/Census extract and rerun spatial validation.

### Stage 3 — harden

**3.1 [PARTIAL 2026-09-16] Implement drift monitoring.** On-demand PSI/KS plus hourly `aeropulse-drift-monitor`. Remaining: pager routing, seasonal dashboards, and error drift after delayed labels arrive.
**3.2 [DONE 2026-09-09] Make `config/sources.yaml` load-bearing.** `apps/connector/aeropulse_connector_app/runner.py` now reads it and skips `enabled: false` sources; falls back to "all enabled" if the file is missing/malformed. `GET /api/v1/sources` joins the same yaml with `SOURCE_SPECS` and `source_health`.
**3.3 [DONE 2026-09-27 for local Compose] MinIO credentials** are passed to api and connector as `AEROPULSE_MINIO_ACCESS_KEY` / `SECRET_KEY` (same local-dev pattern as the Timescale password). Without keys, `put_raw_json` still logs `objects.raw_copy_not_stored` and returns a logical `s3://` URI.
**3.4 [PARTIAL] Checkpointing.** OpenAQ live honors `FetchRequest.start_time` / cursor as a lower bound. Provider-aware resume beyond the shared cursor contract is still open.
**3.5 Add an ML job to CI.** Nothing retrains or re-validates automatically; a leakage regression would not be caught.
**3.6 [DONE] Redis** caches HTTP responses in the API path.
**3.7 [PARTIALLY DONE 2026-09-09] Confidence model.** `forecast_confidence` now derives from the forecast module's own downwind per-cell confidence, and `impact_confidence` from the PM2.5 estimator's `estimate_confidence`, instead of hardcoded `0.0`. Neither has been validated for calibration — treat as wired, not as scientifically vetted.

### Stage 4 — operational
OIDC, DR rehearsal, load testing against a populated database, security testing, then SLO monitoring. Frontend Live wiring is in place (`services/resolve.ts`).

---

## 3. Risks if deployed as-is

| Risk | Severity | Why |
|---|---|---|
| Accuracy claims based on model output | **High** | Metrics describe CAMS reconstruction, not station accuracy. Publishing them as air-quality accuracy would be misleading |
| Anomaly detector missing 95% of exceedances | **High** | If force-promoted, an operator would reasonably infer "no alert" means "no exceedance" |
| Source attribution read as causal | **High** | Weak labels; one class undetectable. LLD caveat §65.4 exists precisely for this |
| Undifferentiated exposure numbers | Medium | Uniform population density makes impact ranking meaningless |
| No drift detection | Medium | Seasonal shift into the burning season would degrade the model silently |
| No observability | Medium | Failures would be discovered by users rather than by monitoring |
| Raw provenance URIs pointing at nothing | Medium | Breaks the audit chain LLD §5.3 requires |
| Dev-only symmetric JWT | Medium | Documented and intentional; still not production identity |

---

## 4. What is genuinely safe to demonstrate now

* The connector extension model, including a real live source with no credential.
* Point-in-time-correct feature engineering on a real 90-day window, with the shared spec preventing train/serve skew.
* Four models trained on real data with temporal, spatial and seasonal holdouts and skill scores against honest baselines.
* A model registry with a promotion gate that **demonstrably refuses** three of four models on measured quality.
* Champion inference with feature-contract validation and graceful degradation, at 0.056 s for 5 cells.
* An honest metrics story, including the negative results.

The last point is the most defensible thing in this repository. A reviewer can see which models work, which do not, and precisely why — which is considerably more valuable than four models all reported as passing.
