"""
GET /api/vessels/candidates
GET /api/vessels/{mmsi}

Roadmap §64. TODO: delegate to services/ais.py for track reconstruction
and services/attribution.py for the ranked candidate list.

NOTE: /candidates still serves mock data — real ranking needs the
attribution scoring algorithm (spatial/temporal/trajectory/behaviour),
which doesn't exist yet. /{mmsi} below is wired to real Supabase data
for vessel info + AIS track; `involved_in` still comes from mock
investigations since real investigation/attribution persistence isn't
built yet either.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.data import mock_investigations as store
from app.db import get_db
from app.models.investigation import Vessel, AISPointRecord
from app.schemas.vessel import AISPoint, VesselCandidatesResponse, VesselDetailResponse
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
def get_vessel(mmsi: str, db: Session = Depends(get_db)) -> VesselDetailResponse:
    vessel = db.get(Vessel, mmsi)
    if vessel is None:
        raise HTTPException(status_code=404, detail=f"Vessel {mmsi} not found")

    points = (
        db.query(AISPointRecord)
        .filter(AISPointRecord.mmsi == mmsi)
        .order_by(AISPointRecord.timestamp)
        .all()
    )
    ais_track = [
        AISPoint(
            timestamp=p.timestamp.isoformat(),
            lat=p.lat,
            lon=p.lon,
            sog_knots=p.sog_knots,
            cog_deg=p.cog_deg,
            heading_deg=p.heading_deg,
            nav_status=p.nav_status,
        )
        for p in points
    ]

    # Still mock-sourced — real investigations/attribution aren't persisted yet.
    involved_in = [inv["id"] for inv in store.get_all() if any(v["mmsi"] == mmsi for v in inv["vessels"])]

    return VesselDetailResponse(
        mmsi=vessel.mmsi,
        imo=vessel.imo,
        name=vessel.name,
        flag=vessel.flag,
        vessel_type=vessel.vessel_type,
        ais_track=ais_track,
        involved_in=involved_in,
    )
