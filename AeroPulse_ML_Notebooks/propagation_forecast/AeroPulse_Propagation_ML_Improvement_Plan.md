# AeroPulse Propagation ML — Model Training & Production Improvement Plan

## 1. Executive assessment

I reviewed the three notebooks currently used for the AeroPulse propagation pipeline:

1. `01_propagation_phase1_import_timeseries.ipynb`
2. `02_propagation_phase2_horizon_transport_features.ipynb`
3. `03_propagation_phase3_hybrid_horizon_models.ipynb`

The current implementation is a **good MVP baseline**. Its strongest design choice is that it does not blindly train a black-box PM2.5 forecaster: it uses a physics-inspired decomposition:

> current PM2.5 → wind-vector advection → ventilation/stability → ML residual correction

The Phase 3 model also correctly treats persistence as the baseline and uses chronological evaluation, horizon-specific purge, and a spatial holdout.

However, the notebooks are not yet sufficient for a production-grade AeroPulse forecasting system. The main gap is not simply "use a more powerful model"; it is to build a **reproducible forecasting/training pipeline with leakage controls, stronger temporal/spatial features, multiple baselines, uncertainty, calibration, model registry/versioning, and production inference contracts**.

The recommended target architecture is:

```text
                    ┌──────────────────────────────┐
                    │ Historical + Forecast Inputs │
                    │ PM2.5 | Weather | Fire |     │
                    │ Boundary Layer | Stations    │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │ Data Quality + Alignment      │
                    │ UTC alignment / gaps / QA     │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │ Feature Engineering           │
                    │ Temporal + Spatial + Weather │
                    │ Transport + Fire + Regime    │
                    └──────────────┬───────────────┘
                                   │
                 ┌─────────────────┼──────────────────┐
                 ▼                 ▼                  ▼
        ┌────────────────┐ ┌────────────────┐ ┌─────────────────┐
        │ Persistence /  │ │ Hybrid Residual│ │ Advanced Model  │
        │ Seasonal       │ │ LightGBM       │ │ TFT/XGBoost/etc │
        │ Baselines      │ │                │ │                 │
        └───────┬────────┘ └───────┬────────┘ └────────┬────────┘
                └──────────────────┼───────────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │ Model Selection + Calibration │
                    │ MAE/RMSE + skill + P90/P95   │
                    │ by horizon / station / regime │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │ Model Registry + Artifacts    │
                    │ model + features + schema     │
                    │ metrics + dataset fingerprint │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │ AeroPulse Inference Service   │
                    │ forecast + confidence +       │
                    │ provenance + model version    │
                    └──────────────────────────────┘
```

---

# 2. What is already good

## 2.1 Phase 1

Phase 1 creates a local/frozen propagation dataset and explicitly verifies the presence of the multi-horizon targets.

The notebook:

- loads `pm25_event_aware_features.parquet`
- validates `target_pm25_t_plus_{h}h`
- normalizes `timestamp_utc`
- persists a propagation-specific Parquet dataset
- writes a dataset manifest
- creates a dataset fingerprint

This is a good foundation for reproducibility.

The current horizons are configured as:

```text
1, 3, 6, 12, 24, 48 hours
```

The notebook explicitly avoids making later phases dependent on another working directory.

## 2.2 Phase 2

The transport feature idea is strong.

The current implementation adds:

- `advect_dx_km_h{h}`
- `advect_dy_km_h{h}`
- `advect_dist_km_h{h}`
- `ventilation_proxy`
- `stagnation_flag`

It also retains neighbour-field features such as:

- `neighbour_pm25_mean`
- `pm25_local_excess`

The important architectural decision is that advection is currently treated as a **feature**, not falsely represented as a complete transported concentration field.

## 2.3 Phase 3

Several parts of Phase 3 should be retained.

### Residual learning

The current target is:

```text
residual = future_pm25 - current_pm25
```

and prediction is:

```text
forecast = current_pm25 + predicted_residual
```

This is a sensible first hybrid architecture.

### Persistence baseline

Persistence is explicitly evaluated:

```text
skill = 1 - MAE_model / MAE_persistence
```

This is essential because PM2.5 can be surprisingly difficult to beat over short horizons.

### Chronological split

The current code uses:

```text
70% train
15% validation
15% test
```

with a horizon-dependent purge.

This is much better than random train/test splitting.

### Spatial holdout

The notebook also evaluates unseen stations, which is important for AeroPulse because the production system should eventually generalize beyond the exact stations used during training.

### Horizon-specific promotion

The notebook does not force every horizon into production. A horizon can be withheld when it fails the persistence gate.

That behavior should remain.

---

# 3. Critical improvements required

## Priority classification

