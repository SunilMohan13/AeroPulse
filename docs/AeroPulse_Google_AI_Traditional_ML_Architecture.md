# AeroPulse — Google AI + Traditional ML Architecture

## Purpose

AeroPulse is a hackathon solution combining traditional machine-learning models with Google's AI capabilities to provide intelligent, explainable environmental insights.

The architecture separates:

1. **Traditional ML models** — numerical prediction and classification.
2. **Google Gemini** — natural-language understanding, reasoning, planning, explanation, and multimodal analysis.
3. **Vertex AI / Google Cloud** — model lifecycle, registry, deployment, and ML infrastructure.
4. **AeroPulse Agentic Orchestrator** — coordinates Gemini, data agents, and ML capabilities.

> **Core principle:** Use traditional ML for quantitative prediction and Gemini for reasoning, correlation, explanation, and agentic interaction.

## Codebase review and integration status (2026-09-13)

This document is a target architecture, not the current runtime. Implemented state:
`docs/architecture.md`, `AGENTS.md`, `docs/api.md`. Copilot LLM and Vertex remain out of this pass.

The repository currently has a
deterministic, evidence-grounded Copilot API with `llm_used=false`; no Gemini SDK call is wired into
the request path. That is intentional until the following prerequisites are satisfied:

1. **Completed 2026-09-14:** the API reads persisted events/evidence/latest forecasts/latest graphs
  from TimescaleDB. This is now the evidence boundary a Gemini adapter must use.
  Persisted grid features and predictions are also available through authenticated, filterable
  list/latest routes; Gemini tools should request bounded pages or one latest grid record, never
  dump unbounded feature history into a prompt.
  Operational AQ/fire/weather/forecast/grid map layers now read the same persisted state, so a
  future Gemini tool should call these APIs rather than duplicating database queries. Satellite
  metadata footprints are persisted too; Gemini must preserve the `AOD is not surface PM2.5`
  limitation and must not infer pixel-level imagery from metadata-only records.
  Drift summaries are available through `/api/v1/drift`; Gemini may explain their returned status
  and limitations but must not reinterpret `INSUFFICIENT_DATA` as stability or trigger promotion.
2. The model catalog must expose true lifecycle status. This is now partially implemented:
  `GET /api/v1/models` merges deterministic serving baselines with filesystem-registry records and
  labels each as `PRIMARY_BASELINE`, `PRIMARY_MODEL`, or `REGISTERED_ONLY`.
3. Notebook metrics alone are not serving artifacts. The saved-output audit found 369/375 executed
  code cells and no saved errors, but no physical notebook bundles under track artifact folders.
  Export, contract validation and `VALIDATION -> SHADOW` registration must precede any use.
4. Gemini receives only a structured evidence envelope: observed facts, predictions, model/version,
  confidence, evidence identifiers, provenance and limitations. It may summarize or plan; it may
  not create PM2.5 values, probabilities, source scores or promotion decisions.
5. Gemini output must validate against `copilot.v1`, retain the deterministic numeric fields, expose
  `llm_used`, and fall back to the current deterministic response on timeout, parse failure, safety
  refusal or missing credentials.

Recommended sequence: ~~persisted API read path~~ (done) -> shadow-model telemetry -> grounded Gemini rewrite
behind a feature flag -> evaluation set for faithfulness/citation coverage -> optional Vertex AI
artifact mirror. Do not start with Vertex deployment or autonomous agents; neither fixes the current
data-boundary and artifact gaps.

## High-Level Architecture

```text
                         +----------------------+
                         |      AeroPulse UI    |
                         |   React Dashboard    |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |   AeroPulse Agentic  |
                         |      Orchestrator    |
                         +----------+-----------+
                                    |
                    +---------------+----------------+
                    |               |                |
                    v               v                v
             Gemini / Google    Traditional ML    Data Agents
                  AI              Prediction
                    |               |
                    |               +-- XGBoost
                    |               +-- LightGBM
                    |               +-- RandomForest
                    |               +-- Other ML
                    |               |
                    |               v
                    |        Vertex AI / MLflow
                    |               |
                    |               v
                    |          Model Registry
                    |
                    v
              Gemini reasoning
              Agent planning
              Explanation
              Multimodal analysis
                    |
                    v
             Evidence Aggregator
                    |
                    v
                  Gemini
                    |
                    v
             Explainable Insight
                    |
                    v
               AeroPulse UI
```

