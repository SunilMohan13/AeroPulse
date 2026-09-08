# AeroPulse India — Low-Level Design (LLD)
## AI-Powered Hyper-Local Pollution Intelligence & Climate Action Platform

**Version:** 1.1  
**Date:** September 2026  
**Status:** Detailed implementation baseline (Docker-first development)  
**Primary geography:** Punjab–Haryana–Delhi NCR / Indo-Gangetic Pollution Corridor  
**Observability:** OpenTelemetry + SigNoz  
**Knowledge Graph:** ArangoDB  
**Deployment:** Docker Compose for development and MVP. Kubernetes is not used in development.  
**Backend:** Python + FastAPI  
**Streaming:** Apache Kafka API (Redpanda in Docker; Kafka-compatible)  
**Spatial + time-series database:** TimescaleDB with PostGIS (single instance in development)  
**Object/raster storage:** S3-compatible object storage / MinIO  
**Cache:** Redis  
**Frontend:** React + TypeScript + MapLibre GL + deck.gl

---

## 1. Executive Summary

AeroPulse should be implemented as an **evidence-fused environmental intelligence platform**, not as a conventional AQI dashboard.

The source plan establishes a 1 km × 1 km analytical grid, combines CPCB observations, IMD/ERA5 meteorology, NASA FIRMS fires, Sentinel-5P, MODIS MAIAC, INSAT/MOSDAC, CAMS, Bhuvan/NRSC, ICAR, industrial/geospatial inventories, population data and citizen observations, and separates observations, predictions, source likelihood and recommended actions.

This LLD converts that plan into an implementation architecture with:

- A plug-and-play **Connector SDK** for every external data provider.
- A canonical **Observation Contract** independent of source-specific payloads.
- Kafka-based event-driven ingestion.
- Raw → normalized → quality-scored → spatially/temporally fused data layers.
- A canonical 1 km grid as the analytical backbone.
- PostGIS for spatial reference/catalog operations.
- TimescaleDB for high-volume time-series observations.
- MinIO/S3 + Parquet/Zarr/GeoTIFF for raw and raster data.
- ArangoDB for explainable environmental event reasoning and provenance relationships.
- Redis for low-latency hot data and API caching.
- A model platform supporting baseline ML first and advanced spatiotemporal models later.
- An event engine that fuses evidence and exposes separate confidence dimensions.
- A forecast/plume engine producing 0–3 hour nowcasts and 6/12/24/48 hour forecasts.
- Exposure/risk scoring.
- A React/MapLibre/deck.gl operational UI.
- An AI Copilot that reasons over trusted evidence rather than acting as the scientific prediction engine.
- SigNoz/OpenTelemetry across APIs, connectors, Kafka consumers, ML inference, database operations and UI/backend flows.
- Docker Compose as the only local/MVP runtime: named volumes, healthchecks, restart policies, worker replicas, retries, circuit breakers, dead-letter queues, backfills and replay.
- Versioned schemas, connector contracts, model versions and evidence lineage.

The most important architectural principle is:

> **New data sources must be integrated by implementing a connector and mapping it to the canonical data contract — not by changing the core platform.**

---

# 2. Source Plan Review

The supplied architecture plan provides the correct foundation.

### 2.1 Strong decisions in the source plan

The plan correctly recommends:

1. Punjab–Haryana–Delhi NCR as the first operating geography.
2. A 1 km × 1 km environmental grid.
3. CPCB as a key ground-truth source.
4. Multi-source fusion rather than dependence on a single AQ source.
5. FIRMS for active-fire evidence.
6. IMD/ERA5 for meteorological features.
7. Sentinel-5P and MODIS as remote-sensing features.
8. CAMS as a physical-model/background prior.
9. ArangoDB/graph reasoning for event explainability.
10. Separate detection, source-likelihood, forecast and impact confidence.
11. ML models for prediction and an LLM for explanation/reasoning.
12. Spatial and temporal holdout evaluation.
13. Explicit scientific caveats around source attribution and satellite resolution.

The plan specifically warns that AOD must not be treated as surface PM2.5 and that probabilistic source attribution must not be represented as proven causality.

### 2.2 LLD-level additions

The implementation needs several additional mechanisms that are not sufficiently detailed in the source plan:

- Connector SDK and source registry.
- Schema registry.
- Idempotency and deduplication.
- Backfill/replay framework.
- Data quality rule engine.
- Feature materialization strategy.
- Model registry and model promotion workflow.
- Online/offline feature consistency.
- Event state machine.
- Graph data model and edge provenance.
- API contracts.
- RBAC and tenant/role model.
- Rate limiting.
- Data retention tiers.
- Kafka partitioning strategy.
- Docker Compose replica scaling for workers.
- Disaster recovery.
- SLOs.
- UI state model.
- Alert delivery abstraction.
- Citizen evidence moderation.
- ML explainability and uncertainty representation.
- Source outage handling.
- Scientific validation pipeline.

These are included in this LLD.

---

# 3. Architecture Goals

## 3.1 Functional goals

The platform must answer:

- What is happening?
- Where is it happening?
- How severe is it?
- What evidence supports it?
- What are the likely contributing sources?
- Where is the pollution likely to move?
- Who may be exposed?
- What should an authority investigate or do?
- How confident is the system?
- Which data/model versions produced the conclusion?

## 3.2 Non-functional goals

| Requirement | Target |
|---|---|
| Availability | 99.9% for core APIs |
| Ingestion resilience | No data loss for accepted source payloads |
| Event processing | Near-real-time for operational sources |
| API p95 | < 500 ms for standard map/event queries |
| Hot event refresh | < 60–120 seconds where source cadence allows |
| Horizontal scaling | Stateless app containers; Compose `--scale` + Kafka consumer groups |
| Replayability | Every source stream replayable |
| Auditability | Full source → feature → model → event lineage |
| Extensibility | Connector-only addition for new sources |
| Observability | Traces, metrics, logs and business telemetry |
| Scientific integrity | Uncertainty and evidence exposed in UI |
| Recovery | Automated retry + DLQ + replay |

---

# 4. High-Level Architecture

```text
                         ┌──────────────────────────┐
                         │       React Web UI        │
                         │ MapLibre + deck.gl        │
                         │ Events / Forecast / KG    │
                         └────────────┬─────────────┘
                                      │ HTTPS
                         ┌────────────▼─────────────┐
                         │ API Gateway / BFF         │
                         │ Auth / RBAC / Rate Limit  │
                         └───────┬─────────┬────────┘
                                 │         │
                    ┌────────────▼─┐     ┌─▼──────────────┐
                    │ Event APIs   │     │ Copilot APIs   │
                    └──────┬───────┘     └──────┬────────┘
                           │                    │
                           │              ┌─────▼─────┐
                           │              │ AI Reasoner│
                           │              └─────┬─────┘
                           │                    │
                           │              ┌─────▼─────┐
                           │              │ Evidence   │
                           │              │ Retrieval  │
                           │              └─────┬─────┘
                           │                    │
┌──────────────────────────▼────────────────────▼─────────────────────────┐
│                          EVENT / INTELLIGENCE LAYER                     │
│                                                                       │
│  Grid Fusion → Feature Engine → Detection → Source Likelihood         │
│                  → Forecast → Exposure/Risk → Action Recommendation    │
└───────────────────────────┬───────────────────────────────────────────┘
                            │
                       Kafka Topics
                            │
┌───────────────────────────▼───────────────────────────────────────────┐
│                       DATA PROCESSING LAYER                            │
│                                                                       │
│ Quality → Normalize → Spatial Map → Temporal Align → Feature Build    │
└───────────────────────────┬───────────────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────────────┐
│                         INGESTION LAYER                                │
│                                                                       │
│ Connector SDK + Source Registry + Scheduler + Pollers + Webhooks      │
│                                                                       │
│ CPCB | IMD | FIRMS | Sentinel-5P | MODIS | INSAT | CAMS | Bhuvan     │
│ ICAR | Industry | OSM | Population | Citizen | Future Sources        │
└───────────────────────────┬───────────────────────────────────────────┘
                            │
       ┌────────────────────┼───────────────────────┐
       ▼                    ▼                       ▼
   TimescaleDB+PostGIS     MinIO/S3              ArangoDB
   Spatial + time-series   Raw/Raster            Evidence graph

                     Redis / Cache / Locks

                   OpenTelemetry / SigNoz
```

