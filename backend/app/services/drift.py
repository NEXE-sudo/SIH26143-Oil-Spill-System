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


def _temperature(lat: float, lon: float, timestamp: datetime, kind: str) -> float:
    """Fallback temperature field used when forcing files have no temperature variable."""
    seasonal = math.sin((timestamp.timetuple().tm_yday / 365.0) * 2 * math.pi)
    spatial = 1.8 * math.sin(math.radians(lat * 3.0)) + 0.8 * math.cos(math.radians(lon))
    return round((27.0 if kind == "current" else 20.0) + seasonal * 1.2 + spatial, 1)


def _forcing_field(lat: float, lon: float, timestamp: datetime, kind: str) -> list[dict]:
    """Sample an independent 3x3 field around the slick at the same timestamp."""
    samples = []
    for lat_offset in (-0.025, 0.0, 0.025):
        for lon_offset in (-0.035, 0.0, 0.035):
            sample_lat = lat + lat_offset
            sample_lon = lon + lon_offset
            vector = _actual_forcing_vector(sample_lat, sample_lon, timestamp, kind)
            if vector is None:
                base_u, base_v = _synthetic_field(sample_lat, sample_lon, timestamp.hour + timestamp.minute / 60.0)
                if kind == "current":
                    base_u *= 0.45
                    base_v *= 0.45
                vector = _vector(base_u, base_v)
            vector["lat"] = round(sample_lat, 5)
            vector["lon"] = round(sample_lon, 5)
            vector["temperature_c"] = _temperature(sample_lat, sample_lon, timestamp, kind)
            samples.append(vector)
    return samples


def _is_land(lat: float, lon: float) -> bool:
    """Return the coastline classification used by the particle model."""
    try:
        from global_land_mask import globe

        return bool(globe.is_land(lat, lon))
    except Exception:
        return False


def _sea_position(lat: float, lon: float, previous_lat: float, previous_lon: float) -> tuple[float, float]:
    """Prevent a particle step from crossing onto land by bisecting the step."""
    if not _is_land(lat, lon):
        return lat, lon
    for fraction in (0.5, 0.25, 0.125, 0.0625, 0.03125):
        candidate_lat = previous_lat + (lat - previous_lat) * fraction
        candidate_lon = previous_lon + (lon - previous_lon) * fraction
        if not _is_land(candidate_lat, candidate_lon):
            return candidate_lat, candidate_lon
    return previous_lat, previous_lon


def _slick_polygon(lat: float, lon: float, major_axis_km: float, minor_axis_km: float,
                   orientation_deg: float, uncertainty_km: float) -> str:
    """Build a sea-only GeoJSON footprint instead of a growing map circle."""
    points = []
    angle = math.radians(orientation_deg)
    for index in range(48):
        theta = 2 * math.pi * index / 48
        radius_major = max(0.1, major_axis_km / 2 + uncertainty_km * 0.18)
        radius_minor = max(0.1, minor_axis_km / 2 + uncertainty_km * 0.08)
        east_km = radius_major * math.cos(theta) * math.cos(angle) - radius_minor * math.sin(theta) * math.sin(angle)
        north_km = radius_major * math.cos(theta) * math.sin(angle) + radius_minor * math.sin(theta) * math.cos(angle)
        point_lat = lat + north_km / KM_PER_DEG_LAT
        point_lon = lon + east_km / _km_per_deg_lon(lat)
        if not _is_land(point_lat, point_lon):
            points.append([point_lon, point_lat])

    if len(points) < 3:
        points = [[lon, lat]] * 3
    points.append(points[0])
    return json.dumps({"type": "Polygon", "coordinates": [points]})


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
                if kind == "wind":
                    uv_candidates = {
                        "u": ["u10", "u10m", "10m_u_component_of_wind", "u_component_of_wind", "u"],
                        "v": ["v10", "v10m", "10m_v_component_of_wind", "v_component_of_wind", "v"],
                    }
                else:
                    uv_candidates = {
                        "u": ["uo", "u_component_of_current", "eastward_sea_water_velocity", "u"],
                        "v": ["vo", "v_component_of_current", "northward_sea_water_velocity", "v"],
                    }
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


def _forcing_payload(lat: float, lon: float, timestamp: datetime) -> dict:
    wind, current = _forcing_vectors(lat, lon, timestamp)
    wind["temperature_c"] = _temperature(lat, lon, timestamp, "wind")
    current["temperature_c"] = _temperature(lat, lon, timestamp, "current")
    return {
        "wind": wind,
        "current": current,
        "wind_field": _forcing_field(lat, lon, timestamp, "wind"),
        "current_field": _forcing_field(lat, lon, timestamp, "current"),
    }


def _source_mode_for(spill_id: str, cached: Optional[dict], mode: str) -> str:
    if cached is not None:
        return "cached_forcing"
    if any(path.exists() for path in _candidate_forcing_paths("wind") + _candidate_forcing_paths("current")):
        return "real_forcing"
    return "synthetic_fallback"


