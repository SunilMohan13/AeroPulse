"""Canonical ML feature specification shared by training and serving.

This module is the single source of truth for the names, order and derivation of
every value handed to a model. Training reads its column list from here and
online inference builds its vector from here, so the two cannot drift apart.

Why this exists: the notebook track and the serving track previously each
defined their own feature names (``temperature_2m`` vs ``temperature``,
``fire_count_20km`` vs ``fire_count``), which made a trained artifact
unloadable by the worker. Import ``FeatureSet.names`` instead of writing a
feature list by hand.

Leakage safety: each :class:`FeatureSet` names its own ``target`` and asserts at
import time that the target is absent from its own feature names. A model can
therefore never be handed its own label as an input.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime

from aeropulse_contracts.feature import GridFeature

ML_FEATURE_VERSION = "ml-features-1.0.0"

# Cyclical encodings are derived from the feature timestamp rather than stored on
# GridFeature: they are pure functions of it, so persisting them would create a
# second source of truth that could disagree.
_TEMPORAL_NAMES = ("sin_hour", "cos_hour", "sin_doy", "cos_doy")

_SPATIAL_NAMES = ("center_lat", "center_lon", "station_distance")

_WEATHER_NAMES = (
    "temperature",
    "humidity",
    "pressure",
    "rainfall",
    "wind_u",
    "wind_v",
    "wind_speed",
    "boundary_layer_height",
)

_FIRE_NAMES = ("fire_count", "fire_frp", "upwind_fire_score")

_COPOLLUTANT_NAMES = ("pm10", "no2", "so2", "co", "o3")

_SATELLITE_NAMES = ("aod",)

_HISTORY_NAMES = (
    "pm25_lag_1h",
    "pm25_lag_3h",
    "pm25_lag_6h",
    "pm25_lag_24h",
    "pm25_roll_6h",
    "pm25_roll_24h",
)


def temporal_encodings(ts: datetime) -> dict[str, float]:
    """Return cyclical hour-of-day and day-of-year encodings.

    Sine/cosine pairs are used so that hour 23 sits adjacent to hour 0 rather
    than at the opposite end of a linear scale.

    Args:
        ts: Feature timestamp. Naive values are treated as UTC.

    Returns:
        Mapping with ``sin_hour``, ``cos_hour``, ``sin_doy`` and ``cos_doy``.
    """
    aware = ts if ts.tzinfo else ts.replace(tzinfo=UTC)
    hour_angle = 2.0 * math.pi * (aware.hour + aware.minute / 60.0) / 24.0
    doy_angle = 2.0 * math.pi * (aware.timetuple().tm_yday / 366.0)
    return {
        "sin_hour": math.sin(hour_angle),
        "cos_hour": math.cos(hour_angle),
        "sin_doy": math.sin(doy_angle),
        "cos_doy": math.cos(doy_angle),
    }


def to_feature_dict(feature: GridFeature) -> dict[str, float | None]:
    """Flatten a :class:`GridFeature` into every derivable model input.

    The returned mapping is a superset of any single model's feature set, so a
    caller may select whichever :class:`FeatureSet` it needs. ``pm25`` is
    included because it is a legitimate *input* to the forecast model (the
    current value is known at prediction time); sets that predict ``pm25``
    exclude it explicitly.

    Args:
        feature: Canonical grid-hour feature record.

    Returns:
        Feature name to value, with ``None`` preserved for genuinely missing
        inputs so that a downstream imputer can record missingness.
    """
    values: dict[str, float | None] = {
        "pm25": feature.pm25,
        "center_lat": feature.center_lat,
        "center_lon": feature.center_lon,
        "station_distance": feature.station_distance,
        "temperature": feature.temperature,
        "humidity": feature.humidity,
        "pressure": feature.pressure,
        "rainfall": feature.rainfall,
        "wind_u": feature.wind_u,
        "wind_v": feature.wind_v,
        "wind_speed": feature.wind_speed,
        "boundary_layer_height": feature.boundary_layer_height,
        "fire_count": float(feature.fire_count),
        "fire_frp": feature.fire_frp,
        "upwind_fire_score": feature.upwind_fire_score,
        "pm10": feature.pm10,
        "no2": feature.no2,
        "so2": feature.so2,
        "co": feature.co,
        "o3": feature.o3,
        "aod": feature.aod,
        "pm25_lag_1h": feature.pm25_lag_1h,
        "pm25_lag_3h": feature.pm25_lag_3h,
        "pm25_lag_6h": feature.pm25_lag_6h,
        "pm25_lag_24h": feature.pm25_lag_24h,
        "pm25_roll_6h": feature.pm25_roll_6h,
        "pm25_roll_24h": feature.pm25_roll_24h,
    }
    values.update(temporal_encodings(feature.timestamp))
    return values


@dataclass(frozen=True)
class FeatureSet:
    """An ordered, named feature list bound to exactly one prediction target.

    Attributes:
        name: Model family this set belongs to.
        names: Ordered feature names. Order is part of the contract because
            tree models are positional once serialised.
        target: Column this set predicts, which must not appear in ``names``.
    """

    name: str
    names: tuple[str, ...]
    target: str

    def vector(self, feature: GridFeature) -> list[float | None]:
        """Project a feature record onto this set, in contract order.

        Args:
            feature: Canonical grid-hour feature record.

        Returns:
            Values ordered to match :attr:`names`.
        """
        flat = to_feature_dict(feature)
        return [flat[n] for n in self.names]

    def row(self, feature: GridFeature) -> dict[str, float | None]:
        """Return this set's features as a mapping, for building dataframes.

        Args:
            feature: Canonical grid-hour feature record.

        Returns:
            Mapping restricted to :attr:`names`.
        """
        flat = to_feature_dict(feature)
        return {n: flat[n] for n in self.names}


#: Estimates surface PM2.5 without ever seeing it. Co-pollutants, AOD, weather
#: and fire proximity carry the signal; LLD §18.1 forbids treating AOD as a
#: direct PM2.5 substitute, so it enters only as one input among many.
PM25_ESTIMATOR = FeatureSet(
    name="pm25_estimator",
    names=_TEMPORAL_NAMES
    + _SPATIAL_NAMES
    + _WEATHER_NAMES
    + _FIRE_NAMES
    + _COPOLLUTANT_NAMES
    + _SATELLITE_NAMES
    + _HISTORY_NAMES,
    target="pm25",
)

#: Predicts the deviation of observed PM2.5 from its seasonal/diurnal baseline.
#: The target is a residual computed against a baseline fitted on training rows
#: only, so the baseline itself is not a leakage channel.
ANOMALY_RESIDUAL = FeatureSet(
    name="anomaly_residual",
    names=_TEMPORAL_NAMES
    + _SPATIAL_NAMES
    + _WEATHER_NAMES
    + _FIRE_NAMES
    + _COPOLLUTANT_NAMES
    + _HISTORY_NAMES,
    target="residual",
)

#: Scores independent source likelihoods. Deliberately excludes the raw
#: threshold inputs that a weak labeller would use, so the classifier cannot
#: simply re-derive its own label definition (LLD §18.3).
SOURCE_LIKELIHOOD = FeatureSet(
    name="source_likelihood",
    names=_TEMPORAL_NAMES + _SPATIAL_NAMES + _WEATHER_NAMES + _SATELLITE_NAMES + _HISTORY_NAMES,
    target="source_label",
)

#: Corrects a persistence/advection baseline at a given horizon. Current pm25 is
#: a valid input because the target lies strictly in the future.
PROPAGATION_FORECAST = FeatureSet(
    name="propagation_forecast",
    names=(
        "pm25",
        *_TEMPORAL_NAMES,
        *_SPATIAL_NAMES,
        *_WEATHER_NAMES,
        *_FIRE_NAMES,
        *_HISTORY_NAMES,
    ),
    target="residual_target",
)

FEATURE_SETS: dict[str, FeatureSet] = {
    fs.name: fs
    for fs in (PM25_ESTIMATOR, ANOMALY_RESIDUAL, SOURCE_LIKELIHOOD, PROPAGATION_FORECAST)
}


def _assert_no_target_leakage() -> None:
    """Fail fast if any feature set contains its own prediction target."""
    for fs in FEATURE_SETS.values():
        if fs.target in fs.names:
            raise AssertionError(
                f"feature set {fs.name!r} leaks its target {fs.target!r} into its inputs"
            )
        if len(set(fs.names)) != len(fs.names):
            raise AssertionError(f"feature set {fs.name!r} has duplicate feature names")


_assert_no_target_leakage()