---

# 5. Core Architectural Principles

## 5.1 Contract-first integration

External systems must never be allowed to define internal data structures.

Every connector converts source-specific payloads into canonical contracts.

```text
External payload
      ↓
Connector parser
      ↓
Canonical Observation
      ↓
Quality validation
      ↓
Normalized Observation
      ↓
Grid mapping
      ↓
Feature/event pipeline
```

## 5.2 Source isolation

A failure in FIRMS must not stop CPCB ingestion.

Each connector has:

- independent deployment or worker pool
- independent retry policy
- source-specific rate limits
- source-specific credentials
- source health
- source freshness
- source circuit breaker
- DLQ
- backfill support

## 5.3 Evidence-first intelligence

Every AI output must reference:

- observation IDs
- source IDs
- timestamps
- model version
- feature version
- geographic scope
- confidence
- processing lineage

## 5.4 Deterministic before probabilistic

Use deterministic calculations for:

- distance
- geometry
- wind-vector alignment
- spatial intersection
- exposure calculation
- threshold checks
- temporal alignment
- data-quality checks

Use ML for:

- pollution estimation
- anomaly detection
- source likelihood
- forecasting
- risk prioritization

Use the LLM for:

- explanation
- investigation
- evidence summarization
- natural-language querying
- action-plan drafting

---

# 6. Service Decomposition

Recommended services:

| Service | Responsibility | Scale |
|---|---|---|
| api-gateway | Auth, routing, rate limits | Horizontal |
| source-registry | Data source metadata/config | 2+ |
| connector-manager | Connector lifecycle | 2+ |
| connector-workers | Source-specific polling | Per source |
| ingestion-service | Canonical event publishing | Horizontal |
| quality-service | Validation/QC | Horizontal |
| normalization-service | Unit/schema normalization | Horizontal |
| spatial-fusion-service | Grid mapping | Horizontal |
| feature-service | Feature generation | Horizontal |
| event-engine | Event detection/state | Horizontal |
| source-likelihood-service | Source scoring | Horizontal |
| forecast-service | Pollution movement | GPU/CPU scalable |
| exposure-service | Population/exposure | Horizontal |
| graph-service | ArangoDB access | Horizontal |
| alert-service | Notifications | Horizontal |
| copilot-service | LLM reasoning | Horizontal |
| citizen-service | Citizen reports/media | Horizontal |
| model-service | Model inference | Horizontal |
| model-training-jobs | Offline training | Batch |
| replay-service | Backfill/replay | Batch |
| admin-service | Configuration/RBAC | 2+ |

Avoid creating a microservice for every small transformation. The above boundaries are **logical services**. For Docker development and MVP they must be packed into a small number of containers (see §41), not one Deployment per row.

---

# 7. Plug-and-Play Data Integration Architecture

## 7.1 Connector SDK

Create a Python package:

```text
aeropulse-connector-sdk/
├── base.py
├── contracts.py
├── auth.py
├── rate_limit.py
├── retry.py
├── checkpoint.py
├── health.py
├── metrics.py
└── testing.py
```

Base interface:

```python
class DataConnector(ABC):
    @abstractmethod
    def metadata(self) -> ConnectorMetadata: ...

    @abstractmethod
    def discover(self) -> list[SourceAsset]: ...

    @abstractmethod
    def fetch(self, request: FetchRequest) -> Iterator[RawRecord]: ...

    @abstractmethod
    def normalize(self, record: RawRecord) -> list[Observation]: ...

    @abstractmethod
    def health_check(self) -> HealthStatus: ...
```

Connector metadata:

```yaml
connector_id: firms_viirs
version: 1.0.0
provider: NASA
data_type: active_fire
transport: https
schedule:
  mode: interval
  interval_seconds: 900
auth:
  type: api_key
rate_limit:
  requests: 5000
  window_seconds: 600
capabilities:
  realtime: true
  historical: true
  spatial_query: true
output_contract:
  - fire_observation.v1
```

## 7.2 Source Registry

Store source configuration centrally.

```text
data_source
------------
source_id
provider
connector_id
display_name
data_type
endpoint
auth_ref
schedule
enabled
priority
expected_interval
last_success_at
last_record_at
status
license
retention_policy
schema_version
```

Never store secrets directly in source configuration. Store a reference name only. In Docker development, resolve that name from Compose secrets or a gitignored `.env` file. Do not commit credentials. Production can later swap the resolver to Vault or a cloud secret manager without changing source records.

## 7.3 Adding a new source

Adding a new source should require:

1. Create connector package.
2. Implement SDK interfaces.
3. Map source fields to canonical contracts.
4. Add source configuration.
5. Add connector tests.
6. Register source.
7. Deploy connector worker.
8. Enable source.

No changes should be required in:

- event engine
- feature engine
- UI
- graph model
- forecast engine

unless the new data type itself introduces a new scientific capability.

---

# 8. Canonical Data Contracts

Use versioned Pydantic models.

## 8.1 Observation

```json
{
  "observation_id": "obs_01J...",
  "source_id": "cpcb",
  "source_record_id": "station123_2026...",
  "schema_version": "observation.v1",
  "observed_at": "2026-09-08T05:15:00Z",
  "received_at": "2026-09-08T05:17:10Z",
  "location": {
    "lat": 28.6139,
    "lon": 77.2090
  },
  "measurement": {
    "parameter": "pm25",
    "value": 142.3,
    "unit": "ug/m3"
  },
  "quality": {
    "quality_flag": "valid",
    "quality_score": 0.97
  },
  "provenance": {
    "provider": "CPCB",
    "connector_version": "1.2.0",
    "raw_object_uri": "s3://raw/cpcb/..."
  }
}
```

## 8.2 Fire observation

```json
{
  "observation_id": "fire_...",
  "source_id": "firms_viirs",
  "observed_at": "...",
  "location": {"lat": 30.1, "lon": 75.7},
  "fire": {
    "frp": 82.4,
    "confidence": 0.91,
    "sensor": "VIIRS"
  }
}
```

## 8.3 Meteorological observation

```json
{
  "parameter": "wind",
  "wind_u": -2.1,
  "wind_v": 3.4,
  "temperature": 25.1,
  "humidity": 72.0,
  "pressure": 1008.2,
  "boundary_layer_height": 420.0
}
```

## 8.4 Raster observation

For satellite/raster products:

```text
observation_id
source_id
product_id
acquisition_time
processing_time
bbox
crs
resolution
object_uri
checksum
cloud_fraction
quality_score
```

Do not put large raster arrays in Kafka or TimescaleDB.

---

# 9. Data Source Integration Matrix

| Source | Data | Initial mode | Storage | Frequency |
|---|---|---|---|---|
| CPCB CAAQMS | PM2.5/PM10/NO2/SO2/CO/O3 | API/HTTP | TimescaleDB | 15 min/hourly |
| OpenAQ | AQ backup/interoperability | REST | TimescaleDB | Hourly/as available |
| IMD | Weather/forecast/warnings | API | TimescaleDB + object | Hourly/forecast cycle |
| ERA5 | Historical weather | Batch | Object + feature store | Historical |
| NASA FIRMS | Fire/FRP/confidence | REST/WFS/WMS | PostGIS + TimescaleDB | Near-real-time |
| Sentinel-5P | NO2/SO2/CO/O3 | Copernicus APIs | Object + feature store | Satellite pass |
| MODIS MAIAC | AOD | Earthdata | Object/raster | Daily |
| INSAT/MOSDAC | Smoke/fire/aerosol/cloud | API/product | Object/raster | Product dependent |
| CAMS | Forecast/background composition | API/download | Object + features | Forecast cycles |
| Bhuvan/NRSC | LULC/geospatial | API/download | PostGIS/object | Periodic |
| ICAR/KRISHI | Agriculture context | API/download | PostGIS/object | Periodic |
| Industry/OCEMS | Industry/activity | API/files | PostGIS | Daily/weekly |
| OSM | Roads/settlements/industry | Extract/API | PostGIS | Periodic |
| Population | Exposure | Raster/vector | PostGIS/object | Periodic |
| Citizen | Photos/reports/sensors | API/upload | Postgres + MinIO | Event-driven |

### Integration rules

