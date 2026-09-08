# AeroPulse India — End-to-End Demo

**Date:** 2026-09-08

Two demo paths. Path A needs no network and no credential and exercises the full pipeline including the quality gate. Path B fetches live data and produces a serving champion.

Read §5 before demoing: **Path A deliberately ends with no model serving**, and that is the correct outcome, not a failure.

---

## 0. Prerequisites

```bash
cd /path/to/AeroPulse
uv sync          # installs the workspace including libs/ml
```

Python 3.12 and `uv`. Docker only for §4.

Verify the toolchain:

```bash
uv run ruff check .
uv run pyright
uv run pytest tests -q
```

Expected: `All checks passed!`, `0 errors`, `179 passed`.

---

## 1. Path A — fully offline (no network, no credential)

Every step runs from the committed fixture, which holds **verbatim Open-Meteo payloads** so the parsing path is identical to live.

```bash
# 1. Ingest fixture -> canonical contracts -> H3 grid -> events -> forecast -> graph
uv run aeropulse-connector

# 2. Train the PM2.5 estimator on the fixture window and attempt promotion
uv run aeropulse-ml train --model pm25_estimator --promote

# 3. Inspect the registry
uv run aeropulse-ml models

# 4. Attempt prediction with whatever is promoted
uv run aeropulse-ml predict

# 5. Serve the API
uv run aeropulse-api      # http://127.0.0.1:8000/docs
```

Measured output of step 2 on this fixture:

```text
dataset: rows=144 cells=2 window=2026-09-06 00:00 -> 2026-09-08 23:00
         observations(aq=864, weather=144, raster=144) in 0.06s
stage:   VALIDATION
PROMOTION GATE FAILED - not serving:
  - temporal skill vs persistence is -2.6697 (must exceed 0)
  - temporal R2 is -0.4376 (must exceed 0)
```

Step 4 then reports, correctly:

```json
{"pm25_estimate": {"available": false, "reason": "no PRODUCTION model registered"}}
```

**This is the demo working.** Three days of data across two cells is not enough to beat persistence; the model overfits, the gate measures that, and the model is refused. The graceful-degradation path of LLD §40 then engages instead of serving a bad prediction. Contrast with §2, where the identical code on a 90-day window scores **+0.435** skill and is promoted.

---

## 2. Path B — live data (still no credential)

Open-Meteo is anonymous. This is the only source in the integration matrix that can be exercised without a credential, which is why it carries the live path.

```bash
export AEROPULSE_CONNECTOR_MODE=live

# Train all four models on 90 days of real corridor data and attempt promotion
uv run aeropulse-ml train --model all --live --days 90 --promote --save-dataset

# Registry state
uv run aeropulse-ml models

# Live prediction through the champion models
uv run aeropulse-ml predict --live --days 3
```

Measured, 2026-09-08:

```text
dataset: rows=10920 cells=5 window=2026-06-10 00:00 -> 2026-09-08 23:00
         observations(aq=65520, weather=10920, raster=10920) in 21.27s

pm25_estimator        -> PRODUCTION   (temporal MAE 3.90, R2 0.975, skill +0.435)
anomaly_detector      -> VALIDATION   gate: detection F1 0.086, recall 0.046
source_likelihood     -> VALIDATION   gate: class 'traffic' never predicted correctly
propagation_forecast  -> VALIDATION   gate: 24h skill -0.1192
```

`uv run aeropulse-ml models`:

```text
stage       model_name              version                     commit
VALIDATION  propagation_forecast    hgb-forecast-202609081642   532fa5e
VALIDATION  source_likelihood       hgb-source-202609081642     532fa5e
VALIDATION  anomaly_detector        hgb-anomaly-202609081642    532fa5e
PRODUCTION  pm25_estimator          hgb-pm25-202609081642       532fa5e
```

Live prediction, measured:

