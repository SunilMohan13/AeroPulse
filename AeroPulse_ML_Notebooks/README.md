# AeroPulse ML Notebooks

Four implementation notebooks aligned to the AeroPulse LLD:

1. `01_pm25_estimator.ipynb` — Hyper-local PM2.5 estimator
2. `02_anomaly_detector.ipynb` — Pollution anomaly detector
3. `03_source_likelihood.ipynb` — Source likelihood classifier
4. `04_propagation_forecast.ipynb` — Pollution propagation forecast

## Data integration

The notebooks use:
- OpenAQ v3 for public ground observations.
- Open-Meteo as a runnable public weather/ERA5-accessible adapter.
- NASA FIRMS for active-fire evidence when `FIRMS_MAP_KEY` is configured.

The AeroPulse production design identifies CPCB as the preferred ground truth and IMD as the operational weather source. Replace the adapters without changing the feature contracts.

OpenAQ v3 requires `X-API-Key`.
NASA FIRMS requires a free `MAP_KEY`.

## Environment

```bash
export OPENAQ_API_KEY="..."
export FIRMS_MAP_KEY="..."
export TRAIN_DAYS="60"
export MAX_STATIONS="30"
export AEROPULSE_MIN_LAT="28.0"
export AEROPULSE_MAX_LAT="32.8"
export AEROPULSE_MIN_LON="74.0"
export AEROPULSE_MAX_LON="78.5"
```

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
jupyter lab
```

Then execute notebooks in order.

## Production integration

The notebooks deliberately keep acquisition, feature engineering, model training and inference separate.

Production path:

External connectors
-> raw immutable data
-> quality/provenance
-> canonical 1-km grid
-> versioned feature table
-> ML training / inference
-> materialized predictions
-> event/graph layer
-> API/UI

Do not make the UI synchronously call external data providers.

## Validation gates

PM2.5:
- MAE, RMSE, R2
- temporal holdout
- spatial holdout
- seasonal holdout
- prediction interval/calibration

Anomaly:
- precision, recall, F1
- false-alert rate
- reviewed event catalogue
- independent corroboration

Source likelihood:
- per-class precision/recall
- macro-F1
- confusion matrix
- log loss/Brier
- calibration
- expert-reviewed source labels

Propagation:
- MAE/RMSE
- spatial overlap
- arrival-time error
- forecast skill against persistence/hybrid baseline
- spatial + temporal + seasonal holdouts

## Important scientific constraints

- AOD is not surface PM2.5.
- Source attribution is probabilistic likelihood, not causal proof.
- Weak labels in the source notebook are pipeline labels only and must not be presented as scientific ground truth.
- Random train/test splits are intentionally avoided because nearby locations and adjacent times are correlated.
- Live inference must use the exact same feature definitions/version as training.
