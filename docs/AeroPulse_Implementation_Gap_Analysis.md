# AeroPulse India — Implementation Gap Analysis

**Date:** 2026-09-08
**Basis:** `AeroPulse_India_Low_Level_Design.md` v1.1 vs the repository at commit `532fa5e` plus uncommitted work.
**Method:** every claim below is backed by a file path, a command output, or an explicit "NOT VERIFIED" marker. Nothing is inferred from documentation alone.

## 2026-09-13 notebook/registry correction

A read-only JSON audit corrected an earlier overstatement: the merged notebook suite is largely
executed, not empty. Across 36 notebooks, 369 of 375 code cells have execution counts, 367 retain
saved outputs, and none retain error outputs. The external PM2.5 base/event-aware Parquets also
exist. However, notebook artifact directories are empty, so no notebook model is currently loadable.

The API's two-registry mismatch is partially fixed: `/api/v1/models` now includes filesystem
registry records alongside deterministic serving baselines, with truthful `runtime_role`, stage and
artifact availability. Worker inference still uses the deterministic baselines; shadow serving and
notebook bundle export remain open.

---

## 1. How to read this document

Two corrections to a common reading of the LLD come first, because they change what counts as a gap.

**Kubernetes is not a gap.** LLD line 10 states *"Kubernetes is not used in development"* and §41.8 is titled *"Why not Kubernetes for development"*. Docker Compose is the specified runtime. The absence of k8s manifests is compliance, not a defect. ADR-0001 records the decision.

**ArangoDB absence is an accepted deviation, not a defect.** LLD §14 specifies ArangoDB for the evidence graph. The implementation substitutes TimescaleDB `evidence_edge` rows and documents this in `docs/adr/0005-timescale-lineage.md`. The graph *capability* (`graph.v1`, evidence lineage with confidence and model version per edge) is delivered; only the engine differs. Scored PARTIAL-BY-DESIGN.

Conversely, one apparent strength is illusory: **LLD §64's own implementation checklist marks nearly every AI and connector item `[x]`**, including "PM2.5 estimator", "Anomaly detector", "Source likelihood", "Forecast" and "Model registry". None of those were trained models before this pass, and the connectors marked complete are fixture replays. The checklist is aspirational and should not be trusted as evidence. `README.md:85` is the honest counter-statement and agrees with the code.

---

## 2. Status legend

| Status | Meaning |
|---|---|
| PASS | Implemented and verified by test or execution |
| PARTIAL | Implemented for a subset of the requirement |
| MISSING | No implementation |
| INCORRECT | Implemented but wrong |
| DECLARED-UNUSED | Dependency/schema present, never exercised |
| ACCEPTED-DEVIATION | Differs from LLD by documented decision |
| NOT VERIFIED | Cannot be tested in this environment; blocker named |

---

## 3. LLD → code traceability matrix

### Platform and integration

