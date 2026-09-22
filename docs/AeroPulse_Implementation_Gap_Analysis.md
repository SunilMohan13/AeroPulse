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
| §9 | 15-source integration matrix | 12 connectors exist (11 fixture-only + **1 live added this pass**) | PARTIAL | **No connector for OpenAQ, ERA5, or population.** Population is the input to every exposure number and is currently the constant `DEFAULT_POPULATION_DENSITY = 5000.0` (`risk.py:7`) |
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
| §18.5 | Exposure/risk separating severity from population risk | `risk.py` formula | unchanged | PARTIAL | Population density is a hardcoded constant |
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
| — | API reads persisted state | Timescale readers serve events/evidence/latest forecast/latest graph, grid features/predictions, and every map layer including persisted raster footprints | **PARTIAL [P0 FIXED 2026-09-14]** | Frontend remains unwired; live satellite acquisition remains replay-only |
| §26 | UI: 11 screens | 9 pages exist in `frontend/web` | PARTIAL | **Every one of the 8 services returns `mock*` imports.** The only `fetch(` in `src/` is the CARTO basemap. `VITE_API_BASE` is set in compose and never read |
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
| P1-1 | Frontend never calls the API | All 8 services return `mock*` imports; `VITE_API_BASE` inert |
| P1-2 | **[FIXED 2026-09-14]** `grid_feature`/`grid_prediction` persistence and reads | Worker persistence landed 2026-09-09. Four authenticated list/latest APIs now expose canonical persisted contracts with grid/model/time filters and pagination. Verified against actual Timescale rows |
| P1-3 | **[FIXED 2026-09-09]** `forecast_confidence` and `impact_confidence` hardcoded `0.0` | Was `engine.py:102,186`. Now wired in `libs/intelligence/aeropulse_intelligence/detect.py`: `forecast_confidence` reuses the forecast module's own downwind per-cell confidence; `impact_confidence` reuses the PM2.5 estimator's `estimate_confidence`. Regression test: `tests/unit/test_event_engine.py::test_forecast_and_impact_confidence_are_wired_not_hardcoded`. Not yet calibrated/validated |
| P1-4 | No population connector; exposure rests on a constant | `risk.py:7` |
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


---

## 11. 2026-09-22 addendum — ML serving path, feature layer, and the last P1 items

This pass implemented the open phases of
`docs/AeroPulse_Notebook_to_Production_ML_Integration_Plan.md` (1–4 and 6) and closed the
remaining P1 items that did not require a credential or a frontend change. Scope was agreed as
backend/ML only: `frontend/web` was not touched (P1-1 stays open by decision, per `AGENTS.md`),
and no git history was rewritten.

Verification for everything below: `uv run ruff check .`, `uv run ruff format --check .`,
`uv run pyright` (0 errors), `uv run pytest tests/unit tests/contract -q` — **302 tests**, up
from 223 at the start of the pass.

### 11.1 Corrections to this document

Three entries above were stale and are corrected here rather than silently left:

| Entry | Stated | Actually |
|---|---|---|
| §3 §7.1 | "`checkpoint.py` still absent" | `libs/connector_sdk/aeropulse_connector_sdk/checkpoint.py` exists and implements cursor-offset replay |
| §3 §20 / §32 | "`Redis(` is never instantiated anywhere. No caching exists" | `apps/api/aeropulse_api/cache.py` is a fail-open Redis response cache over 10 bounded read routes |
| §6 P2 | "no pagination on list endpoints" (partially) | `/api/v1/alerts` and `/api/v1/models` gained `limit`/`offset` this pass; events and sources already had it |

**Phase 0 of the integration plan is also stale, and this matters because it was listed as
blocking everything else.** That plan states a 1,564 MB blob in commits `8b71dce` and `82dc497`
blocks `git push` and requires a history rewrite. Measured on this checkout:

```text
largest blob reachable from any ref:  0.35 MB  (uv.lock)
8b71dce -> NOT REACHABLE FROM ANY BRANCH
82dc497 -> NOT REACHABLE FROM ANY BRANCH
held only by: 4 reflog entries
```

Push transmits reachable objects only, so **no history rewrite is needed and `git push` is not
blocked**. What remains is a 515 MB local `.git`, which is a disk-space matter reclaimable with
`git reflog expire --expire=now --all && git gc --prune=now --aggressive`. That command destroys
the recovery path for those commits, so it was **not run** — it is the repository owner's call.

### 11.2 Closed this pass

