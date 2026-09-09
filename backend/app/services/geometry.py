"""
Geometric properties of a spill polygon: area, perimeter, centroid,
major/minor axis, orientation. Feeds SpillGeometry (app/schemas/common.py).

Used by: app/api/spills.py (GET /api/spills/{id}/geometry)

TODO: implement with shapely (area/perimeter/centroid) + an ellipse fit
(e.g. via minimum bounding ellipse or PCA on the polygon vertices) for
major/minor axis + orientation.
"""

from __future__ import annotations


def compute(polygon) -> dict:
    raise NotImplementedError("Compute area_km2, perimeter_km, centroid, major/minor axis, orientation_deg.")