- Use API polling only where a stable API is available.
- Use asynchronous batch jobs for large raster datasets.
- Use object storage for raw payloads and immutable source artifacts.
- Use database storage for normalized queryable data.
- Maintain source-specific licensing metadata.
- Do not assume that public access means unrestricted commercial reuse.

---

# 10. Kafka Event Architecture

Use Kafka as the backbone for decoupling.

## 10.1 Topic naming

```text
aero.raw.<source>
aero.observation.<domain>
aero.quality.<domain>
aero.normalized.<domain>
aero.grid.features
aero.events.detected
aero.events.updated
aero.forecast.completed
aero.exposure.completed
aero.alerts
aero.citizen.reports
aero.dlq.<service>
```

Examples:

```text
aero.raw.cpcb
aero.raw.firms
aero.observation.air_quality
aero.observation.fire
aero.observation.weather
aero.grid.features
aero.events.detected
```

## 10.2 Partitioning

Primary partition key:

```text
grid_id
```

For source-specific raw topics:

```text
source_id + date_bucket
```

For citizen reports:

```text
region_id
```

This keeps spatially related events together while allowing horizontal scaling.

## 10.3 Kafka requirements

- Schema Registry.
- Avro or Protobuf for internal high-volume contracts.
- JSON for external-facing APIs.
- Idempotent producers.
- Consumer groups per processing stage.
- Dead-letter topics.
- Retry topics.
- Retention based on replay requirements.
- Compression enabled.
- Monitoring for lag.

---

# 11. Raw Data Layer

Use immutable object storage.

```text
s3://aeropulse/
├── raw/
│   ├── cpcb/
│   ├── imd/
│   ├── firms/
│   ├── sentinel5p/
│   ├── modis/
│   ├── insat/
│   ├── cams/
│   ├── bhuvan/
│   └── citizen/
├── normalized/
├── features/
├── models/
├── forecasts/
├── reports/
└── quarantine/
```

Partition:

```text
source/year/month/day/hour/
```

Example:

```text
raw/firms/2026/09/08/05/
```

Store:

- original payload
- checksum
- retrieval timestamp
- source metadata
- license metadata
- connector version

---

# 12. Spatial Data Architecture

## 12.1 1 km grid

The 1 km × 1 km grid is the primary analytical abstraction.

Each grid cell receives:

- observations
- satellite features
- weather
- fire activity
- agriculture signals
- industry context
- urban/transport features
- population
- model predictions
- anomaly scores
- source likelihood
- forecast
- risk

## 12.2 Grid ID

Use a stable global grid indexing approach such as H3 or an equivalent deterministic grid.

Recommended:

```text
H3 resolution selected to approximate ~1 km
```

Do not hardcode latitude/longitude rounding as the primary key.

Maintain:

```text
grid_id
resolution
center_lat
center_lon
geometry
region_id
state
district
city
```

## 12.3 PostGIS (on TimescaleDB)

In development, PostGIS runs **on the TimescaleDB instance**, not as a second PostgreSQL. It stores:

- administrative boundaries
- monitoring stations
- industrial assets
- roads
- population polygons/raster references
- grid geometries
- source footprints
- forecast polygons
- event boundaries

---

# 13. TimescaleDB Design

Use TimescaleDB for high-volume time-series data.

### Tables

```sql
air_quality_observation
weather_observation
fire_observation
satellite_feature
grid_feature
grid_prediction
forecast_value
citizen_sensor_reading
```

Example:

```sql
CREATE TABLE air_quality_observation (
    time timestamptz NOT NULL,
    observation_id text NOT NULL,
    source_id text NOT NULL,
    station_id text,
    grid_id text,
    parameter text NOT NULL,
    value double precision,
    unit text,
    quality_score double precision,
    latitude double precision,
    longitude double precision,
    raw_uri text,
    PRIMARY KEY (time, observation_id)
);
```

Use:

- hypertables
- compression/columnar capabilities where appropriate
- retention policies
- continuous aggregates for UI queries

Do not use TimescaleDB as the raw raster store.

---

# 14. ArangoDB Knowledge Graph

ArangoDB is the environmental reasoning layer.

## 14.1 Vertex collections

```text
GridCell
MonitoringStation
Observation
Fire
Industry
AgricultureArea
WeatherState
PollutionEvent
Plume
City
District
State
PopulationArea
SourceDataset
ModelVersion
FeatureVersion
CitizenReport
RecommendedAction
Alert
```

## 14.2 Edge collections

```text
OBSERVED_IN
LOCATED_IN
SUPPORTS
CONTRIBUTES_TO
NEAR
UPWIND_OF
DOWNWIND_OF
MOVES_TOWARD
AFFECTS
EXPOSES
DERIVED_FROM
GENERATED_BY
CORROBORATES
CONTRADICTS
RECOMMENDS
TRIGGERS
```

## 14.3 Example graph

```text
Fire F1
   │
   ├── LOCATED_IN → Grid G1
   │
   ├── SUPPORTS → Pollution Event E1
   │
Weather W1 ── UPWIND_OF ──> G1
   │
   └── MOVES_TOWARD → G2 → G3 → Delhi
                              │
                              ├── AFFECTS → Population P1
                              └── TRIGGERS → Action A1
```

## 14.4 Evidence lineage

Every important graph edge should carry:

```json
{
  "confidence": 0.86,
  "evidence_ids": ["obs1", "obs2"],
  "model_version": "source-likelihood-1.4.0",
  "created_at": "...",
  "valid_from": "...",
  "valid_to": null
}
```

This allows the Copilot to explain why a relationship exists.

---

# 15. Canonical Grid Feature Model

The source plan defines the following major feature groups.

```text
Identity:
  grid_id
  timestamp

Ground AQ:
  pm25
  pm10
  no2
  so2
  co
  o3
  station_distance

Satellite:
  aod
  satellite_no2
  satellite_so2
  satellite_co
  cloud_fraction

Weather:
  wind_u
  wind_v
  temperature
  humidity
  pressure
  rainfall
  boundary_layer_height

Fire:
  fire_count
  fire_frp
  fire_confidence
  fire_persistence

Agriculture:
  crop_probability
  harvested_area_proxy
  agricultural_burning_score

Industry:
  industrial_density
  source_type
  source_distance
  activity_score

Urban:
  road_density
  built_up_fraction
  nighttime_lights

Exposure:
  population
  sensitive_location_score

AI:
  pm25_estimate
  anomaly_score
  source_likelihood
  forecast
  risk_score
  confidence
```

Additional implementation metadata:

```text
feature_version
feature_generated_at
source_count
missing_feature_count
quality_score
data_freshness_seconds
```

---

# 16. Data Quality Engine

Each observation receives quality flags.

## 16.1 Rules

### Range validation

```text
PM2.5 < 0 → invalid
humidity < 0 or > 100 → invalid
latitude outside [-90,90] → invalid
longitude outside [-180,180] → invalid
```

### Temporal validation

Detect:

- future timestamps
- stale observations
- duplicate timestamps
- large gaps
- clock drift

### Sensor validation

Detect:

- stuck value
- flatline
- impossible jumps
- excessive missingness
- sensor outage

### Spatial validation

Detect:

- invalid coordinates
- station moved unexpectedly
- satellite footprint mismatch

## 16.2 Quality score

Example:

```text
quality_score =
  0.25 * range_quality +
  0.20 * temporal_quality +
  0.20 * sensor_quality +
  0.15 * spatial_quality +
  0.10 * source_reliability +
  0.10 * freshness
```

Weights must be configurable.

---

# 17. Feature Engineering

Feature computation should be deterministic and versioned.

## 17.1 Spatial features

- distance to nearest station
- distance to fires
- distance to industry
- road density
- population density
- upwind fire count
- upwind industrial assets
- affected population

## 17.2 Temporal features

- lagged PM2.5: 1h, 3h, 6h, 12h, 24h
- rolling mean
- rolling max
- rate of change
- day of week
- hour
- season
- historical percentile

## 17.3 Meteorological features

- wind speed
- wind direction
- wind persistence
- boundary layer height
- humidity
- temperature inversion proxy
- precipitation
- atmospheric stability proxy

## 17.4 Fire features

- count within radius
- FRP sum
- FRP weighted by distance
- persistence
- upwind fire score
- crop-area overlap