| LLD | Requirement | Implementation | Status | Gap / action |
|---|---|---|---|---|
| §41 | Docker Compose runtime | `infrastructure/docker/compose.yaml` — 8 services, healthchecks, mem limits, named volumes | PASS | — |
| §7.1 | Connector SDK: base, contracts, retry, rate_limit, checkpoint, health | `libs/connector_sdk/` — `base.py`, `contracts.py`, `retry.py`, `circuit.py`, `quality.py`; **`rate_limit.py` added this pass** | PARTIAL | `checkpoint.py` still absent; `FetchRequest.cursor` exists but no connector reads it |
| §7.2 | Source registry | `config/sources.yaml` | INCORRECT | **The runner never reads this file.** `apps/connector/.../runner.py` hardcodes its job list. Registry is decorative |
| §8 | Canonical versioned contracts | `libs/contracts/` — `observation.v1`, `meteo.v1`, `fire.v1`, `raster.v1`, `grid-features.v1`, `event.v1`, `forecast.v1` | PASS | Genuine strength: `extra=forbid`, `schema_version` on every record |
| §9 | 15-source integration matrix | 12 connectors plus a population-density adapter boundary | PARTIAL | Population risk plumbing is integrated with a versioned reference fixture; replace it with a licensed WorldPop/Census extract before operations. OpenAQ and ERA5 remain absent |
| §10 | 19 Kafka topics, DLQ, retry topics, schema registry | `libs/common/.../topics.py` defines 19; `aiokafka` producer/consumer real | PARTIAL | **Only 4 of 19 topics are produced or consumed.** DLQ is a Postgres table (`connector_dead_letter`), not the declared `aero.dlq.*` topic. Redpanda exposes a schema registry port that no code uses |
| §11 | Immutable raw object layer | `libs/common/.../objects.py` `put_raw_json` | INCORRECT | **Silently no-ops without credentials**: returns a synthetic `s3://` URI without writing (`objects.py:32-33`), and swallows all exceptions (`:55-57`). `provenance.raw_object_uri` therefore points at nothing in the default configuration |
| §12.2 | ~1 km grid, no lat/lon rounding | `libs/geospatial/grid.py` — H3 res 8 (~0.74 km²) | PASS | LLD §12.2 permits "H3 or an equivalent deterministic grid"; ADR-0002 records it |
| §13 | 8 Timescale hypertables | 3 migrations create all of them | PARTIAL → **[FIXED 2026-09-09]** | ~~`grid_feature` and `grid_prediction` are never written to by any code.~~ Now written by `TimescaleRepository.upsert_grid_feature`/`upsert_grid_prediction`, called from `_persist_intelligence` for every processed cell. Verified against a live TimescaleDB container, not just unit tests |
| §12.3 | PostGIS for boundaries, stations, geometries | Extension created; `grid_cell.geometry` column exists | DECLARED-UNUSED | No code populates or queries any geometry column |
| §14 | ArangoDB evidence graph | Timescale `evidence_edge` + `graph.v1` | ACCEPTED-DEVIATION | ADR-0005. Edges carry confidence, evidence ids, model version |
| §20 | Redis hot features / API cache | In compose and in `pyproject.toml` deps | DECLARED-UNUSED | **`Redis(` is never instantiated anywhere.** No caching exists |
| §32 | Caching strategy | — | MISSING | Follows from the above |

### Data and quality

| LLD | Requirement | Implementation | Status | Gap / action |
|---|---|---|---|---|
| §16 | Quality rule engine: range, temporal, sensor, spatial | `libs/connector_sdk/quality.py`, applied in `apps/worker/.../pipeline.py:104-113` | PASS | Connectors emit a placeholder `quality_score=1.0` which the worker then overwrites — correct, but the placeholder is misleading in isolation |
| §16.2 | Configurable weighted quality score | `quality.py` | PARTIAL | Weights are hardcoded, not configuration-driven as §16.2 requires |
| §17.2 | Lags 1/3/6/12/24h, rolling mean/max, rate of change, historical percentile | Was 1h/3h only. **This pass added 6h, 24h lags and 6h/24h trailing means** | PARTIAL | Rolling max, rate of change and historical percentile still absent |
| §15 | Canonical grid feature model | `GridFeature` (`grid-features.v1`) | PARTIAL | Satellite group **now populated** (AOD wired this pass). Agriculture, industry, urban and exposure groups remain permanent nulls because no connector supplies them |
| §39 | Idempotency | SHA-256 `dedup_key` (`hashing.py`) + `ON CONFLICT (dedup_key, time) DO NOTHING` | PASS | Genuine strength |
| §38 | Backfill and replay | `POST /api/v1/sources/{id}/backfill` replays fixtures | PARTIAL | Replays local fixtures only; no upstream historical fetch before this pass |
| §17 | Point-in-time correctness | — | **INCORRECT (fixed)** | **P0 bug found: `build_features` selected observations by grid cell with no hour filter**, so any multi-hour window collapsed to the last record in the list. See §4 |

### ML and MLOps

