# AeroPulse India — Notebook to Production ML Integration Plan

**Status:** partially implemented; registry visibility landed 2026-09-13, serving integration remains open.
**Date:** 2026-09-13
**Scope:** how the four research pipelines in `AeroPulse_ML_Notebooks/` become live
predictive and regression models behind the AeroPulse API and UI.

---

## 1. How to read this document

Three documents already describe parts of this system. This one is the bridge
between them and does not restate them.

| Document | What it owns |
|---|---|
| `docs/AeroPulse_ML_Architecture.md` | The four production models in `libs/ml`, their evaluation and scorecard |
| `docs/AeroPulse_MLOps_Architecture.md` | Registry, promotion gate, training → serving path, reproducibility |
| `AeroPulse_ML_Notebooks/README.md` | The research pipelines, their findings, their gates and their gaps |
| **This document** | The gap between the notebooks and the running product, and the sequence that closes it |

Read section 3 first. It changes what the rest of the plan has to be.

### 2026-09-13 verification update

- Read-only notebook JSON audit: 375 code cells, 369 executed, 367 with saved outputs, zero saved
  errors. This corrects the earlier blanket statement that the notebooks were unexecuted.
- The physical external dataset exists: 1,705,252 rows / 149 stations; base and event-aware
  Parquets are present and their manifest gates pass.
- Notebook-local artifact directories are empty. Saved metrics are research evidence, not a
  deployable artifact or proof of current reproducibility.
- `GET /api/v1/models` now merges deterministic serving baselines with the filesystem-backed
  `aeropulse_ml.registry.ModelRegistry`. Each entry exposes its true stage, `runtime_role`, and
  whether its local artifact is available. Non-production records remain `REGISTERED_ONLY`; this
  changes visibility, not serving.

---

## 2. Executive summary

Four findings, in order of how much they constrain the work.

**1. The online feature path can compute 12 of the 184 features the Phase 7 model
needs — 7%.** This is the binding constraint on the entire integration, and it is an
engineering problem in the feature layer, not a modelling problem. Measured directly
against `to_feature_dict()` and the shipped bundle; see section 6.2.

**2. The notebooks and `libs/ml` solve different problems under similar names.** The
production `pm25_estimator` is a 30-feature **nowcast** that structurally excludes
`pm25` from its own features. The notebook model is a 184-feature **t+24h forecast**
whose first feature *is* `pm25`. These are not two versions of one model and must not
be swapped for each other. Section 6.1.

**3. Nothing the notebooks produced is promotable today, and the notebooks are right
about that.** Every artifact carries `status: VALIDATION`. PM2.5 passes 2 of 4 gates,
propagation withholds all six horizons, source likelihood fails 4 of 10 and abstains
on 48.3% of stations. The correct integration target is therefore **shadow serving**,
not production serving. Section 12.

**4. The trained models are not served by the worker.** The worker still runs deterministic
baselines in `libs/intelligence`, but the API model catalog now reads both the runtime baselines and
the real filesystem registry. This closes the registry-observability mismatch only; prediction
traffic is unchanged and non-production records remain registered-only. Section 4.

The practical consequence: the fastest honest route to live predictions is a
**reduced-feature retrain restricted to what the online path can actually serve**,
run in shadow against the existing baselines. The notebooks' own SHAP result supports
this — temporal lag features carry 77.7% of total attribution, and lags are among the
12 features already available online.

---

## 3. Current state

