"""Gridded population density lookup (LLD §18.5, gap analysis P1-4).

Exposure was previously computed against ``DEFAULT_POPULATION_DENSITY = 5000``
for every cell in the corridor. That constant made ``population_risk`` a
monotone function of ``pollution_severity``: the two numbers the LLD requires
to be *separate* were the same number scaled, so the risk score carried no
information the severity did not already carry. Rural Bathinda and central
Delhi produced identical risk for identical PM2.5, which is the opposite of
what an exposure model is for.

This module resolves density from a reference dataset instead, and — equally
important — reports when it could **not**. A caller gets
:class:`PopulationEstimate` with an explicit ``measured`` flag, so a fallback
is visible in the response rather than silently indistinguishable from a real
lookup.

Resolution is nearest-reference-point within a radius. That is coarse, and it
is honest about being coarse: the alternative, interpolating between sparse
district centroids, would manufacture precision the source does not have.
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

#: Density assumed when no reference point is near enough. Retained from the
#: previous hardcoded behaviour so that removing the constant cannot change a
#: number silently — but every result built from it is flagged unmeasured.
FALLBACK_DENSITY_PER_KM2 = 5000.0

#: Maximum distance from a reference point at which its density is applied.
#: Reference points are district-scale, so beyond this the nearest value says
#: little about the cell.
MAX_MATCH_KM = 60.0

#: Where the reference dataset is read from. Overridable so a deployment can
#: supply a denser national grid without a code change.
POPULATION_DATA_ENV = "AEROPULSE_POPULATION_DATA"

_DEFAULT_DATA = Path(__file__).resolve().parent / "data" / "population_density.json"


@dataclass(frozen=True)
class PopulationEstimate:
    """Population density for a point, and whether it was actually measured.

    Attributes:
        density_per_km2: People per square kilometre.
        measured: True when a reference point was within :data:`MAX_MATCH_KM`.
            False means ``density_per_km2`` is the documented fallback and any
            exposure computed from it is an assumption, not an estimate.
        source: Reference dataset identifier, or ``fallback``.
        reference_name: Nearest reference area, when matched.
        distance_km: Distance to that reference point, when matched.
    """

    density_per_km2: float
    measured: bool
    source: str
    reference_name: str | None = None
    distance_km: float | None = None


@dataclass(frozen=True)
class _ReferencePoint:
    name: str
    lat: float
    lon: float
    density_per_km2: float


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


@lru_cache(maxsize=1)
def _reference_points() -> tuple[tuple[_ReferencePoint, ...], str]:
    """Load the reference dataset once per process.

    Returns:
        ``(points, source_id)``. An unreadable or malformed dataset yields an
        empty tuple, which makes every lookup fall back and say so, rather
        than raising and taking down a request path that has a valid answer.
    """
    path = Path(os.environ.get(POPULATION_DATA_ENV, _DEFAULT_DATA))
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return (), "unavailable"

    points: list[_ReferencePoint] = []
    for entry in payload.get("points", []):
        try:
            points.append(
                _ReferencePoint(
                    name=str(entry["name"]),
                    lat=float(entry["lat"]),
                    lon=float(entry["lon"]),
                    density_per_km2=float(entry["density_per_km2"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            # One malformed row must not discard the rest of the dataset.
            continue
    return tuple(points), str(payload.get("source", "unknown"))


def population_density(lat: float, lon: float) -> PopulationEstimate:
    """Resolve population density for a point.

    Args:
        lat: Latitude in degrees.
        lon: Longitude in degrees.

    Returns:
        The estimate, with ``measured=False`` when nothing was near enough.
    """
    points, source = _reference_points()
    best: _ReferencePoint | None = None
    best_distance = MAX_MATCH_KM
    for point in points:
        distance = _haversine_km(lat, lon, point.lat, point.lon)
        if distance <= best_distance:
            best, best_distance = point, distance

    if best is None:
        return PopulationEstimate(
            density_per_km2=FALLBACK_DENSITY_PER_KM2,
            measured=False,
            source="fallback",
        )
    return PopulationEstimate(
        density_per_km2=best.density_per_km2,
        measured=True,
        source=source,
        reference_name=best.name,
        distance_km=round(best_distance, 3),
    )


def reset_cache() -> None:
    """Clear the memoised dataset. For tests that swap the data file."""
    _reference_points.cache_clear()