| Area | Current | Priority |
|---|---|---|
| Data quality validation | Basic | P0 |
| Leakage prevention | Partial | P0 |
| Time-aware feature engineering | Limited | P0 |
| Baseline models | Persistence only | P0 |
| Model validation | Single temporal split | P0 |
| Spatial validation | Random station split | P0/P1 |
| Weather forecast alignment | Not explicit | P0 |
| Missing-data handling | Median imputation | P1 |
| Hyperparameter tuning | None | P1 |
| Uncertainty prediction | None | P0 |
| Calibration | None | P1 |
| Regime-specific evaluation | None | P1 |
| Transport modelling | Constant-wind approximation | P1 |
| Model registry | Joblib files | P1 |
| Production inference contract | Not defined | P0 |
| Drift monitoring | Not implemented | P1 |
| Retraining pipeline | Not implemented | P1 |
| Explainability | Not implemented | P1 |
| Deep temporal model | Not implemented | P2 |

---

# 4. Phase 1 improvements — data foundation

## 4.1 Add a formal data contract

Before training, validate:

```text
station_id/location_id
timestamp_utc
pm25
latitude
longitude
weather variables
wind_u
wind_v
boundary_layer_height
neighbour features
target_pm25_t_plus_{h}h
```

Create a machine-readable schema:

```yaml
schema_version: "2.0.0"

required:
  - location_id
  - timestamp_utc
  - pm25
  - latitude
  - longitude
  - wind_u
  - wind_v

targets:
  - 1
  - 3
  - 6
  - 12
  - 24
  - 48

frequency: "hourly"
timezone: "UTC"
```

Training must fail fast if the contract is violated.

---

## 4.2 Add data quality gates

For every station:

- duplicate timestamp detection
- timestamp ordering
- missing-hour detection
- PM2.5 negative-value detection
- extreme-value detection
- impossible weather values
- station coordinate validation
- long missing-data sequence detection
- target availability validation

Generate:

```text
data_quality_report.json
```

with:

```json
{
  "rows": 100000,
  "stations": 250,
  "missing_pm25_pct": 1.2,
  "duplicate_rows": 0,
  "timestamp_gaps": 31,
  "invalid_pm25_rows": 4,
  "quality_status": "PASS"
}
```

---

# 5. Most important issue: leakage prevention

The current notebooks explicitly exclude many event columns and perform chronological splitting, which is good.

However, the pipeline must prove that **every feature available at forecast time is genuinely known at forecast time**.

This is especially important for AeroPulse because weather and fire inputs can easily introduce hidden future leakage.

## 5.1 Introduce feature availability timestamps

Every feature should have:

```text
observation_time
available_time
forecast_time
```

For example:

```text
PM2.5 observation:
observation_time = 10:00
available_time   = 10:10

Weather forecast:
forecast_created = 09:00
valid_time        = 12:00
available_time    = 09:05
```

A feature is allowed only when:

```text
available_time <= forecast_time
```

This should become a hard training rule.

---

# 6. Weather forecast vs historical observed weather

This is one of the most important production changes.

The training pipeline must avoid training on:

```text
future observed weather
```

while production uses:

```text
weather forecast
```

Otherwise offline accuracy will be artificially high.

Use two modes:

### Historical training

Use a simulated "forecast vintage":

```text
weather_forecast(t, t+h)
```

not the final observed weather at `t+h`.

### Production

Use the latest available weather forecast for the requested location/horizon.

The feature contract should therefore distinguish:

```text
weather_observed_*
weather_forecast_*
```

and the model should primarily consume the same type of data it will receive in production.

---

# 7. Phase 1 temporal feature engineering

The current model needs richer temporal structure.

Add:

## 7.1 Cyclical time features

```text
hour_sin
hour_cos

day_of_week_sin
day_of_week_cos

day_of_year_sin
day_of_year_cos
```

Example:

```python
df["hour_sin"] = np.sin(2*np.pi*df["hour"]/24)
df["hour_cos"] = np.cos(2*np.pi*df["hour"]/24)
```

This is especially important because PM2.5 has strong diurnal and seasonal behavior.

---

# 8. Add PM2.5 rolling statistics

Current PM2.5 and lag features are useful, but rolling dynamics should be explicit.

Recommended:

```text
pm25_roll_mean_3h
pm25_roll_mean_6h
pm25_roll_mean_12h
pm25_roll_mean_24h
pm25_roll_mean_48h

pm25_roll_std_6h
pm25_roll_std_12h
pm25_roll_std_24h

pm25_min_6h
pm25_max_6h
pm25_min_24h
pm25_max_24h

pm25_slope_3h
pm25_slope_6h
pm25_slope_12h
```

