"""
POST /api/attribution/run
GET  /api/attribution/{investigation_id}

Roadmap §64, weights default from configs/attribution.yaml (§63). TODO:
delegate to services/attribution.py (scoring.py + features.py + ranking.py
under attribution/ at the repo root, per roadmap §61) once real AIS
features are available. Re-sorts the mock candidates by final_score so
the endpoint's contract (ranked list) is real even though the scores
themselves are still fixtures.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.data import mock_investigations as store
from app.schemas.attribution import (
    AttributionResultResponse,
    AttributionRunRequest,
    AttributionWeights,
)

router = APIRouter(prefix="/api/attribution", tags=["attribution"])


@router.post("/run", response_model=AttributionResultResponse)
def run_attribution(payload: AttributionRunRequest) -> AttributionResultResponse:
    inv = store.get_by_id(payload.investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Investigation {payload.investigation_id} not found")

    # TODO: services.attribution.score_and_rank(inv, weights, spatial_radius_km, time_window_hours)
    weights = payload.weights or AttributionWeights()
    ranked = sorted(inv["vessels"], key=lambda v: v["final_score"], reverse=True)

    return AttributionResultResponse(
        investigation_id=inv["id"],
        weights=weights,
        ranked_vessels=ranked,
        generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


@router.get("/{investigation_id}", response_model=AttributionResultResponse)
def get_attribution(investigation_id: str) -> AttributionResultResponse:
    inv = store.get_by_id(investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Investigation {investigation_id} not found")

    ranked = sorted(inv["vessels"], key=lambda v: v["final_score"], reverse=True)
    return AttributionResultResponse(
        investigation_id=inv["id"],
        weights=AttributionWeights(),
        ranked_vessels=ranked,
        generated_at=inv["lodged_at"],
    )
