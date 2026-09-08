"""Connector process entrypoint."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from aeropulse_common.settings import get_settings
from aeropulse_contracts.envelope import KafkaEnvelope
from aeropulse_observability.logging import configure_logging, get_logger
from aeropulse_observability.telemetry import configure_telemetry

from aeropulse_connector_app.runner import replay_all

logger = get_logger("aeropulse.connector")


def _stdout_publish(topic: str, envelope: KafkaEnvelope) -> None:
    logger.info(
        "connector.published",
        kafka_topic=topic,
        source_id=envelope.source_id,
        correlation_id=envelope.correlation_id,
    )
    print(json.dumps({"topic": topic, "envelope": envelope.model_dump(mode="json")}))


async def _publish_kafka(bootstrap: str, fixtures: Path) -> dict[str, int]:
    from aiokafka import AIOKafkaProducer

    producer = AIOKafkaProducer(
        bootstrap_servers=bootstrap,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        acks="all",
    )
    await producer.start()
    pending: list[tuple[str, KafkaEnvelope]] = []

    def capture(topic: str, envelope: KafkaEnvelope) -> None:
        pending.append((topic, envelope))

    try:
        counts = replay_all(fixtures, capture)
        for topic, envelope in pending:
            await producer.send_and_wait(topic, envelope.model_dump(mode="json"))
            logger.info(
                "connector.published",
                kafka_topic=topic,
                source_id=envelope.source_id,
                correlation_id=envelope.correlation_id,
            )
        return counts
    finally:
        await producer.stop()


def main() -> None:
    """Run one replay cycle and publish to Kafka when the broker is reachable."""
    settings = get_settings()
    settings.service_name = "aeropulse-connector"  # type: ignore[misc]
    configure_logging(settings)
    configure_telemetry(settings)
    root = Path("/app") if Path("/app/fixtures").exists() else Path.cwd()
    fixtures = root / "fixtures"

    try:
        counts = asyncio.run(_publish_kafka(settings.kafka_bootstrap_servers, fixtures))
    except Exception:
        logger.exception("connector.kafka.unavailable")
        counts = replay_all(fixtures, _stdout_publish)
    logger.info("connector.cycle.done", **counts)


if __name__ == "__main__":
    main()