---

# 18. ML Architecture

## 18.1 Model 1 — Hyper-local PM2.5 estimator

Initial model:

```text
LightGBM / XGBoost
```

Inputs:

- CPCB ground observations
- AOD
- satellite gases
- weather
- fire activity
- land cover
- elevation
- urban features
- historical PM2.5

Output:

```text
pm25_estimate
prediction_interval
confidence
```

Do not treat AOD as surface PM2.5 directly.

## 18.2 Model 2 — Anomaly detector

Baseline:

```text
historical median/quantile baseline
+
meteorological regime
+
ML residual model
```

Output:

```text
anomaly_score
baseline_pm25
observed_pm25
residual
event_trigger
```

## 18.3 Model 3 — Source likelihood

Candidate classes:

```text
biomass_burning
industrial
traffic
dust
regional_transport
mixed/unknown
```

Inputs:

- wind alignment
- source distance
- pollutant signature
- fire FRP
- satellite signals
- land use
- industrial activity
- historical correlations

Output:

```json
{
  "biomass_burning": 0.78,
  "industrial": 0.11,
  "traffic": 0.04,
  "dust": 0.03,
  "regional_transport": 0.62
}
```

These scores are **independent likelihoods**, not a mutually exclusive softmax. `biomass_burning` and `regional_transport` can both be high. Calibrate each score separately and never present them as proven causality.

## 18.4 Model 4 — Propagation forecast

MVP:

```text
current pollution field
+
wind vector advection
+
boundary layer
+
CAMS
+
historical transport patterns
```

Forecast:

```text
0–3 hour nowcast
6 hour
12 hour
24 hour
48 hour
```

Later:

- ConvLSTM
- Temporal Fusion Transformer
- graph neural network
- physics-informed neural model
- hybrid numerical + ML model

## 18.5 Model 5 — Exposure/risk

Separate:

```text
pollution severity
```

from:

```text
population risk
```

Example:

```text
risk =
pollution_severity
× exposure_duration
× population_density
× sensitive_population_factor
× confidence
```

The exact formula should be configuration-driven and scientifically validated.

---

# 19. Model Registry and Lifecycle

Use a model registry such as MLflow.

Model metadata:

```text
model_id
model_name
version
training_dataset_version
feature_version
code_commit
training_time
geography
season
metrics
approval_status
artifact_uri
```

Promotion:

```text
TRAINING
   ↓
VALIDATION
   ↓
SHADOW
   ↓
CANARY
   ↓
PRODUCTION
   ↓
RETIRED
```

Models must be evaluated using spatial and temporal holdouts.

Avoid random splits because nearby locations and adjacent time periods are correlated.

---

# 20. Online Feature Store Strategy

For MVP, avoid introducing a heavyweight feature-store product unless necessary.

Use:

```text
Offline:
  Parquet + object storage

Historical feature queries:
  TimescaleDB

Hot features:
  Redis

Feature metadata:
  TimescaleDB (same instance in development)
```

If scale later requires it, introduce Feast or another feature-store layer without changing the canonical feature contract.

---

# 21. Pollution Event Engine

The event engine should be stateful.

## 21.1 Event states

```text
DETECTED
VALIDATING
CONFIRMED
FORECASTING
ACTIVE
DECLINING
RESOLVED
REJECTED
```

## 21.2 Event creation

Create an event when:

```text
anomaly_score > threshold
AND
evidence_count >= minimum
AND
quality_score >= minimum
```

Evidence can include:

- CPCB anomaly
- nearby station corroboration
- fire detections
- satellite anomaly
- wind consistency
- CAMS support
- citizen report
- historical pattern

## 21.3 Event confidence

Expose separately:

```text
detection_confidence
source_likelihood_confidence
forecast_confidence
impact_confidence
evidence_freshness
sensor_coverage
overall_confidence
```

Example:

```text
Detection: 94%
Source likelihood: 82%
Movement forecast: 89%
Impact: 91%
Overall: 89%
```

---

# 22. Forecast / Plume Engine

## 22.1 Input

```text
current grid pollution
wind_u / wind_v
boundary layer
temperature
humidity
rainfall
CAMS forecast
source likelihood
historical transport
```

## 22.2 Processing

```text
Current pollution field
       ↓
Spatial smoothing
       ↓
Wind vector field
       ↓
Advection
       ↓
Atmospheric dilution/stability
       ↓
CAMS correction
       ↓
ML residual correction
       ↓
Forecast field
```

## 22.3 Output

```json
{
  "event_id": "evt_123",
  "horizon_hours": 12,
  "grid_predictions": [
    {
      "grid_id": "892...",
      "pm25": 182.4,
      "confidence": 0.84
    }
  ]
}
```

---

# 23. Citizen Intelligence

Workflow:

```text
Take photo
   ↓
Auto-location
   ↓
Observation type
   ↓
Upload
   ↓
Image moderation
   ↓
Computer vision
   ↓
Evidence correlation
   ↓
Event confidence update
```

CV classes:

```text
smoke
fire
dust
haze
clear
unknown
```

Citizen reports should never independently generate a high-severity event.

They should modify confidence only when supported by independent evidence.

---

# 24. AI Copilot

The Copilot is an evidence reasoning interface.

## 24.1 Architecture

```text
User question
    ↓
Intent classifier
    ↓
Query planner
    ↓
Evidence retrieval
    ├── ArangoDB
    ├── PostGIS
    ├── TimescaleDB
    └── Event service
    ↓
Deterministic calculations if required
    ↓
LLM reasoning
    ↓
Evidence validator
    ↓
Structured response
```

## 24.2 Copilot response schema

```json
{
  "answer": "...",
  "observed_facts": [],
  "predicted_conditions": [],
  "likely_sources": [],
  "confidence": {},
  "evidence": [],
  "recommended_actions": [],
  "limitations": []
}
```

## 24.3 Guardrail

The LLM must never invent:

- sensor readings
- source attribution
- forecast values
- coordinates
- event confidence
- government recommendations

Every numeric/scientific claim should be grounded in retrieved evidence.

---

# 25. REST API Design

## 25.1 Map

```http
GET /api/v1/map/grid
GET /api/v1/map/air-quality
GET /api/v1/map/fire
GET /api/v1/map/weather
GET /api/v1/map/satellite
GET /api/v1/map/forecast
```

Example:

```http
GET /api/v1/map/air-quality?
bbox=75.0,28.0,78.0,31.0
&time=2026-09-08T05:00:00Z
&resolution=1km
```

## 25.2 Events

```http
GET    /api/v1/events
GET    /api/v1/events/{event_id}
GET    /api/v1/events/{event_id}/evidence
GET    /api/v1/events/{event_id}/forecast
GET    /api/v1/events/{event_id}/graph
```

## 25.3 Sources

```http
GET  /api/v1/sources
GET  /api/v1/sources/{source_id}
POST /api/v1/sources
PUT  /api/v1/sources/{source_id}
POST /api/v1/sources/{source_id}/test
POST /api/v1/sources/{source_id}/backfill
```

## 25.4 Copilot

```http
POST /api/v1/copilot/query
POST /api/v1/copilot/investigate
POST /api/v1/copilot/explain-event
```

## 25.5 Citizen

```http
POST /api/v1/citizen/reports
POST /api/v1/citizen/reports/{id}/media
GET  /api/v1/citizen/reports/{id}
```

---

# 26. UI Architecture

Frontend:

```text
React
TypeScript
React Query
MapLibre GL
deck.gl
WebSocket/SSE
```

## 26.1 Main screens

### A. National/Regional Overview

```text
┌─────────────────────────────────────────────┐
│ AeroPulse          Region   Time   Alerts   │
├─────────────────────────────────────────────┤
│                                             │
│              INTERACTIVE MAP                │
│      AQ Grid / Fires / Wind / Plume         │
│                                             │
├──────────────┬──────────────┬───────────────┤
│ Active       │ Population   │ Forecast      │
│ Events       │ At Risk      │ Confidence    │
└──────────────┴──────────────┴───────────────┘
```

### B. Pollution Event Detail

Show:

- event severity
- timeline
- source likelihood
- supporting evidence
- affected grid cells
- affected population
- forecast plume
- confidence
- source freshness
- recommended actions
- evidence lineage

### C. Map Layers

