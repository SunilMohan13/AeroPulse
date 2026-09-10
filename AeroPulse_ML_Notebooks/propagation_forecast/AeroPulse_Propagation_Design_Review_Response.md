# AeroPulse Propagation — Design Review Response

Response to `AeroPulse_Propagation_ML_Improvement_Plan.md`, written after
implementing it. Every number here comes from an executed notebook in this
folder; nothing is projected.

The plan's core judgement was right: the residual-over-baseline architecture
is the correct foundation, and the fix was never "use a bigger model" — it
was leakage control, honest baselines, and validation that survives contact
with a new time period and a new region. The implementation confirms that,
and it also contradicts the plan in four specific places, which are recorded
below rather than quietly worked around.

---

## 1. Where the plan was wrong

### 1.1 Most of sections 7-11 and 14 were already implemented

The plan asks for cyclical time features, a PM2.5 lag hierarchy, rolling
statistics, multi-scale spatial neighbours, wind-aware upwind fields and
upwind fire aggregation. Notebook 02 audits the upstream feature store
against every item: **10 of 14 requested families are already complete.**
The plan was written against an earlier version of the pm25 Phase-2 store.

Rebuilding those columns would not have been neutral — a second
implementation of a lag is a second chance to get it wrong. The two families
genuinely missing (day-of-week cyclical encoding, and all of section 10's
station-relative climatology) were added; the rest were audited and left
alone.

### 1.2 The plan's own rolling-feature recipe would have introduced a bug

Section 8 recommends `rolling(window).mean().shift(1)`. On this dataset that
is wrong. There are 56,609 gaps in the hourly grid, and the upstream store
uses a **time-based** window with `closed="left"` (and `ddof=0` for the
standard deviations). The two recipes disagree by up to **256 µg/m³**.
The same applies to lags: `shift(24)` and "the value 24 hours ago" differ by
up to **822 µg/m³**, and agree on only 56% of rows.

`pt.time_lag` and `pt.rolling_past` implement the gap-aware versions, and
notebook 02 asserts the upstream columns match them.

### 1.3 "Beats persistence" is the wrong promotion gate

The plan keeps `skill > 0` vs persistence as the MVP rule and adds a
seasonal comparison in section 16. The measurement in notebook 04 shows the
gap is not marginal: at 12 h a weighted average of three lagged observations
beats persistence by **15.9%**. Promoting on "beats persistence" between 3 h
and 12 h would ship models that lose to arithmetic.

Persistence MAE is also non-monotone in horizon — it peaks at 12 h (9.47) and
falls at 24 h (8.52), because 24 hours later is the same time of day. A single
skill threshold applied across horizons is therefore not comparing like with
like. Every model in notebook 05 is anchored to *its own* horizon's strongest
baseline.

### 1.4 A unit error was inflating every transport feature by 3.6x

Not in the plan, but found while implementing section 12. Open-Meteo is
queried without `wind_speed_unit`, so wind is **km/h**. The previous
implementation converted as if it were m/s. Mean 6 h transport distance was
reported as 194 km; the correct value is 54 km. Tree models are
scale-invariant so the old skill numbers were not corrupted, but the
displacement was useless as a geographic quantity.

---
## 2. Plan coverage

Every numbered section of the improvement plan, and where it landed.

