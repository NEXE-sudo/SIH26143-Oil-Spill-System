"""
POST /api/drift/hindcast
POST /api/drift/forecast

Backed by app/services/drift.py: a real precomputed PyGNOME run if one is
cached for the spill, else a synthetic-but-physically-reasoned fallback.
Either way the response shape is identical.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.data import mock_investigations as store
from app.schemas.drift import (
    DriftForecastResponse,
    DriftHindcastResponse,
    DriftRequest,
)
from app.services import drift as drift_service

router = APIRouter(prefix="/api/drift", tags=["drift"])


def _investigation_for_spill(spill_id: str) -> dict:
    investigation_id = "INV-" + spill_id.removeprefix("SPL-")
    inv = store.get_by_id(investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Spill {spill_id} not found")
    return inv


@router.post("/hindcast", response_model=DriftHindcastResponse)
def drift_hindcast(payload: DriftRequest) -> DriftHindcastResponse:
    inv = _investigation_for_spill(payload.spill_id)
    spill = {"id": payload.spill_id, **inv["spill"]}
    start_time = datetime.fromisoformat(inv["satellite"]["timestamp"].replace("Z", "+00:00"))
    result = drift_service.hindcast(spill, start_time, payload.duration_hours, payload.timestep_minutes)
    return DriftHindcastResponse(**result)


@router.post("/forecast", response_model=DriftForecastResponse)
def drift_forecast(payload: DriftRequest) -> DriftForecastResponse:
    inv = _investigation_for_spill(payload.spill_id)
    spill = {"id": payload.spill_id, **inv["spill"]}
    start_time = datetime.fromisoformat(inv["satellite"]["timestamp"].replace("Z", "+00:00"))
    result = drift_service.forecast(spill, start_time, payload.duration_hours, payload.timestep_minutes)
    return DriftForecastResponse(**result)