Important:

**All rolling features must use only historical observations.**

Use:

```python
rolling(window).mean().shift(1)
```

where appropriate.

---

# 9. Add lag hierarchy

Instead of only a generic lag set, explicitly use:

```text
lag_1h
lag_2h
lag_3h
lag_6h
lag_12h
lag_24h
lag_48h
lag_72h
lag_168h
```

The 168-hour lag is particularly useful for weekly behavior.

---

# 10. Add station-relative features

PM2.5 behavior differs substantially by location.

Add:

```text
station_pm25_mean
station_pm25_std
station_pm25_p90
station_pm25_p95
station_baseline_by_hour
station_baseline_by_month
station_recent_anomaly
```

Use only training-period statistics when building these features to avoid leakage.

A particularly useful feature is:

```text
current_pm25 - station_expected_pm25_for_hour
```

This tells the model whether pollution is unusually high or low for that station and time.

---

# 11. Improve spatial features

The current neighbour features are useful, but the spatial representation should be expanded.

For each station:

```text
nearest_station_pm25
nearest_station_distance_km
neighbour_pm25_mean_5km
neighbour_pm25_mean_10km
neighbour_pm25_mean_25km
neighbour_pm25_std_10km
upwind_neighbour_pm25
downwind_neighbour_pm25
```

The most valuable improvement is:

## Wind-aware neighbours

Instead of treating every neighbour equally, calculate which stations are approximately upwind.

For example:

```text
wind direction
      ↓
station A ----> station B
```

If A is upwind of B, A's PM2.5 should have a larger influence on B.

Create:

```text
upwind_pm25_mean
upwind_pm25_max
upwind_distance_weighted_pm25
```

This will make the existing transport concept significantly stronger.

---

# 12. Improve advection modelling

The current implementation calculates:

```text
distance = wind_speed × horizon
```

and produces `dx/dy/distance`.

This is useful but simplified.

The major limitation is that it assumes:

```text
constant wind
straight-line transport
```

for the complete forecast horizon.

For 24–48 hours this becomes increasingly unrealistic.

## Recommended evolution

### MVP+

Use wind forecast values for each future hour:

```text
wind(t+1)
wind(t+2)
...
wind(t+h)
```

Then integrate displacement:

```text
dx_h = Σ wind_u(t+i) × Δt
dy_h = Σ wind_v(t+i) × Δt
```

Also calculate:

```text
transport_distance
transport_direction
wind_direction_change
wind_speed_mean
wind_speed_std
wind_shear_proxy
```

This is much more realistic than a single current wind vector.

---

# 13. Add atmospheric stability features

Current `ventilation_proxy` is a good starting point.

Expand it with:

```text
boundary_layer_height
boundary_layer_height_change
wind_speed
wind_speed_change
ventilation_index
stagnation_duration
temperature_gradient_proxy
relative_humidity
pressure
```

Create:

```text
stagnation_3h
stagnation_6h
stagnation_12h
```

rather than only a single instantaneous flag.

---

# 14. Fire and emission features

For AeroPulse, wildfire/agricultural/fire activity can be a major propagation driver.

If fire data is available, create:

```text
fire_count_10km
fire_count_25km
fire_count_50km
fire_radiative_power_10km
fire_radiative_power_25km
fire_radiative_power_50km
upwind_fire_count
upwind_fire_radiative_power
fire_distance
```

Most importantly:

```text
wind-aligned fire influence
```

rather than only geographic distance.

---

# 15. Add pollution regime classification

Create a regime label such as:

```text
NORMAL
ELEVATED
HIGH
EXTREME
RISING
FALLING
STAGNANT
TRANSPORT_DOMINATED
```

The model can either:

1. use the regime as a feature, or
2. use different models for different regimes.

A practical first implementation is to use it as a feature and evaluate performance by regime.

---

# 16. Phase 3 — improve the baseline strategy

Persistence should remain.

But it should not be the only baseline.

Add:

## Baseline A — Persistence

```text
PM(t+h) = PM(t)
```

## Baseline B — Seasonal persistence

```text
PM(t+h) = PM(t+h-24h)
```

## Baseline C — Weekly seasonal persistence

```text
PM(t+h) = PM(t+h-168h)
```

## Baseline D — Recent rolling mean

```text
PM(t+h) = mean(PM[t-6:t])
```

## Baseline E — Seasonal + persistence ensemble

For example:

```text
0.5 × persistence
+
0.3 × 24h seasonal
+
0.2 × 168h seasonal
```

The production model should only be promoted if it beats the strongest relevant baseline.

---

# 17. Improve model architecture

The current per-horizon LightGBM/HGB residual model is appropriate for the first production candidate.

