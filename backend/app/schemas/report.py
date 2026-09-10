from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field

class SatelliteSceneMetadata(BaseModel):
    platform: str = "Sentinel-1"
    product: str = "GRD"
    polarisation: str = "VV / VH"
    acquisition_timestamp: datetime
    footprint_bbox: List[float] = Field(
        ..., description="[min_lon, min_lat, max_lon, max_lat]"
    )

class SpillGeometry(BaseModel):
    spill_id: str
    confidence: float
    area_km2: float
    perimeter_km: float
    centroid: Dict[str, float]  # {"lat": float, "lon": float}
    major_axis_km: float
    minor_axis_km: float
    orientation_deg: float
    aspect_ratio: float
    lookalike_probability: float
    spill_polygon_geojson: Optional[str] = None

class DriftHindcastData(BaseModel):
    wind_source: str = "Copernicus ERA5"
    current_source: str = "Copernicus Marine"
    estimated_origin_centroid: Dict[str, float]  # {"lat": float, "lon": float}
    source_window_start: datetime
    source_window_end: datetime
    model_type: str = "Lagrangian Particle Drift (PyGNOME / Runge-Kutta)"
    simulation_timestep_mins: int = 15
    source_probability_map_path: Optional[str] = None

class CandidateFunnel(BaseModel):
    total_vessels_detected: int
    spatial_candidates: int
    temporal_candidates: int
    high_priority_candidates: int

class SuspectEvidence(BaseModel):
    rank: int
    vessel_name: str
    mmsi: str
    vessel_type: Optional[str] = "Cargo / Tanker"
    final_score: float
    score_spatial: float
    score_temporal: float
    score_trajectory: float
    score_behaviour: float
    score_context: float
    closest_approach_km: float
    time_difference_hours: float
    dwell_time_mins: float
    source_corridor_overlap_pct: float
    evidence_statements: List[str]
    assessment: str  # e.g., "HIGH-PRIORITY CANDIDATE"

class InvestigationReportPayload(BaseModel):
    investigation_id: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    analyst_id: Optional[str] = "NTRO_AUTO_PIPELINE"
    model_version: str = "v1.2.0-internal"
    rules_version: str = "v2026.1"
    ais_dataset_version: str = "NOAA_MarineCadastre_2026"
    investigator_review: Optional[str] = None
    satellite: SatelliteSceneMetadata
    spill: SpillGeometry
    drift_hindcast: DriftHindcastData
    candidate_filtering: CandidateFunnel
    suspects: List[SuspectEvidence]
    # Base64 strings or local filepaths to rendered maps/imagery chips
    sar_image_path: Optional[str] = None
    mask_overlay_path: Optional[str] = None
