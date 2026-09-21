"""Scheduled drift monitor behavior tests."""

from datetime import UTC, datetime

from aeropulse_api.drift_monitor import monitor_once
from aeropulse_common.settings import Settings


class _Reader:
    def values(self, signal, start, end, grid_id, model_version, limit):
        values = range(100) if start.day < 14 else range(100, 200)
        return [float(value) for value in values]


def test_monitor_once_reports_actionable_drift_for_each_signal() -> None:
    settings = Settings(drift_monitor_reference_hours=168, drift_monitor_current_hours=24)

    results = monitor_once(_Reader(), settings, datetime(2026, 9, 15, tzinfo=UTC))

    assert len(results) == 11
    assert {result["status"] for result in results} == {"DRIFT"}
    assert all(result["reference_n"] == 100 and result["current_n"] == 100 for result in results)
