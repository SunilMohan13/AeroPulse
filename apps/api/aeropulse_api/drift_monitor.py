"""Periodic feature and prediction distribution drift monitor."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any

from aeropulse_common.settings import Settings, get_settings
from aeropulse_ml.drift import distribution_drift
from aeropulse_observability.logging import configure_logging, get_logger

from aeropulse_api.drift_store import DRIFT_SIGNALS, DriftReader, TimescaleDriftReader

logger = get_logger("aeropulse.drift_monitor")


def monitor_once(
    reader: DriftReader, settings: Settings, now: datetime | None = None
) -> list[dict[str, Any]]:
    """Evaluate every supported signal and log actionable distribution shifts."""
    current_end = now or datetime.now(UTC)
    current_start = current_end - timedelta(hours=settings.drift_monitor_current_hours)
    reference_end = current_start
    reference_start = reference_end - timedelta(hours=settings.drift_monitor_reference_hours)
    results: list[dict[str, Any]] = []
    for signal in DRIFT_SIGNALS:
        reference = reader.values(
            signal, reference_start, reference_end, None, None, settings.drift_monitor_max_samples
        )
        current = reader.values(
            signal, current_start, current_end, None, None, settings.drift_monitor_max_samples
        )
        result = distribution_drift(
            reference, current, min_samples=settings.drift_monitor_min_samples
        )
        record = {"signal": signal, "status": result["status"], **result}
        results.append(record)
        if result["status"] in {"WARNING", "DRIFT"}:
            logger.warning("drift.monitor.alert", **record)
        elif result["status"] == "INSUFFICIENT_DATA":
            logger.info("drift.monitor.insufficient_data", **record)
        else:
            logger.info("drift.monitor.stable", **record)
    return results


def main() -> None:
    """Run drift scans at the configured interval while the process is alive."""
    settings = get_settings()
    settings.service_name = "aeropulse-drift-monitor"  # type: ignore[misc]
    configure_logging(settings)
    if not settings.database_url:
        logger.error("drift.monitor.database_not_configured")
        return
    while True:
        try:
            import psycopg

            with psycopg.connect(settings.database_url) as connection:
                monitor_once(TimescaleDriftReader(connection), settings)
        except Exception:
            logger.exception("drift.monitor.failed")
        time.sleep(settings.drift_monitor_interval_seconds)
