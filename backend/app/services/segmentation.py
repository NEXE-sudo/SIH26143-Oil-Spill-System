"""
Pixel-mask -> polygon segmentation for a detected spill.

Used by: app/api/spills.py (POST /api/spills/detect), feeds services/geometry.py.

Vectorizes the boolean mask from services/detection.run() into a polygon in
real-world lat/lon, using the scene's geotransform (via rasterio) to convert
pixel coordinates. This is what makes the rendered shape match the actual
scene's spill footprint instead of a fixed placeholder path.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import rasterio
from shapely.geometry import Polygon, mapping
from shapely.ops import transform as shapely_transform

# Vertex count above which a traced contour gets simplified. Raw contours
# from real SAR masks can have hundreds of vertices from speckle-edge
# jaggedness; a simplified polygon renders cleanly and is still faithful to
# the mask's actual outline.
_SIMPLIFY_TOLERANCE_PX = 2.0


def mask_to_polygon(
    mask: np.ndarray,
    scene_path: Optional[str] = None,
    output: str = "geojson",
) -> str:
    """
    Vectorize a boolean detection mask into a polygon.

    Args:
        mask: (H, W) boolean array from services/detection.run()["mask"].
        scene_path: path to the original georeferenced scene (.tif), used to
            convert pixel coordinates to lat/lon via its transform. If
            omitted, the polygon is returned in raw pixel coordinates
            (useful for tests, or scenes without geo metadata yet).
        output: "geojson" (default) or "wkt". SpillGeometry.polygon accepts
            either as a string — the frontend map layer should be updated to
            consume GeoJSON (see docs/frontend-map.md), since an SVG path
            can't hold real geographic coordinates.

    Returns:
        The largest connected region in `mask`, as a GeoJSON Polygon string
        (or WKT if output="wkt"). Raises if the mask has no oil pixels.
    """
    if mask.dtype != bool:
        mask = mask.astype(bool)
    if not mask.any():
        raise ValueError("mask has no True pixels — nothing to vectorize.")

    contours, _ = cv2.findContours(
        mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if not contours:
        raise ValueError("cv2 found no contours in a non-empty mask (unexpected).")

    # A spill may fragment into several dark patches; keep the largest by
    # area as "the" spill polygon, matching SpillGeometry's single-polygon
    # contract. (Multi-polygon spills are a reasonable future schema change,
    # not handled here.)
    largest = max(contours, key=cv2.contourArea)

    epsilon = _SIMPLIFY_TOLERANCE_PX
    simplified = cv2.approxPolyDP(largest, epsilon, closed=True)
    coords_px = [(int(pt[0][0]), int(pt[0][1])) for pt in simplified]
    if len(coords_px) < 3:
        raise ValueError("Simplified contour has fewer than 3 vertices — check mask/threshold.")

    polygon_px = Polygon(coords_px)

    if scene_path:
        with rasterio.open(scene_path) as src:
            transform = src.transform

        def px_to_lonlat(x, y, z=None):
            lon, lat = transform @ (x, y)
            return (lon, lat)

        polygon_geo = shapely_transform(px_to_lonlat, polygon_px)
    else:
        polygon_geo = polygon_px

    if output == "wkt":
        return polygon_geo.wkt
    if output == "geojson":
        import json

        return json.dumps(mapping(polygon_geo))
    raise ValueError(f"Unknown output format: {output!r} (expected 'geojson' or 'wkt')")