| ID | Finding | Resolution |
|---|---|---|
| P1-4 | No population connector; exposure rests on a constant (`risk.py:7`) | **FIXED.** `libs/geospatial/aeropulse_geospatial/population.py` resolves density from a 28-point Census-2011-derived district reference layer for the corridor, overridable via `AEROPULSE_POPULATION_DATA`. `score_risk` takes `lat`/`lon`, `GridFeature.population` is populated, and every result carries `population_measured` so an assumption is never mistaken for an estimate. Formula version `risk-0.2`; the density ceiling moved 20,000 → 40,000/km² because NE Delhi (36,155) saturated the old scale. Delivered as a **static reference layer, not a connector** — population is not a time series, and modelling it as `raster.v1` observations would have been ceremony. Tests: `tests/unit/test_risk.py` (8) |
| P1-9 | No custom OTel/domain metrics | **FIXED** (metrics half). Nine domain metrics in `libs/observability/.../metrics.py` covering ingestion, quality, features, events, ML inference and shadow, all with bounded labels, all **wired and incrementing** in `apps/worker`. Tests: `tests/unit/test_domain_metrics.py`. Default OTLP exporter wiring remains absent |
| P1-12 | Drift monitoring incomplete — no scheduled job | **FIXED** (scheduled half). `libs/ml/aeropulse_ml/drift_monitor.py` sweeps every whitelisted signal, compares a 24 h window against the preceding 7 days, and emits structured alerts. `uv run aeropulse-ml drift` exits 2 on drift so a scheduler can branch without parsing JSON. One unreadable signal cannot abort the sweep, and `INSUFFICIENT_DATA` is reported separately from `STABLE`. Error drift still needs delayed ground truth. Tests: `tests/unit/test_drift_monitor.py` (7) |
| §5.5 (plan) | Two registries; `GET /api/v1/models` cannot report reality | **FIXED.** `aeropulse_intelligence.model_registry` is a raising deprecation shim. The deterministic baselines are real `ModelRecord` entries (`aeropulse_ml/baselines.py`) in the filesystem registry, so one read reports both what serves and what was withheld. `champion()` skips artifact-less records, and `sync_baselines` registers a baseline as `RETIRED` when a trained champion already holds the family — preserving the single-champion invariant. Tests: `tests/unit/test_baselines_registry.py` (5), `test_ml_registry.py` (+3) |
| §3 §17.2 | Rolling max / rate of change / historical percentile absent | **FIXED** as part of the feature expansion below |

### 11.3 Feature layer expansion (plan Phases 1–2)

`ML_FEATURE_VERSION` is bumped to **`ml-features-2.0.0`** and `FEATURE_VERSION` to
`grid-features-0.5.0`. The bump is mandatory and deliberate: `validate_feature_contract` compares
it exactly, so every 1.0.0 artifact is invalidated rather than reinterpreted against a vector
that no longer means the same thing.

Seventeen fields added to `GridFeature`, all computable from data already ingested (the plan's
**Route B**, chosen over building six new ingestion pipelines):

| Family | Fields | Why |
|---|---|---|
| Trailing history | `pm25_roll_max_{6,24}h`, `pm25_roll_std_24h`, `pm25_trend_{3,24}h` | LLD §17.2; strictly trailing, so safe even where pm2.5(t) is the target |
| Current-hour derived | `pm25_delta_1h`, `pm25_pct_rank_24h` | Forecast-only; see the leakage note below |
| Dispersion | `ventilation_index`, `stagnation_score` | The winter mechanism that turns constant emissions into an episode |
| Neighbour field | `neighbor_pm25_{mean,max}`, `neighbor_count`, `upwind_pm25` | Other cells' concentrations — the signal a nowcast for a station-less cell actually needs |
| Fire rings | `fire_count_{25,50}km`, `fire_frp_50km`, `upwind_fire_frp` | A single 100 km ring cannot separate "next village" from "edge of domain" |
| Calendar (derived, not stored) | `is_weekend`, `is_stubble_season` | Crop-calendar prior, named so it is not mistaken for an ICAR observation |

**Leakage safety was strengthened, not just extended.** Name-level exclusion is insufficient:
`pm25_delta_1h` is `pm25 - pm25_lag_1h`, so its name differs from the target while revealing it
exactly. `feature_spec.DERIVED_FROM` now records each derived feature's upstream columns and the
import-time assertion walks that graph transitively. A feature computed *from* a set's target is
refused as firmly as the target itself, with a test that proves the refusal fires.

**Neighbour radius is 100 km, not the H3 k-ring.** At resolution 8 an adjacent cell is ~1 km
away and two stations are almost never that close, so a k-ring neighbour field would be
permanently empty on real data.

### 11.4 Offline/online parity harness (plan Phase 2 — its stated gate)

The plan calls this "the single most important measurement". `libs/ml/aeropulse_ml/parity.py`
and `uv run aeropulse-ml parity` implement it, though **not the comparison the plan described**,
and the difference is worth stating:

