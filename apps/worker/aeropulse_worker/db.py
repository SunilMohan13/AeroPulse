"""Timescale persistence for observations, events, forecasts, and lineage."""

from __future__ import annotations

import json
from typing import Any

from aeropulse_contracts.event import EventEvidence, PollutionEvent
from aeropulse_contracts.fire import FireObservation
from aeropulse_contracts.forecast import ForecastResult
from aeropulse_contracts.lineage import EvidenceGraph
from aeropulse_contracts.meteo import MeteorologicalObservation
from aeropulse_contracts.observation import Observation

UPSERT_AQ = """
INSERT INTO air_quality_observation (
    time, observation_id, source_id, source_record_id, station_id, grid_id,
    parameter, value, unit, quality_flag, quality_score, latitude, longitude,
    raw_uri, dedup_key
) VALUES (
    %(time)s, %(observation_id)s, %(source_id)s, %(source_record_id)s, %(station_id)s,
    %(grid_id)s, %(parameter)s, %(value)s, %(unit)s, %(quality_flag)s, %(quality_score)s,
    %(latitude)s, %(longitude)s, %(raw_uri)s, %(dedup_key)s
)
ON CONFLICT (dedup_key, time) DO NOTHING
"""

UPSERT_FIRE = """
INSERT INTO fire_observation (
    time, observation_id, source_id, source_record_id, grid_id, frp, confidence,
    sensor, quality_score, latitude, longitude, raw_uri, dedup_key
) VALUES (
    %(time)s, %(observation_id)s, %(source_id)s, %(source_record_id)s, %(grid_id)s,
    %(frp)s, %(confidence)s, %(sensor)s, %(quality_score)s, %(latitude)s, %(longitude)s,
    %(raw_uri)s, %(dedup_key)s
)
ON CONFLICT (dedup_key, time) DO NOTHING
"""

UPSERT_WX = """
INSERT INTO weather_observation (
    time, observation_id, source_id, source_record_id, grid_id, wind_u, wind_v,
    temperature, humidity, pressure, boundary_layer_height, quality_score,
    latitude, longitude, raw_uri, dedup_key
) VALUES (
    %(time)s, %(observation_id)s, %(source_id)s, %(source_record_id)s, %(grid_id)s,
    %(wind_u)s, %(wind_v)s, %(temperature)s, %(humidity)s, %(pressure)s,
    %(boundary_layer_height)s, %(quality_score)s, %(latitude)s, %(longitude)s,
    %(raw_uri)s, %(dedup_key)s
)
ON CONFLICT (dedup_key, time) DO NOTHING
"""

UPSERT_EVENT = """
INSERT INTO pollution_event (
    event_id, event_type, status, severity, created_at, updated_at, geometry,
    grid_ids, pollutants, detection_confidence, source_confidence,
    forecast_confidence, impact_confidence, overall_confidence, evidence_ids,
    model_versions, feature_version, evidence_freshness, sensor_coverage, payload
) VALUES (
    %(event_id)s, %(event_type)s, %(status)s, %(severity)s, %(created_at)s,
    %(updated_at)s, %(geometry)s, %(grid_ids)s, %(pollutants)s,
    %(detection_confidence)s, %(source_confidence)s, %(forecast_confidence)s,
    %(impact_confidence)s, %(overall_confidence)s, %(evidence_ids)s,
    %(model_versions)s, %(feature_version)s, %(evidence_freshness)s,
    %(sensor_coverage)s, %(payload)s::jsonb
)
ON CONFLICT (event_id) DO UPDATE SET
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at,
    payload = EXCLUDED.payload
"""


