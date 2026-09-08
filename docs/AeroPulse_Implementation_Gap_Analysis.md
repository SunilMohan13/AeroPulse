# AeroPulse India — Implementation Gap Analysis

**Date:** 2026-09-08
**Basis:** `AeroPulse_India_Low_Level_Design.md` v1.1 vs the repository at commit `532fa5e` plus uncommitted work.
**Method:** every claim below is backed by a file path, a command output, or an explicit "NOT VERIFIED" marker. Nothing is inferred from documentation alone.

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
| §13 | 8 Timescale hypertables | 3 migrations create all of them | PARTIAL | **`grid_feature` and `grid_prediction` are never written to by any code.** Features and predictions were computed in memory and discarded |
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
| §46 | Drift monitoring (PSI/KS, prediction and error drift) | — | — | MISSING |
| §33.2 | ML metrics: inference latency, throughput | — | Timings reported by `aeropulse-ml predict`; no continuous metric | PARTIAL |

**Estimator family deviation:** LLD §18.1 names LightGBM/XGBoost. This implementation uses scikit-learn `HistGradientBoosting*` — the same gradient-boosted-histogram algorithm family. Reason: LightGBM requires a system `libomp` that is absent on the target machine (verified: `/opt/homebrew/opt/libomp/lib/libomp.dylib` does not exist on this arm64 host), whereas scikit-learn wheels bundle their own OpenMP. The estimator is one constructor call per trainer, so switching back is a one-line change.

### API, UI, observability, security

| LLD | Requirement | Implementation | Status | Gap / action |
|---|---|---|---|---|
| §25 | REST API: map, events, sources, copilot, citizen | 26 routes, `/api/v1`, Pydantic validation, OpenAPI 3.1 exported | PASS | — |
| §25 | Responses expose prediction, confidence, model_version, feature_version, evidence, grid | Present on `event.v1` / `forecast.v1` | PASS | Genuine strength |
| §43 | API p95 < 500 ms | Not measured under load against real data | NOT VERIFIED | `tests/load/test_health_load.py` exercises `/health` only |
| — | API reads persisted state | **API has zero DB client imports**; serves a process-local dict (`event_store.py:7`) and hardcoded fixtures (`map.py:16-64`) | **INCORRECT** | **P0: `api` and `worker` are separate containers, so `GET /api/v1/events` returns `[]` forever under Compose.** See §4 |
| §26 | UI: 11 screens | 9 pages exist in `frontend/web` | PARTIAL | **Every one of the 8 services returns `mock*` imports.** The only `fetch(` in `src/` is the CARTO basemap. `VITE_API_BASE` is set in compose and never read |
| §21.3 | Four separate confidences | Four fields exist on `event.v1` | PARTIAL | Only `detection_confidence` and `source_confidence` are computed. `forecast_confidence` and `impact_confidence` are hardcoded `0.0` (`engine.py:102,186`) despite the forecast module computing its own per-cell confidence |
| §33 | OpenTelemetry + SigNoz | `libs/observability/telemetry.py` initialises a real TracerProvider | PARTIAL | **No OTLP endpoint is set in compose, so traces export nowhere by default.** SigNoz is absent (self-documented in `docs/architecture.md:31`) |
| §33.2 | Custom metrics (ingestion, quality, ML, API counters/histograms) | — | MISSING | **Zero `Counter(`/`Histogram(` in the codebase** |
| §33.1 | `trace_id` on every log record | structlog JSON with service fields | PARTIAL | **No `trace_id` binding exists**; no span-context processor |
| §35.1 | Identity + RBAC | HS256 JWT, 7 roles, `require_roles` | PARTIAL-BY-DESIGN | Dev-only by explicit decision (ADR-0003). OIDC deferred |
| §35.2 | Secrets hygiene | All credentials via `os.getenv`; `.gitignore` covers `.env`, `*.pem`, `*.key` | PASS | **Verified: no real credential in the tree or in git history.** Only labelled dev placeholders |
| §50 | Connector test framework: unit, contract, replay, failure | 25 test files; contract tests per connector | PASS | Failure-injection tests were thin; **reliability tests added this pass** |

---

## 4. P0 findings

### P0-1 — API read path severed from worker write path

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
| P1-2 | `grid_feature`/`grid_prediction` hypertables never written | No INSERT references them; blocks the feature store and the API read path |
| P1-3 | `forecast_confidence` and `impact_confidence` hardcoded `0.0` | `engine.py:102,186` |
| P1-4 | No population connector; exposure rests on a constant | `risk.py:7` |
| P1-5 | Anomaly detector misses ~95% of exceedances | Measured recall 0.046 (temporal). **Now blocked by the promotion gate** |
| P1-6 | Forecast 24h horizon is worse than persistence | Measured skill −0.119. **Now blocked by the promotion gate** |
| P1-7 | Source likelihood cannot predict `traffic` at all | Measured F1 = 0.000, n = 25. **Now blocked by the promotion gate** |
| P1-8 | MinIO writes silently no-op without credentials | `objects.py:32-33,55-57` |
| P1-9 | No custom OTel metrics; no `trace_id` in logs; traces export nowhere by default | §3 above |
| P1-10 | 15 of 19 Kafka topics unused; DLQ is a table not the declared topic | `topics.py` vs producers/consumers |
| P1-11 | `config/sources.yaml` ignored by the runner | Hardcoded `_RASTER_JOBS` |
| P1-12 | No drift monitoring | LLD §46 |

## 6. P2 / P3

**P2:** quality-score weights hardcoded rather than configurable (§16.2); no pagination on list endpoints; no `checkpoint.py`, so no incremental cursors; rolling max / rate-of-change / historical percentile features absent; no Redis caching; `discover()` returns configured sites rather than fixture contents; notebooks duplicate connector code four times and remain unexecuted.

**P3:** `cv.py` is keyword regex on text, not a CV model (honestly documented); `sources.yaml` covers 6 of 12 connectors; `graphify-out/` build artifacts are committed; CI runs no ML job and builds no images.

---

## 7. What this pass did and did not change

**Delivered and verified:** shared feature spec; hardened live transport; the first credential-free live connector; AOD wired into the satellite feature group; `rainfall` populated (previously dead schema); four trained models on 90 days of real data with temporal, spatial and seasonal holdouts; real metrics; a functioning model registry with an *enforced* promotion gate; champion inference with contract validation and graceful degradation; and fixes for P0-2 through P0-5.

**Deliberately not changed:** P0-1 (API↔DB), P1-1 (frontend wiring) and P1-2 (feature/prediction persistence). These are the remaining work for a deployed end-to-end demo and are sequenced in `docs/AeroPulse_Production_Readiness.md`. They were left rather than rushed because each touches a service boundary that deserves its own review.

**Not verifiable here:** every keyed source. There is no `.env` and no credential in this environment; OpenAQ returns `401` and FIRMS requires a `MAP_KEY`. Those connectors are marked `NOT VERIFIED — requires <credential>` rather than given fabricated latency figures.
