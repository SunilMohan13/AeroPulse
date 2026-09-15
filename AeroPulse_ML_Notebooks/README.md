# AeroPulse ML Notebooks

## Verified saved execution state (2026-09-13)

This repository was audited by reading notebook JSON and saved cell outputs only; no notebook cells
were executed during the audit.

| Track | Code cells | Executed | Saved outputs | Saved errors |
|---|---:|---:|---:|---:|
| PM2.5 estimator | 121 | 116 | 116 | 0 |
| Anomaly detector | 88 | 87 | 87 | 0 |
| Propagation forecast | 87 | 87 | 85 | 0 |
| Source likelihood | 79 | 79 | 79 | 0 |
| **Total** | **375** | **369** | **367** | **0** |

The external canonical dataset is physically present under `$PM25_DATA_ROOT/data/pm25/processed`:
1,705,252 rows, 149 stations, four seasons, 100% weather coverage, a 42.7 MB base Parquet, and a
256.2 MB event-aware Parquet. All manifest quality gates pass.

Six code cells have no execution count. They are confined to acquisition/optional audit branches
in PM2.5 notebooks 01, 03, 04 and anomaly notebook 01; downstream modelling notebooks otherwise
carry saved outputs and no saved error tracebacks.

**Important boundary:** saved notebook outputs prove prior research execution, but the notebook
track artifact directories currently contain no physical model bundles. Do not promote or serve a
notebook model from metrics embedded in a notebook alone. Packaging must first export the bundle,
manifest, feature schema, dataset fingerprint and gate status into the runtime registry, initially
as `VALIDATION`/`SHADOW`.

Research notebooks for the four AeroPulse model families. Each folder is a Parquet
pipeline — acquisition or import, then feature engineering, then models — and the
numbered notebooks inside a folder are meant to be run in order.

| Folder | Model | State |
|---|---|---|
| [`pm25_estimator/`](pm25_estimator/) | Hyper-local PM2.5 estimator | 10 notebooks, complete through Phase 7 |
| [`anomaly_detector/`](anomaly_detector/) | Pollution anomaly / hazard detector | 9 notebooks, complete |
| [`source_likelihood/`](source_likelihood/) | Source likelihood classifier | 9 notebooks, complete — not promoted, no gold set |
| [`propagation_forecast/`](propagation_forecast/) | Pollution propagation forecast | 8 notebooks, complete — all horizons withheld by the gates |

`pm25_estimator` is the root of the dependency graph. The other three read its
Parquet output, so its Phase 1 and Phase 2 notebooks must have run and written:

- `pm25_estimator/data/pm25/processed/base/base_dataset.parquet`
- `pm25_estimator/data/pm25/processed/event_aware/pm25_event_aware_features.parquet`

Two Python modules are **runtime dependencies, not scripts** — the notebooks import
them, so they must stay beside the notebooks: `pm25_estimator/phase7_eval.py` (the
shared evaluation contract for notebooks 06–08) and
`anomaly_detector/anomaly_toolkit.py` (feature builders, baselines, fold
construction and alert policy for notebooks 02–09) and
`propagation_forecast/propagation_toolkit.py` (data contract, gap-aware lag and
rolling builders, transport features, baselines, splits, metrics, registry and
the inference predictor for notebooks 01–08) and
`source_likelihood/source_toolkit.py` (evidence provenance, labeling functions,
weak-label aggregation, leakage exclusion, calibration, registry and the
likelihood predictor for notebooks 01–09). Shared logic lives in these modules
specifically so a split rule or a metric cannot quietly drift between notebooks
and invalidate every comparison drawn across them.

Three of them are also executable test suites — `python anomaly_toolkit.py`,
`python propagation_toolkit.py` and `python source_toolkit.py` run their
assertions and print a pass line per check.

---

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
jupyter lab
```

Copy `.env.example` to `.env` inside `pm25_estimator/` — it is required for
acquisition. `find_dotenv(usecwd=True)` walks upward, so a parent `.env` is enough
for the import-only pipelines. Launch Jupyter **from the folder you are running**,
so `AEROPULSE_PROJECT_ROOT=.` resolves there, or set that variable explicitly.

Acquisition needs two free credentials: `OPENAQ_API_KEY` (OpenAQ v3 requires an
`X-API-Key` header) and `FIRMS_MAP_KEY` (NASA FIRMS). Never commit either; both
folders are configured to read them from `.env`.

Headless execution:

```bash
for nb in 0*.ipynb; do
  ../../.venv/bin/python -m jupyter nbconvert --to notebook --execute --inplace \
    --ExecutePreprocessor.timeout=28800 "$nb"