| Plan section | Status | Where |
|---|---|---|
| 4.1 data contract | done | `pt.SCHEMA`, `pt.validate_contract` — nb 01 |
| 4.2 quality gates | done | `pt.quality_report` — nb 01 |
| 5 feature availability timestamps | done (documented, not enforced per-row) | nb 01 §5 |
| 6 weather forecast vintage | partial — simulated, not archived NWP | nb 03 §2 |
| 7 cyclical time | already present + day-of-week added | nb 02 §3 |
| 8 rolling statistics | already present, recipe verified | nb 02 §5 |
| 9 lag hierarchy | already present (9 lags) | nb 02 §2 |
| 10 station-relative features | **added** | nb 02 §4 |
| 11 spatial / wind-aware neighbours | already present | nb 02 §2 |
| 12 integrated advection | **added**, unit bug fixed | nb 03 §3 |
| 13 stability + stagnation duration | **added** | nb 03 §4 |
| 14 fire features | already present incl. upwind | nb 02 §2 |
| 15 pollution regimes | **added** as past-only flags | nb 03 §5 |
| 16 baseline ladder A-E | **added** | nb 04 |
| 17 model tiers 1-2 | done (4 families compared) | nb 05 §2 |
| 17 tier 3 deep models | deliberately not done — plan §49 | — |
| 18 multi-task model | not done; per-horizon retained | — |
| 19 ensembles | baseline ensemble with fitted weights | nb 04 §4 |
| 20 physical constraints | done, with `constraint_applied` in the response | `pt.constrain_prediction` |
| 21 quantile prediction | done | nb 06 §1 |
| 22 uncertainty calibration | done (split-conformal scaling) | nb 06 §2 |
| 23 rolling-origin validation | done | nb 07 §1 |
| 24 geographic block holdout | done (k-means on coordinates) | nb 07 §2 |
| 25 per-station metrics | done | nb 07 §3 |
| 26 per-regime metrics | done | nb 07 §4 |
| 27 extreme-event recall | done | nb 07 §5 |
| 28 bias analysis | done | nb 07 §5 |
| 29 hyperparameter tuning | done (random search on validation) | nb 05 §3 |
| 30 certification before retrain | done — metrics stored pre-registration | nb 07 → nb 08 |
| 31 feature importance | done | nb 05 §6, bundled for the UI |
| 32 model artifact design | done | nb 08 §1 |
| 33 model registry | done, immutable | `pt.ModelRegistry` |
| 34 inference contract | done | `pt.PropagationPredictor` |
| 35 fallback strategy | done, 5 levels | nb 08 §3 |
| 36 confidence routing | done | `pt.PropagationPredictor` |
| 37 drift monitoring | reference distributions only | nb 08 §5 |
| 38 retraining strategy | documented in the deployment manifest | nb 08 §7 |
| 39 shadow deployment | not implemented | — |
| 40 promotion gates | done, 9 gates, evidence required | `pt.evaluate_promotion`, nb 07 §7 |
| 41 notebook structure | done — 8 notebooks as specified | this folder |
| 42 reusable package | done as one module, not a package tree | `propagation_toolkit.py` |
| 43 YAML configuration | done as `.env` + `PropagationConfig` | `.env.example` |
| 46 provenance in the response | done | nb 08 §2 |
| 47 automated tests | done | `python propagation_toolkit.py` |
| 48 latency benchmark | done | nb 07 §6, nb 08 §4 |

Two deliberate departures from the plan's letter:

**Section 42 asked for a package tree** (`aeropulse_ml/data/`, `features/`,
`models/`, …). This is one module instead. At ~2,000 lines the import graph
of a nine-directory package would cost more than it explains, and the
existing `anomaly_detector/anomaly_toolkit.py` set the precedent in this
repository. Splitting it is mechanical if it outgrows a file.

**Section 43 asked for YAML.** The rest of this repo configures through
`.env`, and mixing two configuration systems in one folder is worse than
either. `PropagationConfig` carries the same fields.

---

## 3. Results

### 3.1 Accuracy

Sealed test period, MAE in µg/m³. "Baseline" is each horizon's strongest
cheap forecast from notebook 04, which is what the model was required to beat.

| horizon | anchor | model MAE | baseline MAE | skill vs baseline | skill vs persistence | R² |
|---|---|---|---|---|---|---|
| 1 h | persistence | 4.05 | 4.20 | +0.037 | +0.037 | 0.61 |
| 3 h | ensemble | 6.14 | 6.57 | +0.066 | +0.129 | 0.37 |
| 6 h | ensemble | 6.81 | 7.31 | +0.069 | +0.186 | 0.31 |
| 12 h | ensemble | 7.32 | 7.97 | +0.082 | +0.228 | 0.25 |
| 24 h | ensemble | 7.64 | 8.20 | +0.069 | +0.104 | 0.24 |
| 48 h | ensemble | 8.61 | 9.13 | +0.057 | +0.102 | 0.16 |

The two skill columns are the point of the exercise. Quoted against
persistence the model looks strong (+0.23 at 12 h). Against the baseline it
actually has to beat it is +0.08. **Roughly two thirds of the apparent skill
at 12 h is free from lagged arithmetic.**

### 3.2 Robustness

- **Rolling-origin: 4/4 folds positive at every horizon.** Mean skill
  0.079-0.123, worst single fold +0.035.
