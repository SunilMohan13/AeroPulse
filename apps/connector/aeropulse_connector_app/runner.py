"""Replay-mode connector runner used by tests and the connector process."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from aeropulse_common.ids import new_ulid
from aeropulse_common.topics import OBSERVATION_AQ, OBSERVATION_FIRE, OBSERVATION_WEATHER
from aeropulse_connector_cpcb import CpcbConnector
from aeropulse_connector_firms import FirmsConnector
from aeropulse_connector_imd import ImdConnector
from aeropulse_connector_sdk.contracts import FetchRequest
from aeropulse_contracts.envelope import KafkaEnvelope, ProcessingMode
from aeropulse_contracts.fire import FireObservation
from aeropulse_contracts.meteo import MeteorologicalObservation
from aeropulse_contracts.observation import Observation
from aeropulse_observability.logging import get_logger

logger = get_logger("aeropulse.connector")

PublishFn = Callable[[str, KafkaEnvelope], None]


def replay_all(
    fixtures_root: Path,
    publish: PublishFn,
    *,
    processing_mode: ProcessingMode = ProcessingMode.BACKFILL,
) -> dict[str, int]:
    """Run CPCB, FIRMS, and IMD replay connectors and publish envelopes.

    Args:
        fixtures_root: Directory containing ``cpcb/stations.json`` etc.
        publish: Callback ``(topic, envelope)``.
        processing_mode: LIVE or BACKFILL.

    Returns:
        Counts of published observations per source.
    """
    request = FetchRequest(processing_mode=processing_mode.value)
    counts = {"cpcb": 0, "firms": 0, "imd": 0}

    cpcb = CpcbConnector(fixtures_root / "cpcb" / "stations.json")
    for raw in cpcb.fetch(request):
        for obs in cpcb.normalize(raw):
            _publish_observation(publish, OBSERVATION_AQ, obs, processing_mode)
            counts["cpcb"] += 1

    firms = FirmsConnector(fixtures_root / "firms" / "fires.json")
    for raw in firms.fetch(request):
        for obs in firms.normalize(raw):
            _publish_observation(publish, OBSERVATION_FIRE, obs, processing_mode)
            counts["firms"] += 1

    imd = ImdConnector(fixtures_root / "imd" / "weather.json")
    for raw in imd.fetch(request):
        for obs in imd.normalize(raw):
            _publish_observation(publish, OBSERVATION_WEATHER, obs, processing_mode)
            counts["imd"] += 1

    logger.info("connector.replay.completed", **counts)
    return counts


def _publish_observation(
    publish: PublishFn,
    topic: str,
    obs: Observation | FireObservation | MeteorologicalObservation,
    mode: ProcessingMode,
) -> None:
    envelope = KafkaEnvelope(
        correlation_id=new_ulid("corr"),
        source_id=obs.source_id,
        processing_mode=mode,
        produced_at=datetime.now(UTC),
        payload=obs.model_dump(mode="json"),
    )
    publish(topic, envelope)
