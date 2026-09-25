"""
POST /api/spills/detect
GET  /api/spills/{id}
GET  /api/spills/{id}/geometry

Roadmap §64. detect_spill() now runs the real pipeline — services/detection.py
-> services/segmentation.py -> services/geometry.py — against a preprocessed
scene on disk. get_spill()/get_spill_geometry() still read from the mock
store, since those serve already-detected investigations by id rather than
running detection fresh; swap them to a real datastore once detections are
persisted (see roadmap).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.data import mock_investigations as store
from app.schemas.common import SpillGeometry
from app.schemas.spill import (
    SpillDetailResponse,
    SpillDetectRequest,
    SpillDetectResponse,
    SpillGeometryResponse,
)
from app.services import detection, geometry, segmentation

router = APIRouter(prefix="/api/spills", tags=["spills"])

_REPO_ROOT = Path(__file__).resolve().parents[3]
RAW_SCENES_DIR = _REPO_ROOT / "data" / "raw"


def _spill_id_for(investigation_id: str) -> str:
    return f"SPL-{investigation_id.removeprefix('INV-')}"


@router.post("/detect", response_model=SpillDetectResponse)
def detect_spill(payload: SpillDetectRequest) -> SpillDetectResponse:
    result = detection.run(payload.scene_id, threshold=payload.threshold)
    if result["n_regions"] == 0:
        raise HTTPException(status_code=422, detail="No candidate spill regions detected in this scene.")

    scene_tif = RAW_SCENES_DIR / f"{payload.scene_id}.tif"
    polygon = segmentation.mask_to_polygon(
        result["mask"],
        scene_path=str(scene_tif) if scene_tif.exists() else None,
        output="geojson",
    )
    geom = geometry.compute(polygon)

    spill = SpillGeometry(
        confidence=result["confidence"],
        area_km2=geom["area_km2"],
        perimeter_km=geom["perimeter_km"],
        centroid=geom["centroid"],
        major_axis_km=geom["major_axis_km"],
        minor_axis_km=geom["minor_axis_km"],
        orientation_deg=geom["orientation_deg"],
        polygon=polygon,
    )

    return SpillDetectResponse(
        spill_id=f"SPL-{payload.scene_id}",
        investigation_id=None,
        spill=spill,
    )


@router.get("/{spill_id}", response_model=SpillDetailResponse)
def get_spill(spill_id: str) -> SpillDetailResponse:
    investigation_id = "INV-" + spill_id.removeprefix("SPL-")
    inv = store.get_by_id(investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Spill {spill_id} not found")
    return SpillDetailResponse(spill_id=spill_id, investigation_id=inv["id"], spill=inv["spill"])


@router.get("/{spill_id}/geometry", response_model=SpillGeometryResponse)
def get_spill_geometry(spill_id: str) -> SpillGeometryResponse:
    investigation_id = "INV-" + spill_id.removeprefix("SPL-")
    inv = store.get_by_id(investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Spill {spill_id} not found")
    spill = inv["spill"]
    return SpillGeometryResponse(
        spill_id=spill_id,
        polygon=spill["polygon"],
        centroid=spill["centroid"],
        area_km2=spill["area_km2"],
        perimeter_km=spill["perimeter_km"],
    )
