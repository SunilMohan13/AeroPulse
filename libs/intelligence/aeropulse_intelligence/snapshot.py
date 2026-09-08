"""In-memory observation snapshot used to build grid features without a database."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from aeropulse_contracts.fire import FireObservation
from aeropulse_contracts.meteo import MeteorologicalObservation
from aeropulse_contracts.observation import Observation


@dataclass
class FeatureSnapshot:
    """Point-in-time observations available to ``build_features``."""

    air_quality: list[Observation] = field(default_factory=list)
    fires: list[FireObservation] = field(default_factory=list)
    weather: list[MeteorologicalObservation] = field(default_factory=list)
    generated_at: datetime | None = None