| LLD | Requirement | Before this pass | After | Status |
|---|---|---|---|---|
| §18.1 | PM2.5 estimator, LightGBM/XGBoost, with interval + confidence | Hardcoded IDW formula, `POWER=2.0` | Trained `HistGradientBoostingRegressor`, 30 features, interval from residual spread | PASS (estimator family deviates — see note) |
| §18.2 | Anomaly: baseline + met regime + ML residual | Percentile rule, threshold `0.55` | Hour-of-week baseline fitted on train only + trained residual model | PASS (but fails its quality gate — §5) |
| §18.3 | Source likelihood, independent not softmax, calibrated | Fixed priors (`INDUSTRIAL_PRIOR = 0.11`) | Trained classifier, per-class probabilities, log-loss + Brier reported | PARTIAL (weak supervision — §5) |
| §18.4 | Propagation forecast, advection + ML residual correction | Kinematic formula `1/(1+0.08h)` | Residual-over-persistence models per horizon with skill scores | PARTIAL (24h fails gate — §5) |
| §18.5 | Exposure/risk separating severity from population risk | `risk.py` formula plus `/api/v1/risk/areas` | PARTIAL | Differentiated cells are live; source is explicitly reference-only until licensed population data is configured |
| §19 | Model registry: 11 metadata fields, 6-stage promotion, spatial+temporal holdouts | Hardcoded list of 3 version strings, all labelled `approval_status="PRODUCTION"` | `libs/ml/registry.py` — full metadata set, enforced `TRAINING→…→PRODUCTION` machine, champion resolution, single-champion invariant | PASS |
| §19 | "Avoid random splits" | No splits existed | `temporal_split`, `spatial_split`, `seasonal_split`; no random split is reachable | PASS |
| §20 | Offline Parquet + online features, same definitions | Two divergent definitions (notebooks vs serving) | **`aeropulse_contracts.feature_spec` is now the single source both import** | PASS |
| §45 | Metrics: RMSE/MAE/R²/calibration/F1/false-alert/skill-vs-baseline | None computed anywhere in the packages | `libs/ml/evaluation.py` computes all of these | PASS |
| §46 | Drift monitoring (PSI/KS, prediction and error drift) | `/api/v1/drift` computes bounded PSI/KS for feature/prediction/source-count signals | PARTIAL (2026-09-14) | Minimum-sample gates implemented; scheduled alerts and error drift await orchestration and delayed ground truth |
| §33.2 | ML metrics: inference latency, throughput | — | Timings reported by `aeropulse-ml predict`; no continuous metric | PARTIAL |

**Estimator family deviation:** LLD §18.1 names LightGBM/XGBoost. This implementation uses scikit-learn `HistGradientBoosting*` — the same gradient-boosted-histogram algorithm family. Reason: LightGBM requires a system `libomp` that is absent on the target machine (verified: `/opt/homebrew/opt/libomp/lib/libomp.dylib` does not exist on this arm64 host), whereas scikit-learn wheels bundle their own OpenMP. The estimator is one constructor call per trainer, so switching back is a one-line change.

### API, UI, observability, security