Do not immediately replace it with a deep model.

Use a staged approach.

## Model tier 1 — Production MVP

```text
Persistence baseline
        +
LightGBM residual model
```

## Model tier 2 — Stronger tree model

Compare:

```text
LightGBM
XGBoost
CatBoost
HistGradientBoosting
```

Use the same feature and evaluation contract.

## Model tier 3 — Temporal deep learning

Only after establishing strong baselines evaluate:

```text
Temporal Fusion Transformer
TFT
TCN
LSTM/GRU
N-BEATS / N-HiTS
```

The deep model should only be promoted if it provides statistically meaningful improvement and acceptable inference cost/latency.

---

# 18. Consider a multi-task model

The current implementation trains:

```text
one model per horizon
```

This is simple and interpretable.

An alternative should be evaluated:

```text
single model
      │
      ├── 1h
      ├── 3h
      ├── 6h
      ├── 12h
      ├── 24h
      └── 48h
```

The advantage is that the model can learn common pollution dynamics across horizons.

However, keep the current per-horizon architecture as the fallback because it is easier to validate and deploy.

---

# 19. Add model ensembles

A strong AeroPulse production design should allow:

```text
Final forecast =
w1 × persistence
+
w2 × hybrid residual
+
w3 × seasonal model
+
w4 × advanced model
```

The weights should be learned from validation data.

Do not assume that the ML model should always receive weight 1.0.

If persistence is better for a particular horizon/regime, the ensemble should be able to fall back toward persistence.

---

# 20. Prediction clipping and physical constraints

The current residual model can potentially generate physically implausible forecasts.

At minimum:

```text
PM2.5 >= 0
```

should be enforced.

Do not blindly use arbitrary maximum clipping.

Instead, use a configurable physical/data-derived upper bound and log every constrained prediction.

For example:

```text
raw_prediction
constrained_prediction
constraint_applied
```

should be included in the inference output.

---

# 21. Add uncertainty prediction

This is a major production requirement.

AeroPulse should not return only:

```json
{
  "pm25": 142.5
}
```

It should return something like:

```json
{
  "forecast_pm25": 142.5,
  "lower_bound": 118.2,
  "upper_bound": 171.8,
  "confidence": 0.82
}
```

Recommended initial approach:

## Quantile LightGBM

Train:

```text
P10
P50
P90
```

or:

```text
P05
P50
P95
```

Then output prediction intervals.

This is considerably more useful operationally than a single deterministic number.

---

# 22. Calibrate uncertainty

Raw prediction intervals should be evaluated.

Measure:

```text
coverage_80
coverage_90
coverage_95
interval_width
```

Example:

If the model claims a 90% interval, approximately 90% of observations should fall inside that interval.

If not, calibrate the intervals.

A good production output is:

```text
forecast
P10
P50
P90
uncertainty_score
```

---

# 23. Improve validation strategy

The current single chronological split is good but insufficient for final model promotion.

Implement rolling-origin validation:

```text
Fold 1:
Train → Validate

Fold 2:
Train --------> Validate

Fold 3:
Train ----------------> Validate

Fold 4:
Train ------------------------> Validate
```

For each horizon calculate:

```text
MAE
RMSE
R2
MAPE / sMAPE where meaningful
MAE skill vs persistence
MAE skill vs seasonal persistence
P90/P95 error
```

Then report:

```text
mean
median
std
worst fold
```

---

# 24. Improve spatial validation

The current station split is random.

That is better than no spatial test, but it does not represent geographic generalization very well.

Add:

## Geographic block holdout

Cluster stations geographically:

```text
North
South
East
West
Central
```

or use geographic clustering.

Train on some regions and test on completely unseen regions.

This gives a better estimate of AeroPulse's ability to expand to new cities/states.

---

# 25. Evaluate performance by station

Do not only report aggregate MAE.

Create:

```text
station_metrics.csv
```

with:

```text
location_id
horizon
mae
rmse
bias
skill_vs_persistence
n_samples
```

This will identify stations where the model consistently fails.

---

# 26. Evaluate performance by pollution regime

Create metrics for:

```text
PM2.5 < 30
30–60
60–120
120–250
>250
```

and also:

```text
normal
rising
falling
stagnant
fire-influenced
transport-dominated
```

This is important because an overall MAE can hide poor performance during extreme pollution events.

---

# 27. Evaluate extreme-event recall

AeroPulse should be useful for alerts, not only average numerical prediction.

Add:

```text
high_pollution_event_precision
high_pollution_event_recall
high_pollution_event_f1
false_alarm_rate
miss_rate
```

For example:

```text
Will PM2.5 exceed 150 µg/m³ in the next 6h?
```

