# Data contracts

All Kafka and HTTP scientific payloads are versioned Pydantic models (`extra=forbid`).

| schema_version | Package | Notes |
| --- | --- | --- |
| `observation.v1` | `aeropulse_contracts.Observation` | AQ |
| `fire_observation.v1` | `FireObservation` | FIRMS |
| `meteo.v1` | `MeteorologicalObservation` | IMD |
| `raster.v1` | `RasterObservation` | Metadata persisted in TimescaleDB; large arrays remain in object storage |
| `envelope.v1` | `KafkaEnvelope` | `LIVE` / `BACKFILL` |
| `grid-features.v1` | `GridFeature` | explicit null satellite fields |
| `anomaly.v1` | `AnomalyResult` | |
| `prediction.v1` | `GridPrediction` | IDW |
| `event.v1` | `PollutionEvent` | split confidence |
| `forecast.v1` | `ForecastResult` | `cams_applied: false` |
| `graph.v1` | `EvidenceGraph` | lineage for UI |
| `copilot.v1` | `CopilotResponse` | `llm_used: false` |
| `alert.v1` | `Alert` | log channel |
| `citizen_report.v1` | `CitizenReport` | corroborative only |

Source likelihoods are **independent** (may sum > 1). AOD is never treated as surface PM2.5.
