"""
AIS ingestion, spatial/temporal filtering, and per-vessel track
reconstruction. Feeds services/attribution.py.

Used by: app/api/vessels.py (GET /api/vessels/candidates, /{mmsi})

Config: configs/attribution.yaml (ais.spatial_radius_km, ais.time_window_hours).

TODO: connect to a real AIS source (e.g. NOAA MarineCadastre for demo
data, see ais/ingestion/ at the repo root) and implement:
    - candidate_vessels(source_estimate, spatial_radius_km, time_window_hours)
    - track_for(mmsi, time_start, time_end) -> list[AISPoint]
"""

from __future__ import annotations


def candidate_vessels(source_estimate: dict, spatial_radius_km: float, time_window_hours: float) -> list:
    raise NotImplementedError("Query AIS points within the spatial/temporal window of the source estimate.")


def track_for(mmsi: str, time_start: str, time_end: str) -> list:
    raise NotImplementedError("Reconstruct the point-level AIS track for this vessel/window.")
