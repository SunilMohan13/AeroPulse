# AeroPulse propagation forecast — pipeline

Eight notebooks plus one shared module. Each notebook writes a Parquet table
or an artifact directory that the next one reads, so any stage can be re-run
without re-running the ones before it.

```
pm25_estimator/data/pm25/processed/event_aware/pm25_event_aware_features.parquet
        │
        ▼
01 data quality      ── data/propagation/processed/base/station_pm25_series.parquet
   contract, gates,     + data_quality_report.json, station_coverage.csv
   fingerprint
        │
        ▼
02 temporal/spatial  ── data/propagation/processed/features/temporal_features.parquet
   station climatology  + station_baselines.joblib
        │
        ▼
03 transport         ── data/propagation/processed/features/propagation_features.parquet
   integrated advection + wind_climatology.joblib
        │
        ├──────────────┐
        ▼              ▼
04 baselines      05 hybrid models ── artifacts/propagation/hybrid/
   artifacts/…/      family comparison, tuning, ablation,
   baselines/        residual_models.joblib
        │              │
        │              ▼
        │        06 uncertainty ── artifacts/propagation/uncertainty/
        │           quantile_bundles.joblib, calibration
        │              │
        └──────────────┴──► 07 evaluation ── artifacts/propagation/evaluation/
                               rolling-origin, geo blocks, station/regime/event
                               metrics, certification_report.json
                                   │
                                   ▼
                            08 packaging ── artifacts/propagation/registry/{h}h/v{n}/
                               model.joblib, metadata.json, metrics.json,
                               feature_schema.json  + deployment_manifest.json
```

## Running

```bash
uv pip install --python ../../.venv/bin/python -r ../requirements.txt
```

Launch Jupyter **from this folder** (so `AEROPULSE_PROJECT_ROOT=.` resolves
here), or set `AEROPULSE_PROJECT_ROOT` to this folder's path. Run 01 through
08 in order.

Notebooks 01-04 take seconds to a minute. 05-07 train models and are the
long ones; `PROP_MAX_TRAIN_ROWS` in `.env` is the compute dial.

The shared module has its own test suite:

```bash
../../.venv/bin/python propagation_toolkit.py
```

That runs every test the improvement plan's section 47 asks for — data
contract, duplicate and gap detection, past-only feature verification,
advection geometry, leakage detection with a positive control, quantile
monotonicity, physical constraints, registry immutability, and the inference
fallback chain.

The response to the improvement plan — what the plan got right, the four places
it was wrong, every measured result, and the six defects found by implementing it —
is in `AeroPulse_Propagation_Design_Review_Response.md`.

## Notebook responsibilities

| # | Notebook | Plan sections | Produces |
|---|---|---|---|
| 01 | `data_quality` | 4, 5, 52 | validated base table, quality report, availability metadata |
| 02 | `temporal_spatial_features` | 7-11, 47 | station climatology, upstream audit, past-only proofs |
| 03 | `transport_features` | 6, 12, 13, 15 | integrated advection, stagnation persistence, regimes |
| 04 | `baselines` | 16 | five-baseline ladder, the per-horizon bar |
| 05 | `hybrid_models` | 17, 18, 29 | family comparison, tuning, ablation, per-horizon models |
| 06 | `uncertainty` | 21, 22 | P10/P50/P90, conformal calibration, coverage |
| 07 | `model_evaluation` | 23-28, 30, 40 | rolling-origin, geo blocks, station/regime/event metrics, promotion |
| 08 | `model_packaging` | 32-37, 46-48 | registry, inference contract, fallback tests, drift baselines |

## Design decisions worth knowing before you change anything

**Wind is km/h.** Open-Meteo is queried without `wind_speed_unit`, so its
default applies. The previous implementation treated it as m/s and inflated
every advection distance by 3.6x. `pt.WIND_KMH_TO_KM_PER_H` and the contract's
`units` block exist to stop that recurring.

**Lags and rolling windows are time-aligned, not positional.** With 56k gaps
in the source data, `shift(24)` and "the value 24 hours ago" disagree on 44%
of rows. Anything that needs a lagged value must go through
`pt.time_lag` / `pt.rolling_past`, both of which are gap-aware.

**The promotion bar is the strongest baseline, not persistence.** Notebook 04
shows a weighted average of three lagged observations beats persistence by
16% at 12 h. Promoting on "beats persistence" would ship models that lose to
arithmetic.

**Forecast-vintage wind is simulated, not real.** There is no archived NWP
forecast to replay, so notebook 03 decays the observed wind toward
climatology with a fitted `tau`. Production must substitute genuine forecast
wind at the same slot. This is the largest remaining gap between the offline
pipeline and production.

**Station and wind climatologies are fitted on the training window only,**
with the cutoff stored in the artifact so production reproduces it. Fitting
on the whole dataset would leak test-period levels into a training feature.

**The registry is immutable.** Re-registering a version raises. A retrain
creates `v2`; it never edits `v1`.

## Known gaps

- Simulated rather than archived forecast weather (above).
- Station-level, not a gridded advected field. CAMS correction and ConvLSTM
  remain out of scope, per plan section 49.
- Shadow deployment and live drift monitoring are specified and seeded with
  reference distributions in notebook 08, but there is no running comparison
  loop yet.
- The serving layer in `libs/ml` still expects the previous bundle format and
  is not updated by these notebooks.