done
```

Notebook artifacts (`artifacts/`, `data/`, `catboost_info/`) are gitignored and
fully regenerable. Nothing under those paths should ever be committed — a 1.5 GB
model bundle reached git history that way once already.

---

## PM2.5 estimator

### Pipeline

```
01  phase1   acquisition  -> data/pm25/processed/base/base_dataset.parquet
01A audit                    coverage / seasonality / extreme-event audit
01B ingestion                manual CPCB export -> canonical contract
      |
02  phase2   features     -> data/pm25/processed/event_aware/pm25_event_aware_features.parquet
      |                       (v3.0.0, 1,705,252 rows, 184 features)
      +--> 03 phase5   baseline model comparison        artifacts/pm25/phase5
      +--> 04 phase6   regime-aware mixture of experts  artifacts/pm25/phase6
      +--> 05          driver acquisition (CAMS, terrain)
      |
      +--> 06 phase7   tail-aware experiments  -> artifacts/pm25/phase7/experiments
             +--> 07   peak + hazard models    -> artifacts/pm25/phase7/peak_hazard
             +--> 08   tuning + final gates    -> artifacts/pm25/phase7/tuning
```

Notebooks 06, 07 and 08 form a chain: 06 selects a loss configuration and writes it
into `experiment_report.json` as structured data; 07 and 08 read that configuration
rather than re-deriving it, so all three train the same objective.

Phase 1 is the slow, network-bound stage; everything after it is local compute. It
caches each station under `data/pm25/raw/stations/`, so an interrupted run resumes
instead of restarting — delete that directory to force a refetch.

### What the phases established

**Phase 5** compared baselines at t+1h and reached R² ≈ 0.67. That number is not
comparable to the Phase 7 results below, which forecast t+24h — a materially harder
problem. Never place the two side by side without stating the horizon.

**Phase 6** built a regime-aware mixture of experts whose serialized bundle was
**1.64 GB**, which is a deployment blocker rather than a model result.

**Phase 7** (notebooks 06–08) is the tail-aware rebuild. Its headline finding is that
the *peak* model — predicting the maximum over the next 24 hours — is far better
suited to alerting than forecasting the concentration at t+24h:

| Model (winter test block) | R² | Extreme bias | Extreme recall |
|---|---|---|---|
| Concentration at t+24h | 0.377 | −70.6 | 0.378 |
| **Peak over next 24h** | 0.193 | **−32.4** | **0.669** |
| Persistence (same rows) | — | −118.6 | 0.182 |

Extreme bias is the headline metric: the mean signed error on rows at or above
150 µg/m³, where negative means the model underpredicts exactly when a warning
matters. Phase 5 measured −103 µg/m³ there. The peak model reaches −32.4.

The hazard classifier (LightGBM, Platt-calibrated) reaches recall 0.675, precision
0.349, PR-AUC 0.523 against a 12.7% base rate, and ECE 0.072. It detects **92.6% of
1,678 episodes with a median 24-hour lead**. The Phase 7 bundle carrying all three
models is **3.44 MB — 477× smaller than Phase 6** — with a 0.69 ms warm p95 and a
1.3 s cold start.

### Acceptance gates

Notebook 08 checks the roadmap's four gates and **does not relax them**:

| Gate | Required | Measured | |
|---|---|---|---|
| Rolling-CV mean R² | ≥ 0.75 | 0.226 | fail |
| Extreme recall | ≥ 0.70 | 0.675 | fail |
| Extreme precision | ≥ 0.25 | 0.349 | pass |
| Median lead time | ≥ 24 h | 24.0 | pass |

**Status: `VALIDATION`, 2/4 — not promoted.** This is a finding, not a failure of
the notebook. Two independent results explain it and agree with each other: temporal
lag features carry 77.7% of total SHAP attribution and 20.8 µg/m³ of permutation
RMSE, while every other feature group sits near zero — the model is essentially
autoregressive, and the other 142 features are not yet earning their place. Optuna
also moved RMSE by less than the fold-to-fold spread (0.16 against 6.24), so
hyperparameter tuning is exhausted as a lever. Both point at the data, not the model.

### Data availability — read before trusting any window

OpenAQ cannot supply a 2–3 year Indian PM2.5 history today. Measured against the live
API: the median Indian PM2.5 sensor's first observation is **2025-02-18**; major
CPCB/DPCC stations (R K Puram, Anand Vihar, Punjabi Bagh) hold 2016-02 → 2018-02 and
then nothing until 2025-02; only 1 of 77 sampled stations covered ≥50% of 2023–2026.
So `PM25_START=auto` resolves to roughly 2025-02 onward, and the notebook derives the
window from the data rather than failing silently on an impossible one.

**A station-level date range is not a sensor-level one.** `/locations` reports
`datetimeLast` as the max across *all* sensors at a site, so a station whose PM2.5
sensor died in 2018 still looks current if its NO₂ sensor is live. Phase 1 resolves
ranges per sensor via `/locations/{id}/sensors`; selecting on station-level dates
picks dead sensors and returns zero rows.

Notebook 01B ingests a manual CPCB export into the canonical contract, which is the
supported path for backfilling 2018–2025 until a historical API exists.

### API gotchas encoded in the notebooks

| Gotcha | Symptom if wrong |
|---|---|
| `datetime_from`/`datetime_to`, not `date_from`/`date_to` | Silently ignored — a 2023 request returns 2016 rows |
| `countries_id` is OpenAQ-internal (India = 9, **91 = Italy**) | A valid dataset for the wrong country |
| `meta["found"]` may be the string `">1000"` | `TypeError` comparing to `len(rows)` |
| Missing API key sends *no* auth header | Opaque `401` that looks like a bad key |
| FIRMS `/area` day range is capped at 5 | `400 Invalid day range. Expects [1..5]` |
| FIRMS NRT covers only recent dates | Empty results for older windows — use the `_SP` product |
| FIRMS errors can arrive as HTTP 200 with a text body | `pd.read_csv` parses garbage |
| OpenAQ emits sporadic 500s and 429s | Long acquisition loops die partway |

### Scope knobs (all read from `.env`)

| Variable | Default | Effect |
|---|---|---|
| `PM25_MAX_STATIONS` | 150 | Stations acquired. The main runtime dial. |
| `PM25_MAX_CANDIDATES` | 400 | Locations whose sensors get resolved while ranking. |
| `PM25_START` / `PM25_END` | `auto` | `auto` derives the window from what the sensors hold. |
| `PM25_THROTTLE_S` | 0.25 | Delay between OpenAQ calls. Raise on 429s. |
| `MIN_STATION_ROWS` | 1000 | Stations below this are excluded, with a recorded reason. |
| `PM25_EVENT_THRESHOLD` | 60 | µg/m³ defining a pollution "event". |
| `PM25_PRIMARY_H` | 24 | Phase 7 forecast horizon. |
| `PM25_CV_SPLITS` | 5 | Rolling-origin folds. Below 5, test blocks miss winter entirely. |
| `PM25_OPTUNA_TRIALS` | 20 | Notebook 08 search budget. |

---

## Anomaly detector

Nine notebooks, no crawl of its own — notebook 01 imports the `pm25_estimator`
dataset and every driver comes from persisted Parquet.

```
pm25_estimator/data/pm25/processed/...
      |
