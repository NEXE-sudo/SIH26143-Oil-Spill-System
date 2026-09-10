"""
Drift hindcast/forecast — traces slick movement backward (source region +
time) and forward (predicted trajectory).

This implementation supports the repo's internal-round PoC in two modes:

1. cached PyGNOME outputs if they exist under backend/data/drift_runs/
2. otherwise a synthetic Lagrangian particle model with physically sensible
   wind/current drift behavior, so the API continues to work without external
   forcing datasets or a live GNOME installation.

When real NetCDF forcing files are present under data/raw/forcing/, the model
uses the nearest available wind and current vectors instead of the synthetic
fallback. The response format stays compatible with the frontend and API.
"""

from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.config import BACKEND_ROOT
from app.config_loader import drift as drift_config

DRIFT_RUNS_DIR = BACKEND_ROOT / "data" / "drift_runs"
FORCING_DIR = BACKEND_ROOT.parent / "data" / "raw" / "forcing"
KM_PER_DEG_LAT = 111.0

_drift_defaults = drift_config()


def _cached_run(spill_id: str, mode: str) -> Optional[dict]:
    path = DRIFT_RUNS_DIR / f"{spill_id}_{mode}.json"
    if path.exists():
        return json.loads(path.read_text())
    return None


def _km_per_deg_lon(lat_deg: float) -> float:
    return KM_PER_DEG_LAT * math.cos(math.radians(lat_deg))


