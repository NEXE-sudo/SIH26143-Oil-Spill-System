"""Schemas for GET /api/vessels/candidates and GET /api/vessels/{mmsi}."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import VesselCandidate


class VesselCandidatesResponse(BaseModel):
    investigation_id: str
    candidates: List[VesselCandidate]


class AISPoint(BaseModel):
    timestamp: str = Field(..., description="ISO-8601 UTC")
    lat: float
    lon: float
    sog_knots: Optional[float] = Field(None, description="speed over ground")
    cog_deg: Optional[float] = Field(None, description="course over ground")
    heading_deg: Optional[float] = None
    nav_status: Optional[str] = None


class VesselDetailResponse(BaseModel):
    mmsi: str
    imo: Optional[str] = None
    name: str
    flag: str
    vessel_type: str
    ais_track: List[AISPoint] = Field(
        default_factory=list, description="Raw reconstructed AIS points for the relevant window"
    )
    involved_in: List[str] = Field(
        default_factory=list, description="investigation ids this vessel is a candidate in"
    )