| LLD | Requirement | Implementation | Status | Gap / action |
|---|---|---|---|---|
| §25 | REST API: map, events, sources, copilot, citizen | 26 routes, `/api/v1`, Pydantic validation, OpenAPI 3.1 exported | PASS | — |
| §25 | Responses expose prediction, confidence, model_version, feature_version, evidence, grid | Present on `event.v1` / `forecast.v1` | PASS | Genuine strength |
| §43 | API p95 < 500 ms | Not measured under load against real data | NOT VERIFIED | `tests/load/test_health_load.py` exercises `/health` only |
| — | API reads persisted state | Timescale readers serve events/evidence/latest forecast/latest graph, grid features/predictions, and every map layer including persisted raster footprints | **PARTIAL [P0 FIXED 2026-09-14]** | Frontend consumes several persisted paths; live satellite acquisition remains replay-only and some UI domains remain demo-backed |
| §26 | UI: 11 screens | 9 pages exist in `frontend/web` | PARTIAL | Live adapters now cover events, sources, event evidence/forecast/graph, grid, fire, weather, citizen reports, copilot, risk areas, and industry assets when `VITE_API_TOKEN` is configured. Population values remain reference-fixture data |
| §21.3 | Four separate confidences | Four fields exist on `event.v1` | PARTIAL | Only `detection_confidence` and `source_confidence` are computed. `forecast_confidence` and `impact_confidence` are hardcoded `0.0` (`engine.py:102,186`) despite the forecast module computing its own per-cell confidence |
| §33 | OpenTelemetry + SigNoz | `libs/observability/telemetry.py` initialises a real TracerProvider | PARTIAL | **No OTLP endpoint is set in compose, so traces export nowhere by default.** SigNoz is absent (self-documented in `docs/architecture.md:31`) |
| §33.2 | Custom metrics (ingestion, quality, ML, API counters/histograms) | Prometheus API request counters/latency histogram/in-flight gauge | PARTIAL (2026-09-14) | Ingestion, quality and ML domain metrics plus collector/dashboards remain |
| §33.1 | `trace_id` on every log record | structlog JSON with service fields | PARTIAL | **No `trace_id` binding exists**; no span-context processor |
| §35.1 | Identity + RBAC | HS256 JWT, 7 roles, `require_roles` | PARTIAL-BY-DESIGN | Dev-only by explicit decision (ADR-0003). OIDC deferred |
| §35.2 | Secrets hygiene | All credentials via `os.getenv`; `.gitignore` covers `.env`, `*.pem`, `*.key` | PASS | **Verified: no real credential in the tree or in git history.** Only labelled dev placeholders |
| §50 | Connector test framework: unit, contract, replay, failure | 25 test files; contract tests per connector | PASS | Failure-injection tests were thin; **reliability tests added this pass** |

---

## 4. P0 findings

### P0-1 — API read path severed from worker write path

**[FIXED 2026-09-14]** `apps/api/aeropulse_api/event_store.py` now provides a request-scoped
`TimescaleEventReader`; all event routes depend on that read contract. Real connector input was
verified through Kafka, worker persistence and authenticated HTTP responses. Forecast and graph
queries select only the latest persisted generation/snapshot. The in-memory implementation remains
the test double, and configured database failures return 503.

The worker persists to TimescaleDB (`apps/worker/aeropulse_worker/db.py`). The API imports no database client and reads only `EVENT_STORE`, a module-level Python dict. In `compose.yaml` these are separate containers, so nothing the worker writes is ever visible to the API. A passing test (`test_events_empty`) encodes the broken behaviour as correct.

**Consequence:** the end-to-end demo cannot work as deployed. Not addressed in this pass; see §7.

### P0-2 — Multi-hour feature windows were silently corrupt (FIXED)

`build_features` filtered candidate observations by grid cell only, with **no hour filter**, then overwrote in a loop so the last list element won. Every feature row for a cell therefore carried an identical pollutant value while the lag columns varied correctly.

Measured before the fix, on 72 hours of real data: `pm25` had **1 distinct value per cell**. After: **68 and 63 distinct values**, matching the raw observations exactly.

Why it hid: the live detection path passes a single-hour snapshot, and every fixture held one hour. It corrupts all backfill, replay and training, and it *manufactures* excellent model scores — a constant target is trivially predictable, which is exactly how it first surfaced (MAE 0.0, R² 1.0).

Fixed in `libs/intelligence/features.py`; `_nearest_weather` was likewise time-blind and is now time-aware with a 3-hour staleness limit. Regression coverage: `tests/unit/test_features_multihour.py` (7 tests).

### P0-3 — Trained artifacts were unloadable (FIXED)

The notebook track trained real models but nothing could load them: feature names disagreed on **every** field (`temperature_2m` vs `temperature`, `fire_count_20km` vs `fire_count`, 20 km vs the serving 100 km radius), six features had no contract representation, and ML libraries were absent from both `pyproject.toml` and `uv.lock`. All four notebooks had `execution_count: null` and empty outputs — **never executed**, so no metric in the repository was real.