## Google AI Components

### Gemini

Use Gemini as the AeroPulse intelligence layer for:

- Natural-language understanding
- Intent classification
- Query decomposition
- Agent/tool selection
- Workflow planning
- Reasoning over structured evidence
- Natural-language explanation
- Recommendation generation
- Multimodal analysis
- Satellite-image interpretation where appropriate

Gemini should not directly execute infrastructure operations. It should work through controlled AeroPulse capabilities/tools.

### Vertex AI

For a Google-sponsored hackathon, Vertex AI is a strong option for the ML lifecycle:

- Model registry
- Model versioning
- Model deployment
- ML lifecycle management
- Google Cloud integration

## Traditional ML Models

AeroPulse can use specialized models such as:

```text
AeroPulse ML Models
|
+-- AQI Prediction
+-- Pollution Forecast
+-- Crop Burning Risk
+-- Industrial Emission Risk
+-- Weather Impact
+-- Pollution Spike Prediction
+-- Environmental Health Risk
```

For structured environmental data, evaluate:

- LightGBM
- XGBoost
- CatBoost
- Random Forest
- Logistic Regression

Do not automatically replace these with neural networks or Gemini. Traditional ML can remain responsible for numerical predictions.

## Gemini + ML Interaction

Example ML output:

```json
{
  "aqi_prediction": {
    "value": 287,
    "confidence": 0.93
  },
  "crop_burning_risk": {
    "value": 0.81
  },
  "industrial_emission_risk": {
    "value": 0.72
  },
  "weather_dispersion": {
    "status": "POOR"
  }
}
```

Gemini then interprets the structured evidence and produces a human-readable explanation.

> The ML model owns the quantitative prediction. Gemini owns the reasoning and explanation.

## Model Storage and GitHub

Do **not** push large trained models or millions of training records into GitHub.

GitHub should contain:

```text
aeropulse/
|
+-- src/
|   +-- training/
|   +-- inference/
|   +-- agents/
|   +-- orchestrator/
|
+-- configs/
+-- tests/
+-- deployment/
+-- requirements.txt
+-- Dockerfile
+-- README.md
```

Model artifacts should be stored in Google Cloud Storage and managed through Vertex AI Model Registry, or through MLflow + object storage if MLflow is retained.

## Training Data

Millions of training rows should remain in object storage/data lake infrastructure rather than being embedded inside the model artifact.

```text
20 Million Records
        |
        v
Google Cloud Storage
        |
        v
Training Pipeline
        |
        v
ML Model
```

Record dataset information as metadata, for example:

```json
{
  "dataset_version": "aeropulse-environment-v12",
  "training_rows": 20000000,
  "feature_count": 120
}
```

## Model Optimization

For traditional ML, prioritize optimization in this order:

```text
1. Data quality
       |
2. Prevent data leakage
       |
3. Feature selection
       |
4. Hyperparameter optimization
       |
5. Reduce tree/model complexity
       |
6. Efficient serialization
       |
7. Keep model loaded in memory
       |
8. Feature caching
       |
9. Batch/parallel prediction
       |
10. Horizontal scaling
```

### Feature Reduction

Example:

```text
250 Features
     |
     v
Feature importance / validation
     |
     v
120 Features
     |
     v
Retrain
```

This can reduce model size, prediction latency, preprocessing time, and memory usage.

## Model Registry

Example Vertex AI Model Registry structure:

```text
AeroPulse Models
|
+-- aqi_prediction
|   +-- v1
|   +-- v2
|   +-- v3 <- Production
|
+-- crop_burning_risk
|   +-- v1
|   +-- v2 <- Production
|
+-- industrial_risk
|   +-- v1 <- Production
|
+-- pollution_forecast
    +-- v1 <- Production
```

Each model version should track:

- Model version
- Dataset version
- Feature schema
- Training code version
- Parameters
- Accuracy
- Precision
- Recall
- F1
- Latency
- Model size
- Status

## Production Prediction Service

Load the production model once when the service starts.

```text
Model Registry
      |
      | Application startup
      v
Prediction Service
      |
      v
Model loaded into RAM
      |
      +-- Request 1
      +-- Request 2
      +-- Request N
```

Avoid downloading and loading the model for every request.

## Feature Cache

Avoid querying every source for every prediction:

