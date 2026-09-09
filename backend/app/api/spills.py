"""
POST /api/spills/detect
GET  /api/spills/{id}
GET  /api/spills/{id}/geometry

Roadmap §64. TODO: delegate to services/detection.py + services/segmentation.py
+ services/geometry.py. For the internal-round PoC this returns the
matching spill sub-object from the mock dataset so the map/detail views
work end to end before the real CV pipeline is plugged in.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.data import mock_investigations as store
from app.schemas.spill import (
    SpillDetailResponse,
    SpillDetectRequest,
    SpillDetectResponse,
    SpillGeometryResponse,
)

router = APIRouter(prefix="/api/spills", tags=["spills"])


def _spill_id_for(investigation_id: str) -> str:
    return f"SPL-{investigation_id.removeprefix('INV-')}"


@router.post("/detect", response_model=SpillDetectResponse)
def detect_spill(payload: SpillDetectRequest) -> SpillDetectResponse:
    # TODO: services.detection.run(payload.scene_id, threshold=payload.threshold)
    #       -> services.segmentation.mask_to_polygon(...)
    #       -> services.geometry.compute(polygon)
    inv = store.INVESTIGATIONS[0]  # placeholder: first mock record stands in for "the" result
    return SpillDetectResponse(
        spill_id=_spill_id_for(inv["id"]),
        investigation_id=inv["id"],
        spill=inv["spill"],
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
