"""
Vessel attribution scoring: combines spatial, temporal, trajectory,
behaviour, and context evidence into a ranked suspect list.

Used by: app/api/attribution.py (POST /api/attribution/run, GET /api/attribution/{id})

Config: configs/attribution.yaml (weights — spatial/temporal/trajectory/behaviour/context).

TODO: implement the actual scoring/ranking logic (see attribution/scoring.py,
attribution/features.py, attribution/ranking.py at the repo root per
roadmap §61) and produce the evidence[] list (app/schemas/common.py::EvidenceItem)
that explains each candidate's score for the UI.
"""

from __future__ import annotations


def score_and_rank(investigation: dict, weights: dict, spatial_radius_km: float, time_window_hours: float) -> list:
    raise NotImplementedError("Score each AIS candidate against the source estimate and rank by final_score.")