Toggle:

```text
PM2.5
PM10
NO2
Fire
FRP
Wind
AOD
Satellite NO2
Industry
Roads
Population
Sensitive locations
Forecast plume
Event boundaries
```

### D. Evidence Panel

For selected event:

```text
Evidence
────────────
CPCB stations      6
Fire detections    42
Satellite signal  Strong
Wind alignment     0.88
CAMS support       Moderate
Citizen reports    3
```

### E. Source Health

```text
CPCB       Healthy   2m ago
IMD        Healthy   8m ago
FIRMS      Healthy   15m ago
Sentinel   Delayed   2h ago
CAMS       Healthy   45m ago
MOSDAC     Degraded  4h ago
```

### F. Copilot

Chat interface with citations to:

- event
- grid
- station
- source
- model
- timestamp

---

# 27. Real-Time UI Updates

Use:

```text
SSE for event updates
WebSocket for interactive operational sessions
REST for historical/map queries
```

Event update:

```json
{
  "type": "event.updated",
  "event_id": "evt_123",
  "severity": "high",
  "confidence": 0.91
}
```

Frontend should update only affected map tiles/layers rather than reloading the entire dataset.

---

# 28. Map Rendering Strategy

Do not return thousands of individual GeoJSON features for every refresh.

Use:

- vector tiles
- server-side aggregation
- deck.gl GPU layers
- H3/grid aggregation
- tile caching

Recommended endpoints:

```text
/tiles/aq/{z}/{x}/{y}.pbf
/tiles/fire/{z}/{x}/{y}.pbf
/tiles/events/{z}/{x}/{y}.pbf
/tiles/forecast/{z}/{x}/{y}.pbf
```

The backend can generate vector tiles from PostGIS or pre-materialized tile datasets.

---

# 29. Alerting Architecture

Notification providers should also be plug-and-play.

```text
Alert Engine
    ↓
Notification Adapter
    ├── Email
    ├── SMS
    ├── Teams
    ├── Slack
    ├── Web Push
    └── Webhook
```

Canonical alert:

```json
{
  "alert_id": "al_123",
  "event_id": "evt_123",
  "severity": "high",
  "recipient_group": "delhi_authority",
  "message_template": "pollution_event_high",
  "evidence": [],
  "expires_at": "..."
}
```

---

# 30. Source Health and Reliability

Every connector exposes:

```text
availability
last_success
last_data
data_lag
error_rate
rate_limit_remaining
records_per_run
quality_score
```

Source status:

```text
HEALTHY
DEGRADED
STALE
FAILED
DISABLED
```

The intelligence layer must understand source health.

Example:

If Sentinel-5P is unavailable:

```text
satellite_no2 = missing
```

Do not silently substitute zero.

Instead:

```text
feature_missing = true
source_coverage_reduced = true
confidence reduced
```

---

# 31. Missing Data Strategy

Missingness is a first-class feature.

For every feature:

```text
value
is_missing
age_seconds
quality_score
source_count
```

Model input:

```text
aod = null
aod_missing = 1
```

Never convert missing observations into zero.

---

# 32. Caching Strategy

Redis caches:

```text
latest AQ by grid
latest weather by grid
active events
event summaries
map tile metadata
source health
Copilot evidence snapshots
API rate-limit counters
distributed locks
```

Example:

```text
grid:{grid_id}:latest
event:{event_id}
source:{source_id}:health
```

TTL:

- latest AQ: 1–5 min
- weather: 5–15 min
- active event: 30–60 sec
- source health: 30 sec

---

# 33. Observability — SigNoz + OpenTelemetry

All services must be instrumented using OpenTelemetry.

Telemetry:

```text
Traces
Metrics
Logs
```

Flow:

```text
Application
   ↓
OpenTelemetry SDK
   ↓
OTel Collector
   ↓
SigNoz
```

SigNoz should be deployed as a Docker Compose service (or Compose profile `observability`). Collect application traces, metrics and logs through the OpenTelemetry Collector container. Collect Docker/host telemetry (container CPU, memory, restarts, disk) — not Kubernetes cluster metrics.

## 33.1 Required trace attributes

```text
service.name
service.version
deployment.environment
source.id
connector.id
grid.id
event.id
model.name
model.version
kafka.topic
kafka.partition
tenant.id
request.id
correlation.id
```

Do not put raw citizen PII or secrets in telemetry.

## 33.2 Critical metrics

### Ingestion

```text
connector_success_total
connector_failure_total
connector_latency_seconds
records_ingested_total
source_data_lag_seconds
```

### Kafka

```text
consumer_lag
records_processed
processing_latency
dlq_records
```

### Data quality

```text
invalid_records
missing_values
duplicate_records
quality_score
```

### ML

```text
inference_latency
model_requests
model_errors
prediction_confidence
drift_score
```

### Event engine

```text
events_detected
events_confirmed
events_rejected
event_processing_latency
```

### API

```text
request_count
error_rate
p50
p95
p99
```

### Infrastructure

```text
CPU
memory
container restarts
network
disk
Kafka/Redpanda broker health
DB connections
```

## 33.3 Business dashboards in SigNoz

Create dashboards:

1. Platform health.
2. Data source health.
3. Ingestion lag.
4. Event pipeline.
5. ML inference.
6. Forecast quality.
7. API performance.
8. Kafka health.
9. Docker / container health.
10. Citizen pipeline.

---

# 34. Distributed Tracing Example

A single user request:

```text
UI
 ↓
API Gateway
 ↓
Event Service
 ↓
PostGIS
 ↓
TimescaleDB
 ↓
ArangoDB
 ↓
Copilot
 ↓
LLM
```

Use the same trace ID.

For event generation:

```text
FIRMS Connector
 ↓
Kafka
 ↓
Quality Service
 ↓
Grid Fusion
 ↓
Feature Service
 ↓
Event Engine
 ↓
Source Likelihood
 ↓
Forecast
 ↓
ArangoDB
 ↓
Alert
```

The entire chain should be visible in SigNoz.

---

# 35. Security Architecture

## 35.1 Identity

Use OIDC/OAuth2.

Roles:

```text
ADMIN
SCIENTIST
AUTHORITY
OPERATOR
ANALYST
VIEWER
CITIZEN
```

## 35.2 Secrets

Never store credentials in:

- source code
- Git
- Kafka payloads
- database plain text

Use:

```text
Docker Compose secrets / gitignored .env  (development, MVP)
Vault or cloud secret manager           (later production)
```

Never put credentials in Git, images, or Compose files that are committed. Compose should only reference secret files or environment variable names.

## 35.3 API security

- JWT validation
- RBAC
- rate limits
- request validation
- payload size limits
- WAF/API gateway
- audit logs

## 35.4 Citizen data

Store:

- media in private object storage
- metadata separately
- access-controlled URLs
- retention policy
- moderation state

---

# 36. Database Responsibilities

| Technology | Primary responsibility |
|---|---|
| TimescaleDB + PostGIS | Metadata, geospatial entities, and time-series (one Docker instance in development) |
| ArangoDB | Environmental graph and evidence relationships |
| Redis | Cache/locks/hot state |
| MinIO/S3 | Raw files/raster/model artifacts |
| Kafka | Event streaming/replay |

Do not duplicate the same responsibility across all databases.

---

# 37. Data Retention

Suggested tiers:

### Hot

```text
0–30 days
```

Fast TimescaleDB access.

### Warm

```text
30 days–1 year
```

Compressed/optimized database/object storage.

### Cold

```text
>1 year
```

Parquet/Zarr in object storage.

Raw data should have source-specific retention policies.

Model training datasets should be immutable and versioned.

---

# 38. Backfill and Replay

Every connector must support:

```text
start_time
end_time
bbox
```

Example:

```http
POST /api/v1/sources/firms/backfill
```

```json
{
  "start": "2026-08-01T00:00:00Z",
  "end": "2026-08-31T23:59:59Z",
  "bbox": [74.0, 27.0, 79.0, 32.0]
}
```

Backfill should publish to separate Kafka topics or carry:

```text
processing_mode=BACKFILL
```

This prevents historical data from being confused with live operational data.

---

# 39. Idempotency

Every external record must have:

```text
source_id
source_record_id
observed_at
```

Generate:

```text
dedup_key =
hash(source_id + source_record_id + observed_at + parameter)
```

