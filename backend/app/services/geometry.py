"""
Geometric properties of a spill polygon: area, perimeter, centroid,
major/minor axis, orientation. Feeds SpillGeometry (app/schemas/common.py).

Used by: app/api/spills.py (GET /api/spills/{id}/geometry)

Computes exact area/perimeter/centroid from the polygon via shapely, and fits
an ellipse (via PCA on the polygon's boundary vertices) to get a
major/minor-axis + orientation summary — the same "size and shape at a
glance" numbers used elsewhere in the app (e.g. drift modeling's initial
slick footprint).
"""

from __future__ import annotations

import json
import math

import numpy as np
from shapely.geometry import shape
from shapely.wkt import loads as wkt_loads

# Rough conversion for small-area geographic polygons (a few km across) —
# good enough for a spill's local extent, not for anything spanning many
# degrees of latitude. 1 degree of latitude is ~111.32 km everywhere; a
# degree of longitude shrinks with cos(latitude).
_KM_PER_DEG_LAT = 111.32


def compute(polygon: str) -> dict:
    """
    Compute area_km2, perimeter_km, centroid, major/minor axis, orientation_deg.

    Args:
        polygon: GeoJSON Polygon string or WKT string (whatever
            services/segmentation.mask_to_polygon returned), in lon/lat
            degrees.

    Returns:
        {
            "area_km2": float,
            "perimeter_km": float,
            "centroid": {"lat": float, "lon": float},
            "major_axis_km": float,
            "minor_axis_km": float,
            "orientation_deg": float,  # 0 = east-west, 90 = north-south
        }
    """
    geom = _parse_polygon(polygon)
    if geom.is_empty:
        raise ValueError("Polygon is empty — nothing to measure.")

    centroid_lon, centroid_lat = geom.centroid.x, geom.centroid.y
    km_per_deg_lon = _KM_PER_DEG_LAT * math.cos(math.radians(centroid_lat))

    # Project lon/lat -> local km-plane centered on the centroid so
    # area/perimeter/axis lengths come out in real kilometres rather than
    # degrees^2, without needing a full CRS reprojection library for what's
    # a small local footprint.
    coords_km = np.array(
        [
            ((lon - centroid_lon) * km_per_deg_lon, (lat - centroid_lat) * _KM_PER_DEG_LAT)
            for lon, lat in geom.exterior.coords
        ]
    )

    area_km2 = _shoelace_area(coords_km)
    perimeter_km = _perimeter(coords_km)
    major_km, minor_km, orientation_deg = _fit_ellipse(coords_km)

    return {
        "area_km2": round(area_km2, 4),
        "perimeter_km": round(perimeter_km, 4),
        "centroid": {"lat": round(centroid_lat, 6), "lon": round(centroid_lon, 6)},
        "major_axis_km": round(major_km, 4),
        "minor_axis_km": round(minor_km, 4),
        "orientation_deg": round(orientation_deg, 2),
    }


# Internal helpers


def _parse_polygon(polygon: str):
    stripped = polygon.strip()
    if stripped.startswith("{"):
        return shape(json.loads(stripped))
    return wkt_loads(stripped)


def _shoelace_area(coords_km: np.ndarray) -> float:
    x, y = coords_km[:, 0], coords_km[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def _perimeter(coords_km: np.ndarray) -> float:
    diffs = np.diff(coords_km, axis=0, append=coords_km[:1])
    return float(np.sum(np.hypot(diffs[:, 0], diffs[:, 1])))


def _fit_ellipse(coords_km: np.ndarray) -> tuple[float, float, float]:
    """PCA-based bounding ellipse: eigenvectors of the vertex covariance give
    the major/minor axis directions, eigenvalues (scaled) give axis lengths."""
    centered = coords_km - coords_km.mean(axis=0)
    cov = np.cov(centered.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    order = np.argsort(eigvals)[::-1]  # largest first = major axis
    eigvals, eigvecs = eigvals[order], eigvecs[:, order]

    # 2*sqrt(eigenvalue) approximates the full axis extent (1-sigma diameter
    # scaled to roughly span the vertex spread) — a summary statistic, not a
    # true minimum-bounding-ellipse fit.
    major_km = 2.0 * math.sqrt(max(eigvals[0], 0.0))
    minor_km = 2.0 * math.sqrt(max(eigvals[1], 0.0))

    major_vec = eigvecs[:, 0]
    orientation_deg = math.degrees(math.atan2(major_vec[1], major_vec[0])) % 180.0

    return major_km, minor_km, orientation_deg
