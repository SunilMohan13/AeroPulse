# AeroPulse — agent notes

## Commands

```bash
uv sync
uv run ruff check .
uv run ruff format .
uv run pyright
uv run pytest tests/unit tests/contract -q
docker compose -f infrastructure/docker/compose.yaml config
docker compose -f infrastructure/docker/compose.yaml up --build
```

Enable live connector workers:

```bash
docker compose -f infrastructure/docker/compose.yaml --profile connectors up --build
```

Mint a local JWT:

```bash
uv run python -c "from aeropulse_auth import encode_token, Role; print(encode_token('dev', [Role.ADMIN]))"
```

## Conventions

- Google-style docstrings on public functions.
- structlog JSON; never log secrets or raw PII. Bind `correlation.id`; `trace_id`/`span_id` bind automatically from the active OTel span (`libs/observability/aeropulse_observability/logging.py`), no manual wiring needed.
- Canonical contracts live in `libs/contracts`. Connectors must not leak source shapes past `normalize()`.
- New sources: implement `DataConnector`, add fixture + contract test, register in `config/sources.yaml` (`enabled: false` actually skips replay — the runner reads this file). Do not change the event engine or UI unless the data type is new.
- Auth: HS256 JWT in development (`AEROPULSE_JWT_SECRET`). OIDC later.
- H3 resolution 8 is the 1 km grid.
- Phase 3 scoring is deterministic (`libs/intelligence`). Do not call an LLM from the event path.
- Source likelihoods are independent, not a softmax.
- List endpoints (`GET /api/v1/events`, `GET /api/v1/sources`) take `limit`/`offset`; keep new list endpoints consistent with that shape (`items`, `total`, `limit`, `offset`).

## ML rules

- `libs/contracts/aeropulse_contracts/feature_spec.py` is the ONLY place a model feature may be
  named. Training and serving both import it. Never write a feature list by hand.
- Random train/test splits are forbidden (LLD §19). Use `temporal_split`, `spatial_split` or
  `seasonal_split` from `libs/ml/evaluation.py`.
- A `FeatureSet` must never contain its own target; an import-time assertion enforces this.
- Any statistic used to build a target or label is fitted on TRAINING ROWS ONLY, then applied to
  held-out rows. Fitting before the split is the leakage bug this layer was built to remove.
- Every metric must be reported against an honest baseline (persistence for regression,
  majority-class for classification). A model that cannot beat its baseline must not be promoted.
- The promotion gate in `libs/ml/train.py` is load-bearing. Do not relax a threshold to make a
  model pass; fix the model or leave it at VALIDATION.
- Model artifacts are pickle-based. `AEROPULSE_MODEL_DIR` must stay deployment-controlled.
- Open-Meteo air quality is CAMS-derived model output, not ground truth. Never state its metrics
  as station accuracy.

## Out of this pass

Copilot LLM, citizen CV, ArangoDB client, MLflow, Sentinel/MODIS/CAMS live, SigNoz, Kubernetes,
API-to-database read path, frontend-to-API wiring. Do not change `frontend/web` unless asked.
Export OpenAPI with `uv run python scripts/export_openapi.py`.