```json
{
  "ml_feature_version": "ml-features-1.0.0",
  "cells": [{
    "grid_id": "8842492739fffff",
    "timestamp": "2026-09-08T23:00:00+00:00",
    "observed_pm25": 112.0,
    "pm25_estimate": {
      "available": true,
      "pm25_estimate": 117.614,
      "prediction_interval_low": 103.742,
      "prediction_interval_high": 131.485,
      "model_version": "hgb-pm25-202609081635",
      "feature_version": "grid-features-0.4.0"
    }
  }],
  "degraded_models": {
    "anomaly_detector": "no PRODUCTION model registered",
    "source_likelihood": "no PRODUCTION model registered",
    "propagation_forecast": "no PRODUCTION model registered"
  },
  "timings_seconds": {"ingest_and_features": 8.2587, "inference": 0.0556}
}
```

Three models declining to serve, with the reason stated, is the intended behaviour.

---

## 3. Measured latency

All figures from the runs above on an M-series laptop. Nothing extrapolated.

| Stage | Measurement |
|---|---|
| Live fetch, 5 sites × 90 days (10 HTTPS requests, rate-limited) | ~21 s total wall clock |
| Feature materialisation | 13,489 grid-hours/s |
| 90-day dataset (fetch + features, 87,360 observations) | 21.27 s |
| Training, PM2.5 estimator (3 holdouts + final fit, 10,920 rows) | 12.9 s |
| Training, all four models | ~85 s |
| Live 3-day fetch + features (inference path) | 8.26 s |
| **ML inference, 5 cells, champion loading included** | **0.056 s** |
| Fixture ingest + features (offline) | 0.06 s |
| Test suite (179 tests) | 5.3 s |

**NOT VERIFIED:** API p95 under load against a populated database (LLD §43 targets < 500 ms). The existing load test exercises `/health` only, and the API is not database-backed — see §5.

---

## 4. Docker Compose stack

```bash
docker compose -f infrastructure/docker/compose.yaml up --build
```

| Service | URL |
|---|---|
| API | http://127.0.0.1:8000/docs |
| Web | http://127.0.0.1:5173 |
| MinIO console | http://127.0.0.1:9001 |

Optional connector workers: `--profile connectors`.

**Read §5 first.** Under Compose the API serves an empty event list regardless of what the worker does.

---

## 5. What the demo does not show

Stated plainly so that nothing here is oversold.

1. **The API is not database-backed.** The worker writes to TimescaleDB; the API imports no database client and reads a process-local Python dict. They are separate containers, so `GET /api/v1/events` returns `[]` permanently under Compose. The ML demo above therefore runs through the CLI, not the HTTP API.
2. **The frontend does not call the API.** All 8 frontend services return static mock imports; `VITE_API_BASE` is set in compose and never read. The UI is a design demo.
3. **Features and predictions are not persisted.** The `grid_feature` and `grid_prediction` hypertables exist and are never written to, so there is no queryable feature store yet.
4. **Three of four models do not serve.** By design — they failed their gates. Fixing them is calibration work (anomaly threshold, per-horizon forecast promotion) and a data problem (source labels).
5. **Air quality here is model output, not ground truth.** Open-Meteo is CAMS-derived. It validates the pipeline; it does not validate accuracy against CPCB stations. Every artifact records this caveat.
6. **Every keyed source is unverified.** No credential exists in this environment: OpenAQ returns `401`, FIRMS requires a `MAP_KEY`. Those connectors remain fixture replays marked `NOT VERIFIED — requires <credential>`.
7. **No drift monitoring** (LLD §46), no Redis caching, no custom OTel metrics, and traces export nowhere by default.

---

## 6. Reproducing the numbers in the ML architecture doc

```bash
AEROPULSE_CONNECTOR_MODE=live uv run aeropulse-ml train --model all --live --days 90 --promote
cat models/training_report.json
```

`models/training_report.json` holds the dataset provenance, every metric per holdout, and the gate outcome per model. Metric values will shift slightly with the fetch date because the trailing 90-day window moves.
