"""Replay-mode connector runner used by tests and the connector process."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from aeropulse_common.ids import new_ulid
from aeropulse_common.objects import put_raw_json
from aeropulse_common.topics import (
    OBSERVATION_AQ,
    OBSERVATION_FIRE,
    OBSERVATION_RASTER,
    OBSERVATION_WEATHER,
)
from aeropulse_connector_bhuvan import BhuvanConnector
from aeropulse_connector_cams import CamsConnector
from aeropulse_connector_cpcb import CpcbConnector
from aeropulse_connector_firms import FirmsConnector
from aeropulse_connector_icar import IcarConnector
from aeropulse_connector_imd import ImdConnector
from aeropulse_connector_industry import IndustryConnector
from aeropulse_connector_insat import InsatConnector
from aeropulse_connector_modis import ModisConnector
from aeropulse_connector_osm import OsmConnector
from aeropulse_connector_sdk.contracts import FetchRequest
from aeropulse_connector_sentinel5p import Sentinel5PConnector
from aeropulse_contracts.envelope import KafkaEnvelope, ProcessingMode
from aeropulse_contracts.fire import FireObservation
from aeropulse_contracts.meteo import MeteorologicalObservation
from aeropulse_contracts.observation import Observation
from aeropulse_contracts.raster import RasterObservation
from aeropulse_observability.logging import get_logger

logger = get_logger("aeropulse.connector")

PublishFn = Callable[[str, KafkaEnvelope], None]
STATIONS_JSON = "stations.json"
PRODUCTS_JSON = "products.json"
ASSETS_JSON = "assets.json"

_RASTER_JOBS: list[tuple[str, Any, str]] = [
    ("sentinel5p", Sentinel5PConnector, f"sentinel5p/{PRODUCTS_JSON}"),
    ("modis", ModisConnector, f"modis/{PRODUCTS_JSON}"),
    ("cams", CamsConnector, f"cams/{PRODUCTS_JSON}"),
    ("insat", InsatConnector, f"insat/{ASSETS_JSON}"),
    ("bhuvan", BhuvanConnector, f"bhuvan/{ASSETS_JSON}"),
    ("icar", IcarConnector, f"icar/{ASSETS_JSON}"),
    ("industry", IndustryConnector, f"industry/{ASSETS_JSON}"),
    ("osm", OsmConnector, f"osm/{ASSETS_JSON}"),
]


def replay_all(
    fixtures_root: Path,
    publish: PublishFn,
    *,
    processing_mode: ProcessingMode = ProcessingMode.BACKFILL,
) -> dict[str, int]:
    """Run all replay connectors and publish canonical envelopes.

    Args:
        fixtures_root: Directory containing per-source fixture folders.
        publish: Callback ``(topic, envelope)``.
        processing_mode: LIVE or BACKFILL.

    Returns:
        Counts of published observations per source.
    """
    request = FetchRequest(processing_mode=processing_mode.value)
    counts = dict.fromkeys(
        ["cpcb", "firms", "imd", *[key for key, _, _ in _RASTER_JOBS]],
        0,
    )

    counts["cpcb"] = _replay_cpcb(fixtures_root, request, publish, processing_mode)
    counts["firms"] = _run_connector(
        FirmsConnector(fixtures_root / "firms" / "fires.json"),
        request,
        publish,
        OBSERVATION_FIRE,
        processing_mode,
    )
    counts["imd"] = _run_connector(
        ImdConnector(fixtures_root / "imd" / "weather.json"),
        request,
        publish,
        OBSERVATION_WEATHER,
        processing_mode,
    )
    for key, cls, rel in _RASTER_JOBS:
        counts[key] = _run_connector(
            cls(fixtures_root / rel),
            request,
            publish,
            OBSERVATION_RASTER,
            processing_mode,
        )

    logger.info("connector.replay.completed", **counts)
    return counts


def _replay_cpcb(
    fixtures_root: Path,
    request: FetchRequest,
    publish: PublishFn,
    mode: ProcessingMode,
) -> int:
    path = fixtures_root / "cpcb" / STATIONS_JSON
    connector = CpcbConnector(path)
    uri = put_raw_json("cpcb", STATIONS_JSON, path.read_bytes()) if path.exists() else None
    n = 0
    for raw in connector.fetch(request):
        raw.raw_uri = uri
        for obs in connector.normalize(raw):
            if uri:
                obs.provenance.raw_object_uri = uri
            _publish_observation(publish, OBSERVATION_AQ, obs, mode)
            n += 1
    return n


def _run_connector(
    connector: Any,
    request: FetchRequest,
    publish: PublishFn,
    topic: str,
    mode: ProcessingMode,
) -> int:
    n = 0
    for raw in connector.fetch(request):
        for obs in connector.normalize(raw):
            _publish_observation(publish, topic, obs, mode)
            n += 1
    return n


def _publish_observation(
    publish: PublishFn,
    topic: str,
    obs: Observation | FireObservation | MeteorologicalObservation | RasterObservation,
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