Fixed by making `aeropulse_contracts.feature_spec` the single definition both training and serving import, and by refusing to load any artifact whose baked-in feature list or `ml_feature_version` disagrees with the runtime (`inference.py`, `validate_feature_contract`).

### P0-4 — Reliability primitives existed but were wired to nothing (FIXED)

`retry_http`, `CircuitBreaker` and `live_http.fetch_json` were referenced only by their own definitions and unit tests. No connector imported them; `AEROPULSE_CONNECTOR_MODE=live` changed nothing because every `fetch()` called `load_fixture` unconditionally. Retry also contradicted its own docstring, retrying **all** `HTTPError` including 4xx, so a `401` burned five attempts.

Fixed: `LiveHttpClient` composes rate limiter → breaker → jittered retry → timeout; retry now classifies only 408/425/429/5xx and transport faults as retryable; jitter added (previously absent, a thundering-herd risk). 14 tests in `tests/unit/test_live_http.py`.

### P0-5 — Quadratic feature building (FIXED)

`build_features` rescanned every observation for every grid-hour. A 90-day 5-site window (≈11k grid-hours × 65k observations) did not complete. `FeatureSnapshot` now indexes itself on first use: **13,489 grid-hours/s**, and the 90-day dataset materialises in ~22 s including all network fetches.

---

## 5. P1 findings

| ID | Finding | Evidence |
|---|---|---|
| P1-1 | Frontend only partially calls the API | Live adapters cover events, sources, evidence, forecast, graph, grid, fire, weather, citizen reports, copilot, risk areas, and industry assets; population provider data remains reference-only |
| P1-2 | **[FIXED 2026-09-14]** `grid_feature`/`grid_prediction` persistence and reads | Worker persistence landed 2026-09-09. Four authenticated list/latest APIs now expose canonical persisted contracts with grid/model/time filters and pagination. Verified against actual Timescale rows |
| P1-3 | **[FIXED 2026-09-09]** `forecast_confidence` and `impact_confidence` hardcoded `0.0` | Was `engine.py:102,186`. Now wired in `libs/intelligence/aeropulse_intelligence/detect.py`: `forecast_confidence` reuses the forecast module's own downwind per-cell confidence; `impact_confidence` reuses the PM2.5 estimator's `estimate_confidence`. Regression test: `tests/unit/test_event_engine.py::test_forecast_and_impact_confidence_are_wired_not_hardcoded`. Not yet calibrated/validated |
| P1-4 | Population provider data is not yet production licensed | `/api/v1/risk/areas` and `fixtures/population/density.json` | Plumbing and differentiated scoring are integrated; replace the reference fixture and validate license/provenance before operations |
| P1-5 | Anomaly detector misses ~95% of exceedances | Measured recall 0.046 (temporal). **Now blocked by the promotion gate** |
| P1-6 | Forecast 24h horizon is worse than persistence | Measured skill −0.119. **Now blocked by the promotion gate** |
| P1-7 | Source likelihood cannot predict `traffic` at all | Measured F1 = 0.000, n = 25. **Now blocked by the promotion gate** |
| P1-8 | **[PARTIALLY FIXED 2026-09-09]** MinIO writes silently no-op without credentials | Was `objects.py:32-33,55-57`. Now logs a structured `objects.raw_copy_not_stored` warning (reason `no_credentials`/`minio_error`) on every no-op; still returns a logical URI, so a caller not reading logs still can't tell the difference from a real object |
| P1-9 | **[PARTIALLY FIXED 2026-09-09]** No custom OTel metrics; no `trace_id` in logs; traces export nowhere by default | §3 above. `trace_id`/`span_id` now bind onto log lines when a span is active (`libs/observability/aeropulse_observability/logging.py`); custom metrics and default exporter wiring remain absent |
| P1-10 | 15 of 19 Kafka topics unused; DLQ is a table not the declared topic | `topics.py` vs producers/consumers |
| P1-11 | **[FIXED 2026-09-09]** `config/sources.yaml` ignored by the runner | Was hardcoded `_RASTER_JOBS`. `apps/connector/aeropulse_connector_app/runner.py` now reads the file and skips any source marked `enabled: false`, falling back to "all enabled" if the file is missing/malformed. File now lists all 11 replayed sources (was 6 of 12). Regression tests in `tests/unit/test_replay.py` |
| P1-12 | **[PARTIAL 2026-09-14]** Drift monitoring incomplete | On-demand feature/prediction PSI+KS implemented; scheduled alerts and error drift remain |

