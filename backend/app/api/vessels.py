"""
GET /api/vessels/candidates
GET /api/vessels/{mmsi}

Roadmap §64. TODO: delegate to services/ais.py for track reconstruction
and services/attribution.py for the ranked candidate list.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.data import mock_investigations as store
from app.schemas.vessel import VesselCandidatesResponse, VesselDetailResponse

router = APIRouter(prefix="/api/vessels", tags=["vessels"])


@router.get("/candidates", response_model=VesselCandidatesResponse)
def get_candidates(
    investigation_id: str = Query(..., description="e.g. INV-2026-0001"),
) -> VesselCandidatesResponse:
    inv = store.get_by_id(investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Investigation {investigation_id} not found")
    return VesselCandidatesResponse(investigation_id=investigation_id, candidates=inv["vessels"])


@router.get("/{mmsi}", response_model=VesselDetailResponse)
def get_vessel(mmsi: str) -> VesselDetailResponse:
    vessel = store.find_vessel_anywhere(mmsi)
    if vessel is None:
        raise HTTPException(status_code=404, detail=f"Vessel {mmsi} not found")

    involved_in = [inv["id"] for inv in store.get_all() if any(v["mmsi"] == mmsi for v in inv["vessels"])]

    # TODO: services.ais.track_for(mmsi, time_start, time_end) for the real point-level track.
    return VesselDetailResponse(
        mmsi=vessel["mmsi"],
        imo=vessel.get("imo"),
        name=vessel["name"],
        flag=vessel["flag"],
        vessel_type=vessel["vessel_type"],
        ais_track=[],
        involved_in=involved_in,
    )
