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

SQL migrations `0001`–`0007` are idempotent. Init scripts still run on first
volume create. The `migrate` Compose service re-applies the same files on every
`up`, so an existing `timescale-data` volume picks up `alert` and
`source_health` columns without a wipe.

The connector is a scheduled loop (`restart: unless-stopped`), not a one-shot job.
There is no `--profile connectors`. Worker Prometheus text is at
`http://127.0.0.1:9090/metrics`.

Replay without Kafka (stdout envelopes):

```bash
uv run aeropulse-connector
```

## OpenAPI

```bash
uv run python scripts/export_openapi.py
```

Writes `docs/openapi/openapi.v1.json`. Bruno collection: `bruno/aeropulse` (keep in sync with that spec).

## JWT

Use `AEROPULSE_JWT_SECRET` (≥ 32 bytes). See `.env.example`.
