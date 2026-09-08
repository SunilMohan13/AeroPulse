"""Worker entrypoint: consume Kafka envelopes and persist observations.

When Kafka is unavailable the process still starts and logs readiness failures.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from aeropulse_common.settings import get_settings
from aeropulse_common.topics import (
    OBSERVATION_AQ,
    OBSERVATION_FIRE,
    OBSERVATION_RASTER,
    OBSERVATION_WEATHER,
)
from aeropulse_contracts.fire import FireObservation
from aeropulse_contracts.meteo import MeteorologicalObservation
from aeropulse_contracts.observation import Observation
from aeropulse_contracts.raster import RasterObservation
from aeropulse_observability.logging import bind_context, configure_logging, get_logger
from aeropulse_observability.telemetry import configure_telemetry

from aeropulse_worker.pipeline import (
    InMemoryRepository,
    ObservationRepository,
    process_air_quality,
    process_fire,
    process_weather,
    run_detection,
)

logger = get_logger("aeropulse.worker")


def _repository() -> ObservationRepository:
    """Prefer Timescale; fall back to in-memory if the database is down."""
    settings = get_settings()
    try:
        import psycopg

        from aeropulse_worker.db import TimescaleRepository

        if not settings.database_url:
            return InMemoryRepository()
        conn = psycopg.connect(settings.database_url)
        logger.info("worker.db.connected")
        return TimescaleRepository(conn)
    except Exception:
        logger.exception("worker.db.unavailable")
        return InMemoryRepository()


async def _run() -> None:
    settings = get_settings()
    settings.service_name = "aeropulse-worker"  # type: ignore[misc]
    configure_logging(settings)
    configure_telemetry(settings)
    logger.info("worker.starting", kafka=settings.kafka_bootstrap_servers)
    persist = _repository()
    snapshot_repo = persist if isinstance(persist, InMemoryRepository) else InMemoryRepository()

    try:
        from aiokafka import AIOKafkaConsumer
    except ImportError:
        logger.error("worker.aiokafka_missing")
        return

    consumer = AIOKafkaConsumer(
        OBSERVATION_AQ,
        OBSERVATION_FIRE,
        OBSERVATION_WEATHER,
        OBSERVATION_RASTER,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id="aeropulse-worker",
        enable_auto_commit=True,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    await consumer.start()
    logger.info("worker.consuming")
    try:
        async for msg in consumer:
            if not isinstance(msg.value, dict):
                continue
            _handle(msg.topic, msg.value, persist, snapshot_repo)
    finally:
        await consumer.stop()


def _handle(
    topic: str,
    value: dict[str, Any],
    persist: ObservationRepository,
    snapshot_repo: InMemoryRepository,
) -> None:
    correlation = value.get("correlation_id", "")
    bind_context(**{"correlation.id": correlation})
    payload = value.get("payload") or value
    try:
        dual = persist is not snapshot_repo
        if topic == OBSERVATION_AQ:
            obs = Observation.model_validate(payload)
            result = process_air_quality(obs, persist)
            if dual:
                process_air_quality(obs, snapshot_repo)
        elif topic == OBSERVATION_FIRE:
            obs_f = FireObservation.model_validate(payload)
            result = process_fire(obs_f, persist)
            if dual:
                process_fire(obs_f, snapshot_repo)
        elif topic == OBSERVATION_RASTER:
            raster = RasterObservation.model_validate(payload)
            snapshot_repo.add_raster(raster)
            result = {"status": "persisted", "grid_id": None}
        else:
            obs_w = MeteorologicalObservation.model_validate(payload)
            result = process_weather(obs_w, persist)
            if dual:
                process_weather(obs_w, snapshot_repo)
        logger.info("worker.processed", topic=topic, status=result["status"])
        if result.get("status") == "persisted":
            detection = run_detection(snapshot_repo)
            logger.info("worker.detection", **detection)
            _persist_intelligence(persist, snapshot_repo)
    except Exception:
        logger.exception("worker.failed", topic=topic)


def _persist_intelligence(persist: ObservationRepository, snapshot: InMemoryRepository) -> None:
    """Best-effort Timescale write for events, graphs, forecasts, features, and health."""
    writer = getattr(persist, "upsert_event", None)
    if writer is None:
        return
    store = snapshot.event_store
    try:
        for event in store.events.values():
            persist.upsert_event(event)  # type: ignore[attr-defined]
            persist.insert_evidence(event.event_id, store.evidence.get(event.event_id, []))  # type: ignore[attr-defined]
            graph = store.graphs.get(event.event_id)
            if graph is not None:
                persist.insert_graph(graph)  # type: ignore[attr-defined]
            forecast = store.forecasts.get(event.event_id)
            if forecast is not None:
                persist.insert_forecast(forecast)  # type: ignore[attr-defined]
        if hasattr(persist, "upsert_grid_feature"):
            for feature in store.latest_features.values():
                persist.upsert_grid_feature(feature)  # type: ignore[attr-defined]
        if hasattr(persist, "upsert_grid_prediction"):
            for prediction in store.latest_predictions.values():
                persist.upsert_grid_prediction(prediction)  # type: ignore[attr-defined]
        if hasattr(persist, "upsert_source_health"):
            persist.upsert_source_health("cpcb", len(snapshot.air_quality))  # type: ignore[attr-defined]
    except Exception:
        logger.exception("worker.intelligence_persist_failed")


def main() -> None:
    """CLI entrypoint."""
    asyncio.run(_run())


if __name__ == "__main__":
    main()