Use the dedup key before inserting into normalized stores.

Kafka producer should be idempotent.

Database writes should use upsert semantics where appropriate.

---

# 40. Failure Handling

## Connector failure

```text
retry
 ↓
exponential backoff
 ↓
circuit breaker
 ↓
source marked degraded
 ↓
DLQ
 ↓
alert operator
```

## Kafka consumer failure

```text
retry topic
 ↓
retry N times
 ↓
DLQ
 ↓
SigNoz alert
```

## ML service failure

Use:

```text
previous valid prediction
+
fallback model
+
degraded confidence
```

Never silently return stale predictions as current.

---

# 41. Docker Compose Architecture

Development and MVP run **only on Docker Compose**. Do not introduce Kubernetes, Helm, or Argo CD during development.

Kubernetes remains a possible later production path after the platform is proven. It is not a development dependency and must not appear in local setup, CI smoke tests, or the MVP demo path.

## 41.1 Compose files

```text
infrastructure/docker/
├── compose.yaml                 # core stack
├── compose.observability.yaml   # SigNoz + OTel Collector (profile: observability)
├── compose.ml.yaml              # MLflow + optional GPU worker (profile: ml)
├── .env.example                 # names only, no secret values
└── secrets/                     # gitignored local secret files
```

Profiles:

```text
default        API + workers + data stores + frontend
connectors     enable live source pollers
observability  SigNoz + OTel Collector
ml             MLflow and training/inference extras
full           all profiles
```

A developer should be able to start a useful stack with:

```bash
docker compose -f infrastructure/docker/compose.yaml up --build
```

## 41.2 Container packing (not one container per logical service)

| Container | What it runs |
|---|---|
| `web` | React + MapLibre frontend (dev server or nginx static) |
| `api` | FastAPI process: gateway, map, events, sources, citizen, copilot, admin routers |
| `worker` | Kafka consumers: quality, normalize, grid fusion, features, event engine, alerts |
| `connector` | Connector SDK workers (Compose `deploy.replicas` or `--scale`) |
| `forecast` | Forecast / exposure jobs (CPU). Started on demand or as a long-running worker |
| `timescaledb` | TimescaleDB **with PostGIS** — metadata, spatial, time-series |
| `redpanda` | Kafka-compatible broker + Schema Registry (single node locally) |
| `redis` | Cache, locks, hot event state |
| `minio` | Raw/raster/model object storage |
| `arangodb` | Evidence graph |
| `signoz` + `otel-collector` | Observability profile |
| `mlflow` | Model registry profile |

Do not run 17 FastAPI microservices locally. Keep module boundaries in Python packages; deploy them as the containers above.

## 41.3 Networks, volumes, health

```text
networks:
  aeropulse-frontend   # web, api (published ports)
  aeropulse-backend    # api, workers, data stores (internal)

volumes:
  timescale-data
  redpanda-data
  redis-data
  minio-data
  arango-data
  signoz-data
```

Every service must declare:

- `healthcheck` used as Compose `depends_on: condition: service_healthy`
- `restart: unless-stopped`
- memory limits so a local laptop does not OOM
- published ports only for `web`, `api`, MinIO console (dev), SigNoz UI, and Redpanda console if enabled

Do not publish database ports to `0.0.0.0` in shared or demo environments. Bind to `127.0.0.1` for local development.

## 41.4 Scheduling without Kubernetes CronJobs

Use one of:

- a small `scheduler` container running APScheduler / a Compose command
- host or CI `cron` that calls `docker compose run --rm connector ...`

Jobs:

```text
connector polling
backfill
periodic raster refresh
model evaluation
```

## 41.5 Scaling in Compose

```bash
docker compose up --scale connector=3 --scale worker=2
```

Partition work by Kafka consumer groups and `source_id`, not by Kubernetes HPA. Replica counts are explicit in Compose for demos.

## 41.6 Slim vs full local stack

**Slim (default day-to-day):**

```text
timescaledb, redpanda, redis, minio, api, worker, web
```

Use fixture/replay data instead of live satellite pulls.

**Full demo:**

```text
slim + arangodb + connector + forecast + observability
```

ArangoDB can be omitted in slim mode if the API can read evidence from Timescale until the graph worker is enabled.

## 41.7 Image policy

- Pin image tags (and digests where possible) in Compose.
- Run application containers as a non-root user.
- Multi-stage Dockerfiles: build stage + slim runtime.
- `.dockerignore` for each app.
- No secrets in image layers.
- `HEALTHCHECK` in application images where useful, plus Compose healthchecks.

## 41.8 Why not Kubernetes for development

- The 8-week / hackathon path cannot absorb cluster, Helm, HPA, PDB and GitOps cost.
- Compose is enough for source connectors, Kafka consumers, databases and a demo UI.
- Horizontal scale is Kafka consumer groups, which Compose replicas already exercise.
- Production k8s, if ever needed, should wrap the same images and env contract — not a different architecture.

---

# 42. Scaling Strategy

## Connector scaling

Scale by source:

```text
cpcb-worker × N
firms-worker × N
imd-worker × N
```

## Processing scaling

Kafka consumer groups allow:

```text
quality-service × N
feature-service × N
event-engine × N
```

## Forecast scaling

Use CPU initially.

GPU only when advanced deep-learning forecasting is introduced.

## Database scaling

Start in Docker with:

```text
Single TimescaleDB+PostGIS
Single-node Redpanda
Single Redis
Single MinIO
Single ArangoDB
```

Do not run Postgres and Timescale as two databases in development. Timescale is PostgreSQL; enable PostGIS on that instance.

Introduce read replicas, Redis HA, and a 3-broker Kafka/Redpanda cluster only when query or durability load requires it — not in local Compose.

---

# 43. Performance Design

Avoid synchronous chains such as:

```text
API → CPCB → FIRMS → IMD → ML → graph → response
```

Instead:

```text
Sources → Kafka → processing
                    ↓
                 materialized
                   state
                    ↓
                  API
```

The UI should query already-materialized results.

This is essential for low latency.

## Target query paths

Map:

```text
UI → API → Redis/vector tile/cache → response
```

Event detail:

```text
UI → API → Redis + Postgres + ArangoDB
```

Copilot:

```text
UI → Copilot → evidence retrieval → LLM
```

Do not make the Copilot call raw external APIs synchronously.

---

# 44. API Latency Optimization

Use:

- Redis hot cache.
- Precomputed grid summaries.
- Materialized views.
- Vector tiles.
- Async event processing.
- Connection pooling.
- HTTP keep-alive.
- GZIP/Brotli.
- Pagination.
- Bounding-box queries.
- Time-window limits.
- ArangoDB indexed graph traversals.

---

# 45. Scientific Validation

## PM2.5 estimator

Metrics:

```text
RMSE
MAE
R²
spatial CV
temporal CV
calibration
```

## Anomaly detection

```text
precision
recall
F1
false-alert rate
```

## Source classification

```text
precision
recall
calibration
confusion matrix
```

## Forecast

```text
MAE
RMSE
spatial overlap
arrival-time error
forecast skill vs baseline
```

## Risk

```text
calibration
ranking quality
precision@K
```

## Citizen CV

```text
precision
recall
human-review agreement
```

Use geography and season holdouts.

---

# 46. Model Drift

Monitor:

```text
feature drift
prediction drift
error drift
source coverage drift
seasonal drift
```

Example:

```text
PSI / KS
prediction distribution
residual distribution
```

If drift exceeds threshold:

```text
alert
 ↓
investigate
 ↓
retrain candidate
 ↓
shadow validation
 ↓
canary
```

---

# 47. Data Governance

Every dataset must maintain:

```text
source
provider
license
access_method
retrieved_at
processing_version
schema_version
retention
quality
```

Every derived result must maintain:

```text
source_observations
feature_version
model_version
code_version
created_at
```

The UI must distinguish:

```text
OBSERVED
INFERRED
PREDICTED
RECOMMENDED
```

---

# 48. Configuration Management

Use Git for source and platform configuration. Docker Compose reads non-secret config from mounted YAML. Do not use Argo CD or cluster GitOps in development.

Example:

