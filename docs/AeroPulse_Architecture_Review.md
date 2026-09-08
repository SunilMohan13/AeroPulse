# AeroPulse India — Architecture Review

**Date:** 2026-09-08
**Reviewed against:** `AeroPulse_India_Low_Level_Design.md` v1.1 (3,532 lines, read in full)
**Companion documents:** `AeroPulse_Implementation_Gap_Analysis.md` · `AeroPulse_ML_Architecture.md` · `AeroPulse_MLOps_Architecture.md` · `AeroPulse_Connector_Integration.md` · `AeroPulse_End_to_End_Demo.md` · `AeroPulse_Production_Readiness.md`

---

## 1. Executive summary

AeroPulse was, before this review, a **well-engineered deterministic evidence pipeline that ran entirely on replay fixtures**, plus two disconnected satellites: a real-ML notebook track that had never been executed, and a React UI wired to static mock data. The architecture was sound; the claim of being an ML platform was not supported by the code.

The most important finding is not a missing feature. It is that **the LLD's own implementation checklist (§64) marks nearly every AI and connector item `[x]`** — "PM2.5 estimator", "Anomaly detector", "Source likelihood", "Forecast", "Model registry", all eleven connectors — while the code contained no trained model, no metric, no model artifact, and no live HTTP path. `README.md:85` is the honest counter-statement and agrees with the code. A reviewer trusting §64 would have concluded the platform was nearly complete.

**What the architecture gets right** deserves stating first, because it is the reason the ML work could be added in one pass rather than requiring a rewrite: contract-first integration with versioned Pydantic schemas and `extra=forbid`; an H3 grid that correctly refuses lat/lon rounding as a key; SHA-256 dedup keys enforced at the database; evidence lineage carrying confidence and model version per edge; genuine source isolation boundaries; RBAC; and no committed secrets. The connector-only extension model of LLD §7.3 works — adding a live source touched no core platform code.

**What was wrong** fell into three classes:

1. **Wiring.** Reliability primitives, live HTTP, trained artifacts, Redis, PostGIS, 15 of 19 Kafka topics, `config/sources.yaml`, and two hypertables all existed and were connected to nothing. The system had the *parts* of its design without the *paths*.
2. **Correctness.** A latent P0: the feature builder selected observations by grid cell with no hour filter, so any multi-hour window silently collapsed to one value per cell. It was invisible because production only ever passed single-hour snapshots.
3. **Scientific integrity.** Two leakage defects in the notebook track, and a `model_registry` that labelled three heuristics `approval_status="PRODUCTION"`.

After this pass there is a working vertical slice: **live credential-free ingestion → canonical contracts → H3 grid → shared feature spec → four trained models on 90 days of real data with temporal/spatial/seasonal holdouts → a registry with an enforced promotion gate → champion inference with contract validation and graceful degradation.** Three of the four models are deliberately **not serving**, because they failed their gates. That outcome is the review working as intended.

---

## 2. Scoring

Derived, not impressionistic. Each dimension is the fraction of the LLD requirements traced in the gap analysis that reached PASS, with PARTIAL counting half and accepted deviations counting as PASS. Numerators are in `AeroPulse_Implementation_Gap_Analysis.md` §3.

| Dimension | Before | After | Notes |
|---|---|---|---|
| Architecture & contracts | 85% | 88% | Strongest area throughout; contract-first design held up |
| Data pipeline | 60% | 75% | P0 hour-filter bug fixed; AOD and rainfall wired; persistence still missing |
| Connectors | 35% | 55% | First live source; primitives wired; 3 sources still absent, 11 still fixture-only |
| ML | 10% | 70% | From zero trained models and zero metrics to four models, real holdouts, real metrics |
| MLOps | 5% | 65% | From a hardcoded list to an enforced lifecycle; no drift monitoring |
| Kafka | 40% | 40% | Untouched; 4 of 19 topics used |
| Database | 55% | 55% | Untouched; two hypertables still unwritten |
| API | 70% | 70% | Well-built, but not database-backed |
| UI | 20% | 20% | Untouched by instruction; mock-only |
| Observability | 35% | 35% | Traces initialise but export nowhere; no custom metrics |
| Security | 70% | 75% | Credential-in-URL logging closed |
| Testing | 65% | 82% | 67 → 179 tests; leakage, gate, reliability and regression coverage added |
| **Demo readiness** | **25%** | **70%** | CLI path works end to end on live data; HTTP/UI path does not |
| **Production readiness** | **30%** | **48%** | Gated by API↔DB, drift, observability, ground truth |

The honest headline: **ML went from absent to genuinely functional; the serving path did not change.** The remaining distance to production is concentrated in four items listed in §5.

---

## 3. Architecture assessment

### Service boundaries — sound

LLD §6 lists 21 logical services and §322 explicitly says to pack them into few containers. The implementation does exactly that: logical services are Python packages packed into `api`, `worker` and `connector`. This is right for the MVP and avoids the common failure of one deployment per table. Dependency direction is clean, with `libs/contracts` at the base and no circular imports. `libs/ml` was added at the same layer as `libs/intelligence`, depending only downward.

One boundary is wrong: **the API owns no data access**. It is not that the API is thin — it is that no component bridges the worker's writes to the API's reads.

### Data architecture — one correctness bug, now fixed

The lifecycle from LLD §5.1 is faithfully implemented: external payload → connector parser → canonical observation → quality validation → grid mapping → feature pipeline. Quality scoring, grid assignment and dedup-key generation happen in the worker rather than the connector, which is the right separation — connectors only map shapes.