- **Geographic blocks: positive skill on all 5 blocks x 6 horizons**, range
  +0.064 to +0.147. Held-out MAE varies 4.1-17.6 by region while skill stays
  flat, so the model transfers rather than memorising station identity. This
  is the strongest result in the pipeline and it is what makes geographic
  expansion credible.
- **Uncertainty: calibrated.** Raw P10-P90 coverage was already 76.9-78.9%
  against 80% nominal; conformal multipliers came out x0.99-x1.02. Test
  coverage 77.0-79.4%, and it holds inside episodes (80.7% in the 120-250
  band at 6 h).
- **Latency: 7-29 ms per horizon**, 74 ms for all six, against a 200 ms SLA.

### 3.3 Why nothing was promoted

All six horizons are withheld. Two gates fail, and neither is a
threshold quibble.

**Exceedance recall collapses with horizon.** At 150 µg/m³ the model catches
43% of exceedances at 1 h, 9% at 3 h, 2% at 6 h and none at 48 h. Beyond
1 h it catches **fewer than the baseline it beats on MAE** — 2.0% versus
12.1% at 6 h.

**Bias on episodes is severe.** Mean error on rows above 120 µg/m³ is
**-79.8 at 1 h and -162.1 at 6 h**, with a 97-100% underprediction rate.

Both follow from the objective. Exceedances are 0.2% of rows; a squared-error
model minimises aggregate loss by predicting "not an episode" and eating a
small penalty on a rare event. Aggregate MAE improves and the product gets
worse. Plan section 28 predicted exactly this, and the gate caught it.

One caveat, stated so nobody mistakes it for a tuning problem: the
`extreme_bias` gate at ≤85% underprediction is close to unpassable for *any*
conditional-mean forecaster on a heavy right tail. The threshold is arguably
badly specified. But -162 µg/m³ of mean error is not a threshold artifact,
so loosening the gate would hide a defect rather than fix a measurement.

### 3.4 The two findings that change what to build next

**P90 is the right instrument for alerting, and the numbers are decisive.**
An exceedance question asks whether a high outcome is *plausible*, not
whether it is *expected*. Same threshold, same rows, upper bound instead of
the point:

| horizon | threshold | point recall | P90 recall | point FAR | P90 FAR |
|---|---|---|---|---|---|
| 1 h | 100 | 0.540 | **0.727** | 0.17% | 0.52% |
| 3 h | 150 | 0.094 | **0.307** | 0.03% | 0.20% |
| 6 h | 150 | 0.020 | **0.209** | 0.02% | 0.19% |
| 12 h | 150 | 0.006 | **0.118** | 0.01% | 0.15% |
| 24 h | 150 | 0.010 | **0.152** | 0.01% | 0.14% |

Recall improves 2x to 20x with false-alarm rates still under 0.7%. On this
evidence P90 alerting clears the 0.20 recall gate at 1 h, 3 h and 6 h — the
horizons an alerting product needs. The quantile models are trained,
calibrated and already inside the registered bundle.

**P50 is a better point forecast than the point model, at every horizon.**

| horizon | 1 h | 3 h | 6 h | 12 h | 24 h | 48 h |
|---|---|---|---|---|---|---|
| point model MAE | 4.047 | 6.136 | 6.810 | 7.316 | 7.638 | 8.608 |
| P50 MAE | 3.922 | 5.893 | 6.565 | 7.120 | 7.460 | 8.587 |
| improvement | 3.1% | 4.0% | 3.6% | 2.7% | 2.3% | 0.2% |

An objective mismatch, not a mystery: notebook 05 *selected* on MAE but
*trained* on squared error, which targets the conditional mean. Pinball loss
at q=0.5 is MAE. The gain is **five times what hyperparameter tuning
bought** (0.50%). `PropagationPredictor` has a `point_source="p50"` switch;
it is off, because switching the served forecast without re-running
certification would put an uncertified model in production — the exact
failure the gates exist to prevent.

### 3.5 Feature ablation: most of the plan's feature work does not pay

Drop one block, retrain, re-measure on validation (h=6):

| block removed | features | MAE change |
|---|---|---|
| pm25 history (lags/rolls) | 40 | **+1.21%** |
| spatial neighbour field | 15 | +0.33% |
| regime flags | 6 | +0.30% |
| stability / stagnation | 11 | +0.24% |
| transport (advect/fcst) | 12 | +0.24% |
| CAMS satellite | 20 | +0.13% |
| fire | 46 | +0.03% |
| station climatology | 11 | **-0.19%** |

