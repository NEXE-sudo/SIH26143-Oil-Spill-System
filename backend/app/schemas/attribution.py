"""Schemas for POST /api/attribution/run and GET /api/attribution/{investigation_id}."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import VesselCandidate


class AttributionWeights(BaseModel):
    """Mirrors configs/attribution.yaml — never hard-code these in code."""

    spatial: float = 0.30
    temporal: float = 0.25
    trajectory: float = 0.20
    behaviour: float = 0.15
    context: float = 0.10


class AttributionRunRequest(BaseModel):
    investigation_id: str
    spatial_radius_km: Optional[float] = Field(25, description="see configs/attribution.yaml (ais block)")
    time_window_hours: Optional[float] = Field(24, description="see configs/attribution.yaml (ais block)")
    weights: Optional[AttributionWeights] = None


class AttributionResultResponse(BaseModel):
    investigation_id: str
    weights: AttributionWeights
    ranked_vessels: List[VesselCandidate]
    generated_at: str = Field(..., description="ISO-8601 UTC")