```yaml
sources:
  - id: cpcb
    connector: cpcb_caaqms
    enabled: true
    schedule: "*/15 * * * *"

  - id: firms
    connector: nasa_firms
    enabled: true
    schedule: "*/15 * * * *"

  - id: imd
    connector: imd_weather
    enabled: true
    schedule: "0 * * * *"
```

Secrets remain outside Git.

---

# 49. Source Adapter Repository Structure

```text
aeropulse/
├── services/
│   ├── api-gateway/
│   ├── ingestion/
│   ├── quality/
│   ├── fusion/
│   ├── features/
│   ├── events/
│   ├── source-likelihood/
│   ├── forecast/
│   ├── exposure/
│   ├── graph/
│   ├── copilot/
│   └── alerts/
│
├── connectors/
│   ├── cpcb/
│   ├── imd/
│   ├── firms/
│   ├── sentinel5p/
│   ├── modis/
│   ├── insat/
│   ├── cams/
│   ├── bhuvan/
│   ├── icar/
│   ├── industry/
│   └── osm/
│
├── libs/
│   ├── contracts/
│   ├── connector-sdk/
│   ├── geospatial/
│   ├── observability/
│   ├── auth/
│   └── common/
│
├── ml/
│   ├── pm25/
│   ├── anomaly/
│   ├── source/
│   ├── forecast/
│   └── risk/
│
├── frontend/
│   └── web/
│
├── infrastructure/
│   ├── docker/
│   │   ├── compose.yaml
│   │   ├── compose.observability.yaml
│   │   ├── compose.ml.yaml
│   │   └── .env.example
│   └── terraform/          # optional later; not required to develop or demo
│
└── docs/
```

---

# 50. Connector Testing Framework

Every connector must have:

### Unit tests

- authentication
- payload parsing
- field mapping
- timestamp conversion
- unit conversion

### Contract tests

Given a fixture:

```text
source payload
→ canonical observation
```

must always produce the expected contract.

### Replay tests

Run historical payloads through:

```text
raw
→ normalize
→ quality
→ grid
```

### Failure tests

Simulate:

- HTTP 429
- HTTP 500
- timeout
- malformed JSON
- missing fields
- invalid timestamps
- source outage

---

# 51. API Contract Versioning

Use:

```text
/v1
/v2
```

and schema versions:

```text
observation.v1
event.v1
forecast.v1
```

Never silently modify a contract.

Introduce:

```text
v2
```

for breaking changes.

---

# 52. Event Contract

```json
{
  "event_id": "evt_123",
  "event_type": "pollution",
  "status": "ACTIVE",
  "severity": "HIGH",
  "created_at": "...",
  "updated_at": "...",
  "geometry": "...",
  "grid_ids": [],
  "pollutants": ["PM2.5"],
  "detection_confidence": 0.94,
  "source_confidence": 0.82,
  "forecast_confidence": 0.89,
  "impact_confidence": 0.91,
  "overall_confidence": 0.89,
  "evidence_ids": [],
  "model_versions": [],
  "feature_version": "grid-features-1.3"
}
```

---

# 53. Security and Scientific Integrity of Copilot

The Copilot must use a policy layer:

```text
Question
 ↓
Intent
 ↓
Allowed tools
 ↓
Evidence retrieval
 ↓
Evidence validation
 ↓
LLM
 ↓
Response validator
```

Allowed tools:

```text
get_event
get_grid
get_forecast
get_evidence
get_source_health
calculate_distance
calculate_exposure
get_graph_neighbors
```

The LLM should not directly access arbitrary databases.

---

# 54. Operational Dashboards

### Dashboard 1 — Pollution Operations

- active events
- severity
- affected population
- forecast direction
- confidence

### Dashboard 2 — Data Operations

- source status
- source freshness
- ingestion rate
- data quality
- missingness

### Dashboard 3 — ML Operations

- model latency
- prediction volume
- drift
- model confidence
- errors

### Dashboard 4 — Platform Operations

- Docker / container health
- Kafka / Redpanda
- TimescaleDB + PostGIS
- ArangoDB
- Redis
- object storage
- API latency

---

# 55. Disaster Recovery

Back up:

```text
TimescaleDB + PostGIS
ArangoDB
source registry
model registry
object metadata
configuration
```

Object storage should have versioning enabled.

Define:

```text
RPO: 15 minutes
RTO: 1 hour
```

for the initial production architecture, subject to infrastructure constraints.

---

# 56. Multi-Region / Future BRICS Readiness

Do not implement federated learning in MVP.

Design boundaries so each country can later run:

```text
National AeroPulse
```

with:

- local raw data
- local models
- local KG
- local citizen data

and share:

```text
aggregated environmental intelligence
model updates
selected features
cross-border events
```

The existing source plan correctly identifies this as a later federation capability.

---

# 57. MVP Implementation Plan

## Phase 0 — Data validation

Duration: 3–5 days

Tasks:

- validate CPCB access
- validate IMD endpoints
- create FIRMS MAP_KEY
- validate Sentinel-5P access
- validate MODIS Earthdata
- validate CAMS
- identify MOSDAC products
- verify licensing
- test historical availability

Deliverable:

```text
source registry + sample payload archive
```

## Phase 1 — Platform foundation

Weeks 1–2

Build:

- Docker Compose (core data + API + worker + web)
- Redpanda (Kafka API)
- TimescaleDB + PostGIS
- MinIO
- Redis
- ArangoDB
- SigNoz (observability profile)
- Connector SDK
- source registry

## Phase 2 — Data pipeline

Weeks 2–3

Implement:

- CPCB
- IMD
- FIRMS
- Sentinel-5P
- MODIS
- CAMS

Development/demo cut: implement **CPCB + FIRMS + IMD** first, with replay fixtures. Add Sentinel-5P, MODIS and CAMS only after the live map and event engine work.

Pipeline:

```text
source
→ raw
→ Kafka
→ quality
→ normalized
→ grid
→ TimescaleDB/PostGIS
```

## Phase 3 — AI detection

Weeks 3–4

Implement:

- PM2.5 estimator
- anomaly detector
- fire correlation
- confidence engine

## Phase 4 — Forecast + graph

Week 5

Implement:

- wind advection
- CAMS integration
- forecast service
- ArangoDB graph
- evidence lineage

## Phase 5 — UI + Copilot

Week 6

Implement:

- live map
- event cards
- forecast plume
- evidence panel
- source health
- Copilot

## Phase 6 — Citizen intelligence

Week 7

Implement:

- report API
- image storage
- CV
- evidence correlation

## Phase 7 — Hardening

Week 8

Implement:

- load tests
- failure tests
- replay
- alerting
- security
- observability
- scenario replay
- production readiness

---

# 58. Recommended MVP Technology Stack

| Area | Technology |
|---|---|
| API | FastAPI |
| Language | Python |
| Frontend | React + TypeScript |
| Maps | MapLibre GL |
| Visualization | deck.gl |
| Streaming | Kafka API (Redpanda in Docker) |
| Schema | Protobuf/Avro + Schema Registry |
| Metadata + spatial + time-series | TimescaleDB + PostGIS (one instance in development) |
| Graph | ArangoDB |
| Cache | Redis |
| Object store | MinIO/S3 |
| ML | LightGBM/XGBoost |
| Deep learning | PyTorch |
| ML registry | MLflow |
| Geospatial | GeoPandas/rasterio/xarray/rioxarray |
| ML serving | FastAPI in the `api` / `forecast` containers |
| Advanced serving | Same images; no KServe in development |
| Observability | OpenTelemetry + SigNoz (Compose profile) |
| Container | Docker |
| Local/MVP orchestration | Docker Compose |
| Later production (optional) | Same images on Kubernetes — not a development requirement |
| CI/CD | GitHub Actions/GitLab CI building images and running `docker compose` smoke tests |
| Secrets | Compose secrets / gitignored `.env`; Vault later |

---

# 59. Production SLOs

## API

```text
p95 < 500 ms
p99 < 1 s
```

for normal map/event APIs.

## Data freshness

Target based on source cadence:

```text
CPCB: < 5 min after source availability
FIRMS: < 20 min
IMD: < 15 min
```

Satellite sources have source-dependent latency.

## Event detection

```text
< 2–5 minutes
```

after required evidence arrives for a live event.

## Forecast

```text
< 5 minutes
```

for the initial regional forecast generation.

---

# 60. Cost Optimization

