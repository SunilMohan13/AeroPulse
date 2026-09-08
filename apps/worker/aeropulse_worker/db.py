"""Timescale persistence for normalized observations."""

from __future__ import annotations

from typing import Any

from aeropulse_contracts.fire import FireObservation
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


class TimescaleRepository:
    """psycopg-backed observation repository."""

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
