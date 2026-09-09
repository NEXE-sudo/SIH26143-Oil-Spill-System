"""
Drift hindcast/forecast — traces slick movement backward (to estimate
source region + time) and forward (to predict future trajectory), driven
by wind + ocean current forcing.

Used by: app/api/drift.py (POST /api/drift/hindcast, /forecast)

Config: configs/drift.yaml (duration_hours, timestep_minutes).

TODO: wrap PyGNOME (see drift/pygnome/ at the repo root) or an equivalent
Lagrangian particle-tracking model. Hindcast should also emit a source
probability surface (heatmap) alongside the point estimate.
"""

from __future__ import annotations


def hindcast(spill: dict, duration_hours: int, timestep_minutes: int) -> dict:
    raise NotImplementedError("Run PyGNOME backward in time from the spill polygon/centroid.")


def forecast(spill: dict, duration_hours: int, timestep_minutes: int) -> dict:
    raise NotImplementedError("Run PyGNOME forward in time from the spill polygon/centroid.")
