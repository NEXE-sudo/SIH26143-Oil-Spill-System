"""Schemas for POST /api/attribution/run and GET /api/attribution/{investigation_id}."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from app.config_loader import attribution as attribution_config
from app.schemas.common import VesselCandidate

_cfg = attribution_config()
_weight_defaults = _cfg.get("attribution", {}).get("weights", {})
_ais_defaults = _cfg.get("ais", {})


class AttributionWeights(BaseModel):
    """Defaults loaded from configs/attribution.yaml — never hard-code these in code."""

    spatial: float = _weight_defaults.get("spatial", 0.30)
    temporal: float = _weight_defaults.get("temporal", 0.25)
    trajectory: float = _weight_defaults.get("trajectory", 0.20)
    behaviour: float = _weight_defaults.get("behaviour", 0.15)
    context: float = _weight_defaults.get("context", 0.10)


class AttributionRunRequest(BaseModel):
    investigation_id: str
    spatial_radius_km: Optional[float] = Field(
        default_factory=lambda: _ais_defaults.get("spatial_radius_km", 25),
        description="see configs/attribution.yaml (ais block)",
    )
    time_window_hours: Optional[float] = Field(
        default_factory=lambda: _ais_defaults.get("time_window_hours", 24),
        description="see configs/attribution.yaml (ais block)",
    )
    weights: Optional[AttributionWeights] = None


class AttributionResultResponse(BaseModel):
    investigation_id: str
    weights: AttributionWeights
    ranked_vessels: List[VesselCandidate]
    generated_at: str = Field(..., description="ISO-8601 UTC")
