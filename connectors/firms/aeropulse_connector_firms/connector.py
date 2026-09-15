"""FIRMS connector: maps VIIRS fire detections to fire_observation.v1."""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from datetime import UTC, datetime
from pathlib import Path

from aeropulse_common.ids import new_ulid
from aeropulse_connector_sdk.base import DataConnector
from aeropulse_connector_sdk.checkpoint import apply_cursor
from aeropulse_connector_sdk.contracts import (
    ConnectorMetadata,
    FetchRequest,
    HealthStatus,
    RawRecord,
    SourceAsset,
)
from aeropulse_connector_sdk.testing import load_fixture, load_yaml_metadata
from aeropulse_contracts.fire import FireObservation, FireProperties
from aeropulse_contracts.observation import Location, Provenance, Quality

_PACKAGE_DIR = Path(__file__).resolve().parent
_METADATA = load_yaml_metadata(_PACKAGE_DIR / "metadata.yaml")


def _confidence_to_unit(raw: object) -> float:
    if isinstance(raw, (int, float)):
        value = float(raw)
        return value / 100.0 if value > 1 else value
    mapping = {"l": 0.3, "n": 0.6, "h": 0.9, "low": 0.3, "nominal": 0.6, "high": 0.9}
    return mapping.get(str(raw).lower(), 0.5)


class FirmsConnector(DataConnector):
    """Reads FIRMS-like fire detection payloads from fixtures or live JSON."""

    def __init__(self, fixture_path: Path | None = None) -> None:
        self.fixture_path = fixture_path

    def metadata(self) -> ConnectorMetadata:
        """Return FIRMS connector metadata."""
        return _METADATA

    def discover(self) -> list[SourceAsset]:
        """FIRMS has a single virtual asset (VIIRS detections)."""
        return [SourceAsset(asset_id="viirs", name="VIIRS active fire")]

    def fetch(self, request: FetchRequest) -> Iterator[RawRecord]:
        """Yield one raw record per fire detection in the fixture."""
        if not self.fixture_path:
            return
        payload = load_fixture(self.fixture_path)
        fetched_at = datetime.now(UTC)
        for idx, fire in enumerate(apply_cursor(payload.get("fires", []), request.cursor)):
            yield RawRecord(
                source_id="firms",
                source_record_id=str(fire.get("id", f"fire_{idx}")),
                payload=fire,
                fetched_at=fetched_at,
            )

    def normalize(self, record: RawRecord) -> Sequence[FireObservation]:
        """Map a FIRMS detection to a canonical fire observation."""
        fire = record.payload
        observed_at = datetime.fromisoformat(str(fire["observed_at"]).replace("Z", "+00:00"))
        return [
            FireObservation(
                observation_id=new_ulid("fire"),
                source_id="firms",
                source_record_id=record.source_record_id,
                observed_at=observed_at,
                received_at=record.fetched_at,
                location=Location(lat=float(fire["lat"]), lon=float(fire["lon"])),
                fire=FireProperties(
                    frp=float(fire["frp"]),
                    confidence=_confidence_to_unit(fire.get("confidence", 0.5)),
                    sensor=str(fire.get("sensor", "VIIRS")),
                ),
                quality=Quality(quality_flag="valid", quality_score=1.0),
                provenance=Provenance(
                    provider="NASA",
                    connector_version=_METADATA.version,
                    raw_object_uri=record.raw_uri,
                ),
            )
        ]

    def health_check(self) -> HealthStatus:
        """Replay connector is healthy when a fixture path is configured."""
        return HealthStatus(
            connector_id=_METADATA.connector_id,
            healthy=self.fixture_path is not None and self.fixture_path.exists(),
            message="replay" if self.fixture_path else "no fixture",
            checked_at=datetime.now(UTC),
        )