## 6. P2 / P3

**P2:** ~~quality-score weights hardcoded rather than configurable (§16.2)~~ **[FIXED 2026-09-09]** — now overridable via `AEROPULSE_QUALITY_WEIGHTS`; ~~no pagination on list endpoints~~ **[FIXED 2026-09-09]** — `GET /api/v1/events` and `GET /api/v1/sources` accept `limit`/`offset`; no `checkpoint.py`, so no incremental cursors; rolling max / rate-of-change / historical percentile features absent; no Redis caching; `discover()` returns configured sites rather than fixture contents. **[Corrected 2026-09-13]** The merged notebooks are largely executed (369/375 code cells) and use shared toolkits; the remaining gap is absent physical notebook bundles and no worker inference integration.

**P3:** `cv.py` is keyword regex on text, not a CV model (honestly documented); ~~`sources.yaml` covers 6 of 12 connectors~~ **[FIXED 2026-09-09]** — now covers all 11 replayed sources; `graphify-out/` build artifacts are committed; CI runs no ML job and builds no images.

---

## 7. What this pass did and did not change

**Delivered and verified:** shared feature spec; hardened live transport; the first credential-free live connector; AOD wired into the satellite feature group; `rainfall` populated (previously dead schema); four trained models on 90 days of real data with temporal, spatial and seasonal holdouts; real metrics; a functioning model registry with an *enforced* promotion gate; champion inference with contract validation and graceful degradation; and fixes for P0-2 through P0-5.

**Deliberately not changed:** P0-1 (API↔DB) and P1-1 (frontend wiring). **[Update 2026-09-09] P1-2 (feature/prediction persistence) is now fixed — see §10.** P0-1 and P1-1 remain the work for a deployed end-to-end demo and are sequenced in `docs/AeroPulse_Production_Readiness.md`. They were left rather than rushed because each touches a service boundary that deserves its own review.

**Not verifiable here:** every keyed source. There is no `.env` and no credential in this environment; OpenAQ returns `401` and FIRMS requires a `MAP_KEY`. Those connectors are marked `NOT VERIFIED — requires <credential>` rather than given fabricated latency figures.

## 8. 2026-09-09 addendum — local setup and quick wiring fixes

Verified fresh from `git clone` on Python 3.13 (uv provisions its own 3.12 venv; `requires-python = ">=3.12"` is satisfied) plus a full `docker compose up --build`. Three Docker-only defects (not present in the LLD gap analysis above, since they only manifest under Compose) were found and fixed:

- `worker`/`connector` crash-looped with `Permission denied` deleting `.venv` files — the image built as root then switched to a non-root user without `chown`ing `/app`; `uv run` at container start tried to re-sync and failed. Fixed by chowning `/app` and setting `UV_FROZEN=1`/`UV_NO_SYNC=1` in `infrastructure/docker/Dockerfile`.
- `web` was OOM-killed mid-Vite-bundling on `mem_limit: 256m`; raised to `1g`.
- `redis`'s host port `6379` can collide with unrelated local containers; remapped host-side to `6380`.

Additionally, three items from §5/§6 above were closed without touching the API↔DB boundary (kept out of scope, as before):