Three systems exist. Only the middle one runs in production, and it contains no
trained model.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 1. RESEARCH          AeroPulse_ML_Notebooks/                        │
│                                                                     │
│    pm25_estimator (10 nb)  anomaly_detector (9 nb)                  │
│    propagation_forecast (8) source_likelihood (9)                   │
│         │                                                           │
│         └── saved cell outputs + manifests                          │
│             physical notebook bundles currently absent             │
│                                                                     │
│    ✗ no loadable bundle is available for a runtime consumer         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 2. PRODUCTION RUNTIME                                    ← the live │
│                                                            path     │
│  connectors ──▶ Kafka ──▶ worker ──▶ TimescaleDB                    │
│                             │                                       │
│                             └─▶ libs/intelligence (DETERMINISTIC)   │
│                                   estimator.py   IDW baseline       │
│                                   anomaly.py     quantile threshold │
│                                   likelihood.py  fixed priors       │
│                                   forecast.py    wind advection     │
│                                          │                          │
│                                    engine.evaluate_cell             │
│                                          │                          │
│  API (FastAPI, 26 routes) ◀── EVENT_STORE (in-memory, empty)        │
│                                                                     │
│    ✓ event/evidence/forecast/graph API reads TimescaleDB (2026-09-14)│
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 3. ML PLATFORM       libs/ml/aeropulse_ml/                          │
│                                                                     │
│    dataset → train → registry(index.json) → inference               │
│    sklearn HistGradientBoosting, 30-feature FeatureSets             │
│    promotion gate, ModelStage, validate_feature_contract            │
│                                                                     │
│    API reads registry metadata; worker still never calls inference  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 4. UI                frontend/web/  React 19 + Vite + MapLibre      │
│    9 screens, all reading src/data/mock*.ts                         │
│    ✗ no API client, no VITE_API_URL, no fetch to /api/v1            │
└─────────────────────────────────────────────────────────────────────┘
```

Verification of the remaining serving gap:

- `apps/api/aeropulse_api/routers/models.py` imports `aeropulse_ml.registry.ModelRegistry` and
  exposes registered metadata through `/api/v1/models`; this is catalog visibility only.
- `apps/worker/aeropulse_worker/pipeline.py:19` imports
  `aeropulse_intelligence.detect.process_snapshot`, and nothing from `aeropulse_ml`.

`docs/AeroPulse_ML_Architecture.md` §10 lists the PM2.5 estimator as "Live prediction:
Yes". That refers to the `aeropulse-ml predict` CLI path, which does work. It does not
mean the worker serves the model. Worth correcting in that document.

---

## 4. What the saved notebook outputs report

The metrics below are retained in notebook outputs and manifests. The referenced notebook-local
bundle files are not physically present in this checkout, so none can be loaded, registered from
the notebook track, or promoted without rerunning the relevant packaging step. Treat every path
below as an expected output path, not as proof that the artifact currently exists.

### 4.1 `pm25_estimator` — Phase 7 bundle

Expected path: `artifacts/pm25/phase7/peak_hazard/pm25_peak_hazard_bundle.joblib`, reported as 3.44 MB,
`schema_version 1.0.0`, `dataset_version 3.0.0`, fingerprint `ba72d91a76c075ee`,
184 features, `primary_horizon_h: 24`. Contains three models in one bundle:

| Key | Type | Target | Headline (winter test block) |
|---|---|---|---|
| `concentration` | LightGBM regressor | PM2.5 at t+24h | R² 0.377, extreme bias −70.6, extreme recall 0.378 |
| `peak_24h` | LightGBM regressor | max PM2.5 over next 24h | R² 0.193, **extreme bias −32.4**, **extreme recall 0.669** |
| `hazard_extreme_24h` | LightGBM classifier | P(extreme within 24h) | recall 0.675, precision 0.349, PR-AUC 0.523, ECE 0.072 |

Persistence on the same rows: extreme bias −118.6, extreme recall 0.182.
The hazard model detects 92.6% of 1,678 episodes at a median 24-hour lead.
Runtime: 0.69 ms warm p95, 1.3 s cold start.

Gates: 2 of 4 pass (precision 0.349 ≥ 0.25 ✓, lead time 24.0 ≥ 24 ✓;
rolling-CV R² 0.226 < 0.75 ✗, extreme recall 0.675 < 0.70 ✗).

### 4.2 `anomaly_detector` — hazard classifier (notebook 05)

P(peak ≥ 121 µg/m³ within 24h), the CPCB "Very Poor" threshold.
PR-AUC 0.438, ROC-AUC 0.884, precision 0.520, recall 0.429, false-alert rate 1.3%.
Baselines: current `pm25(t)` 0.226, persistence 0.195, A0 residual proxy 0.042.
Beats persistence in 5 of 5 rolling-origin folds; ranking stable
(ROC-AUC 0.873 ± 0.019), operating point not (recall 0.509 ± 0.225).

Alert policy from notebook 08: score blended `0.7 × local + 0.3 × neighbour within
100 km`, raise at 0.234, clear at 0.140, 2-hour persistence.

The A0 residual detector is explicitly **reference-only** — ROC-AUC ≈ 0.50 against
the CPCB label, indistinguishable from random. It must not be served.

### 4.3 `propagation_forecast`

CatBoost residual over the strongest per-horizon baseline, six horizons.

| horizon | model MAE | skill vs anchor baseline | skill vs persistence |
|---|---|---|---|
| 1 h | 4.05 | +0.037 | +0.037 |
| 3 h | 6.14 | +0.066 | +0.129 |
| 6 h | 6.81 | +0.069 | +0.186 |
| 12 h | 7.32 | +0.082 | +0.228 |
| 24 h | 7.64 | +0.069 | +0.104 |
| 48 h | 8.61 | +0.057 | +0.102 |

Rolling-origin 4/4 positive at every horizon; geographic-block holdout positive on
all 5 blocks × 6 horizons. P10–P90 intervals calibrated at 77–79% against 80% nominal.

**All six horizons are withheld.** Exceedance recall at 150 µg/m³ falls from 0.434 at
1 h to 0.020 at 6 h — worse than the baseline it beats on MAE. Squared-error
regression minimises aggregate loss by predicting "not an episode", so aggregate MAE
improves while the product gets worse. Two fixes are measured and available:
**P90 for alerting** (recall 0.020 → 0.209 at 6 h under 0.7% false alarms) and
**P50 as the point forecast** (beats the squared-error model on MAE at every horizon).

### 4.4 `source_likelihood`

Per-source binary LightGBM classifiers on 56 leak-safe features. Independent
likelihoods, not a softmax — which matches the production contract.

| source | PR-AUC | lift | ROC-AUC | ECE | calibration |
|---|---|---|---|---|---|
| dust | 0.709 | 1.95× | 0.823 | 0.036 | isotonic |
| traffic | 0.613 | 2.86× | 0.810 | 0.017 | isotonic |
| industrial | 0.145 | 3.51× | 0.769 | 0.021 | sigmoid |
| regional_transport | 0.015 | 3.28× | 0.783 | 0.001 | beta |
| biomass_burning | 0.007 | 10.83× | 0.851 | 0.012 | sigmoid |

Nothing promoted; 4 of 10 gates fail. Served behaviour abstains on 48.3% of stations
with mean attribution confidence 0.171.

A finding that changes the serving design: for `biomass_burning` and
`regional_transport`, 98.6–98.9% of performance is explained by the labeling
function's own inputs. Those two hypotheses are currently definitions, not findings.
**Serve the labeling function directly with its reliability weight**, rather than a
classifier that has learned nothing but that definition.

---

## 5. The six mismatches

### 5.1 Problem mismatch — nowcast vs forecast

| | Production `PM25_ESTIMATOR` | Notebook Phase 7 |
|---|---|---|
| Question | What is PM2.5 *here, now*, where no station exists? | What will PM2.5 be in 24 h? |
| Target | `pm25` | `pm25(t+24h)` / `max pm25 over t..t+24h` |
| Feature count | 30 | 184 |
| Is `pm25` a feature? | **No** — excluded structurally, it is the target | **Yes** — it is feature #1 |
| Enforced by | `_assert_no_target_leakage()` at import | n/a, different target |

Using the notebook model to fill the `pm25_estimator` slot would feed `pm25` in as an
input to predict `pm25`. The import-time assertion in `feature_spec.py` exists to
prevent exactly that, and would correctly refuse it.

The notebook models map onto **`PROPAGATION_FORECAST`**, which already includes `pm25`
in its feature set and targets a future residual. That is the correct production slot
for the concentration model.

### 5.2 Feature contract mismatch — the binding constraint

Measured by evaluating `to_feature_dict()` on a `GridFeature` and intersecting with
the shipped bundle's `feature_names`:

| Quantity | Count |
|---|---|
| Features the Phase 7 bundle requires | 184 |
| `GridFeature` model fields | 54 |
| Features `to_feature_dict()` can emit online | 31 |
| **Notebook features the online path can produce today** | **12 (7%)** |
| Missing online | **172** |

The 12 available: `pm25`, `pm25_lag_{1,3,6,24}h`, `boundary_layer_height`,
`wind_u`, `wind_v`, `sin_hour`, `cos_hour`, `sin_doy`, `cos_doy`.

The 172 missing, by family:

| Family | Missing | Note |
|---|---|---|
| fire / upwind fire | 44 | FIRMS aggregation over rings, bearings and lags |
| CAMS | 20 | `cams_*` — external model output, not currently ingested online |
| pm25 rolling / derived | 37 | `pm25_roll*`, `delta_*`, other windows |
| rain, wind, stability | 12 | `stagnation_*`, `low_*` |
| regional / upwind aggregates | 12 | leave-one-out national and regional means |
| terrain, crop calendar, calendar | 13 | `elevation_*`, `crop_*`, `days_*`, `is_*` |

This is the single largest work item in the plan, and it is feature-store engineering,
not modelling. Two routes exist, and they are not exclusive:

- **Route A — expand the online feature layer** to materialise the missing 172.
  Highest fidelity, highest cost. Requires online FIRMS ring aggregation, a CAMS
  ingestion path, terrain and crop-calendar static joins, and leave-one-out regional
  aggregates computed per timestep.
- **Route B — retrain on the servable subset.** Restrict the feature set to what the
  online path produces (or can produce cheaply), and re-run the notebooks' own
  evaluation. The notebooks' SHAP result — temporal lags carry 77.7% of attribution
  and every other group sits near zero — predicts the accuracy loss is small.

**Recommendation: Route B first, Route A incrementally.** Route B produces a servable
model in one retrain cycle and gives an honest measurement of what the other 172
features are worth online. Route A then has a benchmark to justify each family's
ingestion cost, instead of building all six families on faith.

### 5.3 Runtime mismatch

| | Production `libs/ml` | Notebooks |
|---|---|---|
| Library | scikit-learn `HistGradientBoosting` | LightGBM (pm25, anomaly, source), CatBoost (propagation) |
| Bundle keys | `model`, `feature_names`, `target`, `ml_feature_version`, … | `models` (dict of 3), `calibration`, `regression_config`, `dataset_fingerprint`, `status`, … |
| Loader | `ModelBundleCache` + `validate_feature_contract` | notebook-local |

LightGBM and CatBoost are declared in `AeroPulse_ML_Notebooks/requirements.txt` but not
in the runtime workspace. Serving them adds both to the production dependency set and
to the container image. The notebook bundle schema is *richer* than the production one
(it already carries fingerprint, status and calibration), so the convergence should
extend `ModelRecord`, not flatten the notebook artifact.

### 5.4 Two hazard models predicting the same thing

| | `pm25_estimator` nb 07 | `anomaly_detector` nb 05 |
|---|---|---|
| Target | P(extreme within 24 h) | P(peak ≥ 121 µg/m³ within 24 h) |
| Threshold | 150 µg/m³ | 121 µg/m³ (CPCB "Very Poor") |
| Recall / precision | 0.675 / 0.349 | 0.429 / 0.520 |
| PR-AUC | 0.523 | 0.438 |
| Calibration | Platt | selected per notebook 08 |
| Alert policy | none defined | 0.7 local + 0.3 neighbour, raise 0.234 / clear 0.140 |

Both answer "will it be dangerous within 24 hours". Serving both would put two
contradictory hazard probabilities on the same map cell. **This must be reconciled to
one hazard model with one threshold before any hazard reaches the UI.** The threshold
choice is a product decision, not a modelling one — 121 µg/m³ is the CPCB standard and
is the defensible default for a public-facing alert. The `pm25_estimator` variant has
the better recall and the anomaly variant has the alert policy and the rolling-origin
evidence; the merge should take the target and policy from the anomaly pipeline and
re-fit at 121 µg/m³.

### 5.5 Two registries

| | `aeropulse_ml.registry.ModelRegistry` | `aeropulse_intelligence.model_registry` |
|---|---|---|
| Backing | filesystem, `$AEROPULSE_MODEL_DIR/index.json` | hardcoded Python list |
| Contents | real trained champions with metrics and stages | 3 static baseline entries |
| Served by | nothing | `GET /api/v1/models` |

`GET /api/v1/models` reports `baseline-idw-0.1`, `quantile-baseline-0.1` and
`wind-advection-0.1` as `PRODUCTION` regardless of what was actually trained. It is
truthful about the current runtime — those baselines *are* what serves — but it cannot
report a real model once one exists. One registry must win, and it should be the
filesystem one.

### 5.6 Data provenance mismatch

The notebooks train on OpenAQ (PM2.5) and Open-Meteo (weather); production is designed
around CPCB (ground truth) and IMD (operational weather). Three consequences:

- **Open-Meteo air quality is CAMS-derived model output, not ground truth.** Offline
  metrics measured against it must never be reported as station accuracy.
- **Forecast-vintage wind is simulated.** Notebook 03 in the propagation pipeline
  decays observed wind toward climatology because no archived NWP exists to replay.
  Production must substitute real forecast wind. The notebooks call this the largest
  offline/production gap in that pipeline, and it will move the metrics.
- **A 24-hour forecast currently uses 24-hour-old meteorology.** Switching to forecast
  weather at t+h is item 2 on the notebooks' own list of what would move the gates.

Every metric in section 4 is therefore an *offline* metric against a research dataset.
None of them predicts production accuracy. The shadow phase in section 7 exists to
measure that, and no promotion decision should be made before it reports.

---

## 6. Target architecture

```text
  connectors ──▶ Kafka ──▶ worker
                             │
                             ├─▶ FeatureBuilder  (EXPANDED — section 5.2)
                             │     GridFeature + servable notebook families
                             │            │
                             │            ├──────────────┐
                             │            ▼              ▼
                             │      CHAMPION        CHALLENGER (shadow)
                             │   libs/intelligence   ModelBundleCache
                             │   deterministic       LightGBM / CatBoost
                             │   baselines           from registry
                             │            │              │
                             │            │              └─▶ shadow_prediction
                             │            ▼                   (logged, not served)
                             │      engine.evaluate_cell
                             │            │
                             └────────────┴─▶ TimescaleDB
                                                 grid_feature
                                                 grid_prediction
                                                 shadow_prediction
                                                 event / forecast / alert
                                                      │
                                    ┌─────────────────┘
                                    ▼
                             API read path  (NEW — replaces in-memory EVENT_STORE)
                                    │
                    ┌───────────────┼────────────────┬──────────────┐
                    ▼               ▼                ▼              ▼
            /map/air-quality  /map/forecast   /grid/{id}/       /api/v1/models
            /map/hazard       /events/*       predictions       (real registry)
                                    │
                                    ▼
                          frontend/web  (mock services replaced by API client)
```

Two principles carried from the existing design:

- **The champion stays deterministic until a challenger earns promotion.** The UI never
  shows an unpromoted model's output as fact.
- **Degradation is never fatal.** `validate_feature_contract` refuses a mismatched
  artifact and the caller falls back, per LLD §40 and the existing `inference.py`
  contract.

---

## 7. Model to endpoint to UI mapping

| Notebook model | Production slot | Contract | Proposed endpoint | UI surface | Ship as |
|---|---|---|---|---|---|
| pm25 `concentration` t+24h | `propagation_forecast` | `forecast.v1` | `GET /api/v1/map/forecast` (existing, populate) | Forecast screen, map time-slider | Shadow |
| pm25 `peak_24h` | **new** `pm25_peak_24h` | new `peak_forecast.v1` | `GET /api/v1/grid/{grid_id}/peak` | Map cell detail, Overview KPI | Shadow |
| pm25 `hazard` + anomaly `hazard` (merged) | **new** `pm25_hazard_24h` | new `hazard.v1` | `GET /api/v1/map/hazard`, `GET /api/v1/alerts` | Map hazard layer, alert banner | Shadow → Canary |
| propagation 6-horizon | `propagation_forecast` | `forecast.v1` | `GET /api/v1/events/{id}/forecast` (existing) | Event detail forecast chart | Withheld (P50/P90 rework first) |
| propagation P90 | **new** `forecast_p90` | extend `forecast.v1` | same, extra field | Alert thresholding | Shadow |
| source per-source binaries | `source_likelihood` | `SourceLikelihood` (exists) | `GET /api/v1/events/{id}/graph` | Evidence / attribution panel | Shadow, abstain-by-default |
| source biomass + transport | **labeling function, not a model** | `SourceLikelihood` | same | same, flagged as rule-based | Rule, labelled as such |
| anomaly A0 residual | — | — | — | — | **Never serve** (ROC-AUC ≈ 0.50) |

Three new contracts are needed (`peak_forecast.v1`, `hazard.v1`, a `p90` field on
`forecast.v1`). Every one of them must follow the existing conventions: Pydantic with
`extra: forbid`, a `schema_version`, a `model_version`, and list endpoints returning
`items` / `total` / `limit` / `offset`.

---

## 8. Phased plan

Each phase states its goal, deliverables and the acceptance criterion that lets the
next phase start. Phases 1–3 are strictly ordered. Phases 4–6 can overlap.

### Phase 0 — Unblock the repository

**Goal:** make `git push` possible. This is a prerequisite for everything else and is
independent of the ML work.

`.gitignore` has been hardened (directory rules plus file-type rules for `*.joblib`,
`*.parquet`, `*.csv`, and the rest), and all 6.1 GB of notebook data and artifacts is
correctly ignored. That protects future commits. It does not fix history.

A **1,564 MB** blob, `pm25_regime_aware_bundle.joblib`, is present in commits
`8b71dce` ("pushing ML models") and `82dc497` ("removing data"). Both are local-only on
branch `sunil`. GitHub rejects any file over 100 MB, and the rejection blocks the whole
push, so this branch cannot be pushed as it stands. Deleting the file in a later commit
does not help — the blob is still reachable in history.

**Deliverable:** history rewritten with `git filter-repo --strip-blobs-bigger-than 50M`
(or `--path`-targeted removal), then force-push. This rewrites commit SHAs, so it needs
coordination with anyone who has the branch.
**Acceptance:** `git push` succeeds; largest blob in history under 50 MB; `.git` well
below its current 515 MB.

### Phase 1 — Contract unification

**Goal:** one place where every servable feature is named, covering both the production
models and the notebook models.

**Deliverables**

- New `FeatureSet` entries in `libs/contracts/aeropulse_contracts/feature_spec.py` for
  `pm25_peak_24h` and `pm25_hazard_24h`, plus an extended `propagation_forecast` set.
- A decision on the servable feature subset (section 5.2, Route B), recorded as the
  feature list.
- `ML_FEATURE_VERSION` bumped to `ml-features-2.0.0`. The bump is mandatory:
  `validate_feature_contract` compares it exactly, and every existing artifact must be
  invalidated rather than silently reinterpreted.
- The notebooks import these sets instead of declaring feature lists locally. This is
  already the standing rule in `AGENTS.md` — `feature_spec.py` is the only place a
  feature may be named — and the notebooks are currently outside it.

**Acceptance:** `_assert_no_target_leakage()` passes for every new set; the notebook
that trains each model imports its feature list from `feature_spec` and no longer
constructs one.

### Phase 2 — Feature layer expansion

**Goal:** close the 12-of-184 gap far enough to serve the chosen subset.

**Deliverables**

- `GridFeature` extended with the agreed families. Priority order follows the
  notebooks' own ablation evidence, not intuition: PM2.5 history and rolling windows
  first (worth ~4× everything else combined in the propagation ablation), then
  stability and stagnation, then the spatial neighbour field, then transport, then
  fire. Station climatology ranks top-five by importance and is *unnecessary* by
  ablation — deprioritise it.
- Online computation for each family in `libs/intelligence/features.py`, with the
  same definitions as the notebooks.
- **Time-aligned lags and rolling windows, not positional.** The propagation pipeline
  measured 56,609 gaps in the source grid, where `shift(24)` and "the value 24 hours
  ago" agree on only 56% of rows and differ by up to 822 µg/m³. Positional shifts in
  the online path would silently produce a different feature than the model was
  trained on.
- **Wind units asserted.** Open-Meteo returns km/h. A previous implementation
  converted as if m/s and inflated every advection distance 3.6× (194 km vs 54 km at
  6 h). The unit must be carried in the contract and asserted, not assumed.

**Acceptance:** an offline/online parity harness recomputes features for a sample of
historical rows through the production `build_features` path and matches the notebook
Parquet within tolerance. This harness is the deliverable that makes the rest
trustworthy — without it, training/serving skew is undetectable.

### Phase 3 — Artifact and registry convergence

**Goal:** one registry, and notebook artifacts that the production loader can read.

**Deliverables**

- A packaging step in each pipeline's final notebook that emits a bundle in the
  production shape, and a `ModelRecord` registered via `ModelRegistry` at
  `ModelStage.VALIDATION`.
- `ModelRecord` extended to carry what the notebook bundles already have and the
  production one does not: `dataset_fingerprint`, `calibration`, `regression_config`,
  `primary_horizon_h`.
- `libs/intelligence/model_registry.py`'s hardcoded `PRODUCTION_MODELS` replaced by a
  read of the filesystem registry, so `GET /api/v1/models` reports reality. The
  deterministic baselines should appear as real registered records rather than
  literals, so the endpoint stays truthful when no ML champion exists.
- LightGBM and CatBoost added to the runtime dependency set.
- `evaluate_promotion_gate` extended with cases for the new model names, using the
  notebooks' gates: extreme recall, extreme precision, median lead time, and
  rolling-CV R². **Do not relax a threshold to make a model pass** — the standing rule
  in `AGENTS.md`, and the notebooks already honour it at 2 of 4.

**Acceptance:** `aeropulse-ml models` lists the notebook artifacts at VALIDATION with
their real metrics; `GET /api/v1/models` returns the same set;
`validate_feature_contract` accepts the repackaged bundle.

### Phase 4 — Shadow serving

**Goal:** run the challenger against live traffic without showing it to anyone.

This is the phase the existing MLOps document flags as missing: `SHADOW` and `CANARY`
are recorded stages, but nothing routes traffic to a challenger.

**Deliverables**

- `ModelBundleCache` instantiated in the worker and called alongside the deterministic
  baselines in `process_snapshot`. The baseline result remains the served answer.
- A `shadow_prediction` table recording both outputs plus the feature vector hash, so
  champion and challenger are comparable row by row after the fact.
- Cold-start handling: the notebooks measured 1.3 s cold and 0.69 ms warm p95, so the
  cache must be warmed at worker start, not on first request.
- Failure isolation: a challenger exception must never affect the served answer. The
  existing degradation contract (`load_errors`, `degraded_models`) already specifies
  this behaviour; the shadow path must inherit it.

**Acceptance:** shadow predictions accumulate for a full seasonal window with zero
impact on served output; a comparison report shows challenger vs champion on the
notebooks' metrics, computed on production data rather than research data.

### Phase 5 — Persistence and the API read path

**Status update 2026-09-14:** event/evidence/latest forecast/latest graph reads are implemented and
verified with actual connector replay input. `grid_feature`/`grid_prediction` gained authenticated,
filterable list/latest routes on 2026-09-14. Operational map routes now consume the same persisted
AQ/fire/weather/forecast/grid state. The frontend now consumes the authenticated event, source, map, evidence, citizen, and copilot paths; population risk remains mock-backed until a population source is integrated.

**Goal:** the API serves what the worker computed. This is independent of the ML work
and is called out in `AeroPulse_MLOps_Architecture.md` §8 as the highest-value single
change — it unblocks the feature store, the API read path, post-hoc error measurement
and drift detection at once.

**Deliverables**

- API reads `grid_feature`, `grid_prediction`, events and forecasts from TimescaleDB
  instead of the process-local `EVENT_STORE`.
- The in-memory store is retained as a test fixture and fallback, not as the
  production path.
- Map endpoints (`/map/air-quality`, `/map/fire`, `/map/weather`) return real data
  instead of the hardcoded seed points.
- `GET /api/v1/alerts` and `GET /api/v1/models` gain `limit`/`offset` to match the
  documented list convention, which they currently do not follow.

**Acceptance:** under Docker Compose with connectors replaying, `GET /api/v1/events`
returns non-empty; `/map/air-quality` reflects ingested observations.

### Phase 6 — Prediction endpoints

**Goal:** expose the new model outputs.

**Deliverables**

- `peak_forecast.v1` and `hazard.v1` contracts, plus a `p90` field on `forecast.v1`.
- `GET /api/v1/map/hazard`, `GET /api/v1/grid/{grid_id}/peak`,
  `GET /api/v1/grid/{grid_id}/predictions`.
- Every prediction response carries `model_version`, `feature_version` and a
  `degraded` flag, so the UI can distinguish a model answer from a baseline fallback.
- **A shadow model's output is never returned as a served prediction.** Until
  promotion, these endpoints return the deterministic baseline, correctly labelled.
- OpenAPI re-exported via `scripts/export_openapi.py`.

**Acceptance:** contract tests for each new endpoint; OpenAPI regenerated; response
schemas named rather than untyped `object` (the current spec is mostly
`additionalProperties: true`).

### Phase 7 — Frontend wiring

**Goal:** replace mocks with the API.

**Deliverables**

- An API client with `VITE_API_URL` and JWT attachment. The API already permits
  `localhost:5173` via CORS.
- An adapter layer between API `snake_case` contracts and the UI's `camelCase` types.
  These have genuinely diverged — the UI uses `EventSeverity: 'SEVERE'` where the
  contract has `CRITICAL`, and carries UI-only fields such as `title` and `aqi`.
- `src/services/*` switched from mock modules to fetch, one service at a time, keeping
  the mock as the offline/demo fallback. The scripted demo mode is a product feature
  and should keep working.
- **Uncertainty and provenance surfaced, not hidden.** A hazard probability shown
  without its confidence, or a baseline fallback shown as a model prediction, is the
  failure mode that matters most in a public air-quality tool.

**Acceptance:** every screen renders from the API with mocks disabled; demo mode still
runs offline.

---

## 9. Serving design notes

**Latency.** Measured 0.69 ms warm p95 per bundle, 1.3 s cold. With per-process
memoisation and warm-up at worker start, model inference is not the bottleneck;
feature construction is. The 172 missing features include ring aggregations over FIRMS
and leave-one-out regional means, both of which are expensive per timestep and should
be computed once per snapshot for all cells rather than per cell.

**Batch, not per-request.** Predictions are materialised by the worker per snapshot and
read by the API. The UI must never trigger inference synchronously, and must never call
an external data provider — both are stated constraints in the notebooks' production
integration section.

**Degradation.** Four independent failure modes need distinct handling: missing
champion, feature-contract mismatch, corrupt artifact, and missing input features at
inference. The first three are covered by the existing `inference.py` contract. The
fourth is new and matters more with 184 features than with 30 — LightGBM handles NaN
natively, which is convenient and dangerous, because a silently all-NaN feature family
produces a confident wrong answer rather than an error. **Feature completeness must be
asserted per prediction and recorded**, not left to the model's NaN handling.

**Trust boundary.** `joblib.load` executes arbitrary code from its payload. This is
safe only while `AEROPULSE_MODEL_DIR` is deployment-controlled and written solely by
training runs. Notebook artifacts entering the registry **must not** relax that: the
packaging step should write into the same controlled root, and the directory must never
accept third-party uploads. If artifacts ever become externally supplied, move to a
schema-validated format such as ONNX before doing so.

---

## 10. What may and may not ship

| Model | May reach the UI as | Blocked by |
|---|---|---|
| Deterministic baselines | Served predictions (as today) | — |
| pm25 `peak_24h` | Shadow only | Rolling-CV R² 0.226 < 0.75; extreme recall 0.675 < 0.70 |
| Merged hazard classifier | Shadow, then canary once reconciled | Two competing thresholds (5.4); production-data metrics unknown |
| pm25 `concentration` t+24h | Shadow only | Extreme bias −70.6; the peak model is strictly better for alerting |
| propagation, all horizons | Withheld | Exceedance recall 0.020 at 6 h, worse than its own baseline |
| propagation P50 / P90 | Shadow, promising | Certification not re-run |
| source: dust, traffic | Shadow, abstain-heavy | Temporal 1.95× vs 2.0 gate; spatial 1.45× vs 1.5 |
| source: industrial | Shadow | Below lift floor |
| source: biomass, transport | **Serve the labeling function, not the model** | 98.6–98.9% explained by their own label inputs |
| anomaly A0 residual | **Never** | ROC-AUC ≈ 0.50 vs CPCB label |

No gold set of human-reviewed attribution labels exists, so every source-likelihood
metric measures agreement with the weak-labeling system, not attribution accuracy.
The UI must not describe these as measured sources.

---

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Offline/online feature skew | Model degrades silently in production; worst failure mode here | Parity harness in Phase 2 is a gate, not a nice-to-have |
| Simulated forecast wind replaced by real NWP | Propagation metrics move, possibly a lot | Re-certify all horizons after the switch; treat current numbers as provisional |
| OpenAQ/Open-Meteo → CPCB/IMD provider swap | Retrain required; metrics not transferable | Provider-neutral feature contracts already exist; re-run evaluation, do not port metrics |
| Thresholds fitted in one season | Anomaly recall varies 0.509 ± 0.225 across folds | Season-aware thresholds, or re-fit on a rolling window; ranking is stable even when the operating point is not |
| Two hazard models reach the UI | Contradictory public health signals | Reconcile in Phase 1, before any endpoint exists |
| 1.5 GB blob recurs | Push blocked again | File-type rules now in `.gitignore`; consider a pre-commit size check |
| Pickle artifacts from notebooks | Code execution at load | Keep the registry root deployment-controlled; never accept uploads |
| Promoting on offline metrics | Shipping a model that fails on real data | Promotion requires shadow evidence on production data, not notebook metrics |

---

## 12. Open decisions

These need a human decision and are not implied by the code.

1. **Hazard threshold: 121 or 150 µg/m³?** 121 is the CPCB "Very Poor" standard and the
   defensible public default. 150 is what the `pm25_estimator` pipeline used.
2. **Route B (retrain on servable features) or Route A (build all 172)?** The plan
   recommends B first; the cost of A is six ingestion pipelines.
3. **Which horizons does the product actually need?** The propagation pipeline supports
   six; the UI arguably needs two or three.
4. **Does the product accept a 48% abstention rate on source attribution?** It is the
   correct behaviour for the evidence available, but it is a visible product decision.
5. **Point forecast from P50 rather than squared error?** Measured better on MAE at
   every horizon, and the switch already exists as a flag, deliberately off.
6. **Who owns the history rewrite in Phase 0**, and when, given it invalidates clones.

---

## 13. Sequencing summary

```text
Phase 0  git history              ── independent, do first, unblocks everything
Phase 1  contracts                ──┐
Phase 2  feature layer + parity   ──┼─ strictly ordered
Phase 3  registry convergence     ──┘
Phase 4  shadow serving           ──┐
Phase 5  persistence + read path  ──┼─ 5 can start any time; 4 and 6 depend on 3
Phase 6  prediction endpoints     ──┤
Phase 7  frontend wiring          ──┘  depends on 5 and 6
```

The critical path runs 1 → 2 → 3 → 4. Phase 5 is independent of the ML work and is
the highest-value change available regardless of whether any model ships, because it
unblocks the feature store, post-hoc error measurement and drift detection together.

The single most important measurement in this plan is the Phase 2 parity harness. Every
metric in section 4 is offline. Until features computed by the production path match the
features the models were trained on, no production number means anything.
