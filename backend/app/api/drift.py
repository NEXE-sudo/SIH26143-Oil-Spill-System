"""
POST /api/drift/hindcast
POST /api/drift/forecast

Roadmap §64, §67 (PyGNOME under drift/pygnome/). TODO: delegate to
services/drift.py, which should wrap PyGNOME (or an equivalent
Lagrangian particle model) driven by services/ocean current + wind
forcing. Returns a short synthetic track derived from the matching mock
investigation's source estimate so the map's hindcast/forecast toggle
has data to render for the demo.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from app.data import mock_investigations as store
from app.schemas.drift import (
    DriftForecastResponse,
    DriftHindcastResponse,
    DriftRequest,
    DriftTimestep,
)

router = APIRouter(prefix="/api/drift", tags=["drift"])


def _investigation_for_spill(spill_id: str):
    investigation_id = "INV-" + spill_id.removeprefix("SPL-")
    inv = store.get_by_id(investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Spill {spill_id} not found")
    return inv


def _synthetic_track(inv: dict, payload: DriftRequest, forward: bool) -> list[DriftTimestep]:
    # TODO: replace with services.drift.hindcast()/forecast() (PyGNOME run)
    centroid = inv["spill"]["centroid"]
    polygon = inv["spill"]["polygon"]
    steps = max(1, (payload.duration_hours * 60) // payload.timestep_minutes)
    start = datetime.fromisoformat(inv["satellite"]["timestamp"].replace("Z", "+00:00"))
    track: list[DriftTimestep] = []
    for i in range(int(steps) + 1):
        sign = 1 if forward else -1
        offset_min = sign * i * payload.timestep_minutes
        ts = start + timedelta(minutes=offset_min)
        # Placeholder linear drift so the frontend has a non-trivial track to draw.
        drift_deg = 0.01 * i * sign
        track.append(
            DriftTimestep(
                timestamp=ts.isoformat().replace("+00:00", "Z"),
                centroid={"lat": centroid["lat"] + drift_deg, "lon": centroid["lon"] + drift_deg},
                polygon=polygon,
                uncertainty_radius_km=0.5 + 0.2 * i,
            )
        )
    return track


@router.post("/hindcast", response_model=DriftHindcastResponse)
def drift_hindcast(payload: DriftRequest) -> DriftHindcastResponse:
    inv = _investigation_for_spill(payload.spill_id)
    return DriftHindcastResponse(
        spill_id=payload.spill_id,
        source_estimate=inv["source"],
        source_probability_heatmap=None,
        track=_synthetic_track(inv, payload, forward=False),
    )


@router.post("/forecast", response_model=DriftForecastResponse)
def drift_forecast(payload: DriftRequest) -> DriftForecastResponse:
    inv = _investigation_for_spill(payload.spill_id)
    return DriftForecastResponse(
        spill_id=payload.spill_id,
        track=_synthetic_track(inv, payload, forward=True),
    )