The architecture should not create excessive containers or expensive always-on GPU workloads.

Start with:

```text
one api container
one worker container
shared connector workers
CPU-only ML
```

Scale with `docker compose --scale`, not a cluster autoscaler.

Only introduce GPU workloads when model performance justifies the cost.

Batch raster processing.

Cache map tiles.

Use object storage for historical data.

---

# 61. Key Architectural Decisions

### Decision 1

**Use Kafka as the integration backbone.**

Reason:

- decoupling
- replay
- scaling
- fault isolation

### Decision 2

**Use canonical contracts.**

Reason:

- plug-and-play connectors
- source independence
- stable ML pipeline

### Decision 3

**Use 1 km grid as analytical abstraction.**

Reason:

- joins heterogeneous spatial sources
- scalable feature generation
- consistent model inputs

### Decision 4

**Use ArangoDB for environmental reasoning.**

Reason:

- event/source/evidence relationships
- explainability
- multi-hop reasoning

### Decision 5

**Use SigNoz as the unified observability platform.**

Reason:

- OpenTelemetry-native traces
- metrics
- logs
- Docker / host visibility

### Decision 6

**Keep LLM outside the scientific prediction path.**

Reason:

- deterministic scientific outputs
- reproducibility
- explainability
- reduced hallucination risk

### Decision 7

**Use Docker Compose for development and MVP. Do not use Kubernetes in development.**

Reason:

- same images from laptop to demo
- Kafka consumer-group scaling without a cluster
- lower operational cost for an 8-week build
- Kubernetes, if ever needed, consumes the same images and env contract

---

# 62. End-to-End Event Example

Example: agricultural burning event in Punjab.

```text
FIRMS
  ↓
Fire detections
  ↓
Kafka
  ↓
Quality validation
  ↓
Grid mapping
  ↓
Fire feature generation
  ↓
CPCB stations show PM2.5 increase
  ↓
IMD wind indicates SE transport
  ↓
Satellite signal supports regional pollution
  ↓
CAMS supports background transport
  ↓
Event engine detects anomaly
  ↓
Source likelihood:
  biomass burning = high
  regional transport = medium/high
  industry = low
  ↓
Forecast engine
  ↓
Plume moves toward Delhi NCR
  ↓
Exposure engine
  ↓
Population risk increases
  ↓
ArangoDB creates evidence graph
  ↓
Alert engine
  ↓
UI shows event + plume + confidence
  ↓
Copilot explains:
"Observed PM2.5 increased...
fire activity is concentrated...
winds are aligned...
forecast indicates movement..."
```

This is the core AeroPulse demonstration.

---

# 63. Final Reference Architecture

```text
                         USERS
                           │
                 ┌─────────▼──────────┐
                 │ React / MapLibre UI │
                 │ deck.gl / Copilot   │
                 └─────────┬──────────┘
                           │
                     API Gateway/BFF
                           │
      ┌────────────────────┼─────────────────────┐
      │                    │                     │
   Event API           Map API              Copilot API
      │                    │                     │
      └──────────────┬─────┴──────────────┬──────┘
                     │                    │
                Redis Cache         Evidence Service
                     │                    │
                     │            ┌───────┴────────┐
                     │            │                │
                     │        ArangoDB        TimescaleDB
                     │
              Materialized State
                     │
       ┌─────────────▼─────────────┐
       │ Event Intelligence Layer  │
       │                           │
       │ Detection                 │
       │ Source Likelihood         │
       │ Forecast                  │
       │ Exposure                  │
       │ Risk                      │
       └─────────────┬─────────────┘
                     │
                   Kafka
                     │
       ┌─────────────▼──────────────┐
       │ Data Processing             │
       │ Quality / Normalize / Grid  │
       │ Feature Engineering         │
       └─────────────┬──────────────┘
                     │
                   Kafka
                     │
       ┌─────────────▼──────────────┐
       │ Connector SDK               │
       │                             │
       │ CPCB / IMD / FIRMS          │
       │ Sentinel / MODIS / INSAT    │
       │ CAMS / Bhuvan / ICAR        │
       │ Industry / OSM / Citizen    │
       └─────────────┬──────────────┘
                     │
             External Data Sources

Data Stores:
  TimescaleDB + PostGIS
  ArangoDB
  Redis
  MinIO/S3

Observability:
  OpenTelemetry → OTel Collector → SigNoz

Infrastructure:
  Docker Compose → healthchecks → image CI → optional later k8s using the same images
```

---

# 64. Implementation Checklist

## Platform

- [x] Docker Compose
- [x] Redpanda (Kafka API) + Schema Registry
- [x] TimescaleDB + PostGIS
- [x] ArangoDB
- [x] Redis
- [x] MinIO/S3
- [x] SigNoz (observability profile) (Compose overlay; collector debug exporter)
- [x] OpenTelemetry

## Integration

- [x] Connector SDK
- [x] Source Registry
- [x] CPCB connector
- [x] IMD connector
- [x] FIRMS connector
- [x] Sentinel-5P connector
- [x] MODIS connector
- [x] CAMS connector
- [x] INSAT/MOSDAC connector
- [x] Bhuvan connector
- [x] ICAR connector
- [x] Industry connector
- [x] OSM ingestion
- [x] Citizen API

## Data

- [x] Raw data layer
- [x] Canonical contracts
- [x] Quality engine
- [x] Spatial mapping
- [x] Temporal alignment
- [x] 1 km grid
- [x] Feature pipeline
- [x] Provenance

## AI

- [x] PM2.5 estimator
- [x] Anomaly detector
- [x] Source likelihood
- [x] Forecast
- [x] Exposure
- [x] Risk
- [x] Model registry
- [ ] Model monitoring

## Intelligence

- [x] Event engine
- [x] Event state machine
- [x] ArangoDB graph
- [x] Evidence lineage
- [x] Confidence engine
- [x] Alert engine
- [x] Copilot

## UI

- [ ] Live map
- [ ] AQ layers
- [ ] Fire layers
- [ ] Wind layers
- [ ] Satellite layers
- [ ] Forecast plume
- [ ] Event detail
- [ ] Evidence panel
- [ ] Source health
- [ ] Risk view
- [ ] Copilot
- [ ] Citizen reporting

## Production

- [x] RBAC
- [x] Secrets
- [x] Rate limiting
- [x] Backfill
- [x] Replay
- [x] DLQ
- [x] Compose replica scaling
- [x] Disaster recovery
- [x] Load testing
- [ ] Security testing
- [ ] Scientific validation
- [ ] SLO monitoring

---

# 65. Important Scientific and Integration Caveats

1. Public data access does not automatically imply unrestricted commercial use. Current licensing and attribution terms must be validated before production deployment.
2. Some Indian government geospatial datasets may require registration, special access or agreements.
3. Satellite observations have cloud and cadence limitations; missingness must be modeled explicitly.
4. Industrial emissions are likely to remain the least complete public data layer. Industrial attribution should therefore remain probabilistic unless authoritative telemetry is available.
5. AOD is not surface PM2.5 and must only be used as one input to a fused estimator.
6. The platform should not claim satellite-derived hyper-local measurements beyond the native measurement resolution. ML downscaling/fusion should be described accurately.
7. Citizen observations are corroborative evidence, not standalone proof.
8. Every prediction must expose uncertainty.
9. Every alert should be traceable to evidence and model/feature versions.

---

# 66. Final Recommendation

The recommended production architecture is:

> **Connector SDK + Source Registry → Kafka API (Redpanda in Docker) → Quality/Normalization → 1 km Grid → Feature Layer → ML/Event Intelligence → ArangoDB Evidence Graph → Exposure/Risk → APIs/UI/Copilot, with TimescaleDB+PostGIS + MinIO/S3 + Redis as specialized stores, OpenTelemetry + SigNoz for observability, and Docker Compose as the development/MVP runtime.**

The most important implementation decision is to make **data-source integration a product capability of the platform itself**.

A new source should look like:

```text
Implement connector
      ↓
Map to canonical contract
      ↓
Register source
      ↓
Deploy
      ↓
Automatically becomes available
to the existing fusion/event/ML/graph/UI pipeline
```

This design allows AeroPulse to begin with the Punjab–Haryana–Delhi NCR scenario and later expand to all India and eventually BRICS without redesigning the core architecture.
