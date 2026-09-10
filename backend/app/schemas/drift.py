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


class DriftVector(BaseModel):
    u_m_s: float = Field(..., description="Eastward vector component in m/s")
    v_m_s: float = Field(..., description="Northward vector component in m/s")
    speed_m_s: Optional[float] = Field(None, description="Magnitude of the vector in m/s")
    direction_deg: Optional[float] = Field(
        None, description="Compass direction in degrees clockwise from north"
    )


class DriftTimestep(BaseModel):
    timestamp: str = Field(..., description="ISO-8601 UTC")
    centroid: LatLon
    polygon: Optional[str] = Field(
        None, description="SVG path or WKT of the slick outline at this timestep, if available"
    )
    uncertainty_radius_km: Optional[float] = None
    wind: Optional[DriftVector] = Field(None, description="Wind forcing at this timestep")
    current: Optional[DriftVector] = Field(
        None, description="Ocean current forcing at this timestep"
    )


class DriftHindcastResponse(BaseModel):
    spill_id: str
    source_mode: str = Field(
        ...,
        description="Drift provenance: cached_forcing, real_forcing, or synthetic_fallback",
    )
    source_estimate: SourceEstimate
    source_probability_heatmap: Optional[str] = Field(
        None, description="URL or inline raster/geojson of the source probability surface"
    )
    track: List[DriftTimestep]


class DriftForecastResponse(BaseModel):
    spill_id: str
    source_mode: str = Field(
        ...,
        description="Drift provenance: cached_forcing, real_forcing, or synthetic_fallback",
    )
    track: List[DriftTimestep]