01 import    -> data/anomaly/processed/base/anomaly_base.parquet
02 features  -> data/anomaly/processed/features/anomaly_features.parquet
                (325 columns: 280 features, 15 targets, + station_geometry.parquet)
      +--> 03 residual detector (A0)  -> artifacts/anomaly/phase3
      +--> 04 hierarchical baseline   -> artifacts/anomaly/phase4_baseline
      +--> 05 hazard classifier       -> artifacts/anomaly/phase5_hazard
      |        +--> 06 onset detector -> artifacts/anomaly/phase6_onset
      |        +--> 08 calibration    -> artifacts/anomaly/phase8_alerts
      +--> 07 spatial generalization  -> artifacts/anomaly/phase7_spatial
      +--> 09 rolling-origin eval     -> artifacts/anomaly/phase9_rolling
```

Notebooks 03–09 all read notebook 02's output, so **02 must be re-run after any
feature change**. Notebooks 06 and 08 additionally consume 05's predictions.

### Three models, deliberately separate

The original pipeline used one residual model to answer three different questions.
Notebook 03 measures why that fails: the residual score's ROC-AUC against the CPCB
"Very Poor" label is ≈0.50 — indistinguishable from random. It is kept as an
explicit **reference-only** baseline, not a production model.

| Model | Question | Notebook |
|---|---|---|
| A — forecast | What will PM2.5 be? | targets in 02; `pm25_estimator/` owns the model |
| B — hazard | Will it be dangerous within 24 h? | 05 — the candidate model |
| C — onset | Is something unusual starting? | 06 |

The hazard classifier predicts P(peak ≥ 121 µg/m³ within 24 h), the CPCB NAQI "Very
Poor" threshold. On the held-out test block it reaches PR-AUC 0.438 and ROC-AUC
0.884 at precision 0.520 / recall 0.429, with a 1.3% false-alert rate. Against the
honest baselines that is a real margin: current `pm25(t)` scores PR-AUC 0.226,
persistence 0.195, and the A0 residual proxy 0.042. It clears the plan's precision
target (0.25) but misses its recall target (0.70).

Notebook 08 selects the alert policy: an uncalibrated score blended as
`0.7 × local + 0.3 × neighbour within 100 km`, raising at 0.234, clearing at 0.140,
with 2-hour persistence. The blend is preferred over a strict spatial AND because it
degrades gracefully at isolated stations, where an AND policy suppresses every alert.

Notebook 09 runs rolling-origin evaluation over the 567-day span in 5 folds. The
model beats persistence in **5 of 5 folds**, and ranking is stable (ROC-AUC
0.873 ± 0.019) while operating-point recall is not (0.509 ± 0.225) — thresholds
fitted in one season do not transfer to another.

### Leakage controls

Enforced in notebook 02 and asserted in its manifest:

- `baseline_pm25`, `residual` and `robust_z` are fit on **training rows only, after
  the split** — never on the full table.
- `target_*` are the only forward-looking columns, and are never features.
- `event_*` aggregates span the whole episode including its peak, and are quarantined
  as `leaky_event_columns`.
- `concurrent_pm25_features` embed `pm25(t)`: valid for +24 h targets, invalid for
  nowcasting `pm25(t)`.
- National aggregates are leave-one-out. A plain groupby mean includes the row's own
  station, and `national_pm25_max` would simply equal it whenever that station is the
  dirtiest that hour.
- Rolling-origin folds carry a 48-hour embargo between train and validation.

### Anomaly scope knobs

| Variable | Default | Effect |
|---|---|---|
| `PM25_DATA_ROOT` | `../pm25_estimator` | Where notebook 01 looks for the canonical Parquet |
| `ANOMALY_VERY_POOR_UGM3` | 121 | CPCB NAQI "Very Poor" hazard threshold |
| `ANOMALY_POOR_UGM3` | 91 | Secondary hazard label |
| `ANOMALY_SEVERE_UGM3` | 251 | Tertiary hazard label |
| `ANOMALY_HORIZON_HOURS` | 24 | Hazard forecast horizon |
| `ANOMALY_FALSE_ALERT_BUDGET` | 0.05 | False-alert cap used for threshold selection |

---

## Propagation forecast

Eight notebooks plus `propagation_toolkit.py`, no crawl of its own — notebook 01
imports the `pm25_estimator` event-aware table, which already carries
`target_pm25_t_plus_{1,3,6,12,24,48}h`.

```
pm25_estimator/data/pm25/processed/event_aware/...
      |