- The plan asks to diff production features against the notebook Parquet. Those notebook artifact
  directories are empty in this checkout (§0 of this document records that), so that comparison
  is not runnable.
- Training and serving already share one implementation and one feature list, so the classic
  two-codebase skew is structurally impossible here.
- The skew that **is** possible is batch-versus-realtime: training materialises a grid-hour from a
  snapshot holding the whole window; online inference only has data up to that hour. The harness
  rebuilds each grid-hour with a truncated snapshot and diffs. A disagreement means either a
  feature is reading the future into the training frame, or it is unavailable at inference time.

Measured, this pass: **144 grid-hours compared, zero divergence across all 47 features.** A test
injects a deliberately forward-looking feature and confirms the harness catches it and names the
affected models, so the clean result is evidence rather than an absence of checking.

Caveat on coverage: the offline fixture is 3 days across 2 cells. The harness should be re-run on
a wider live window before its result is treated as conclusive.

### 11.5 Two new models, and what they measured

`pm25_peak_24h` (forward 24 h maximum) and `pm25_hazard_24h` (P(peak ≥ 121 µg/m³ within 24 h))
implement the plan's §5.4 reconciliation: **one hazard model at one threshold**. The CPCB
"Very Poor" breakpoint of 121 was chosen over the research pipeline's 150 because it is the
national standard and this is a public-facing alert. Two hazard probabilities on one map cell is
a product defect regardless of which is more accurate.

Measured on a live 90-day, 5-cell, 10,920-row Open-Meteo window (2026-09-22):

| Model | Stage | Gate outcome |
|---|---|---|
| `pm25_estimator` | **PRODUCTION** | skill +0.409 vs persistence, R² 0.975 |
| `source_likelihood` | **PRODUCTION** | macro F1 0.592 (was 0.000 on `traffic` and withheld before the feature expansion) |
| `anomaly_detector` | VALIDATION | detection F1 0.145 < 0.30 (was 0.086) |
| `propagation_forecast` | VALIDATION | 24 h skill −0.106 (was −0.119) |
| `pm25_peak_24h` | VALIDATION | extreme recall 0.049 < 0.70; extreme bias −41.4 µg/m³; held-out-cell recall 0.472 |
| `pm25_hazard_24h` | VALIDATION | PR-AUC 0.334 does **not** beat reading current PM2.5 (0.380) |

Two results deserve emphasis because they are the pass's most useful findings:

1. **`source_likelihood` earned PRODUCTION.** The expanded feature set (calendar + dispersion)
   lifted macro F1 from below the 0.50 floor to 0.592 without any threshold being relaxed.
2. **The hazard classifier loses to its own baseline.** PR-AUC 0.334 against 0.380 for simply
   reading the current concentration. The gate blocks it, which is the correct outcome and
   independently reproduces the notebooks' concern about this model family. The peak model
   likewise reproduces the notebooks' extreme-bias finding (−41.4 here, −32.4 there): squared-error
   regression minimises aggregate loss by predicting "no episode", so aggregate MAE improves
   (skill +0.396) while episode recall collapses to 0.049.

No threshold was lowered to make anything pass. One threshold was **added**: the peak gate also
checks spatial generalisation, because a model sold as hyper-local prediction for cells with no
station of their own has failed at its purpose if it only works where it was fitted.

### 11.6 Shadow serving (plan Phase 4)

`SHADOW` and `CANARY` were recorded stages that nothing routed traffic to. `libs/ml/aeropulse_ml/shadow.py`
plus a `shadow_prediction` hypertable (`infrastructure/db/migrations/0005_shadow_prediction.sql`)
close that. The worker warms challenger bundles at start and scores them after the served answer
is already computed.

Verified with the real trained models above: **960 shadow rows over 480 grid-hours, zero
failures, 93.7% mean feature completeness, 19 ms warm-up.** Failure isolation was tested by
replacing a challenger's estimator with one that raises — the exception becomes an error row and
the served path is untouched.

Also added, from the plan's §9: **feature completeness is asserted per prediction and recorded.**
Gradient boosting handles NaN natively, which is convenient and dangerous, because a silently
all-null feature family yields a confident answer rather than an error. Predictions below 50%
populated are refused with the reason stated.

### 11.7 New endpoints (plan Phase 6)

`peak_forecast.v1` and `hazard.v1` contracts, `p10`/`p90` on `forecast.v1`, and five routes:
`/api/v1/grid-hazard`, `/api/v1/grid-hazard/{grid_id}/latest`, `/api/v1/grid-peak`,
`/api/v1/grid-peak/{grid_id}/latest`, `/api/v1/map/hazard`. OpenAPI re-exported — 36 paths, up
from 31.