```text
Data Sources
     |
     v
Feature Engineering
     |
     v
Feature Store / Cache
     |
     v
ML Prediction Service
```

Redis can be used for hot/short-lived features where appropriate.

## AeroPulse Agentic Architecture

```text
                         User
                           |
                           v
                        Gemini
                           |
                    Intent Analysis
                           |
                           v
                 AeroPulse Orchestrator
                           |
             +-------------+-------------+
             |             |             |
             v             v             v
        Weather Agent   ML Agent    Satellite Agent
                           |
                 +---------+---------+
                 |         |         |
                 v         v         v
               AQI       Risk     Forecast
               Model     Model      Model
                 |         |         |
                 +---------+---------+
                           |
                           v
                   Evidence Aggregator
                           |
                           v
                         Gemini
                           |
                           v
                   Final Explanation
```

## ML Prediction Agent

Use a reusable ML Prediction Agent rather than one agent per model.

Example:

```json
{
  "agent_id": "ml_prediction_agent",
  "name": "AeroPulse ML Prediction Agent",
  "capabilities": [
    "aqi_prediction",
    "pollution_forecast",
    "crop_burning_risk",
    "industrial_risk"
  ]
}
```

The orchestrator determines which model/capability is required.

## Multimodal Gemini

Satellite imagery is a strong opportunity for AeroPulse.

```text
Satellite Image
       |
       v
     Gemini
       |
       v
Image Interpretation
       |
       v
Environmental Signal
       |
       v
Traditional ML
       |
       v
Risk Prediction
```

This can be combined with:

```text
Satellite
+
Weather
+
PM2.5
+
Agriculture
+
Industrial
+
Traffic
```

## Gemini Guardrails

Gemini should not invent quantitative results.

Recommended system instruction:

```text
You are the AeroPulse reasoning engine.

Use only the supplied observations and model predictions
for quantitative claims.

Do not invent measurements.

If required evidence is unavailable, explicitly state
that it is unavailable.

Clearly distinguish:
1. Observed data
2. ML prediction
3. Gemini inference
4. Recommendation
```

Example:

```text
Observed
--------
PM2.5: 183 µg/m³

ML Prediction
-------------
Tomorrow AQI: 287
Confidence: 93%

Gemini Interpretation
---------------------
Poor atmospheric dispersion combined with elevated
agricultural burning risk is likely to contribute to
the expected deterioration.

Recommendation
--------------
Increase monitoring in the identified high-risk areas.
```

## Compelling AeroPulse Demo Query

A strong demo question is:

> **"Will Delhi's air quality deteriorate tomorrow, what are the likely causes, and what areas should we prioritize for monitoring?"**

Execution:

```text
                         User Question
                               |
                               v
                            Gemini
                               |
                         Intent Analysis
                               |
                               v
                       AeroPulse Planner
                               |
        +----------------------+----------------------+
        |                      |                      |
        v                      v                      v
   Weather Agent          ML Prediction         Satellite Agent
                              Agent
                                |
                  +-------------+-------------+
                  |             |             |
                  v             v             v
              AQI Model     Risk Model   Forecast Model
                  |             |             |
                  +-------------+-------------+
                                |
                                v
                       Evidence Aggregator
                                |
                                v
                             Gemini
                                |
                    +-----------+-----------+
                    |                       |
                    v                       v
               Root Causes              Risk Areas
                    |                       |
                    +-----------+-----------+
                                |
                                v
                       Actionable Response
```

## Example Final Response

```text
HIGH POLLUTION RISK

Tomorrow's predicted AQI:
287

Prediction confidence:
93%

Likely contributing factors:
1. Poor atmospheric dispersion
2. Elevated agricultural burning risk
3. Increased industrial emission risk

Priority monitoring areas:
- Region A
- Region B
- Region C

Recommended action:
Increase monitoring and issue an early warning
for the identified high-risk regions.

Evidence:
✓ Weather forecast
✓ AQI prediction model
✓ Agricultural risk model
✓ Industrial risk model
✓ Satellite analysis
```

## Development → Production Lifecycle

```text
Developer
   |
   v
GitHub
   |
   +-- Training Code
   +-- Feature Code
   +-- Prediction Code
   +-- Agent Code
   +-- Tests
   |
   v
CI/CD
   |
   v
Training / Evaluation
   |
   v
Vertex AI
   |
   v
Model Registry
   |
   +-- Candidate
   +-- Staging
   +-- Production
   |
   v
Prediction Service
```

