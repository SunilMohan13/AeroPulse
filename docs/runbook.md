# Runbook

## Local libraries

```bash
uv sync
uv run ruff check .
uv run pytest tests/unit tests/contract -q
uv run aeropulse-api
```

## Compose

```bash
docker compose -f infrastructure/docker/compose.yaml up --build
```

SQL migrations `0001`–`0003` load on first Postgres volume. Wipe `timescale-data` if schema is stale.

Replay without Kafka (stdout envelopes):

```bash
uv run aeropulse-connector
```

## OpenAPI

```bash
uv run python scripts/export_openapi.py
```

Writes `docs/openapi/openapi.v1.json`.

## JWT

Use `AEROPULSE_JWT_SECRET` (≥ 32 bytes). See `.env.example`.