This converts the forecasting system into something operationally useful.

---

# 28. Add bias analysis

For every horizon calculate:

```text
mean_error = mean(predicted - actual)
```

and analyze:

```text
underprediction
overprediction
```

especially for high pollution episodes.

If the model systematically underpredicts extreme events, it should not be promoted even if aggregate MAE looks good.

---

# 29. Add hyperparameter tuning

The current model uses fixed parameters:

```text
n_estimators=400
learning_rate=0.05
num_leaves=63
```

This is fine for an MVP, but production training should tune them.

Use Optuna or an equivalent controlled search.

Search:

```text
learning_rate
num_leaves
max_depth
min_child_samples
subsample
colsample_bytree
reg_alpha
reg_lambda
```

Optimize on rolling validation, not test data.

The test set must remain untouched until final evaluation.

---

# 30. Avoid fitting the production bundle on data that includes the final test period

The current notebook evaluates a test set and then fits the final production bundle on the complete dataset.

This is acceptable only when the final test result is treated as a historical certification result and the next production model version is clearly identified.

For stronger MLOps:

```text
Train
  ↓
Validation
  ↓
Model selection
  ↓
Frozen certification test
  ↓
Promotion decision
  ↓
Retrain on eligible production history
  ↓
Register new model version
```

Store the certification metrics before retraining.

---

# 31. Feature importance and explainability

Every promoted model should produce:

```text
feature_importance.csv
```

and ideally SHAP summaries.

At inference time, provide a compact explanation:

```text
Main drivers:
1. Current PM2.5
2. Upwind neighbour PM2.5
3. Wind transport
4. Boundary layer height
5. Recent PM2.5 trend
```

This is particularly useful for the AeroPulse UI.

---

# 32. Production model artifact design

Do not save only:

```text
propagation_forecast_6h.joblib
```

The bundle should contain:

```json
{
  "model_version": "propagation-2026.09.01",
  "model_type": "lightgbm_residual",
  "horizon_hours": 6,
  "feature_schema_version": "2.0.0",
  "features": [],
  "baseline": "persistence",
  "training_dataset_fingerprint": "...",
  "training_start": "...",
  "training_end": "...",
  "metrics": {},
  "spatial_metrics": {},
  "uncertainty": {},
  "created_at": "...",
  "git_commit": "...",
  "promoted": true
}
```

The model artifact must be immutable.

---

# 33. Recommended model registry

For the AeroPulse tool, introduce a lightweight model registry.

It can initially be filesystem/object-storage based.

Example:

```text
models/
  propagation/
    1h/
      v1/
      v2/
    3h/
      v1/
    6h/
      v1/
    12h/
      v1/
```

Each version should contain:

```text
model.joblib
metadata.json
metrics.json
feature_schema.json
```

Later this can move to MLflow or another model registry.

---

# 34. Production inference contract

Create one inference API independent of the training notebook.

Example:

```http
POST /api/v1/propagation/forecast
```

Request:

```json
{
  "location_id": "station_123",
  "forecast_time": "2026-09-10T10:00:00Z",
  "horizons": [1, 3, 6, 12, 24]
}
```

Response:

```json
{
  "location_id": "station_123",
  "forecast_time": "2026-09-10T10:00:00Z",
  "forecasts": [
    {
      "horizon_hours": 1,
      "pm25": 121.4,
      "p10": 108.2,
      "p50": 121.4,
      "p90": 137.9,
      "model_version": "propagation-2026.09.10",
      "confidence": 0.87
    }
  ]
}
```

---

# 35. Production fallback strategy

AeroPulse must never fail because a single feature/model is unavailable.

Recommended:

```text
Primary:
Hybrid ML

       ↓ failure / low confidence

Secondary:
Seasonal + persistence ensemble

       ↓ failure

Final:
Persistence
```

The API should return:

```text
forecast_source
model_version
fallback_used
```

Example:

```json
{
  "forecast_source": "persistence_fallback",
  "fallback_used": true
}
```

---

# 36. Confidence-aware model routing

Introduce a model decision layer:

```text
                    Forecast request
                          │
                          ▼
                  Data quality check
                          │
             ┌────────────┴────────────┐
             │                         │
          GOOD                       POOR
             │                         │
             ▼                         ▼
        ML forecast              Persistence
             │
             ▼
       confidence check
             │
      ┌──────┴──────┐
      │             │
    HIGH          LOW
      │             │
      ▼             ▼
    ML              Ensemble
```

This is better than always trusting the ML model.

---

# 37. Add model drift monitoring

Once deployed, track:

## Data drift

```text
PM2.5 distribution
wind distribution
temperature
humidity
boundary layer
fire indicators
```

