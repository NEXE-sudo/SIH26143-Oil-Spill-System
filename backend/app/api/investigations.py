"""
POST /api/investigations
GET  /api/investigations
GET  /api/investigations/{id}

Roadmap §64/§65. GET list + GET detail aren't in the roadmap's endpoint
list verbatim, but the frontend (src/data/reports.js) explicitly names
`GET /api/investigations` as the replacement for the mock array, and
InvestigationDetail.jsx needs a single-record fetch — both are added here
as thin templates alongside the roadmap-specified POST.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.data import mock_investigations as store
from app.schemas.investigation import (
    Investigation,
    InvestigationCreateRequest,
    InvestigationListResponse,
)

router = APIRouter(prefix="/api/investigations", tags=["investigations"])


@router.get("", response_model=InvestigationListResponse)
def list_investigations() -> InvestigationListResponse:
    """Backs the landing dashboard (lodged/pending/completed counters)."""
    return InvestigationListResponse(items=store.get_all())


@router.get("/{investigation_id}", response_model=Investigation)
def get_investigation(investigation_id: str) -> Investigation:
    """Backs InvestigationDetail.jsx."""
    inv = store.get_by_id(investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Investigation {investigation_id} not found")
    return inv


@router.post("", response_model=Investigation, status_code=201)
def create_investigation(payload: InvestigationCreateRequest) -> Investigation:
    """
    Kick off a new investigation.

    TODO (post-internal-round): wire this to the real pipeline —
        services.sentinel.resolve_scene()
        services.detection.run()
        services.geometry.compute()
        services.drift.hindcast()
        services.ais.reconstruct_tracks()
        services.attribution.score_and_rank()
    For the internal-round PoC this returns a freshly-lodged, unscored
    record so the dashboard has something to show immediately; a
    background job (or a follow-up POST /api/attribution/run call) fills
    in vessels/metrics once the pipeline finishes.
    """
    if not payload.scene_id and not payload.aoi_bbox:
        raise HTTPException(status_code=400, detail="Provide either scene_id or aoi_bbox")

    new_id = f"INV-2026-{uuid.uuid4().hex[:4].upper()}"
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    record = {
        "id": new_id,
        "status": "lodged",
        "lodged_at": now,
        "satellite": {
            "platform": "Sentinel-1",
            "product": "GRD",
            "timestamp": now,
        },
        "spill": {
            "confidence": 0.0,
            "area_km2": 0.0,
            "perimeter_km": 0.0,
            "centroid": {"lat": 0.0, "lon": 0.0},
            "major_axis_km": 0.0,
            "minor_axis_km": 0.0,
            "orientation_deg": 0.0,
            "polygon": "",
        },
        "source": {
            "lat": 0.0,
            "lon": 0.0,
            "window_start": now,
            "window_end": now,
        },
        "vessels": [],
        "metrics": {
            "oil_iou": None,
            "oil_f1": None,
            "false_positive_rate": None,
            "source_error_km": None,
            "candidate_recall": None,
            "top3_recall": None,
            "processing_time_s": None,
        },
    }
    store.INVESTIGATIONS.append(record)
    return record
