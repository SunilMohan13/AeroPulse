"""Data quality engine tests (LLD §16)."""

from datetime import UTC, datetime, timedelta

from aeropulse_connector_sdk.quality import evaluate_observation

NOW = datetime(2026, 9, 8, 5, 20, tzinfo=UTC)
OBS = datetime(2026, 9, 8, 5, 15, tzinfo=UTC)


def test_valid_pm25() -> None:
    result = evaluate_observation(
        parameter="pm25",
        value=142.3,
        lat=28.6,
        lon=77.2,
        observed_at=OBS,
        received_at=NOW,
    )
    assert result.quality_flag == "valid"
    assert result.quality_score > 0.7


def test_negative_pm25_invalid() -> None:
    result = evaluate_observation(
        parameter="pm25",
        value=-1.0,
        lat=28.6,
        lon=77.2,
        observed_at=OBS,
        received_at=NOW,
    )
    assert result.quality_flag == "invalid"
    assert "negative_concentration" in result.reasons


def test_invalid_latitude() -> None:
    result = evaluate_observation(
        parameter="pm25",
        value=10.0,
        lat=120.0,
        lon=77.2,
        observed_at=OBS,
        received_at=NOW,
    )
    assert result.quality_flag == "invalid"
    assert "invalid_coordinates" in result.reasons


def test_future_timestamp_invalid() -> None:
    result = evaluate_observation(
        parameter="pm25",
        value=10.0,
        lat=28.6,
        lon=77.2,
        observed_at=NOW + timedelta(hours=2),
        received_at=NOW,
    )
    assert result.quality_flag == "invalid"
    assert "future_timestamp" in result.reasons


def test_humidity_out_of_range() -> None:
    result = evaluate_observation(
        parameter="humidity",
        value=140.0,
        lat=28.6,
        lon=77.2,
        observed_at=OBS,
        received_at=NOW,
    )
    assert result.quality_flag == "invalid"
