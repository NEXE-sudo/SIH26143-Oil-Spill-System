"""
Satellite service — scene search & retrieval (Sentinel-1 SAR, Sentinel-2 optical).

Used by: app/api/scenes.py (POST /api/scenes/search)

TODO:
    - Wire to Copernicus Data Space / Sentinel Hub (credentials via .env).
    - Cache downloaded scenes under data/raw/ (never commit — see data/README.md).
    - Return SceneResult objects matching app/schemas/spill.py::SceneResult.
"""

from __future__ import annotations

from typing import List


def search(aoi_bbox: List[float], time_start: str, time_end: str, platform: str, product: str) -> list:
    raise NotImplementedError("Wire this up to Copernicus / Sentinel Hub before the actual hackathon round.")