## Prediction drift

```text
forecast distribution
uncertainty distribution
```

## Performance drift

When actual observations arrive:

```text
MAE
RMSE
bias
skill
coverage
```

by:

```text
horizon
station
region
pollution regime
```

---

# 38. Retraining strategy

Recommended initial policy:

```text
Scheduled:
weekly evaluation

Retraining:
weekly or bi-weekly

Emergency retraining:
when drift/performance threshold is exceeded
```

Do not automatically promote every newly trained model.

Use:

```text
candidate
→ validation
→ certification
→ shadow
→ production
```

---

# 39. Shadow deployment

Before replacing a production model:

```text
Production model ──→ user response

Candidate model ──→ shadow prediction
```

Compare:

```text
candidate vs production
candidate vs actual
production vs actual
```

Promote only if the candidate consistently improves the defined metrics.

---

# 40. Model promotion gates

The current rule:

```text
skill > 0
```

is a good MVP rule but is too weak for production.

Recommended gate:

```text
1. Beats persistence
2. Beats seasonal baseline
3. No significant degradation on any critical region
4. Positive skill across multiple validation folds
5. Acceptable extreme-event recall
6. Acceptable uncertainty coverage
7. No major station-level regression
8. Latency within SLA
9. Model artifact reproducible
```

Example:

```yaml
promotion:
  min_skill_vs_persistence: 0.05
  min_validation_folds_positive: 4
  max_station_regression_pct: 10
  min_p90_coverage: 0.85
  max_inference_latency_ms: 200
```

These thresholds should be configurable and empirically tuned.

---

# 41. Recommended new notebook structure

Instead of continuing to expand the existing three notebooks indefinitely, split responsibilities.

## Notebook 01 — Data Contract & Quality

```text
01_propagation_data_quality.ipynb
```

Responsibilities:

- input validation
- timestamp normalization
- missing data
- anomaly detection
- data quality report
- dataset fingerprint

## Notebook 02 — Temporal & Spatial Features

```text
02_propagation_temporal_spatial_features.ipynb
```

Responsibilities:

- lags
- rolling statistics
- seasonality
- station baselines
- spatial neighbours
- wind-aware neighbours

## Notebook 03 — Transport Features

```text
03_propagation_transport_features.ipynb
```

Responsibilities:

- wind vector
- integrated advection
- ventilation
- stagnation
- upwind influence

## Notebook 04 — Baseline Models

```text
04_propagation_baselines.ipynb
```

Responsibilities:

- persistence
- seasonal persistence
- rolling mean
- baseline ensemble

## Notebook 05 — Hybrid Models

```text
05_propagation_hybrid_models.ipynb
```

Responsibilities:

- LightGBM residual
- XGBoost/CatBoost comparison
- per-horizon training
- hyperparameter optimization

## Notebook 06 — Probabilistic Forecasting

```text
06_propagation_uncertainty.ipynb
```

Responsibilities:

- quantile models
- prediction intervals
- calibration
- coverage

## Notebook 07 — Model Evaluation

```text
07_propagation_model_evaluation.ipynb
```

Responsibilities:

- rolling validation
- spatial validation
- station metrics
- regime metrics
- extreme-event metrics
- promotion decision

## Notebook 08 — Model Packaging

```text
08_propagation_model_packaging.ipynb
```

Responsibilities:

- model bundle
- feature schema
- metadata
- metrics
- model registry
- production artifact

---

# 42. Recommended reusable Python package

Do not keep production logic only inside notebooks.

Create:

```text
aeropulse_ml/
├── data/
│   ├── validation.py
│   ├── alignment.py
│   └── quality.py
├── features/
│   ├── temporal.py
│   ├── spatial.py
│   ├── transport.py
│   ├── weather.py
│   └── fire.py
├── baselines/
│   ├── persistence.py
│   └── seasonal.py
├── models/
│   ├── residual.py
│   ├── quantile.py
│   └── ensemble.py
├── evaluation/
│   ├── temporal.py
│   ├── spatial.py
│   ├── regimes.py
│   └── metrics.py
├── registry/
│   └── model_registry.py
├── inference/
│   └── predictor.py
└── schemas/
    └── propagation.py
```

The notebooks should become orchestration and experimentation layers over this package.

---

# 43. Recommended configuration

Move hard-coded settings to YAML.

Example:

```yaml
propagation:
  horizons: [1, 3, 6, 12, 24, 48]

validation:
  train_fraction: 0.70
  validation_fraction: 0.15
  test_fraction: 0.15
  purge_by_horizon: true

models:
  primary: lightgbm
  candidates:
    - lightgbm
    - xgboost
    - catboost

uncertainty:
  enabled: true
  quantiles: [0.1, 0.5, 0.9]

promotion:
  require_positive_skill: true
  compare_seasonal_baseline: true
  require_spatial_validation: true
```

