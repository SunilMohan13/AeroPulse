"""In-memory processing pipeline used by the worker and unit tests.

Kafka I/O is thin in ``main.py``; this module is deterministic and side-effect
free except for the optional repository callbacks.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from aeropulse_common.hashing import dedup_key
from aeropulse_connector_sdk.quality import evaluate_observation
from aeropulse_contracts.fire import FireObservation
from aeropulse_contracts.meteo import MeteorologicalObservation
from aeropulse_contracts.observation import Observation
from aeropulse_contracts.raster import RasterObservation
from aeropulse_geospatial.grid import to_grid_id
from aeropulse_intelligence.detect import process_snapshot
from aeropulse_intelligence.engine import EventStore
from aeropulse_intelligence.snapshot import FeatureSnapshot
from aeropulse_observability.logging import get_logger

logger = get_logger("aeropulse.worker")


class ObservationRepository(Protocol):
    """Persistence port for normalized observations."""

    def upsert_air_quality(self, observation: Observation) -> bool:
        """Insert or ignore an air-quality row. Returns True if inserted."""
        ...

    def upsert_fire(self, observation: FireObservation) -> bool:
        """Insert or ignore a fire row. Returns True if inserted."""
        ...

    def upsert_weather(self, observation: MeteorologicalObservation) -> bool:
        """Insert or ignore a weather row. Returns True if inserted."""
        ...

    def record_dlq(self, source_id: str, payload: dict[str, Any], error: str) -> None:
        """Record a quality-rejected payload. Optional on implementations."""
        ...


class InMemoryRepository:
    """Test double that enforces dedup_key uniqueness."""

    def __init__(self) -> None:
        self.air_quality: dict[str, Observation] = {}
        self.fires: dict[str, FireObservation] = {}
        self.weather: dict[str, MeteorologicalObservation] = {}
        self.rasters: list[RasterObservation] = []
        self.dlq: list[dict[str, Any]] = []
        self.event_store = EventStore()

    def upsert_air_quality(self, observation: Observation) -> bool:
        """Store air quality if the dedup key is new."""
        key = observation.dedup_key or observation.observation_id
        if key in self.air_quality:
            return False
        self.air_quality[key] = observation
        return True

    def upsert_fire(self, observation: FireObservation) -> bool:
        """Store fire if the dedup key is new."""
        key = observation.dedup_key or observation.observation_id
        if key in self.fires:
            return False
        self.fires[key] = observation
        return True

    def upsert_weather(self, observation: MeteorologicalObservation) -> bool:
        """Store weather if the dedup key is new."""
        key = observation.dedup_key or observation.observation_id
        if key in self.weather:
            return False
        self.weather[key] = observation
        return True

    def record_dlq(self, source_id: str, payload: dict[str, Any], error: str) -> None:
        """Keep rejected payloads for operator replay."""
        self.dlq.append({"source_id": source_id, "error": error, "payload": payload})

    def add_raster(self, raster: RasterObservation) -> None:
        """Keep raster metadata in the snapshot."""
        self.rasters.append(raster)


def process_air_quality(
    observation: Observation,
    repository: ObservationRepository,
) -> dict[str, Any]:
    """Quality-score, grid-map, and persist an air-quality observation.

    Args:
        observation: Canonical observation.v1.
        repository: Persistence adapter.

    Returns:
        Result dict with ``status`` of ``persisted``, ``duplicate``, or ``rejected``.
    """
    qc = evaluate_observation(
        parameter=observation.measurement.parameter,
        value=observation.measurement.value,
        lat=observation.location.lat,
        lon=observation.location.lon,
        observed_at=observation.observed_at,
        received_at=observation.received_at,
    )
    observation.quality.quality_flag = qc.quality_flag
    observation.quality.quality_score = qc.quality_score
    if qc.quality_flag == "invalid":
        logger.warning(
            "quality.rejected",
            source_id=observation.source_id,
            reasons=qc.reasons,
        )
        if hasattr(repository, "record_dlq"):
            repository.record_dlq(
                observation.source_id,
                observation.model_dump(mode="json"),
                ",".join(qc.reasons),
            )
        return {"status": "rejected", "reasons": qc.reasons}

    observation.grid_id = to_grid_id(observation.location.lat, observation.location.lon)
    observation.dedup_key = dedup_key(
        observation.source_id,
        observation.source_record_id,
        _iso(observation.observed_at),
        observation.measurement.parameter,
    )
    inserted = repository.upsert_air_quality(observation)
    return {"status": "persisted" if inserted else "duplicate", "grid_id": observation.grid_id}


def process_fire(
    observation: FireObservation,
    repository: ObservationRepository,
) -> dict[str, Any]:
    """Grid-map and persist a fire observation."""
    qc = evaluate_observation(
        parameter="frp",
        value=observation.fire.frp,
        lat=observation.location.lat,
        lon=observation.location.lon,
        observed_at=observation.observed_at,
        received_at=observation.received_at,
    )
    observation.quality.quality_flag = qc.quality_flag
    observation.quality.quality_score = qc.quality_score
    if qc.quality_flag == "invalid":
        if hasattr(repository, "record_dlq"):
            repository.record_dlq(
                observation.source_id,
                observation.model_dump(mode="json"),
                ",".join(qc.reasons),
            )
        return {"status": "rejected", "reasons": qc.reasons}
    observation.grid_id = to_grid_id(observation.location.lat, observation.location.lon)
    observation.dedup_key = dedup_key(
        observation.source_id,
        observation.source_record_id,
        _iso(observation.observed_at),
        "frp",
    )
    inserted = repository.upsert_fire(observation)
    return {"status": "persisted" if inserted else "duplicate", "grid_id": observation.grid_id}


def process_weather(
    observation: MeteorologicalObservation,
    repository: ObservationRepository,
) -> dict[str, Any]:
    """Grid-map and persist a meteorological observation."""
    humidity = observation.humidity if observation.humidity is not None else 50.0
    qc = evaluate_observation(
        parameter="humidity" if observation.humidity is not None else "weather",
        value=humidity,
        lat=observation.location.lat,
        lon=observation.location.lon,
        observed_at=observation.observed_at,
        received_at=observation.received_at,
    )
    observation.quality.quality_flag = qc.quality_flag
    observation.quality.quality_score = qc.quality_score
    if qc.quality_flag == "invalid":
        if hasattr(repository, "record_dlq"):
            repository.record_dlq(
                observation.source_id,
                observation.model_dump(mode="json"),
                ",".join(qc.reasons),
            )
        return {"status": "rejected", "reasons": qc.reasons}
    observation.grid_id = to_grid_id(observation.location.lat, observation.location.lon)
    observation.dedup_key = dedup_key(
        observation.source_id,
        observation.source_record_id,
        _iso(observation.observed_at),
        "weather",
    )
    inserted = repository.upsert_weather(observation)
    return {"status": "persisted" if inserted else "duplicate", "grid_id": observation.grid_id}


def run_detection(repository: InMemoryRepository) -> dict[str, Any]:
    """Materialize features and evaluate events from persisted observations."""
    snapshot = FeatureSnapshot(
        air_quality=list(repository.air_quality.values()),
        fires=list(repository.fires.values()),
        weather=list(repository.weather.values()),
        rasters=list(getattr(repository, "rasters", [])),
    )
    events = process_snapshot(snapshot, repository.event_store)
    return {
        "events": len(events),
        "open": len(repository.event_store.open_by_grid),
        "event_ids": [e.event_id for e in events],
    }


def _iso(value: datetime) -> str:
    return value.isoformat()
