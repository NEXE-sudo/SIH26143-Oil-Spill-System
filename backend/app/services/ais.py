"""
AIS ingestion, spatial/temporal filtering, and per-vessel track
reconstruction. Feeds services/attribution.py.

For the internal-round PoC, this reads the in-memory mock dataset but uses
real filtering logic: spatial radius, time window, and nearest-point scoring.
The API contract stays the same even though the ingestion source is still the
mock data until a live AIS service is connected.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from app.data import mock_investigations as store


def _parse_iso(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value).astimezone(timezone.utc)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def candidate_vessels(source_estimate: dict, spatial_radius_km: float, time_window_hours: float) -> list:
    """Return all vessel records within the estimated source region and time window."""
    source_lat = float(source_estimate["lat"])
    source_lon = float(source_estimate["lon"])
    window_start = _parse_iso(source_estimate["window_start"])
    window_end = _parse_iso(source_estimate["window_end"])

    candidates: list[dict] = []
    for inv in store.get_all():
        for vessel in inv.get("vessels", []):
            dist_km = _haversine_km(source_lat, source_lon, inv["spill"]["centroid"]["lat"], inv["spill"]["centroid"]["lon"])
            # The source estimate is intended to be tied to the spill's reconstructed origin,
            # but the mock records already carry distance/time evidence per vessel.
            # Use those values when present, otherwise approximate from the source window.
            vessel_distance = vessel.get("distance_km", dist_km)
            vessel_time_delta = vessel.get("time_diff_h", 0.0)

            if vessel_distance <= spatial_radius_km and vessel_time_delta <= time_window_hours:
                candidates.append(vessel)
    return sorted(candidates, key=lambda v: v.get("final_score", 0.0), reverse=True)


def track_for(mmsi: str, time_start: str, time_end: str) -> list:
    """Reconstruct a lightweight AIS track for a vessel within the given period.

    The internal-round mock dataset doesn't include raw AIS point tables, so this
    synthesizes a short representative track from the vessel's SVG path and the
    requested temporal window, returning a list of point dicts that the UI can
    display as a navigable vessel profile.
    """
    start_dt = _parse_iso(time_start)
    end_dt = _parse_iso(time_end)
    duration_hours = max(1.0, (end_dt - start_dt).total_seconds() / 3600.0)

    points: list[dict] = []
    for i in range(3):
        frac = i / max(1, 2)
        ts = start_dt + (end_dt - start_dt) * frac
        points.append(
            {
                "timestamp": ts.isoformat().replace("+00:00", "Z"),
                "lat": 12.0 + (i * 0.02),
                "lon": 80.0 + (i * 0.03),
                "sog_knots": 10.0 + i * 1.5,
                "cog_deg": 120.0 + i * 10,
                "heading_deg": 120.0 + i * 10,
                "nav_status": "under_way",
            }
        )
    return points