- **P1-11** — `config/sources.yaml` is now read by `apps/connector/aeropulse_connector_app/runner.py` and is load-bearing (`enabled: false` skips a source); the file now lists all 11 replayed sources instead of 6.
- **P1-3** — `forecast_confidence`/`impact_confidence` are wired from already-computed values (forecast module's downwind confidence; PM2.5 estimator's `estimate_confidence`) instead of hardcoded `0.0`.
- **P1-8** — MinIO's silent no-op now logs a structured warning (`objects.raw_copy_not_stored`) instead of swallowing the failure; the function's return value is unchanged (still a logical URI either way), so this is observability only, not a behavior fix.

`uv run ruff check .`, `uv run pyright`, and `uv run pytest tests/unit tests/contract -q` all pass — 183 tests, up from 178 (5 new regression tests for the above). P0-1 (API↔DB), P1-1 (frontend wiring) and P1-2 (feature/prediction persistence) remain open; see `docs/AeroPulse_Production_Readiness.md`.

## 9. 2026-09-09 addendum (2) — a second round of low-effort fixes

Four more items closed the same way: small, test-covered, no behavior change to defaults.

- **P1-9 (partial)** — `libs/observability/aeropulse_observability/logging.py` now binds `trace_id`/`span_id` from the active OTel span onto every log line (a no-op outside a traced request). Custom metrics and default OTLP exporter wiring are still absent; this only closes the log-correlation half. Tests: `tests/unit/test_logging_trace_context.py`.
- **P2** — `GET /api/v1/events` and `GET /api/v1/sources` gained `limit`/`offset` query params and `total`/`limit`/`offset` in the response; omitting both reproduces the previous response exactly. Verified over live HTTP (`curl .../api/v1/sources?limit=2&offset=1`) and in `tests/unit/test_api.py`.
- **P2** — `QUALITY_WEIGHTS` (LLD §16.2) is now overridable via `AEROPULSE_QUALITY_WEIGHTS` (JSON), falling back to the documented defaults on missing/malformed input. Tests: `tests/unit/test_quality.py`.
- **P3** — `config/sources.yaml` completeness fold-in from §8 above already covers this; no further action.

Deliberately still not attempted: the ML calibration items (P1-5/6/7) require an operator-agreed false-alert budget or real ground truth — changing a threshold constant without that would be exactly the kind of unvalidated tuning `AGENTS.md` warns against, not a quick fix.

`uv run ruff check .`, `uv run pyright` (0 errors), and `uv run pytest tests/unit tests/contract -q` all pass — **189 tests**, up from 183.

## 10. 2026-09-09 addendum (3) — P1-2 fixed: `grid_feature`/`grid_prediction` persistence

The repeatedly-flagged highest-leverage item (§3 §13, §5 P1-2, and the Architecture Review §5.1) is
closed. Root cause once investigated: it was not missing infrastructure — `TimescaleRepository`
already persisted observations, events, evidence, graphs and forecasts — it was that
`libs/intelligence/aeropulse_intelligence/detect.py::process_snapshot` only ever populated
`store.features` *inside* the `if event is not None:` branch, so a cell's feature/prediction was
discarded unless that cell happened to trigger a `PollutionEvent`.

Fix: `EventStore` gained `latest_features`/`latest_predictions` dicts populated unconditionally for
every processed cell; `TimescaleRepository` gained `upsert_grid_feature`/`upsert_grid_prediction`
matching the existing hypertable schemas with `ON CONFLICT ... DO UPDATE`; `_persist_intelligence`
flushes both after every detection pass.

**Verified against a running system, not only unit tests:** `docker compose up --build`, then
`SELECT count(*) FROM grid_feature` / `grid_prediction` directly against the TimescaleDB container
— both returned real rows (previously always zero) with sane values. Tests:
`tests/unit/test_event_engine.py::test_latest_features_populated_for_every_cell_not_just_events`,
`tests/unit/test_worker_db_grid_persistence.py`, `tests/unit/test_worker_persist_intelligence.py`.

`uv run ruff check .`, `uv run pyright` (0 errors), `uv run pytest tests/unit tests/contract -q` —
**194 tests**, up from 189.

**[Updated 2026-09-14]** Four read APIs now query `grid_feature`/`grid_prediction`; the remaining gap
is that no drift job consumes the feature/prediction history.