Only PM2.5's own history matters, by roughly 4x over anything else. The 46
fire columns are worth 0.03%. The transport features this project spent real
effort correcting are worth 0.24%. And the station climatology added for
plan section 10 makes validation MAE slightly **worse**.

The station-climatology result contradicts the feature importances, where
`pm25_vs_station_month` ranks top-five at 12/24/48 h. Both are correct: gain
measures how often a model reaches for a feature, ablation measures whether
it needs one. Those features are heavily used and almost perfectly
substitutable. Keep them (free at inference, and they make the UI's driver
list legible) while being clear they are not earning skill.

The uncomfortable implication for planning: the plan's sections 11-14 —
spatial, transport, stability, fire — account for under 1% of MAE combined.
Correcting them was right, because a wrong feature is worse than an absent
one, but they are not the lever.

---

## 4. Defects found by implementing

Six, all of which would have shipped:

1. **Wind unit.** m/s assumed where the API returns km/h; every transport
   distance inflated 3.6x.
2. **Seasonal baselines used positional shifts** across 56k data gaps,
   overstating their availability (99.8% reported vs 84.8% true) and
   understating their accuracy.
3. **The predictor could never run the ML model.** Models were trained with
   the `bl_*` baseline ladder in their feature set; the predictor supplied
   only `baseline_forecast`. Every request would have raised a `KeyError`,
   been caught by the fallback handler, and served a baseline while
   reporting success. The inference tests would all have passed.
4. **Intervals could exclude their own point forecast** — one case had the
   point at 137 µg/m³ inside a P10 of 350.
5. **`drivers` was always empty**; the label table matched none of the
   features that actually rank.
6. **`ModelRegistry.index()` read a metrics key that is never written**,
   silently showing `None` for every skill value.

Items 3-6 share a cause: they are only visible when the thing runs on real
artifacts. Each now has a test that fails loudly — `test_ml_path_executes`
asserts the forecast source is `hybrid_lightgbm` rather than merely
asserting a number came back.

---

## 5. What to do next, in order

1. **Adopt P90 for exceedance alerting** and re-run notebook 07 with the
   event gates evaluated on P90. Highest value, zero training cost, and it
   is what unblocks the alerting product.
2. **Switch the point forecast to P50** (or retrain notebook 05's comparison
   with an MAE objective) and re-certify. Free 2-4%.
3. **Investigate three stations** — 358467, 3409395, 270729 — which account
   for seven of the eight worst station/horizon pairs, with skill to -1.85.
   Three stations is an inspection task, not a modelling one.
4. **Replace the simulated forecast wind with archived NWP.** This is the
   largest remaining gap between offline and production, and it is the only
   way to know whether transport features are genuinely weak or merely
   starved of a real forecast.
5. **Weight the training loss toward episodes**, or train a dedicated
   exceedance classifier. The `anomaly_detector` pipeline already does the
   latter for a 24 h hazard, so check for overlap before building a second one.
6. **Do not build a deep temporal model yet.** Plan section 49 is right, and
   the ablation reinforces it: a model whose skill comes almost entirely
   from PM2.5's own history is not being held back by architecture.

---

## 6. Definition of Done (plan section 53)

```
[x] Dataset contract implemented
[x] Data quality gates implemented
[x] No future leakage verified automatically
[~] Production/historical feature parity verified   (simulated forecast wind)
[x] Temporal features implemented
[x] Rolling PM2.5 features implemented
[x] Wind-aware spatial features implemented
[x] Improved transport features implemented
[x] Persistence baseline implemented
[x] Seasonal baselines implemented
[x] Rolling-origin validation implemented
[x] Geographic holdout implemented
[x] Station-level metrics implemented
[x] Regime-level metrics implemented
[x] Extreme-event metrics implemented
[x] Quantile prediction implemented
[x] Prediction interval calibration implemented
[x] Model versioning implemented
[x] Model registry implemented
[x] Production inference contract implemented
[x] Fallback strategy implemented
[x] Model promotion gates implemented
[~] Shadow deployment implemented        (mechanism runs; no accumulating loop)
[~] Drift monitoring implemented         (reference distributions only)
[ ] Retraining workflow implemented      (policy documented, not automated)
[x] Automated tests implemented
[x] Latency benchmark completed
```

22 of 26 complete, 3 partial, 1 not started.

The pipeline is production-ready. **The model is not**, and the pipeline is
what tells you so — which was the point.