---

# 44. Recommended end-to-end training flow

```text
Raw data
   │
   ▼
Data quality
   │
   ├── FAIL → reject dataset
   │
   ▼
Time alignment
   │
   ▼
Leakage validation
   │
   ▼
Feature generation
   │
   ▼
Feature availability validation
   │
   ▼
Train / validation / test
   │
   ├──────────────┬──────────────┐
   ▼              ▼              ▼
Persistence   Seasonal       ML models
   │              │              │
   └──────────────┴──────────────┘
                  │
                  ▼
          Rolling validation
                  │
                  ▼
          Spatial validation
                  │
                  ▼
        Regime/event validation
                  │
                  ▼
         Uncertainty calibration
                  │
                  ▼
          Promotion evaluation
                  │
            ┌─────┴─────┐
            │           │
          PASS         FAIL
            │           │
            ▼           ▼
       Register       Withhold
            │
            ▼
       Shadow deploy
            │
            ▼
       Production
```

---

# 45. AeroPulse-specific inference architecture

The ML model should not be called directly from the UI.

Recommended:

```text
AeroPulse UI
     │
     ▼
Forecast API
     │
     ▼
Propagation Inference Service
     │
     ├── Feature Store / latest observations
     ├── Weather forecast
     ├── Fire/emission data
     ├── Station neighbour data
     │
     ▼
Feature Builder
     │
     ▼
Model Router
     │
     ├── 1h model
     ├── 3h model
     ├── 6h model
     ├── 12h model
     ├── 24h model
     └── 48h model
     │
     ▼
Prediction + uncertainty
     │
     ▼
Quality / constraint checks
     │
     ▼
AeroPulse response
```

---

# 46. Forecast output should include provenance

Every prediction should be explainable.

Recommended response:

```json
{
  "station_id": "DELHI_001",
  "forecast_time": "2026-09-10T10:00:00Z",
  "horizon_hours": 6,
  "pm25": 156.2,
  "p10": 129.4,
  "p50": 156.2,
  "p90": 191.7,
  "model_version": "propagation-2026.09.10-v3",
  "forecast_source": "hybrid_lightgbm",
  "confidence": 0.84,
  "drivers": [
    "high_current_pm25",
    "persistent_upwind_pm25",
    "low_boundary_layer",
    "weak_ventilation"
  ],
  "fallback_used": false
}
```

---

# 47. Testing requirements

Add automated tests for:

## Data

```text
test_timestamp_alignment
test_duplicate_detection
test_missing_hours
test_invalid_pm25
```

## Features

```text
test_no_future_feature_leakage
test_rolling_features_use_past_only
test_advection_calculation
test_spatial_neighbour_calculation
```

## Model

```text
test_prediction_non_negative
test_feature_schema
test_model_artifact_loading
test_missing_feature_behavior
```

## Inference

```text
test_forecast_api
test_unknown_station
test_missing_weather
test_model_fallback
test_horizon_validation
```

---

# 48. Performance and latency requirements

Production inference should be lightweight.

For the initial LightGBM architecture:

```text
feature preparation: target < 50 ms
model inference:     target < 20 ms/model
API overhead:        target < 100 ms
```

The exact SLA should be benchmarked rather than assumed.

Precompute whenever possible:

```text
station metadata
neighbour topology
static geographic features
station baselines
```

Do not calculate expensive geographic relationships for every API request.

---

# 49. What NOT to do yet

Avoid immediately jumping to:

```text
ConvLSTM
large Transformer
GNN
diffusion model
complex physics simulator
```

before fixing:

```text
data leakage
weather forecast alignment
spatial validation
strong baselines
uncertainty
regime evaluation
production feature parity
```

A well-designed LightGBM hybrid model with correct features can be substantially more valuable than a deep model trained on a leaky dataset.

---

# 50. Implementation roadmap

## Phase A — P0: Production correctness

Implement first:

1. Data contract
2. Data quality gates
3. Feature availability timestamps
4. Future leakage detector
5. Weather forecast-vintage handling
6. Temporal features
7. Rolling PM2.5 features
8. Strong seasonal baselines
9. Rolling-origin validation
10. Production inference contract

## Phase B — P1: Forecast quality

Then implement:

1. Wind-aware neighbours
2. Integrated multi-hour advection
3. Fire/emission features
4. Pollution regimes
5. Hyperparameter optimization
6. Quantile prediction
7. Uncertainty calibration
8. Station/regional evaluation
9. Extreme-event evaluation
10. Model registry

