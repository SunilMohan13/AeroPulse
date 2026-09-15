"""Replay runner publishes canonical envelopes for all three sources."""

from pathlib import Path

import pytest
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


def test_replay_all_respects_sources_yaml_missing_file(tmp_path: Path) -> None:
    """A missing/unreadable registry must not silently stop ingestion."""
    published: list[tuple[str, KafkaEnvelope]] = []
    counts = replay_all(
        Path("fixtures"),
        lambda topic, env: published.append((topic, env)),
        sources_config=tmp_path / "does-not-exist.yaml",
    )
    assert counts["cpcb"] == 8
    assert counts["osm"] == 1


def test_replay_all_disables_source_via_config(tmp_path: Path) -> None:
    """`config/sources.yaml` is now load-bearing: disabling a source skips it."""
    config = tmp_path / "sources.yaml"
    config.write_text(
        "sources:\n"
        "  - {id: cpcb, enabled: true}\n"
        "  - {id: firms, enabled: false}\n"
        "  - {id: imd, enabled: true}\n"
        "  - {id: sentinel5p, enabled: true}\n"
        "  - {id: modis, enabled: true}\n"
        "  - {id: cams, enabled: true}\n"
        "  - {id: insat, enabled: true}\n"
        "  - {id: bhuvan, enabled: true}\n"
        "  - {id: icar, enabled: true}\n"
        "  - {id: industry, enabled: true}\n"
        "  - {id: osm, enabled: true}\n"
    )
    counts = replay_all(Path("fixtures"), lambda topic, env: None, sources_config=config)
    assert counts["firms"] == 0
    assert counts["cpcb"] == 8


def test_replay_all_updates_checkpoint_cursor(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []

    class FakeRepo:
        def get_checkpoint(self, source_id: str) -> str | None:
            return "2" if source_id == "cpcb" else None

        def upsert_checkpoint(self, source_id: str, cursor: str) -> None:
            calls.append((source_id, cursor))

    monkeypatch.setattr("aeropulse_connector_app.runner._checkpoint_repository", lambda: FakeRepo())

    def fake_replay_cpcb(fixtures_root: Path, request, publish, mode):
        assert request.cursor == "2"
        return 3

    monkeypatch.setattr("aeropulse_connector_app.runner._replay_cpcb", fake_replay_cpcb)
    monkeypatch.setattr(
        "aeropulse_connector_app.runner._run_connector",
        lambda connector, request, publish, topic, mode: 0,
    )

    counts = replay_all(Path("fixtures"), lambda topic, env: None)

    assert counts["cpcb"] == 3
    assert ("cpcb", "5") in calls
    assert calls[0] == ("cpcb", "5")


@pytest.mark.parametrize("bad_content", ["not: a: list", "sources: not-a-list"])
def test_replay_all_falls_back_when_config_malformed(tmp_path: Path, bad_content: str) -> None:
    config = tmp_path / "sources.yaml"
    config.write_text(bad_content)
    counts = replay_all(Path("fixtures"), lambda topic, env: None, sources_config=config)
    assert counts["cpcb"] == 8
