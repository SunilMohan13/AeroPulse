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
    assert all(e.processing_mode == ProcessingMode.BACKFILL for _, e in published)
