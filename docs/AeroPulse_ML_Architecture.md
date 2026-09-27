# AeroPulse India — ML Architecture

**Date:** 2026-09-08
**Scope:** the four models of LLD §18, as implemented in `libs/ml/` and served through `libs/ml/aeropulse_ml/inference.py`.

The MapLibre UI in `frontend/web` is part of this repository. Demo/Live both exist; Live reads
the FastAPI service. Connector ingest is a scheduled loop driven by `config/sources.yaml`, not
a one-shot job.

Every number in this document was produced by one reproducible command against live data. None is copied from a design document, and none is estimated.

```bash
AEROPULSE_CONNECTOR_MODE=live uv run aeropulse-ml train --model all --live --days 90 --promote
```

---

## 1. The problem this architecture replaced

Before this pass the platform had two ML tracks that could not talk to each other.

**Serving** (`libs/intelligence/`) contained four deterministic formulas with hardcoded coefficients — inverse-distance weighting with `POWER = 2.0`, a percentile rule with threshold `0.55`, fixed priors such as `INDUSTRIAL_PRIOR = 0.11`, and kinematic dilution `1/(1 + 0.08h)`. There was no `.fit(` call, no artifact, and no metric anywhere in any shipped package.

**Notebooks** (`AeroPulse_ML_Notebooks/`) contained real LightGBM and logistic-regression training on real data — but every notebook had `execution_count: null` and empty outputs, meaning none had ever been executed, so no reported metric existed. Their artifacts had zero references anywhere in `apps/` or `libs/`, and could not have been loaded even deliberately: the feature names disagreed on every single field.

| Notebook name | Serving contract field |
|---|---|
| `temperature_2m` | `temperature` |
| `relative_humidity_2m` | `humidity` |
| `surface_pressure` | `pressure` |
| `precipitation` | `rainfall` |
| `wind_speed_10m` | `wind_speed` |
| `fire_count_20km` | `fire_count` (and the radius differed: 20 km vs 100 km) |
| `pm25_roll6`, `pm25_roll24` | *no contract field* |
| `sin_hour`, `cos_hour`, `sin_doy`, `cos_doy` | *no contract field* |
| `lat`, `lon` | `center_lat`, `center_lon` |

The notebooks also used a lat/lon degree-bucket grid while serving used H3 resolution 8, and the two tracks shared not one line of feature-engineering code.

---

## 2. The fix: one feature definition

`libs/contracts/aeropulse_contracts/feature_spec.py` is now the only place a model input may be named. Training reads its column list from it; online inference builds its vector from it. Skew is structurally impossible rather than merely discouraged.

```text
canonical observations (observation.v1 / meteo.v1 / raster.v1)
        |
        v
build_features()                 <- ONE implementation, serving-owned
        |
        v
GridFeature (grid-features.v1)
        |
        v
feature_spec.to_feature_dict()   <- ONE projection
        |
        +--> features_to_frame() --> training matrix
        +--> FeatureSet.vector() --> online inference vector
```

Each model declares a `FeatureSet` naming its own target, and an import-time assertion rejects any set that contains its own target. That is what makes the estimator's exclusion of `pm25` a structural guarantee rather than a convention.

Two further guards:

* `validate_feature_contract()` refuses to load an artifact whose baked-in `feature_names` or `ml_feature_version` disagrees with the runtime — including a pure reordering, because tree models are positional once serialised.
* `_matrix()` zero-fills columns that are entirely null so the vector keeps its contracted width. Dropping them would silently change the artifact's layout. The affected names are reported by `degenerate_features()`.

**Feature versions:** `grid-features-0.4.0` (serving contract, bumped this pass to add 6h/24h lags and 6h/24h trailing means) and `ml-features-1.0.0` (the shared projection). Both are recorded on every artifact.

---

## 3. Estimator choice, and a deviation from the LLD

LLD §18.1 names LightGBM or XGBoost. This implementation uses scikit-learn `HistGradientBoostingRegressor` / `HistGradientBoostingClassifier`.

**Reason:** LightGBM requires a system OpenMP runtime. On the target machine `/opt/homebrew/opt/libomp/lib/libomp.dylib` does not exist (verified), so LightGBM would fail to import. scikit-learn bundles its own OpenMP in its wheels. `HistGradientBoosting*` is the same gradient-boosted-histogram algorithm family — it is LightGBM's approach reimplemented in scikit-learn — so this is an implementation-vehicle change, not an algorithmic one. Each trainer instantiates its estimator in a single call (`_regressor()`), so restoring LightGBM is a one-line change once the dependency is guaranteed.

