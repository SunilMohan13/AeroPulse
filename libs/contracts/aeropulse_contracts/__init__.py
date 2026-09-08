"""Versioned canonical contracts independent of source-specific payloads."""

from aeropulse_contracts.envelope import KafkaEnvelope, ProcessingMode
from aeropulse_contracts.event import (
    EventConfidence,
    EventEvidence,
    EventSeverity,
    EventStatus,
    PollutionEvent,
)
from aeropulse_contracts.feature import GridFeature, SourceLikelihood
from aeropulse_contracts.fire import FireObservation, FireProperties
from aeropulse_contracts.meteo import MeteorologicalObservation
from aeropulse_contracts.observation import (
    Location,
    Measurement,
    Observation,
    Provenance,
    Quality,
)
from aeropulse_contracts.prediction import AnomalyResult, GridPrediction
from aeropulse_contracts.raster import RasterObservation

__all__ = [
    "AnomalyResult",
    "EventConfidence",
    "EventEvidence",
    "EventSeverity",
    "EventStatus",
    "FireObservation",
    "FireProperties",
    "GridFeature",
    "GridPrediction",
    "KafkaEnvelope",
    "Location",
    "Measurement",
    "MeteorologicalObservation",
    "Observation",
    "PollutionEvent",
    "ProcessingMode",
    "Provenance",
    "Quality",
    "RasterObservation",
    "SourceLikelihood",
]