class TimescaleRepository:
    """psycopg-backed observation and intelligence repository."""

    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def upsert_air_quality(self, observation: Observation) -> bool:
        """Insert air quality; return False on duplicate key."""
        with self.conn.cursor() as cur:
            cur.execute(
                UPSERT_AQ,
                {
                    "time": observation.observed_at,
                    "observation_id": observation.observation_id,
                    "source_id": observation.source_id,
                    "source_record_id": observation.source_record_id,
                    "station_id": observation.source_record_id.split("_")[0],
                    "grid_id": observation.grid_id,
                    "parameter": observation.measurement.parameter,
                    "value": observation.measurement.value,
                    "unit": observation.measurement.unit,
                    "quality_flag": observation.quality.quality_flag,
                    "quality_score": observation.quality.quality_score,
                    "latitude": observation.location.lat,
                    "longitude": observation.location.lon,
                    "raw_uri": observation.provenance.raw_object_uri,
                    "dedup_key": observation.dedup_key,
                },
            )
            inserted = cur.rowcount == 1
        self.conn.commit()
        return inserted

    def upsert_fire(self, observation: FireObservation) -> bool:
        """Insert fire observation; return False on duplicate key."""
        with self.conn.cursor() as cur:
            cur.execute(
                UPSERT_FIRE,
                {
                    "time": observation.observed_at,
                    "observation_id": observation.observation_id,
                    "source_id": observation.source_id,
                    "source_record_id": observation.source_record_id,
                    "grid_id": observation.grid_id,
                    "frp": observation.fire.frp,
                    "confidence": observation.fire.confidence,
                    "sensor": observation.fire.sensor,
                    "quality_score": observation.quality.quality_score,
                    "latitude": observation.location.lat,
                    "longitude": observation.location.lon,
                    "raw_uri": observation.provenance.raw_object_uri,
                    "dedup_key": observation.dedup_key,
                },
            )
            inserted = cur.rowcount == 1
        self.conn.commit()
        return inserted

    def upsert_weather(self, observation: MeteorologicalObservation) -> bool:
        """Insert weather observation; return False on duplicate key."""
        with self.conn.cursor() as cur:
            cur.execute(
                UPSERT_WX,
                {
                    "time": observation.observed_at,
                    "observation_id": observation.observation_id,
                    "source_id": observation.source_id,
                    "source_record_id": observation.source_record_id,
                    "grid_id": observation.grid_id,
                    "wind_u": observation.wind_u,
                    "wind_v": observation.wind_v,
                    "temperature": observation.temperature,
                    "humidity": observation.humidity,
                    "pressure": observation.pressure,
                    "boundary_layer_height": observation.boundary_layer_height,
                    "quality_score": observation.quality.quality_score,
                    "latitude": observation.location.lat,
                    "longitude": observation.location.lon,
                    "raw_uri": observation.provenance.raw_object_uri,
                    "dedup_key": observation.dedup_key,
                },
            )
            inserted = cur.rowcount == 1
        self.conn.commit()
        return inserted

    def record_dlq(self, source_id: str, payload: dict[str, Any], error: str) -> None:
        """Insert a dead-letter row."""
        sql = """
        INSERT INTO connector_dead_letter (source_id, payload, error)
        VALUES (%s, %s::jsonb, %s)
        """
        with self.conn.cursor() as cur:
            cur.execute(sql, (source_id, json.dumps(payload), error))
        self.conn.commit()

    def upsert_source_health(self, source_id: str, records: int, status: str = "HEALTHY") -> None:
        """Upsert source_health after a successful run."""
        sql = """
        INSERT INTO source_health (source_id, status, last_success_at, last_record_at, records_per_run, updated_at)
        VALUES (%s, %s, now(), now(), %s, now())
        ON CONFLICT (source_id) DO UPDATE SET
            status = EXCLUDED.status,
            last_success_at = EXCLUDED.last_success_at,
            last_record_at = EXCLUDED.last_record_at,
            records_per_run = EXCLUDED.records_per_run,
            updated_at = EXCLUDED.updated_at
        """
        with self.conn.cursor() as cur:
            cur.execute(sql, (source_id, status, records))
        self.conn.commit()

    def upsert_event(self, event: PollutionEvent) -> None:
        """Insert or update a pollution event row."""
        with self.conn.cursor() as cur:
            cur.execute(
                UPSERT_EVENT,
                {
                    "event_id": event.event_id,
                    "event_type": event.event_type,
                    "status": event.status.value,
                    "severity": event.severity.value,
                    "created_at": event.created_at,
                    "updated_at": event.updated_at,
                    "geometry": event.geometry,
                    "grid_ids": event.grid_ids,
                    "pollutants": event.pollutants,
                    "detection_confidence": event.detection_confidence,
                    "source_confidence": event.source_confidence,
                    "forecast_confidence": event.forecast_confidence,
                    "impact_confidence": event.impact_confidence,
                    "overall_confidence": event.overall_confidence,
                    "evidence_ids": event.evidence_ids,
                    "model_versions": event.model_versions,
                    "feature_version": event.feature_version,
                    "evidence_freshness": event.evidence_freshness,
                    "sensor_coverage": event.sensor_coverage,
                    "payload": json.dumps(event.model_dump(mode="json")),
                },
            )
        self.conn.commit()

    def insert_evidence(self, event_id: str, items: list[EventEvidence]) -> None:
        """Insert evidence rows (ignore duplicates)."""
        sql = """
        INSERT INTO event_evidence (
            evidence_id, event_id, evidence_type, observation_id, grid_id, summary, quality_score
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (evidence_id) DO NOTHING
        """
        with self.conn.cursor() as cur:
            for item in items:
                cur.execute(
                    sql,
                    (
                        item.evidence_id,
                        event_id,
                        item.evidence_type,
                        item.observation_id,
                        item.grid_id,
                        item.summary,
                        item.quality_score,
                    ),
                )
        self.conn.commit()

    def insert_graph(self, graph: EvidenceGraph) -> None:
        """Persist lineage edges."""
        sql = """
        INSERT INTO evidence_edge (
            edge_id, event_id, edge_type, from_id, to_id, confidence, evidence_ids, model_version, created_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (edge_id) DO NOTHING
        """
        with self.conn.cursor() as cur:
            for edge in graph.edges:
                cur.execute(
                    sql,
                    (
                        edge.edge_id,
                        graph.event_id,
                        edge.edge_type,
                        edge.from_id,
                        edge.to_id,
                        edge.confidence,
                        edge.evidence_ids,
                        edge.model_version,
                        edge.created_at,
                    ),
                )
        self.conn.commit()

    def insert_forecast(self, forecast: ForecastResult) -> None:
        """Persist forecast cells."""
        sql = """
        INSERT INTO forecast_value (
            time, event_id, origin_grid_id, grid_id, horizon_hours, pm25, confidence,
            model_version, cams_applied
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (time, grid_id, horizon_hours, model_version) DO NOTHING
        """
        with self.conn.cursor() as cur:
            for idx, cell in enumerate(forecast.grid_predictions):
                horizon = (
                    0 if idx == 0 else forecast.horizons[min(idx - 1, len(forecast.horizons) - 1)]
                )
                cur.execute(
                    sql,
                    (
                        forecast.generated_at,
                        forecast.event_id,
                        forecast.origin_grid_id,
                        cell.grid_id,
                        horizon,
                        cell.pm25,
                        cell.confidence,
                        forecast.model_version,
                        forecast.cams_applied,
                    ),
                )
        self.conn.commit()