---

## 4. Evaluation methodology

LLD §19 is explicit: *"Models must be evaluated using spatial and temporal holdouts. Avoid random splits because nearby locations and adjacent time periods are correlated."*

No random split is reachable in this codebase. `libs/ml/evaluation.py` provides exactly three:

| Holdout | Question it answers | Construction |
|---|---|---|
| **temporal** | Does it generalise forward in time? | 80th-percentile time cut; test lies strictly in the future |
| **spatial** | Does it generalise to unseen locations? | Whole H3 cells held out; deterministic so retrains stay comparable |
| **seasonal** | Does it survive a regime change? | Latest calendar month held out |

A holdout that cannot be constructed reports `evaluated: false` with a reason instead of silently degrading to something weaker. With a single-month window the seasonal split declines rather than pretending; the 90-day window spans June–September, so it does evaluate.

A **separate model is fitted per holdout**, so no test row ever influences the model it is scored against.

---

## 5. Dataset

| Property | Value |
|---|---|
| Source | Open-Meteo air quality + weather (anonymous, no credential) |
| Sites | 5 Indo-Gangetic corridor cells: Delhi NCR, Gurugram, Karnal, Ludhiana, Amritsar |
| Window | 2026-06-10 → 2026-09-08 (90 days, hourly) |
| Grid-hour rows | **10,920** |
| Distinct H3 cells | 5 |
| Observations | 65,520 air quality + 10,920 weather + 10,920 raster (AOD) |
| Materialisation time | ~22 s including all network fetches |

**The single most important caveat in this document:** Open-Meteo air quality is **CAMS-derived model output, not ground reference measurement**. It is a legitimate background/prior input under LLD §9 and a legitimate signal for validating that the pipeline works end to end. It is **not** CPCB ground truth. `provenance.provider` records `"Open-Meteo (CAMS-derived model output)"` so the distinction survives into the evidence graph, and every artifact carries the same warning in its `notes`.

The practical consequence is that the estimator's headline accuracy is optimistic: it reconstructs a *smooth model field* from co-pollutants produced by the same underlying model, which is an easier problem than estimating real station PM2.5. **Retrain on CPCB before making any operational accuracy claim.**

---

## 6. Model 1 — Hyper-local PM2.5 estimator

* **Target:** `pm25`. **Features:** 30, excluding `pm25` by construction.
* **Inputs:** co-pollutants (`pm10, no2, so2, co, o3`), AOD, weather (`temperature, humidity, pressure, rainfall, wind_u, wind_v, wind_speed, boundary_layer_height`), fire (`fire_count, fire_frp, upwind_fire_score`), history (1/3/6/24 h lags, 6/24 h trailing means), spatial (`center_lat, center_lon, station_distance`), cyclical time.
* **Baseline:** persistence (`pm25_lag_1h`).

| Holdout | MAE | RMSE | R² | Bias | Baseline MAE | **Skill** |
|---|---|---|---|---|---|---|
| temporal | 3.90 | 5.84 | 0.975 | −1.40 | 6.89 | **+0.435** |
| spatial | 3.61 | 5.69 | 0.961 | −1.09 | 5.34 | **+0.324** |
| seasonal | 3.16 | 4.94 | 0.961 | +0.18 | 5.46 | **+0.422** |

**Gate: PASS.** Positive skill on all three holdouts, consistently. Slight negative bias means it under-predicts marginally — relevant for an alerting system and worth watching.

**AOD handling.** LLD §18.1 and caveat §65.5 forbid treating AOD as surface PM2.5. AOD is emitted as `RasterObservation.sample_aod`, never as a `Measurement`, so no consumer can mistake it for a surface reading; it reaches the model only as one of 30 feature columns. A contract test enforces this (`test_aod_is_not_emitted_as_a_pollutant_measurement`).

---

## 7. Model 2 — Anomaly detector

Architecture follows LLD §18.2: hour-of-week baseline + meteorology-conditioned ML residual.

