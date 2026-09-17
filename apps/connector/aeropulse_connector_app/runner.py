"""Replay-mode connector runner used by tests and the connector process."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
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
DEFAULT_SOURCES_CONFIG = Path("config/sources.yaml")


def _decode_cursor(cursor: str | None) -> int:
    """Return a non-negative integer offset for a checkpoint cursor."""
    if cursor in (None, ""):
        return 0
    try:
        value = int(cursor)
    except (TypeError, ValueError):
        return 0
    return max(0, value)


def _next_cursor(cursor: str | None, records_emitted: int) -> str:
    """Advance the checkpoint by the number of records processed."""
    return str(_decode_cursor(cursor) + max(0, records_emitted))


def _checkpoint_repository() -> Any | None:
    """Return the Timescale-backed checkpoint repository when the DB is configured."""
    from aeropulse_common.settings import get_settings

    settings = get_settings()
    if not settings.database_url:
        return None
    try:
        import psycopg
        from aeropulse_worker.db import TimescaleRepository

        return TimescaleRepository(psycopg.connect(settings.database_url))
    except Exception:
        logger.warning("connector.checkpoint.unavailable")
        return None


def _checkpoint_key(source_id: str, provider: str | None) -> str:
    """Construct a provider-aware checkpoint identity for a replay source."""
    if provider is None or provider == "":
        return source_id
    return f"{source_id}: {provider}"


def _checkpoint_cursor(repo: Any | None, source_id: str, provider: str | None) -> str | None:
    """Read the most recent checkpoint while remaining compatible with legacy source-only keys."""
    if repo is None:
        return None
    key = _checkpoint_key(source_id, provider)
    cursor = repo.get_checkpoint(key)
    if cursor is not None:
        return cursor
    if provider is not None:
        return repo.get_checkpoint(source_id)
    return None


def _persist_checkpoint(repo: Any | None, source_id: str, provider: str | None, cursor: str) -> None:
    """Persist the updated cursor using the provider-aware key."""
    if repo is None:
        return
    repo.upsert_checkpoint(_checkpoint_key(source_id, provider), cursor)


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


def _enabled_source_ids(config_path: Path) -> set[str] | None:
    """Read `config/sources.yaml` and return the set of enabled source ids.

    Returns ``None`` (meaning "treat everything as enabled") if the file is
    missing or malformed, so a misconfigured/absent registry never silently
    stops ingestion.
    """
    try:
        raw = yaml.safe_load(config_path.read_text())
    except (OSError, yaml.YAMLError) as exc:
        logger.warning("connector.sources_config.unreadable", path=str(config_path), error=str(exc))
        return None
    sources = (raw or {}).get("sources")
    if not isinstance(sources, list):
        logger.warning("connector.sources_config.invalid", path=str(config_path))
        return None
    return {
        s["id"] for s in sources if isinstance(s, dict) and s.get("enabled", True) and "id" in s
    }


def replay_all(
    fixtures_root: Path,
    publish: PublishFn,
    *,
    processing_mode: ProcessingMode = ProcessingMode.BACKFILL,
    sources_config: Path = DEFAULT_SOURCES_CONFIG,
) -> dict[str, int]:
    """Run all replay connectors and publish canonical envelopes.

    Args:
        fixtures_root: Directory containing per-source fixture folders.
        publish: Callback ``(topic, envelope)``.
        processing_mode: LIVE or BACKFILL.
        sources_config: Path to `config/sources.yaml`; a source id absent or
            marked ``enabled: false`` there is skipped (LLD §7.2).

    Returns:
        Counts of published observations per source (skipped sources read 0).
    """
    enabled = _enabled_source_ids(sources_config)
    repo = _checkpoint_repository()
    counts = dict.fromkeys(
        ["cpcb", "firms", "imd", *[key for key, _, _ in _RASTER_JOBS]],
        0,
    )

    if enabled is None or "cpcb" in enabled:
        connector = CpcbConnector(fixtures_root / "cpcb" / STATIONS_JSON)
        provider = connector.metadata().provider
        cursor = _checkpoint_cursor(repo, "cpcb", provider)
        request = FetchRequest(processing_mode=processing_mode.value, cursor=cursor, provider=provider)
        counts["cpcb"] = _replay_cpcb(fixtures_root, request, publish, processing_mode)
        _persist_checkpoint(repo, "cpcb", provider, _next_cursor(cursor, counts["cpcb"]))
    if enabled is None or "firms" in enabled:
        connector = FirmsConnector(fixtures_root / "firms" / "fires.json")
        provider = connector.metadata().provider
        cursor = _checkpoint_cursor(repo, "firms", provider)
        request = FetchRequest(processing_mode=processing_mode.value, cursor=cursor, provider=provider)
        counts["firms"] = _run_connector(
            connector,
            request,
            publish,
            OBSERVATION_FIRE,
            processing_mode,
        )
        _persist_checkpoint(repo, "firms", provider, _next_cursor(cursor, counts["firms"]))
    if enabled is None or "imd" in enabled:
        connector = ImdConnector(fixtures_root / "imd" / "weather.json")
        provider = connector.metadata().provider
        cursor = _checkpoint_cursor(repo, "imd", provider)
        request = FetchRequest(processing_mode=processing_mode.value, cursor=cursor, provider=provider)
        counts["imd"] = _run_connector(
            connector,
            request,
            publish,
            OBSERVATION_WEATHER,
            processing_mode,
        )
        _persist_checkpoint(repo, "imd", provider, _next_cursor(cursor, counts["imd"]))
    for key, cls, rel in _RASTER_JOBS:
        if enabled is not None and key not in enabled:
            continue
        connector = cls(fixtures_root / rel)
        provider = connector.metadata().provider
        cursor = _checkpoint_cursor(repo, key, provider)
        request = FetchRequest(processing_mode=processing_mode.value, cursor=cursor, provider=provider)
        counts[key] = _run_connector(
            connector,
            request,
            publish,
            OBSERVATION_RASTER,
            processing_mode,
        )
        _persist_checkpoint(repo, key, provider, _next_cursor(cursor, counts[key]))

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
