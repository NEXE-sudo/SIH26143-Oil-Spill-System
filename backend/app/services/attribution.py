"""
Vessel attribution scoring: combines spatial, temporal, trajectory,
behaviour, and context evidence into a ranked suspect list.

This implementation keeps the scoring transparent and explainable: every
candidate receives a final score derived from the config weights and a
human-readable evidence list so the front-end can display a proper reasoned
ranking without hiding the formula inside a black box.
"""

from __future__ import annotations


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _score_from_distance(distance_km: float, spatial_radius_km: float) -> float:
    if spatial_radius_km <= 0:
        return 0.0
    return _clamp01(1.0 - (distance_km / spatial_radius_km))


def _score_from_time(time_diff_h: float, time_window_hours: float) -> float:
    if time_window_hours <= 0:
        return 0.0
    return _clamp01(1.0 - (time_diff_h / time_window_hours))


def _default_evidence(vessel: dict, distance_km: float, time_diff_h: float, trajectory_score: float) -> list[dict]:
    evidence = []
    if distance_km is not None:
        evidence.append({
            "ok": distance_km <= 10,
            "text": f"Passed within {distance_km:.1f} km of the estimated source",
        })
    if time_diff_h is not None:
        evidence.append({
            "ok": time_diff_h <= 3,
            "text": f"Passed {time_diff_h:.1f} h from the estimated source window",
        })
    evidence.append({
        "ok": trajectory_score >= 0.6,
        "text": "Track direction is compatible with the source-to-spill trajectory",
    })
    return evidence


def score_and_rank(investigation: dict, weights: dict, spatial_radius_km: float, time_window_hours: float) -> list:
    """Return vessels sorted by a transparent evidence-weighted score."""
    if not investigation.get("vessels"):
        return []

    w = {
        "spatial": float(weights.get("spatial", 0.30)),
        "temporal": float(weights.get("temporal", 0.25)),
        "trajectory": float(weights.get("trajectory", 0.20)),
        "behaviour": float(weights.get("behaviour", 0.15)),
        "context": float(weights.get("context", 0.10)),
    }

    ranked: list[dict] = []
    for vessel in investigation["vessels"]:
        distance_km = float(vessel.get("distance_km", 0.0))
        time_diff_h = float(vessel.get("time_diff_h", 0.0))
        spatial_score = _score_from_distance(distance_km, spatial_radius_km)
        temporal_score = _score_from_time(time_diff_h, time_window_hours)
        trajectory_score = _clamp01(float(vessel.get("trajectory", 0.0)))
        behaviour_score = _clamp01(float(vessel.get("behaviour", 0.0)))
        context_score = _clamp01(float(vessel.get("context", 0.5)))

        final_score = (
            w["spatial"] * spatial_score
            + w["temporal"] * temporal_score
            + w["trajectory"] * trajectory_score
            + w["behaviour"] * behaviour_score
            + w["context"] * context_score
        )

        vessel_copy = dict(vessel)
        vessel_copy["final_score"] = round(_clamp01(final_score), 4)
        vessel_copy["spatial"] = round(spatial_score, 4)
        vessel_copy["temporal"] = round(temporal_score, 4)
        vessel_copy["trajectory"] = round(trajectory_score, 4)
        vessel_copy["behaviour"] = round(behaviour_score, 4)
        vessel_copy["context"] = round(context_score, 4)
        vessel_copy["evidence"] = vessel_copy.get("evidence") or _default_evidence(
            vessel_copy, distance_km, time_diff_h, trajectory_score
        )

        ranked.append(vessel_copy)

    ranked.sort(key=lambda v: v["final_score"], reverse=True)
    return ranked