**Leakage fix.** The notebook computed its baseline over the whole dataset *before* splitting, so every test row's regression target had already seen the test period; it then evaluated against `proxy_event`, itself derived from that same residual — a model scored against a label entangled with its own input. Here `fit_anomaly_baseline()` receives **training rows only** and is applied to held-out rows, and evaluation uses an **external** label: whether observed PM2.5 crosses the CPCB NAQI "Very Poor" breakpoint of 121 µg/m³. That threshold comes from a published standard, not from the model.

| Holdout | Residual MAE | Residual R² | Precision | Recall | F1 | False-alert rate | Positive rate |
|---|---|---|---|---|---|---|---|
| temporal | 11.36 | 0.844 | 0.600 | **0.046** | 0.086 | 0.0030 | 0.089 |
| spatial | 13.65 | 0.718 | 0.909 | **0.204** | 0.333 | 0.0010 | 0.045 |

**Gate: FAIL — held at VALIDATION, not serving.**

The residual model is sound (R² 0.72–0.84). The *detector built on it* is not: at recall 0.046 it misses roughly 95% of standard exceedances. Precision is high and the false-alert rate is near zero, which is exactly the failure mode LLD §45 anticipates by demanding a false-alert rate alongside recall — a detector that almost never fires looks excellent on precision and is useless to an operator.

Root cause is the alert rule, not the model: the threshold is one residual standard deviation, which is far too strict. Calibrating that threshold against a target false-alert budget is the next step and does not require retraining.

---

## 8. Model 3 — Source likelihood

Classes: `biomass_burning`, `traffic`, `regional_transport`, `mixed_unknown`. Per LLD §18.3 these are reported as **independent likelihoods, not a softmax** — the serving payload returns per-class probabilities without implying exclusivity.

**Leakage fix.** The notebook's `weak_label()` was a closed-form function of `pm25`, `no2_pm25_ratio`, `fire_count_30km`, `wind_speed_10m` and `hour` — and every one of those was in its `FEATURES`. Its accuracy therefore measured whether logistic regression could re-derive quantile thresholds it had been handed. Here the `SOURCE_LIKELIHOOD` feature set **deliberately excludes every signal the label rule uses** (no fire columns, no co-pollutants), so the classifier must work from weather, AOD, history, space and time. Label thresholds are also fitted on training rows only.

| Holdout | Accuracy | Majority-class rate | Macro F1 | Log loss | Brier |
|---|---|---|---|---|---|
| temporal | 0.972 | **0.933** | 0.607 | 0.189 | 0.053 |
| spatial | 0.999 | **0.998** | 0.875 | 0.004 | 0.002 |

Per-class, temporal holdout:

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| `mixed_unknown` | 0.975 | 0.996 | 0.985 | 2038 |
| `regional_transport` | 0.913 | 0.770 | 0.836 | 122 |
| `traffic` | **0.000** | **0.000** | **0.000** | 25 |

**Gate: FAIL — held at VALIDATION, not serving.**

This is why accuracy is the wrong headline. 0.972 accuracy against a 0.933 majority-class rate is a 3.9-point gain over always guessing `mixed_unknown`. The model learns `regional_transport` genuinely (F1 0.84) and **cannot detect `traffic` at all** despite 25 supporting rows. The spatial holdout collapsed to two classes, making its 0.999 accuracy uninformative — reported for completeness, not as evidence.

**This model must never be presented as source attribution.** The labels are heuristics, not verified attribution. Its serving payload carries `"caveat": "weak labels; probabilistic hint only, never proven causality"`, consistent with LLD caveat §65.4.

---

## 9. Model 4 — Propagation forecast

Residual-over-persistence correction per horizon. Positive skill against persistence is the only claim worth making about a forecast.

| Horizon | Holdout | Model MAE | Persistence MAE | **Skill** |
|---|---|---|---|---|
| 3 h | temporal | 14.05 | 16.87 | **+0.167** |
| 3 h | spatial | 10.20 | 13.33 | **+0.235** |
| 6 h | temporal | 19.15 | 25.65 | **+0.253** |
| 6 h | spatial | 14.56 | 21.67 | **+0.328** |
| 12 h | temporal | 21.91 | 33.48 | **+0.346** |
| 12 h | spatial | 16.67 | 30.82 | **+0.459** |
| 24 h | temporal | 26.34 | 23.53 | **−0.119** |
| 24 h | spatial | 17.20 | 20.34 | +0.155 |

