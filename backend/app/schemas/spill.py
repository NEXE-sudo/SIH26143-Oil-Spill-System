"""Schemas for POST /api/scenes/search, POST /api/spills/detect, GET /api/spills/{id}(/geometry)."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from app.config_loader import detection as detection_config
from app.schemas.common import SatelliteScene, SpillGeometry

_detection_defaults = detection_config()


class SceneSearchRequest(BaseModel):
    aoi_bbox: List[float] = Field(..., description="[min_lon, min_lat, max_lon, max_lat]")
    time_start: str
    time_end: str
    platform: Optional[str] = Field("Sentinel-1", description="Sentinel-1 (SAR) or Sentinel-2 (optical)")
    product: Optional[str] = Field("GRD", description="e.g. GRD, SLC (SAR) or L2A (optical)")


class SceneResult(SatelliteScene):
    scene_id: str
    preview_url: Optional[str] = None
    cloud_cover_pct: Optional[float] = None


class SceneSearchResponse(BaseModel):
    results: List[SceneResult]


class SpillDetectRequest(BaseModel):
    scene_id: str
    threshold: Optional[float] = Field(
        default_factory=lambda: _detection_defaults.get("threshold", 0.50),
        description="Detection confidence threshold, see configs/detection.yaml",
    )


class SpillDetectResponse(BaseModel):
    spill_id: str
    investigation_id: Optional[str] = None
    spill: SpillGeometry


class SpillDetailResponse(BaseModel):
    spill_id: str
    investigation_id: str
    spill: SpillGeometry


class SpillGeometryResponse(BaseModel):
    spill_id: str
    polygon: str = Field(..., description="SVG path or WKT of the spill outline")
    centroid: dict
    area_km2: float
    perimeter_km: float
