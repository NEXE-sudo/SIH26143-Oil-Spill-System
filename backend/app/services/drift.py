"""
Drift hindcast/forecast — traces slick movement backward (source region +
time) and forward (predicted trajectory).

Two data paths, same output shape:

1. Precomputed PyGNOME runs. scripts/run_pygnome_drift.py (run separately,
   in a conda env with PyGNOME installed) writes real particle-tracking
   results to backend/data/drift_runs/{spill_id}_{hindcast,forecast}.json.
   This module just loads them — no PyGNOME import here.
2. Everywhere else: a synthetic Lagrangian particle model (current + wind
   windage + random diffusion), so every spill_id returns a physically
   reasoned track even without a cached PyGNOME run.

Config: configs/drift.yaml (duration_hours, timestep_minutes).
"""

from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.config import BACKEND_ROOT

DRIFT_RUNS_DIR = BACKEND_ROOT / "data" / "drift_runs"

KM_PER_DEG_LAT = 111.0


def _cached_run(spill_id: str, mode: str) -> Optional[dict]:
    path = DRIFT_RUNS_DIR / f"{spill_id}_{mode}.json"
    if path.exists():
        return json.loads(path.read_text())
    return None


def _km_per_deg_lon(lat_deg: float) -> float:
    return KM_PER_DEG_LAT * math.cos(math.radians(lat_deg))


def _synthetic_field(lat: float, lon: float, t_hours: float) -> tuple[float, float]:
    """Smooth, bounded synthetic current+wind velocity (km/h) at a point/time.

    A slowly rotating gyre plus a steady monsoon-like drift component —
    divergence-free-ish and within realistic current/windage magnitudes
    (current ~0.1-1 m/s, wind contributing ~3% of ~5-12 m/s wind speed).
    """
    current_speed_kmh = 0.35 * 3.6  # ~0.35 m/s, typical Bay of Bengal surface current
    gyre_angle = math.radians(30) + 0.05 * t_hours
    current_u = current_speed_kmh * math.cos(gyre_angle) * math.sin(lat * 4)
    current_v = current_speed_kmh * math.sin(gyre_angle) * math.cos(lon * 4)

    wind_speed_kmh = 6.0 * 3.6 * 0.03  # ~6 m/s wind, 3% windage
    wind_angle = math.radians(210)  # steady NE monsoon-ish onshore component
    wind_u = wind_speed_kmh * math.cos(wind_angle)
    wind_v = wind_speed_kmh * math.sin(wind_angle)

    return current_u + wind_u, current_v + wind_v


def _synthetic_track(spill: dict, start_time: datetime, duration_hours: int,
                      timestep_minutes: int, backward: bool) -> list[dict]:
    rng = random.Random(spill.get("centroid", {}).get("lat", 0))
    lat = spill["centroid"]["lat"]
    lon = spill["centroid"]["lon"]
    polygon = spill.get("polygon")
    steps = max(1, (duration_hours * 60) // timestep_minutes)
    sign = -1 if backward else 1
    dt_h = timestep_minutes / 60.0

    track: list[dict] = []
    for i in range(int(steps) + 1):
        t_hours = sign * i * dt_h
        u_kmh, v_kmh = _synthetic_field(lat, lon, t_hours)
        diffusion_km = rng.uniform(-0.05, 0.05)

        dlat = sign * (v_kmh * dt_h + diffusion_km) / KM_PER_DEG_LAT
        dlon = sign * (u_kmh * dt_h + diffusion_km) / _km_per_deg_lon(lat)
        lat += dlat
        lon += dlon

        ts = start_time + timedelta(hours=t_hours)
        track.append(
            {
                "timestamp": ts.isoformat().replace("+00:00", "Z"),
                "centroid": {"lat": round(lat, 5), "lon": round(lon, 5)},
                "polygon": polygon,
                "uncertainty_radius_km": round(0.5 + 0.15 * i, 2),
            }
        )

    if backward:
        track.reverse()
    return track


def hindcast(spill: dict, start_time: datetime, duration_hours: int, timestep_minutes: int) -> dict:
    spill_id = spill["id"]
    cached = _cached_run(spill_id, "hindcast")
    if cached:
        return cached

    track = _synthetic_track(spill, start_time, duration_hours, timestep_minutes, backward=True)
    origin = track[0]["centroid"]
    return {
        "spill_id": spill_id,
        "source_estimate": {
            "lat": origin["lat"],
            "lon": origin["lon"],
            "window_start": track[0]["timestamp"],
            "window_end": track[min(3, len(track) - 1)]["timestamp"],
        },
        "source_probability_heatmap": None,
        "track": track,
    }


def forecast(spill: dict, start_time: datetime, duration_hours: int, timestep_minutes: int) -> dict:
    spill_id = spill["id"]
    cached = _cached_run(spill_id, "forecast")
    if cached:
        return cached

    track = _synthetic_track(spill, start_time, duration_hours, timestep_minutes, backward=False)
    return {"spill_id": spill_id, "track": track}
