# Disaster recovery (development / MVP)

Compose is the runtime. Recovery is volume + replay, not a multi-region failover.

## Backups

- Timescale: named volume `timescale-data`
- Redpanda: `redpanda-data`
- MinIO: `minio-data`
- Redis is cache; it can be empty after restart

## Restore local demo

1. Recreate volumes if corrupted: `docker compose -f infrastructure/docker/compose.yaml down -v`
2. `docker compose -f infrastructure/docker/compose.yaml up --build`
3. Migrations 0001–0003 apply on empty Postgres
4. `uv run aeropulse-connector` to replay fixtures into Kafka/stdout

## Replay vs live

Default `AEROPULSE_CONNECTOR_MODE=replay`. Live HTTP is gated (`libs/connector_sdk/live_http.py`).

## Observability / graph / ML extras

```bash
docker compose -f infrastructure/docker/compose.yaml \
  -f infrastructure/docker/compose.observability.yaml --profile observability up
docker compose -f infrastructure/docker/compose.yaml \
  -f infrastructure/docker/compose.ml.yaml --profile ml --profile graph up
```