01 data quality  -> data/propagation/processed/base/station_pm25_series.parquet
                    contract, gates, data_quality_report.json
02 temporal      -> data/propagation/processed/features/temporal_features.parquet
                    station climatology, upstream audit, past-only proofs
03 transport     -> data/propagation/processed/features/propagation_features.parquet
                    integrated advection (306 columns)
      +--> 04 baselines     -> artifacts/propagation/baselines
      +--> 05 hybrid models -> artifacts/propagation/hybrid
      |         +--> 06 uncertainty -> artifacts/propagation/uncertainty
      +-----------------+--> 07 evaluation -> artifacts/propagation/evaluation
                              +--> 08 packaging -> artifacts/propagation/registry
```

Notebooks 04–08 read notebook 03's output, so **03 must be re-run after any feature
change**. 07 needs both 05 and 06; 08 needs 05, 06 and 07. Full detail is in
`propagation_forecast/PIPELINE.md`, and the response to the improvement plan is in
`propagation_forecast/AeroPulse_Propagation_Design_Review_Response.md`.

### The bar is the strongest baseline, not persistence

Notebook 04 scores five baselines per horizon: persistence, 24 h seasonal, 168 h
seasonal, a 6 h rolling mean, and a renormalising ensemble. At 12 h the ensemble beats
persistence by **15.9%** on MAE with no model at all, so a horizon promoted on
"skill > 0 vs persistence" would be shipping a model that loses to arithmetic. Every
residual model is anchored to its own horizon's strongest baseline.

Persistence MAE is also non-monotone — it peaks at 12 h (9.47) and falls at 24 h (8.52)
because 24 hours later is the same time of day — so one skill threshold across horizons
is not comparing like with like.

### Results

Sealed test period. "Skill" is against the anchor baseline, not persistence.

| horizon | model MAE | baseline MAE | skill vs baseline | skill vs persistence |
|---|---|---|---|---|
| 1 h | 4.05 | 4.20 | +0.037 | +0.037 |
| 3 h | 6.14 | 6.57 | +0.066 | +0.129 |
| 6 h | 6.81 | 7.31 | +0.069 | +0.186 |
| 12 h | 7.32 | 7.97 | +0.082 | +0.228 |
| 24 h | 7.64 | 8.20 | +0.069 | +0.104 |
| 48 h | 8.61 | 9.13 | +0.057 | +0.102 |

CatBoost residual over the baseline, chosen over LightGBM/XGBoost/HistGradientBoosting
by a margin (0.095 vs 0.085 mean skill) narrow enough that a swap would be defensible.
Rolling-origin gives 4/4 positive folds at every horizon; geographic-block holdout gives
positive skill on all 5 blocks × 6 horizons (+0.064 to +0.147), so the model transfers to
unseen regions rather than memorising stations. P10–P90 intervals are calibrated
(77–79% against 80% nominal) and hold inside episodes.

### All six horizons are withheld, and that is the finding

Two gates fail. Exceedance recall at 150 µg/m³ falls from 0.434 at 1 h to 0.020 at 6 h
and 0.000 at 48 h — **worse than the baseline it beats on MAE** (0.121 at 6 h). Mean
error on rows above 120 µg/m³ is −79.8 at 1 h and −162.1 at 6 h, underpredicting on
97–100% of them.

Squared-error regression is doing what it was asked to. Exceedances are 0.2% of rows, so
predicting "not an episode" minimises aggregate loss. Aggregate MAE improves and the
product gets worse — exactly the failure the plan's section 28 gate exists to catch.

Two measurements point at the fix:

- **P90 for alerting.** Recall improves 2–20× at false-alarm rates under 0.7% (6 h at
  150 µg/m³: 0.020 → 0.209), clearing the 0.20 gate at 1, 3 and 6 h.
- **P50 as the point forecast.** It beats the squared-error model on MAE at every
  horizon by 2–4%, five times what hyperparameter tuning bought. Pinball loss at q=0.5
  *is* MAE; squared error targets the conditional mean. `PropagationPredictor` has a
  `point_source="p50"` switch, deliberately left off until certification is re-run.

### Most of the feature work does not pay

Ablation at 6 h, dropping one block and retraining:

| block removed | features | MAE change |
|---|---|---|
| pm25 history (lags/rolls) | 40 | **+1.21%** |
| spatial neighbour field | 15 | +0.33% |
| stability / stagnation | 11 | +0.24% |
| transport (advect/fcst) | 12 | +0.24% |
| fire | 46 | +0.03% |
| station climatology | 11 | **−0.19%** |

PM2.5's own history is worth roughly 4× everything else combined. The station
climatology block ranks top-five by feature importance while being unnecessary by
ablation — gain measures what a model reaches for, ablation measures what it needs.

### Leakage and correctness controls

- **Wind is km/h.** Open-Meteo is queried without `wind_speed_unit`. The previous
  implementation converted as if m/s and inflated every advection distance **3.6×**
  (194 km vs 54 km at 6 h). `pt.WIND_KMH_TO_KM_PER_H` and the contract's `units` block
  exist to stop that recurring.
- **Lags and rolling windows are time-aligned, not positional.** With 56,609 gaps in the
  source grid, `shift(24)` and "the value 24 hours ago" agree on only 56% of rows and
  differ by up to 822 µg/m³. Use `pt.time_lag` / `pt.rolling_past`; notebook 02 asserts
  the upstream columns match them.
- **Station and wind climatologies are fitted before the training cutoff only**, with
  the cutoff stored in the artifact. Notebook 02 multiplies every post-cutoff PM2.5 by
  10 and asserts the baselines do not move.
- **Forecast-vintage wind is simulated.** No archived NWP exists to replay, so notebook
  03 decays observed wind toward climatology with `tau` fitted to the wind *anomaly*
  autocorrelation (8.3 h — fitting the raw series instead gives a misleading 37.7 h).
  Production must substitute real forecast wind. This is the largest offline/production
  gap in the pipeline.
- **A leakage scan runs with a positive control** — an injected copy of the target must
  be flagged, or the scan is not known to work.

### Propagation scope knobs

| Variable | Default | Effect |
|---|---|---|
| `PM25_DATA_ROOT` | `../pm25_estimator` | Where notebook 01 looks for the canonical Parquet |
| `PROP_HORIZONS` | `1,3,6,12,24,48` | Horizons modelled; each gets its own baseline anchor and promotion decision |
| `PROP_TRAIN_FRACTION` | `0.70` | Chronological train split |
| `PROP_VALID_FRACTION` | `0.15` | Validation split; the remainder is the sealed test period |
| `PROP_MAX_TRAIN_ROWS` | unset | Caps training rows by even thinning across time — the compute dial for notebooks 05–07 |
| `PROP_ROLLING_FOLDS` | `4` | Rolling-origin folds in notebook 07 |
| `PROP_GEO_BLOCKS` | `5` | k-means geographic blocks for the spatial holdout |
| `PROP_TUNING_TRIALS` | `20` | Random-search budget in notebook 05 |

---

## Source likelihood

Nine notebooks plus `source_toolkit.py`, replacing the previous three. No crawl
of its own — notebook 01 imports the `pm25_estimator` event-aware table, and the
old optional OpenAQ co-pollutant fetch is no longer needed.

```
pm25_estimator/data/pm25/processed/event_aware/...
      |