def _normalize_track(track: list[dict], spill: dict, start_time: datetime,
                     backward: bool) -> list[dict]:
    if track:
        anchor_index = -1 if backward else 0
        anchor_centroid = track[anchor_index].get("centroid", {})
        lat_offset = float(spill["centroid"]["lat"]) - float(anchor_centroid.get("lat", 0.0))
        lon_offset = float(spill["centroid"]["lon"]) - float(anchor_centroid.get("lon", 0.0))
        for point in track:
            point["centroid"] = {
                "lat": float(point["centroid"]["lat"]) + lat_offset,
                "lon": float(point["centroid"]["lon"]) + lon_offset,
            }

        duration = timedelta(hours=float(_drift_defaults.get("duration_hours", 24)))
        first_time = start_time - duration if backward else start_time
        timestep = duration / max(1, len(track) - 1)
        for index, point in enumerate(track):
            timestamp = first_time + timestep * index
            point["timestamp"] = timestamp.isoformat().replace("+00:00", "Z")

    previous = None
    for point in track:
        lat = float(point["centroid"]["lat"])
        lon = float(point["centroid"]["lon"])
        if previous is not None:
            lat, lon = _sea_position(lat, lon, previous[0], previous[1])
            point["centroid"] = {"lat": round(lat, 5), "lon": round(lon, 5)}
        previous = (lat, lon)
        timestamp = _coerce_datetime(point["timestamp"])
        point.update(_forcing_payload(lat, lon, timestamp))
        if not point.get("polygon", "").startswith("{"):
            point["polygon"] = _slick_polygon(
                float(point["centroid"]["lat"]),
                float(point["centroid"]["lon"]),
                float(spill.get("major_axis_km", 4.0)),
                float(spill.get("minor_axis_km", 1.5)),
                float(spill.get("orientation_deg", 0.0)),
                float(point.get("uncertainty_radius_km") or 0.5),
            )
    return track


def _synthetic_track(spill: dict, start_time: datetime | str, duration_hours: int,
                      timestep_minutes: int, backward: bool) -> list[dict]:
    start_time = _coerce_datetime(start_time)
    rng = random.Random(int(spill.get("centroid", {}).get("lat", 0) * 1000))
    lat = float(spill["centroid"]["lat"])
    lon = float(spill["centroid"]["lon"])
    steps = max(1, (duration_hours * 60) // timestep_minutes)
    sign = -1 if backward else 1
    dt_h = timestep_minutes / 60.0

    track: list[dict] = []
    for i in range(int(steps) + 1):
        t_hours = sign * i * dt_h
        u_kmh, v_kmh = _synthetic_field(lat, lon, t_hours)
        ts = start_time + timedelta(hours=t_hours)
        forcing = _forcing_payload(lat, lon, ts)
        track.append(
            {
                "timestamp": ts.isoformat().replace("+00:00", "Z"),
                "centroid": {"lat": round(lat, 5), "lon": round(lon, 5)},
                "polygon": _slick_polygon(
                    lat,
                    lon,
                    float(spill.get("major_axis_km", 4.0)),
                    float(spill.get("minor_axis_km", 1.5)),
                    float(spill.get("orientation_deg", 0.0)),
                    0.5 + 0.15 * i,
                ),
                "uncertainty_radius_km": round(0.5 + 0.15 * i, 2),
                **forcing,
            }
        )

        if i < int(steps):
            diffusion_km = rng.uniform(-0.05, 0.05)
            dlat = sign * (v_kmh * dt_h + diffusion_km) / KM_PER_DEG_LAT
            dlon = sign * (u_kmh * dt_h + diffusion_km) / _km_per_deg_lon(lat)
            lat, lon = _sea_position(lat + dlat, lon + dlon, lat, lon)

    if backward:
        track.reverse()
    return track


def hindcast(spill: dict, start_time: datetime | str, duration_hours: int = None, timestep_minutes: int = None) -> dict:
    spill_id = spill["id"]
    cached = _cached_run(spill_id, "hindcast")
    start_time = _coerce_datetime(start_time)
    if cached:
        track = _normalize_track(cached.get("track", []), spill, start_time, True)
        origin = track[0]["centroid"]
        return {
            "spill_id": spill_id,
            "source_mode": "cached_forcing",
            "source_estimate": {
                "lat": origin["lat"],
                "lon": origin["lon"],
                "window_start": track[0]["timestamp"],
                "window_end": track[min(3, len(track) - 1)]["timestamp"],
            },
            "source_probability_heatmap": cached.get("source_probability_heatmap"),
            "track": track,
        }

    duration_hours = duration_hours or int(_drift_defaults.get("duration_hours", 24))
    timestep_minutes = timestep_minutes or int(_drift_defaults.get("timestep_minutes", 15))

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
    start_time = _coerce_datetime(start_time)
    if cached:
        return {
            "spill_id": spill_id,
            "source_mode": "cached_forcing",
            "track": _normalize_track(cached.get("track", []), spill, start_time, False),
        }

    duration_hours = duration_hours or int(_drift_defaults.get("duration_hours", 24))
    timestep_minutes = timestep_minutes or int(_drift_defaults.get("timestep_minutes", 15))

    track = _synthetic_track(spill, start_time, duration_hours, timestep_minutes, backward=False)
    return {"spill_id": spill_id, "source_mode": _source_mode_for(spill_id, cached, "forecast"), "track": track}