**Gate: FAIL — held at VALIDATION, not serving.**

3–12 h show real, consistent skill (+0.17 to +0.46). **At 24 h the model is worse than persistence** on the temporal holdout. The diurnal cycle means the value 24 h ahead resembles the value now, which is a strong baseline the residual model does not beat; the model has also learned a shorter-range correction that misfires at that range.

The 48 h horizon of LLD §18.4 is not evaluated: the 90-day window yields too few resolvable pairs, and it reports `evaluated: false` with that reason rather than a fabricated number.

Correct next step is per-horizon promotion — ship 3/6/12 h, withhold 24 h — rather than tuning until the aggregate looks acceptable.

---

## 10. Scorecard

| Model | Data | Features | Algorithm | Validation | Metrics | Leakage checked | Live prediction | MLOps | Gate |
|---|---|---|---|---|---|---|---|---|---|
| PM2.5 estimator | Real (model output) | Shared spec, 30 | HGB Regressor | temporal + spatial + seasonal | MAE/RMSE/R²/bias/skill | Yes — target excluded structurally | Yes | Registered, PRODUCTION | **PASS** |
| Anomaly detector | Real (model output) | Shared spec, 27 | HGB Regressor on baseline residual | temporal + spatial | Residual + P/R/F1/false-alert | Yes — baseline fitted on train only; external label | Ready, not serving | Registered, VALIDATION | **FAIL** (recall 0.046) |
| Source likelihood | Real, **weak labels** | Shared spec, 20 | HGB Classifier | temporal + spatial | Macro-F1/log-loss/Brier/confusion | Yes — label inputs excluded from features | Ready, not serving | Registered, VALIDATION | **FAIL** (traffic F1 = 0) |
| Propagation forecast | Real (model output) | Shared spec, 27 | HGB Regressor, residual over persistence | temporal + spatial per horizon | MAE/RMSE + skill vs persistence | Yes — target strictly future | Ready, not serving | Registered, VALIDATION | **FAIL** (24 h skill −0.119) |

## 11. Maturity assessment

Levels: 0 concept · 1 prototype · 2 working baseline · 3 validated · 4 production candidate · 5 production ML.

| Model | Before | Now | Why |
|---|---|---|---|
| PM2.5 estimator | 1 | **3 — validated** | Trained on real data, positive skill on three independent holdouts, artifact registered and served with contract validation. Not level 4: trained on model output rather than CPCB ground truth; on-demand distribution drift exists but scheduled/error drift does not |
| Anomaly detector | 1 | **2 — working baseline** | Residual model is sound and leakage-free, but the detector fails its own standards-based evaluation. Blocked from serving |
| Source likelihood | 1 | **2 — working baseline** | Pipeline is correct and leakage-free; supervision is heuristic and one class is undetectable. Cannot exceed level 2 without labelled attribution data, which no available source provides |
| Propagation forecast | 1 | **2/3 — validated at 3–12 h** | Genuine skill at 3–12 h; negative at 24 h. Level 3 for the short horizons, level 2 overall until per-horizon promotion exists |

No model is level 4 or 5. Reaching level 4 requires CPCB ground truth, drift monitoring (LLD §46, absent) and the calibration work above.

---

## 12. Future architecture

The registry decouples model implementation from serving, so replacement does not touch the platform: train a new artifact against the same `FeatureSet`, register it, and promote it through `SHADOW → CANARY → PRODUCTION`. `validate_feature_contract` guarantees an incompatible artifact is refused rather than mis-served.

| Model | Candidate successors | Prerequisite |
|---|---|---|
| PM2.5 | Temporal Fusion Transformer; spatio-temporal GNN over the H3 adjacency graph | Many more cells; H3 neighbour edges are not yet materialised |
| Anomaly | Variational autoencoder; contrastive detection | Calibrated thresholds and a labelled event set first |
| Source | Multimodal transformer; causal inference | **Real labels.** No architecture fixes weak supervision |
| Forecast | ConvLSTM; Neural ODE; physics-informed network | Gridded fields rather than 5 point cells |

The ordering matters: for source attribution the binding constraint is label quality, not model capacity. A transformer trained on the same heuristic labels would reproduce the same heuristic with more parameters. Per LLD §5.4, complexity is not the missing ingredient — data is.
