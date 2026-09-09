"""Shared building-block schemas reused across investigations/spills/vessels."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class LatLon(BaseModel):
    lat: float
    lon: float


class SatelliteScene(BaseModel):
    platform: str = Field(..., examples=["Sentinel-1"])
    product: str = Field(..., examples=["GRD"])
    timestamp: str = Field(..., description="ISO-8601 UTC timestamp")


class SpillGeometry(BaseModel):
    confidence: float = Field(..., ge=0, le=1)
    area_km2: float
    perimeter_km: float
    centroid: LatLon
    major_axis_km: float
    minor_axis_km: float
    orientation_deg: float
    polygon: str = Field(
        ..., description="SVG path (frontend map overlay) or WKT, depending on renderer"
    )


class SourceEstimate(BaseModel):
    lat: float
    lon: float
    window_start: str = Field(..., description="ISO-8601 UTC — earliest plausible spill origin time")
    window_end: str = Field(..., description="ISO-8601 UTC — latest plausible spill origin time")


class EvidenceItem(BaseModel):
    ok: Optional[bool] = Field(
        None, description="True = supports attribution, False = counts against it, null = inconclusive"
    )
    text: str


class VesselCandidate(BaseModel):
    mmsi: str
    imo: Optional[str] = None
    name: str
    flag: str
    vessel_type: str
    final_score: float = Field(..., ge=0, le=1)
    spatial: float = Field(..., ge=0, le=1)
    temporal: float = Field(..., ge=0, le=1)
    trajectory: float = Field(..., ge=0, le=1)
    behaviour: float = Field(..., ge=0, le=1)
    distance_km: float
    time_diff_h: float
    dwell_min: float
    track: str = Field(..., description="SVG path of the vessel's reconstructed AIS track")
    evidence: list[EvidenceItem] = []


class InvestigationMetrics(BaseModel):
    oil_iou: Optional[float] = None
    oil_f1: Optional[float] = None
    false_positive_rate: Optional[float] = None
    source_error_km: Optional[float] = None
    candidate_recall: Optional[float] = None
    top3_recall: Optional[float] = None
    processing_time_s: Optional[float] = None