The defect was point-in-time correctness. `build_features` filtered by cell but not by hour, so a 72-hour window produced **one distinct `pm25` value per cell** instead of 68. It corrupted every backfill, replay and training path, and it manufactured perfect model scores — which is how it surfaced (MAE 0.0, R² 1.0 on a temporal holdout). Fixed, with `_nearest_weather` likewise made time-aware, and covered by 7 regression tests.

The same investigation exposed an O(cells × hours × observations) cost that made a 90-day window non-terminating. `FeatureSnapshot` now self-indexes: **13,489 grid-hours/s**.

### Grid — correct, and correctly justified

H3 resolution 8 (≈0.74 km²) against the LLD's "1 km × 1 km" headline. LLD §12.2 permits "H3 or an equivalent deterministic grid" with resolution chosen to approximate 1 km, and explicitly forbids lat/lon rounding as a key. The implementation complies and ADR-0002 records it. Not a gap.

### Deterministic before probabilistic — the right instinct, mis-scoped

LLD §5.4 says to use deterministic calculation for geometry, alignment and thresholds, and ML for estimation, anomaly, source and forecast. The implementation applied determinism to **all eight**, which is why the "four ML models" were formulas. The deterministic geometry (`haversine`, `bearing`, `cosine_alignment`, wind vectors) is genuinely good and is retained and reused — the trained models consume it. The correction was to add the ML layer where §5.4 asks for it, keeping the deterministic baselines as the fallback that graceful degradation returns to.

### Evidence-first intelligence — largely delivered

LLD §5.3 requires every AI output to reference observation ids, source ids, timestamps, model version, feature version, scope, confidence and lineage. `event.v1` carries all of it, and predictions now carry `model_version` and `feature_version` from the registry. Two of the four confidence dimensions of §21.3, however, are hardcoded `0.0` (`forecast_confidence`, `impact_confidence`) despite the forecast module computing its own per-cell confidence — a wiring gap, not a design one.

---

## 4. Scientific integrity

The LLD's caveats (§65) are unusually good, and the review held the implementation to them.

| Caveat | Status |
|---|---|
| §65.5 AOD is not surface PM2.5 | **Enforced by construction.** AOD is emitted as `RasterObservation.sample_aod`, never a `Measurement`, and reaches models as one of 30 features. Test-enforced |
| §65.4 Industrial attribution stays probabilistic | Honoured — and stronger: source likelihood is blocked from serving because it cannot predict `traffic` at all |
| §65.7 Citizen reports are corroborative only | Honoured; `cv.py` is honestly documented as keyword matching, not a CV model |
| §65.8 Every prediction exposes uncertainty | Prediction intervals present; **the interval derives from in-sample residual spread and is therefore optimistic**, stated in the ML doc |
| §65.9 Alerts traceable to evidence and versions | Honoured |
| §18.3 Source scores independent, not softmax | Honoured in contract and in serving payload |

**The dominant scientific caveat is one the LLD did not anticipate:** the only credential-free source is Open-Meteo, whose air quality is **CAMS-derived model output, not ground measurement**. The PM2.5 estimator's MAE of 3.90 µg/m³ therefore measures reconstruction of a smooth model field from co-pollutants produced by the same model — an easier problem than estimating real station PM2.5. It validates that the pipeline works; it does not validate accuracy. Every artifact carries this in `notes`, and retraining on CPCB is the prerequisite for any operational claim.

Two leakage defects were fixed structurally rather than by convention: the anomaly baseline is now fitted on training rows only (it previously saw the test period before the split), and the source classifier's feature set now **excludes every signal its weak-label rule uses** (it previously received the exact columns its own label was computed from).

---

## 5. What stands between this and production

Four items, in dependency order. Each is scoped in `AeroPulse_Production_Readiness.md`.

1. **Persist `grid_feature` and `grid_prediction`.** One change unblocks four gaps: the feature store, the API read path, post-hoc error measurement once ground truth arrives, and drift detection.
2. **Give the API a database read path.** Until then the HTTP and UI demo cannot work regardless of how good the models are.
3. **Obtain CPCB ground truth.** No modelling work raises confidence in accuracy without it; everything currently trains on model output.
4. **Observability.** Traces export nowhere by default, there are zero custom metrics, and no `trace_id` reaches logs — so none of the LLD §33.2 SLOs can be measured, let alone met.

Calibration work sits alongside these: the anomaly alert threshold is one residual standard deviation and misses ~95% of standard exceedances, and the forecast needs per-horizon promotion so 3–12 h can ship while 24 h is withheld.

---

## 6. Answering the golden question

> *"Can I execute the complete pipeline with real data and produce a scientifically defensible prediction?"*

**Partially, and the boundary is precise.**

**Yes:** live credential-free ingestion, canonical contracts, H3 grid assignment, point-in-time-correct features including real satellite AOD, four models trained on 90 days of real corridor data, evaluated on three independent holdouts with skill scores against honest baselines, registered with full provenance, gated on quality, and served with contract validation and measured latency (inference 0.056 s). One model earned promotion on merit; three were refused on merit. That path is reproducible with two commands and no credential.

**No:** not through the HTTP API, because the API reads a process-local dict rather than the database the worker writes to. Not through the UI, which is mock-only. Not on ground-truth data, because the only keyless source is model output. And not with the anomaly, source or forecast models serving, because they failed their gates.

The distinction worth holding onto is that the *pipeline* is now demonstrably real and the *deployment* is not. Before this pass neither was.