01 data quality       -> data/source/processed/base/source_evidence.parquet
                         contract, provenance, availability flags
02 evidence features  -> data/source/processed/features/source_evidence_features.parquet
                         pollutant level anomalies, transport consistency, station context
03 labeling functions -> data/source/processed/labels/labeling_function_votes.parquet
                         15 independent LFs with reliability weights
04 weak supervision   -> data/source/processed/labels/weak_labels.parquet
                         multi-label targets, conflict, unknown, 44,563 events
      +--> 05 classifiers  -> artifacts/source/classifiers
      |        +--> 06 calibration -> artifacts/source/calibration
      +----------------+--> 07 temporal/spatial/event -> artifacts/source/evaluation
                       +--> 08 gold set              -> artifacts/source/gold_set
                              +--> 09 packaging      -> artifacts/source/registry
```

Notebooks 05–09 read notebook 04's output, so **03 and 04 must be re-run after
any evidence change**. Detail is in `source_likelihood/PIPELINE.md`; the response
to the improvement plan is in
`source_likelihood/AeroPulse_Source_Likelihood_Design_Review_Response.md`.

### The architectural fix: labels are multi-label

The previous labeller assigned one class per row through a priority chain in
which later rules overwrote earlier ones — `dust` → `industrial` →
`regional_transport` → `traffic` → `biomass_burning`. A row with fire *and*
transport evidence came out as `biomass_burning` alone, while the pipeline
described itself as producing independent likelihoods.

Measured cost: of the 245,508 rows the old rule assigned to a source, **217,962
(88.8%) had at least one other source with supporting evidence that the overwrite
discarded**. And `dust`, first in the chain, appeared on **0.00% of rows** despite
its evidence firing on 18.1% — that class was structurally unreachable, and no
downstream modelling could have recovered it.

Fifteen independent labeling functions now each vote +1 / 0 / −1 on one source
with a reliability weight. 24.4% of rows support two or more sources.
`mixed_unknown` is not a class: it is derived from the absence of confident
scores, because as a competing class it was 85.6% of rows and would teach any
classifier that predicting "unknown" wins.

### Results

Per-source binary classifiers (LightGBM) on 56 leak-safe features. PR-AUC lift
is the only comparable figure — prevalence ranges from 0.07% to 36%.

| source | PR-AUC | lift | ROC-AUC | ECE | calibration |
|---|---|---|---|---|---|
| dust | 0.709 | 1.95x | 0.823 | 0.036 | isotonic |
| traffic | 0.613 | 2.86x | 0.810 | 0.017 | isotonic |
| industrial | 0.145 | 3.51x | 0.769 | 0.021 | sigmoid |
| regional_transport | 0.015 | 3.28x | 0.783 | 0.001 | beta |
| biomass_burning | 0.007 | 10.83x | 0.851 | 0.012 | sigmoid |

All five beat both a constant-prevalence null and a shuffled-label control.
Calibration improves ECE 3–45×, and all three methods win somewhere — a single
global choice would be wrong for two of five. Geographic-block holdout keeps
positive lift on all 5 blocks × 5 sources (worst: dust at 1.45×). Event-based
splitting is much harder than a row split: biomass burning falls from 10.8× to
**1.95×** once whole episodes are held out.

### Two of the five hypotheses are currently definitions, not findings

The tautology analysis in notebook 08 compares a leak-safe classifier against one
allowed to see the labeling-function inputs:

| source | leak-safe PR-AUC | with label inputs | explained only by its own inputs |
|---|---|---|---|
| dust | 0.720 | 1.000 | 28.0% |
| traffic | 0.621 | 1.000 | 37.9% |
| industrial | 0.145 | 1.000 | 85.5% |
| regional_transport | 0.014 | 1.000 | 98.6% |
| biomass_burning | 0.011 | 0.999 | 98.9% |

Dust and traffic are largely learnable from independent evidence. Biomass burning
and regional transport are not: "biomass burning" here *means* "upwind fire
radiative power is high and PM2.5 is elevated", so a model denied both has nothing
(PR-AUC 0.011) and a model given both scores 0.999 having learned nothing. **For
those two sources, serve the labeling function directly with its reliability
weight rather than a classifier that pretends to have learned it.**

### Nothing is promoted, and 48% of requests abstain

Four of ten gates fail: temporal validation (1.95× vs 2.0), spatial validation
(1.45× vs 1.5), one source below the lift floor, and the absent gold set. Served
behaviour is an abstention on 48.3% of stations and a low-confidence dust or
traffic likelihood for the rest, with mean attribution confidence 0.171. For a
source-attribution product that is the correct failure mode.

**No human-reviewed attribution labels exist**, so every metric here measures
agreement with the weak-labeling system, not attribution accuracy. Notebook 08
ships the stratified annotation sheet, the review protocol and the scoring
harness — exercised end to end against mock labels — with every expert column
empty, asserted in code. Filling it from the heuristics would make the audit a
copy of the thing audited.

### Leakage and correctness controls

- **Exclusion is family-level, not column-level.** Naming the exact
  labeling-function inputs was not enough: the classifier read
  `upwind_fire_count_50km`, `pm25_lag_1h` and `n_sources_evaluated` (a label
  output) and reached **PR-AUC 0.9999** on biomass — a number that looked like
  success and was a leakage report. 42 family prefixes are now excluded, plus all
  `*_pm25_ratio` columns and the `evidence_*` flags that decide abstention.
- **Abstention is NaN, never 0.5.** An all-abstaining source scored 0, squashed to
  probability 0.5, and cleared the positive threshold — silence counted as
  support, giving an `is_unknown` rate of exactly 0.0%.
- **Calibration is selected on held-out rows.** Fitted and measured on the same
  validation slice, isotonic scored ECE exactly 0.00000 for all five sources and
  won every time.
- **X/PM2.5 ratios do not work as evidence.** All fall 5–8× across concentration
  bands because PM2.5 is the denominator, and per-station normalisation does not
  fix it. Pollutant *level* anomalies are used instead — which show that severe
  PM2.5 episodes here are fine-dominated (combustion), not dust.
- **Events are keyed on `(location_id, event_id)`.** The upstream `event_id` is
  not unique across stations; grouping on it alone produced 706 "events" averaging
  257 days.
- **CAMS co-pollutants are model output, not measurement**, driven by an emissions
  inventory that already encodes where traffic and industry are. Carried as a 0.55
  reliability weight against 0.95 for a PM2.5 measurement.
- **The output statement is a safety control**: never "caused by", "identified" or
  "proven". Enforced by a contract test.

### Source scope knobs

| Variable | Default | Effect |
|---|---|---|
| `PM25_DATA_ROOT` | `../pm25_estimator` | Where notebook 01 looks for the canonical Parquet |
| `SOURCE_TRAIN_FRACTION` | `0.70` | Chronological train split |
| `SOURCE_VALID_FRACTION` | `0.15` | Validation split; remainder is the sealed test period |
| `SOURCE_MAX_TRAIN_ROWS` | unset | Caps training rows by even thinning across time |
| `SOURCE_GEO_BLOCKS` | `5` | k-means geographic blocks for the spatial holdout |
| `SOURCE_GOLD_SET_SIZE` | `300` | Events sampled into the annotation sheet |
| `SOURCE_ENABLE_COPOLLUTANTS` | `0` | Legacy OpenAQ fetch; no longer needed, CAMS covers every row |

---

## Evaluation rules

These are project rules, mirrored in `AGENTS.md`, and the notebooks enforce them
rather than merely describing them.

**Random train/test splits are forbidden.** Rows are hourly and autoregressive, and
nearby stations are correlated, so a shuffled test row's answer sits in the training
set as an ordinary feature of its neighbour. Use temporal, spatial or seasonal splits.
Rolling-origin folds apply a **purge** (the forecast horizon, since the target at *t*
describes *t+h*) plus an **embargo** margin on top, so a rolling window straddling the
boundary cannot leak either.

**Every metric is reported against an honest baseline** — persistence for regression,
majority-class for classification. A model that cannot beat its baseline is not
promoted, and both PM2.5 notebook 06 and notebook 08 filter candidates on that test
before ranking them on anything else.

**Any statistic used to build a target or label is fitted on training rows only**,
then applied to held-out rows. Fitting before the split is the specific leakage bug
this layer exists to remove.

**Nothing is selected on the test set.** Thresholds and calibrators are chosen on a
held-out slice of the calibration block, never on test. PM2.5 notebook 07 reports both
rankings when they disagree and explains why the honest one ships.

**Five folds is a floor, not a default.** At three folds the PM2.5 test blocks begin in
mid-February and contain no winter or post-monsoon rows, so every extreme metric would
be measured on seasons that have almost no extremes. The notebooks assert seasonal
coverage and fail loudly rather than reporting a meaningless number.

**Feature names come from one place.** `libs/contracts/aeropulse_contracts/feature_spec.py`
is the only place a model feature may be named; training and serving both import it.
Never write a feature list by hand.

---

## Known gaps

These are dataset and scope limits, recorded here and in each notebook's report JSON
rather than papered over.

**One winter.** The dataset spans roughly 19 months and holds a single burning
season, so the model has seen the phenomenon it must predict exactly once. A winter
fold can be validated but not replicated. This is the single largest constraint on
both pipelines, and it is what the PM2.5 acceptance gates are failing on.

**Weather is observed, not forecast.** A deployed +24 h model needs forecast weather
valid over the horizon; these models are trained on analysis and would be served
against forecasts, which is an unmeasured train/serve skew.

**No land-use, population, road or building density.** Anomaly notebook 07 finds that
spatial transfer tracks pollution *regime* more than distance, and testing that
properly requires these features.

**Thresholds do not transfer across seasons.** Anomaly notebook 09 shows operating-point
recall swinging 0.509 ± 0.225 across folds; a quantile-targeted alert budget is the
recommended fix.

**Labels are exceedances, not a reviewed event catalogue.**

**`upwind_fire_*` now exists** and is populated — `upwind_fire_count_50km`,
`upwind_fire_frp_50km` and `upwind_fire_fraction_100km` are non-zero on 29–82% of rows.
It was previously recorded here as deliberately absent; that note was stale. Propagation
notebook 05's ablation then found the entire 46-column fire block is worth **0.03%** of
MAE at 6 h, so the gap was real and closing it changed nothing measurable.

**Phase 5's spatial holdout is a random 80/20 station split**, not a geographically
blocked one, so neighbouring stations can straddle it. Propagation notebook 07 does use
k-means geographic blocks and finds positive skill on every held-out block, which is
weak evidence the random split is not badly optimistic — but it is a different model on
a different target, so the pm25 gap stands.

**Propagation forecast-vintage weather is simulated.** Notebook 03 decays observed wind
toward a train-period climatology rather than replaying an archived forecast, because no
forecast archive exists. It is leakage-free and it is not what production will feed the
model. This is the largest offline/production gap in that pipeline.

**Propagation event recall is unusable beyond 1 h on the point forecast** (0.020 at 6 h,
0.000 at 48 h), and mean error on rows above 120 µg/m³ reaches −162 µg/m³. The P90 bound
recovers 2–20× the recall and is the recommended fix, but it has not been certified.

**Propagation shadow deployment and drift monitoring are mechanisms, not loops.**
Notebook 08 runs a candidate alongside production and stores reference distributions;
nothing accumulates them over time.

**Source likelihood has no ground truth, and two of its five hypotheses are
tautologies.** No human-reviewed attribution catalogue exists, so every metric
measures agreement with the weak-labeling system. Notebook 08's tautology
analysis shows biomass burning and regional transport are 98.9% and 98.6%
explained only by the columns that define them — for those two, the labeling
function *is* the model.

**Source likelihood labels drift severely across the chronological split.**
Biomass burning is 8.01% of training rows and 0.07% of test rows — one stubble
season, entirely on the training side. Thresholds frozen on validation fire on
nothing in test, which is why biomass has the best ROC-AUC of any source (0.851)
and an F1 of exactly zero.

**No industrial-zone, road-density or land-use data.** The source-likelihood
industrial and traffic hypotheses infer land use from time of day, which is the
weakest evidence in that pipeline. This is the same gap listed above for the
anomaly detector, and it blocks both.

**Serving `libs/ml` is not updated by these notebooks.**

---

## What would move the gates, in order of expected effect

1. **More post-monsoon cycles** — the CPCB 3–5 year rebuild. Everything else is
   second-order until the model has seen more than one burning season.
2. **Forecast weather at t+h** instead of observations at t. A 24-hour forecast
   currently uses 24-hour-old meteorology.
3. **Population, road and land-use density**, the acquisition gaps recorded in the
   Phase 7 driver manifest.
4. **Sequence models (LSTM)** — explicitly out of scope for this pass and correctly
   sequenced *after* the three items above. Moving to a sequence model before the data
   foundation is fixed would spend weeks to relearn the same autoregressive signal that
   SHAP already shows dominates the tree models.

---

## Scientific constraints

- **AOD is not surface PM2.5.** Satellite aerosol optical depth is a column
  measurement and needs conversion assumptions that break down under haze.
- **Open-Meteo air quality is CAMS-derived model output, not ground truth.** Never
  state its metrics as station accuracy.
- **Source attribution is probabilistic likelihood, not causal proof**, and source
  likelihoods are independent — not a softmax.
- **Weak labels are pipeline labels only** and must not be presented as scientific
  ground truth.
- **Live inference must use the exact same feature definitions and version as
  training.**

---

## Production integration

The notebooks deliberately keep acquisition, feature engineering, training and
inference separate. The production path is:

```
external connectors -> raw immutable data -> quality/provenance
  -> canonical 1 km grid (H3 resolution 8) -> versioned feature table
  -> ML training / inference -> materialized predictions
  -> event/graph layer -> API/UI
```

The UI must never synchronously call external data providers. CPCB is the preferred
ground truth and IMD the operational weather source in the production design; the
notebooks use OpenAQ and Open-Meteo as runnable public adapters, and the feature
contracts are provider-neutral so an adapter can be swapped without touching them.
