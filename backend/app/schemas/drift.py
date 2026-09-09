"""Schemas for POST /api/drift/hindcast and POST /api/drift/forecast."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from app.config_loader import drift as drift_config
from app.schemas.common import LatLon, SourceEstimate

_drift_defaults = drift_config()


class DriftRequest(BaseModel):
    spill_id: str
    duration_hours: Optional[int] = Field(
        default_factory=lambda: _drift_defaults.get("duration_hours", 24),
        description="see configs/drift.yaml",
    )
    timestep_minutes: Optional[int] = Field(
        default_factory=lambda: _drift_defaults.get("timestep_minutes", 15),
        description="see configs/drift.yaml",
    )


class DriftTimestep(BaseModel):
    timestamp: str = Field(..., description="ISO-8601 UTC")
    centroid: LatLon
    polygon: Optional[str] = Field(
        None, description="SVG path or WKT of the slick outline at this timestep, if available"
    )
    uncertainty_radius_km: Optional[float] = None


class DriftHindcastResponse(BaseModel):
    spill_id: str
    source_estimate: SourceEstimate
    source_probability_heatmap: Optional[str] = Field(
        None, description="URL or inline raster/geojson of the source probability surface"
    )
    track: List[DriftTimestep]


class DriftForecastResponse(BaseModel):
    spill_id: str
    track: List[DriftTimestep]
