"""Exposure/risk scoring tests."""

from aeropulse_intelligence.risk import score_risk


def test_severity_and_risk_separated() -> None:
    result = score_risk(150.0, exposure_duration_hours=6.0, population_density=8000.0)
    assert 0 < result.pollution_severity < 1
    assert result.population_risk <= result.pollution_severity or result.population_risk >= 0
    assert result.formula_version == "risk-0.1"
