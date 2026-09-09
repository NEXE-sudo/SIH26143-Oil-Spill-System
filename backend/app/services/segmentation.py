"""
Pixel-mask -> polygon segmentation for a detected spill.

Used by: app/api/spills.py (POST /api/spills/detect), feeds services/geometry.py.

TODO: connect to the segmentation model output (see ml/segmentation/) and
vectorize the mask (e.g. via rasterio/shapely) into a polygon.
"""

from __future__ import annotations


def mask_to_polygon(mask) -> str:
    raise NotImplementedError("Vectorize the segmentation mask into a polygon (WKT/GeoJSON).")
