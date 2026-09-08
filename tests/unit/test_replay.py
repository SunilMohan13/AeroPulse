"""Replay runner publishes canonical envelopes for all three sources."""

from pathlib import Path

from aeropulse_connector_app.runner import replay_all
from aeropulse_contracts.envelope import KafkaEnvelope, ProcessingMode


def test_replay_all_counts() -> None:
    published: list[tuple[str, KafkaEnvelope]] = []

    def capture(topic: str, envelope: KafkaEnvelope) -> None:
        published.append((topic, envelope))

    counts = replay_all(Path("fixtures"), capture)
    assert counts["cpcb"] == 8  # 6 pollutants + 2 pollutants
    assert counts["firms"] == 2
    assert counts["imd"] == 2
    assert counts["sentinel5p"] == 1
    assert counts["modis"] == 1
    assert counts["cams"] == 1
    assert counts["insat"] == 1
    assert counts["bhuvan"] == 1
    assert counts["icar"] == 1
    assert counts["industry"] == 1
    assert counts["osm"] == 1
    assert all(e.processing_mode == ProcessingMode.BACKFILL for _, e in published)