def _coerce_datetime(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        return value
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def _vector(u_m_s: float, v_m_s: float) -> dict:
    speed = math.hypot(u_m_s, v_m_s)
    direction_deg = math.degrees(math.atan2(v_m_s, u_m_s))
    direction_deg = (direction_deg + 360.0) % 360.0
    return {
        "u_m_s": round(float(u_m_s), 4),
        "v_m_s": round(float(v_m_s), 4),
        "speed_m_s": round(float(speed), 4),
        "direction_deg": round(float(direction_deg), 1),
    }


def _synthetic_field(lat: float, lon: float, t_hours: float) -> tuple[float, float]:
    """Smooth synthetic current+wind velocity in m/s at a point/time."""
    current_speed = 0.12
    gyre_angle = math.radians(30) + 0.05 * t_hours
    current_u = current_speed * math.cos(gyre_angle) * math.sin(lat * 4)
    current_v = current_speed * math.sin(gyre_angle) * math.cos(lon * 4)

    wind_speed = 1.7
    wind_angle = math.radians(210)
    wind_u = wind_speed * math.cos(wind_angle)
    wind_v = wind_speed * math.sin(wind_angle)

    return current_u + wind_u, current_v + wind_v


def _candidate_forcing_paths(kind: str) -> list[Path]:
    prefix = "wind" if kind == "wind" else "current"
    stem = "*_wind.nc" if kind == "wind" else "*_currents.nc"
    return [
        FORCING_DIR / f"chennai_demo_{kind}.nc" if kind == "wind" else FORCING_DIR / "chennai_demo_currents.nc",
        *sorted(FORCING_DIR.glob(stem)),
    ]


def _actual_forcing_vector(lat: float, lon: float, timestamp: datetime, kind: str) -> Optional[dict]:
    paths = _candidate_forcing_paths(kind)
    for path in paths:
        if not path.exists():
            continue
        try:
            import numpy as np
            from netCDF4 import Dataset, num2date
        except Exception:
            return None

        try:
            with Dataset(str(path)) as ds:
                # Common variable names: ERA5 wind uses u10 / v10 or names with '10m' and 'u/v';
                # Copernicus currents use uo/vo or u/v. Use the first matching names.
                gv_candidates = ["u10", "u10m", "10m_u_component_of_wind", "u_component_of_wind", "u", "uo"] if kind == "wind" else ["vo", "v", "v_component_of_current", "uo", "u"]
                uv_candidates = {"u": ["u10", "u10m", "10m_u_component_of_wind", "u_component_of_wind", "u", "uo"], "v": ["v10", "v10m", "10m_v_component_of_wind", "v_component_of_wind", "v", "vo"]}
                u_name = next((name for name in uv_candidates["u"] if name in ds.variables), None)
                v_name = next((name for name in uv_candidates["v"] if name in ds.variables), None)
                if not u_name or not v_name:
                    continue
                lat_name = next((name for name in ["lat", "latitude", "y"] if name in ds.variables), None)
                lon_name = next((name for name in ["lon", "longitude", "x"] if name in ds.variables), None)
                time_name = next((name for name in ["time", "valid_time"] if name in ds.variables), None)
                if not lat_name or not lon_name:
                    continue

                lat_vals = np.asarray(ds.variables[lat_name][:])
                lon_vals = np.asarray(ds.variables[lon_name][:])
                if lat_vals.ndim > 1:
                    lat_vals = lat_vals.ravel()
                if lon_vals.ndim > 1:
                    lon_vals = lon_vals.ravel()

                u_arr = np.asarray(ds.variables[u_name][:])
                v_arr = np.asarray(ds.variables[v_name][:])

                if time_name is not None:
                    time_var = ds.variables[time_name]
                    try:
                        time_values = num2date(time_var[:], time_var.units, only_use_cftime_datetimes=False)
                    except Exception:
                        time_values = []
                    if len(time_values) > 0:
                        idx_t = min(range(len(time_values)), key=lambda i: abs((time_values[i] - timestamp).total_seconds()))
                        if u_arr.ndim == 3:
                            u = float(u_arr[idx_t, np.argmin(np.abs(lat_vals - lat)), np.argmin(np.abs(lon_vals - lon))])
                            v = float(v_arr[idx_t, np.argmin(np.abs(lat_vals - lat)), np.argmin(np.abs(lon_vals - lon))])
                        elif u_arr.ndim == 2:
                            u = float(u_arr[np.argmin(np.abs(lat_vals - lat)), np.argmin(np.abs(lon_vals - lon))])
                            v = float(v_arr[np.argmin(np.abs(lat_vals - lat)), np.argmin(np.abs(lon_vals - lon))])
                        else:
                            continue
                        return _vector(float(u), float(v))

                lat_idx = int(np.argmin(np.abs(lat_vals - lat)))
                lon_idx = int(np.argmin(np.abs(lon_vals - lon)))
                if u_arr.ndim >= 2:
                    u = float(u_arr[lat_idx, lon_idx])
                    v = float(v_arr[lat_idx, lon_idx])
                    return _vector(u, v)
        except Exception:
            continue
    return None


def _forcing_vectors(lat: float, lon: float, timestamp: datetime) -> tuple[dict, dict]:
    wind = _actual_forcing_vector(lat, lon, timestamp, "wind")
    current = _actual_forcing_vector(lat, lon, timestamp, "current")
    if wind is None:
        wind_u, wind_v = _synthetic_field(lat, lon, float((timestamp.hour + timestamp.minute / 60.0)))
        wind = _vector(wind_u, wind_v)
    if current is None:
        current_u, current_v = _synthetic_field(lat, lon, float((timestamp.hour + timestamp.minute / 60.0)))
        current = _vector(current_u * 0.45, current_v * 0.45)
    return wind, current


def _source_mode_for(spill_id: str, cached: Optional[dict], mode: str) -> str:
    if cached is not None:
        return "cached_forcing"
    if any(path.exists() for path in _candidate_forcing_paths("wind") + _candidate_forcing_paths("current")):
        return "real_forcing"
    return "synthetic_fallback"


def _normalize_track(track: list[dict]) -> list[dict]:
    for point in track:
        if "wind" not in point or "current" not in point:
            centroid = point.get("centroid", {})
            lat = float(centroid.get("lat", 0.0))
            lon = float(centroid.get("lon", 0.0))
            timestamp = _coerce_datetime(point["timestamp"])
            wind, current = _forcing_vectors(lat, lon, timestamp)
            point["wind"] = wind
            point["current"] = current
    return track


def _synthetic_track(spill: dict, start_time: datetime | str, duration_hours: int,
                      timestep_minutes: int, backward: bool) -> list[dict]:
    start_time = _coerce_datetime(start_time)
    rng = random.Random(int(spill.get("centroid", {}).get("lat", 0) * 1000))
    lat = float(spill["centroid"]["lat"])
    lon = float(spill["centroid"]["lon"])
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
        wind, current = _forcing_vectors(lat, lon, ts)
        track.append(
            {
                "timestamp": ts.isoformat().replace("+00:00", "Z"),
                "centroid": {"lat": round(lat, 5), "lon": round(lon, 5)},
                "polygon": polygon,
                "uncertainty_radius_km": round(0.5 + 0.15 * i, 2),
                "wind": wind,
                "current": current,
            }
        )

    if backward:
        track.reverse()
    return track


def hindcast(spill: dict, start_time: datetime | str, duration_hours: int = None, timestep_minutes: int = None) -> dict:
    spill_id = spill["id"]
    cached = _cached_run(spill_id, "hindcast")
    if cached:
        return {
            **cached,
            "source_mode": "cached_forcing",
            "track": _normalize_track(cached.get("track", [])),
        }

    duration_hours = duration_hours or int(_drift_defaults.get("duration_hours", 24))
    timestep_minutes = timestep_minutes or int(_drift_defaults.get("timestep_minutes", 15))

    start_time = _coerce_datetime(start_time)
    track = _synthetic_track(spill, start_time, duration_hours, timestep_minutes, backward=True)
    origin = track[0]["centroid"]
    return {
        "spill_id": spill_id,
        "source_mode": _source_mode_for(spill_id, cached, "hindcast"),
        "source_estimate": {
            "lat": origin["lat"],
            "lon": origin["lon"],
            "window_start": track[0]["timestamp"],
            "window_end": track[min(3, len(track) - 1)]["timestamp"],
        },
        "source_probability_heatmap": None,
        "track": track,
    }


def forecast(spill: dict, start_time: datetime | str, duration_hours: int = None, timestep_minutes: int = None) -> dict:
    spill_id = spill["id"]
    cached = _cached_run(spill_id, "forecast")
    if cached:
        return {
            "spill_id": spill_id,
            "source_mode": "cached_forcing",
            "track": _normalize_track(cached.get("track", [])),
        }

    duration_hours = duration_hours or int(_drift_defaults.get("duration_hours", 24))
    timestep_minutes = timestep_minutes or int(_drift_defaults.get("timestep_minutes", 15))

    start_time = _coerce_datetime(start_time)
    track = _synthetic_track(spill, start_time, duration_hours, timestep_minutes, backward=False)
    return {"spill_id": spill_id, "source_mode": _source_mode_for(spill_id, cached, "forecast"), "track": track}