The plan's binding constraint for this phase is honoured: **a shadow model's output is never
returned as a served prediction.** These routes answer from a deterministic persistence rule
while no hazard or peak model is promoted, and every item carries `degraded: true` plus a
`persistence-*` `model_version`. Hazard items additionally carry `calibrated: false`, because an
uncalibrated gradient-boosting score ranks hours correctly but its magnitude is not a frequency,
and rendering 0.8 as "80% chance" would be wrong. A cell with no observed PM2.5 is omitted
rather than scored zero — "no data" and "no hazard" must not render identically on a map.

### 11.8 Still open after this pass

| ID | Item | Why it is still open |
|---|---|---|
| ~~P1-1~~ | ~~Frontend never calls the API~~ | **FIXED 2026-09-22.** All 8 service modules are mode-aware; a Demo/Live toggle selects between the scripted narrative and the API. See §12 |
| P1-5/6/7 | Anomaly, forecast-24h and hazard fail their gates | These need an operator-agreed false-alert budget or real CPCB ground truth. Moving a threshold to make them pass is exactly what the gate exists to prevent |
| P1-10 | 15 of 19 Kafka topics unused; DLQ is a table | Unchanged |
| P1-9 (part) | No default OTLP exporter; SigNoz absent | Metrics now exist and increment; export wiring does not |
| §3 §12.3 | PostGIS geometry columns unpopulated | Unchanged |
| §3 §9 | No OpenAQ or ERA5 connector | Both need credentials that do not exist in this environment |
| §3 §11 | MinIO writes no-op without credentials | Unchanged; logs a warning since 2026-09-09 |
| — | Champion hazard/peak predictions are not materialised by the worker | The routes serve the deterministic baseline and say so. Wiring a promoted champion through to these layers is the next step, and is deliberately not speculative work while both models sit at VALIDATION |

The scientific caveat is unchanged and applies to every number in §11.5: Open-Meteo air quality
is CAMS-derived **model output, not ground measurement**. These metrics validate the pipeline
end to end; they do not validate accuracy against CPCB stations.

---

## 12. 2026-09-22 addendum (2) — P1-1 closed: the frontend reads the API

P1-1 ("Frontend never calls the API; all 8 services return `mock*` imports; `VITE_API_BASE` is
inert") is fixed. The full write-up is §15 of
`docs/AeroPulse_Notebook_to_Production_ML_Integration_Plan.md`; what matters for this document:

**The demo is a mode, not a fallback.** A top-bar Demo / Live switch selects between the
scripted Punjab→Delhi episode and the API. Demo remains the default and still works with no
backend, no token and no network — it is what the product demonstrates, and burying it behind a
failure path would make it unreachable whenever the backend is healthy.

**`VITE_API_BASE` is now load-bearing**, alongside a new `VITE_API_TOKEN` (dev-only HS256, per
ADR-0003) and `VITE_DEFAULT_DATA_MODE`. All three are wired in `infrastructure/docker/compose.yaml`;
`frontend/web/.env.example` documents them.

**Three screens stay on demo data in live mode** because the API cannot serve them, and each
says so on screen rather than passing curated data off as live. These are now the concrete
backend gaps the UI work surfaced:

| Gap | Effect | Closed by |
|---|---|---|
| No `GET /api/v1/citizen/reports` | The Citizen screen cannot enumerate reports | A list route with the standard `items`/`total`/`limit`/`offset` shape |
| `graph.v1` has no layout coordinates | The Evidence graph cannot be drawn from live lineage | Coordinates on the contract, or a client-side force layout |
| No per-cell observed-history route | The forecast chart's observed leg stays scripted | A history endpoint, or deriving from `grid-features` by cell and time |
| `GET /api/v1/sources` is a registry, not a health feed | Freshness, latency, quality and record counts read "unknown" | Telemetry fields on the source route |
| `event.v1` carries no recommended actions or population-at-risk | Both render as "—" with a reason | Product decision on whether the API should own either |

**Two defects this pass introduced and caught by running it:** `At Risk: 0.0M people` (a null
coalesced to zero, which is a *false* claim rather than an unknown one) and `Healthy · -1 min`
(a sentinel leaking to screen). Both are fixed, and `SourceHealth`'s telemetry fields are now
`number | null` so the compiler — not a reviewer — finds the next such case.

**The no-silent-substitution property is verified, not assumed.** With the API up and the
database stopped, `/health` returns 200 while the storage routes return 503; the UI serves demo
data and names each endpoint and reason in a banner. With the API stopped entirely, the Live
toggle disables itself with the reason and a restored "live" session choice reconciles back to
demo, so the header can never claim Live while every panel is on a fallback.