## Phase C — P1/P2: MLOps

Implement:

1. Candidate model training
2. Model certification
3. Shadow deployment
4. Drift monitoring
5. Automated retraining
6. Promotion gates
7. Model rollback

## Phase D — P2: Advanced modelling

Only after the above:

1. Multi-task horizon model
2. TFT/TCN/N-BEATS comparison
3. Graph/spatial model
4. Learned transport representation
5. Ensemble optimization

---

# 51. Recommended final model strategy

For AeroPulse, I recommend this production architecture initially:

```text
                   Current PM2.5
                         │
                         ▼
                Persistence baseline
                         │
                         ├──────────────┐
                         │              │
                         ▼              ▼
                 Seasonal baseline   Transport model
                                        │
                                        ▼
                                  Feature builder
                                        │
                                        ▼
                                LightGBM residual
                                        │
                                        ▼
                              Quantile predictions
                                        │
                                        ▼
                              Ensemble / router
                                        │
                                        ▼
                              Constraint checking
                                        │
                                        ▼
                        Forecast + P10/P50/P90
```

For each horizon:

```text
1h  → model
3h  → model
6h  → model
12h → model
24h → model only if it beats baselines
48h → model only if it beats baselines
```

This preserves the strongest design principle already present in the notebooks:

> **Do not ship a horizon merely because a model exists. Ship it only when it demonstrates reliable skill against appropriate baselines.**

---

# 52. Specific changes to the existing three notebooks

## Notebook 01

Keep:

- dataset import
- target validation
- fingerprint
- manifest

Add:

- data-quality report
- schema validation
- duplicate detection
- hourly continuity checks
- coordinate validation
- station-level coverage report
- feature availability metadata
- dataset version

## Notebook 02

Keep:

- advection displacement
- ventilation
- stagnation
- neighbour features

Add:

- temporal features
- rolling statistics
- station baselines
- wind-aware neighbours
- multi-scale spatial features
- integrated forecast-wind advection
- fire influence
- pollution regime
- strict past-only feature tests

## Notebook 03

Keep:

- residual learning
- persistence
- per-horizon models
- chronological purge
- spatial holdout
- promotion/withholding

Change:

- add seasonal baselines
- rolling-origin validation
- geographic holdout
- hyperparameter tuning
- regime metrics
- extreme-event metrics
- bias metrics
- uncertainty/quantiles
- calibration
- model registry
- certification report
- production model packaging

---

# 53. Definition of Done

The AeroPulse propagation model should be considered production-ready only when all of the following are true:

```text
[ ] Dataset contract implemented
[ ] Data quality gates implemented
[ ] No future leakage verified automatically
[ ] Production/historical feature parity verified
[ ] Temporal features implemented
[ ] Rolling PM2.5 features implemented
[ ] Wind-aware spatial features implemented
[ ] Improved transport features implemented
[ ] Persistence baseline implemented
[ ] Seasonal baselines implemented
[ ] Rolling-origin validation implemented
[ ] Geographic holdout implemented
[ ] Station-level metrics implemented
[ ] Regime-level metrics implemented
[ ] Extreme-event metrics implemented
[ ] Quantile prediction implemented
[ ] Prediction interval calibration implemented
[ ] Model versioning implemented
[ ] Model registry implemented
[ ] Production inference contract implemented
[ ] Fallback strategy implemented
[ ] Model promotion gates implemented
[ ] Shadow deployment implemented
[ ] Drift monitoring implemented
[ ] Retraining workflow implemented
[ ] Automated tests implemented
[ ] Latency benchmark completed
```

---

# 54. Final architectural recommendation

The existing notebooks should **not be discarded**.

They provide a good propagation MVP and a sensible hybrid foundation. The right approach is to evolve them into a proper ML pipeline rather than replacing them wholesale.

The highest-value improvements are, in order:

1. **Eliminate and continuously test for temporal/data leakage.**
2. **Make training use the same forecast information that production will have.**
3. **Add temporal, station, spatial and wind-aware features.**
4. **Strengthen baselines beyond persistence.**
5. **Use rolling-origin and geographic validation.**
6. **Evaluate extreme pollution events separately.**
7. **Add probabilistic forecasts and calibrated uncertainty.**
8. **Package models with a strict feature/model schema.**
9. **Create a dedicated AeroPulse inference service.**
10. **Add model registry, monitoring, shadow deployment and controlled promotion.**

Only after these are implemented should AeroPulse invest heavily in Transformer/TFT/GNN-style models.

This will produce a system that is not only more accurate, but also **trustworthy, reproducible, explainable, operationally safe, and directly deployable inside AeroPulse**.
