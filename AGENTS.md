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
- structlog JSON; never log secrets or raw PII. Bind `correlation.id`.
- Canonical contracts live in `libs/contracts`. Connectors must not leak source shapes past `normalize()`.
- New sources: implement `DataConnector`, add fixture + contract test, register in `config/sources.yaml`. Do not change the event engine or UI unless the data type is new.
- Auth: HS256 JWT in development (`AEROPULSE_JWT_SECRET`). OIDC later.
- H3 resolution 8 is the 1 km grid.
- Phase 3 scoring is deterministic (`libs/intelligence`). Do not call an LLM from the event path.
- Source likelihoods are independent, not a softmax.

## Out of this pass

Copilot, citizen, ArangoDB writes, LightGBM, Sentinel/MODIS/CAMS, forecast plume, Kubernetes. Do not change `frontend/web` unless asked.
