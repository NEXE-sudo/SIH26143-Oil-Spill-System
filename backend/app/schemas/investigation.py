"""
Schemas for POST /api/investigations, GET /api/reports/{id}, and the
list/detail shape consumed by src/data/reports.js today.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.common import (
    InvestigationMetrics,
    SatelliteScene,
    SourceEstimate,
    SpillGeometry,
    VesselCandidate,
)

InvestigationStatus = Literal["lodged", "pending", "completed"]


class InvestigationCreateRequest(BaseModel):
    """Body for POST /api/investigations — kicks off a new investigation.

    The internal-round PoC can accept either a scene reference already
    resolved via POST /api/scenes/search, or a raw AOI + time window that
    the satellite service will resolve to a scene itself.
    """

    scene_id: Optional[str] = Field(
        None, description="Pre-resolved satellite scene id from /api/scenes/search"
    )
    aoi_bbox: Optional[List[float]] = Field(
        None, description="[min_lon, min_lat, max_lon, max_lat], required if scene_id is omitted"
    )
    time_start: Optional[str] = Field(None, description="ISO-8601 UTC")
    time_end: Optional[str] = Field(None, description="ISO-8601 UTC")
    notes: Optional[str] = None


class InvestigationSummary(BaseModel):
    """Lightweight row for dashboard/list views (LandingPage.jsx counters)."""

    id: str
    status: InvestigationStatus
    lodged_at: str
    satellite: SatelliteScene
    spill: SpillGeometry


class Investigation(BaseModel):
    """Full investigation record — the exact shape InvestigationDetail.jsx renders."""

    id: str
    status: InvestigationStatus
    lodged_at: str
    satellite: SatelliteScene
    spill: SpillGeometry
    source: SourceEstimate
    vessels: List[VesselCandidate]
    metrics: InvestigationMetrics


class InvestigationListResponse(BaseModel):
    items: List[Investigation]
    status_labels: dict = Field(
        default_factory=lambda: {"lodged": "Lodged", "pending": "Pending", "completed": "Completed"}
    )