The application should depend on a logical model name/version or production alias rather than hardcoding a model filename.

## Kubernetes Deployment

```text
                         Kubernetes
                              |
        +---------------------+---------------------+
        |                     |                     |
        v                     v                     v
 AeroPulse API          ML Prediction         Agent Runtime
                            Service
                                |
                                v
                         Model in RAM
```

Google Cloud services remain outside the cluster where appropriate:

```text
              Google Cloud
                    |
        +-----------+-----------+
        |                       |
        v                       v
     Gemini                  Vertex AI
        |                       |
        |                  Model Registry
        |                       |
        |                  Model Artifacts
        |                       |
        +-----------+-----------+
                    |
                    v
             AeroPulse Backend
```

## Recommended Hackathon Stack

| Layer | Recommendation |
|---|---|
| UI | React |
| Backend | FastAPI |
| Agent orchestration | AeroPulse Orchestrator |
| GenAI | Google Gemini |
| Agent framework | Optional Google ADK |
| Traditional ML | LightGBM / XGBoost / CatBoost |
| ML lifecycle | Vertex AI |
| Model registry | Vertex AI Model Registry |
| Object storage | Google Cloud Storage |
| Feature cache | Redis if required |
| Data processing | Python / Pandas / Polars |
| Database | PostgreSQL if needed |
| Containerization | Docker |
| Deployment | Google Cloud / Kubernetes |
| Observability | OpenTelemetry / Google Cloud observability |

## Recommended Google AI Positioning

For the hackathon, clearly communicate the roles:

```text
                 GOOGLE AI
                    |
        +-----------+-----------+
        |                       |
        v                       v
      Gemini                 Vertex AI
        |                       |
   Intelligence             ML Lifecycle
        |                       |
   +----+----+             +----+----+
   |         |             |         |
Reasoning  Multimodal   Registry  Deployment
Planning   Analysis
   |         |
   +----+----+
        |
        v
AeroPulse Orchestrator
        |
        v
Traditional ML Models
        |
        v
Environmental Predictions
        |
        v
Gemini
        |
        v
Explainable Actionable Insights
```

The story should not be:

> "We added Gemini because the hackathon requires Google AI."

Instead:

> **"AeroPulse uses Google Gemini as the reasoning and multimodal intelligence layer and Vertex AI as the ML lifecycle platform, while specialized traditional ML models perform the quantitative environmental predictions."**

## Final Recommended Architecture

```text
                         AEROPULSE
                            |
                            v
                     React Dashboard
                            |
                            v
                       FastAPI API
                            |
                            v
                  Agentic Orchestrator
                            |
                +-----------+-----------+
                |                       |
                v                       v
             Gemini                 ML Agent
                |                       |
                |                +------+------+
                |                |      |      |
                |                v      v      v
                |               AQI   Risk Forecast
                |               Model Models Model
                |                       |
                +-----------+-----------+
                            |
                            v
                    Evidence Aggregator
                            |
                            v
                         Gemini
                            |
                            v
                  Final AeroPulse Insight
```

## Final Recommendation

For AeroPulse:

### Google Gemini

Use for:

- Intent understanding
- Agentic planning
- Reasoning
- Explanation
- Recommendations
- Multimodal satellite analysis

### Traditional ML

Use for:

- AQI prediction
- Pollution forecasting
- Risk scoring
- Agricultural burning prediction
- Industrial risk prediction
- Numerical/classification tasks

### Vertex AI

Use for:

- Model registry
- Model versions
- Model deployment
- Google Cloud ML lifecycle

### Google Cloud Storage

Use for:

- Model artifacts
- Training datasets
- Evaluation artifacts

### GitHub

Use for:

- Source code
- Training pipelines
- Feature engineering
- Agent implementation
- Tests
- Deployment configuration

### AeroPulse Orchestrator

Use as the central decision layer:

```text
Intent
  ↓
Plan
  ↓
Select Agents
  ↓
Execute Data + ML Capabilities
  ↓
Aggregate Evidence
  ↓
Gemini Reasoning
  ↓
Explain
  ↓
Recommend
```

> **AeroPulse combines traditional ML for quantitative environmental prediction with Google Gemini for reasoning, multimodal understanding, explanation, and actionable decision support.**
