"""
In-memory mock dataset backing the API templates.

This is a direct port of the frontend's src/data/reports.js so that every
endpoint in app/api/ returns data in exactly the shape the frontend already
renders. Once the real services (services/detection.py, services/drift.py,
services/ais.py, services/attribution.py) are implemented, swap the reads
below for calls into those services / the database — the route handlers
and Pydantic schemas do not need to change shape.

See roadmap:
  §56 Recommended Software Architecture
  §60 Suggested Database (investigations -> spills -> vessels -> ...)
  §65 Example Investigation Object
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional


def _days_ago_iso(days: int, hour: int = 10, minute: int = 35) -> str:
    d = datetime.now(timezone.utc) - timedelta(days=days)
    d = d.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return d.isoformat().replace("+00:00", "Z")


STATUS_LABELS: Dict[str, str] = {
    "lodged": "Lodged",
    "pending": "Pending",
    "completed": "Completed",
}


INVESTIGATIONS: List[Dict[str, Any]] = [
    {
        "id": "INV-2026-0001",
        "status": "completed",
        "lodged_at": _days_ago_iso(1),
        "satellite": {
            "platform": "Sentinel-1",
            "product": "GRD",
            "timestamp": _days_ago_iso(1),
        },
        "spill": {
            "confidence": 0.91,
            "area_km2": 12.83,
            "perimeter_km": 17.4,
            "centroid": {"lat": 13.48858, "lon": 80.40159},
            "major_axis_km": 6.4,
            "minor_axis_km": 1.9,
            "orientation_deg": 41,
            "polygon": "M 168,132 L 198,124 L 224,134 L 232,150 L 214,168 L 182,166 L 162,152 Z",
        },
        "source": {
            "lat": 13.48858,
            "lon": 80.40159,
            "window_start": _days_ago_iso(1, 2, 0),
            "window_end": _days_ago_iso(1, 8, 0),
        },
        "vessels": [
            {
                "mmsi": "357219004",
                "imo": "9456213",
                "name": "MV KAVERI STAR",
                "flag": "India",
                "vessel_type": "Crude oil tanker",
                "final_score": 0.87,
                "spatial": 0.96,
                "temporal": 0.91,
                "trajectory": 0.88,
                "behaviour": 0.62,
                "distance_km": 3.2,
                "time_diff_h": 1.4,
                "dwell_min": 42,
                "track": "M 150,180 L 172,160 L 196,148 L 210,140",
                "evidence": [
                    {"ok": True, "text": "Passed within 3.2 km of estimated source"},
                    {"ok": True, "text": "Passed during estimated source window"},
                    {"ok": True, "text": "Track direction consistent with source-to-spill path"},
                    {"ok": True, "text": "Remained in region for 42 minutes"},
                    {"ok": None, "text": "Moderate behavioural anomaly"},
                    {"ok": True, "text": "AIS track overlaps 71% of high-probability source corridor"},
                ],
            },
            {
                "mmsi": "412998231",
                "imo": "9812734",
                "name": "MV DELTA HORIZON",
                "flag": "Panama",
                "vessel_type": "Product tanker",
                "final_score": 0.73,
                "spatial": 0.81,
                "temporal": 0.7,
                "trajectory": 0.75,
                "behaviour": 0.4,
                "distance_km": 8.6,
                "time_diff_h": 3.1,
                "dwell_min": 18,
                "track": "M 120,210 L 140,190 L 158,172 L 176,158",
                "evidence": [
                    {"ok": True, "text": "Passed within 8.6 km of estimated source"},
                    {"ok": True, "text": "Within source window with 3.1 h margin"},
                    {"ok": None, "text": "Trajectory partially compatible"},
                    {"ok": False, "text": "No unusual behaviour detected"},
                ],
            },
            {
                "mmsi": "563102887",
                "imo": "9345981",
                "name": "MV OSPREY TRADER",
                "flag": "Liberia",
                "vessel_type": "Bulk carrier",
                "final_score": 0.51,
                "spatial": 0.58,
                "temporal": 0.44,
                "trajectory": 0.52,
                "behaviour": 0.35,
                "distance_km": 21.4,
                "time_diff_h": 6.8,
                "dwell_min": 6,
                "track": "M 240,110 L 250,130 L 246,150 L 236,164",
                "evidence": [
                    {"ok": None, "text": "21.4 km from estimated source — moderate distance"},
                    {"ok": None, "text": "6.8 h outside tightest source window"},
                    {"ok": False, "text": "No dwell time near source"},
                ],
            },
        ],
        "metrics": {
            "oil_iou": 0.84,
            "oil_f1": 0.89,
            "false_positive_rate": 0.06,
            "source_error_km": 4.1,
            "candidate_recall": 0.93,
            "top3_recall": 1.0,
            "processing_time_s": 38,
        },
    },
    {
        "id": "INV-2026-0002",
        "status": "pending",
        "lodged_at": _days_ago_iso(3),
        "satellite": {
            "platform": "Sentinel-1",
            "product": "GRD",
            "timestamp": _days_ago_iso(3),
        },
        "spill": {
            "confidence": 0.78,
            "area_km2": 6.42,
            "perimeter_km": 11.1,
            "centroid": {"lat": 15.802, "lon": 73.914},
            "major_axis_km": 4.1,
            "minor_axis_km": 1.3,
            "orientation_deg": 112,
            "polygon": "M 150,110 L 178,104 L 200,118 L 196,138 L 170,142 L 150,128 Z",
        },
        "source": {
            "lat": 15.77,
            "lon": 73.86,
            "window_start": _days_ago_iso(3, 22, 0),
            "window_end": _days_ago_iso(3, 4, 0),
        },
        "vessels": [
            {
                "mmsi": "419887210",
                "imo": "9601122",
                "name": "MV KONKAN PIONEER",
                "flag": "India",
                "vessel_type": "Chemical tanker",
                "final_score": 0.68,
                "spatial": 0.74,
                "temporal": 0.7,
                "trajectory": 0.6,
                "behaviour": 0.45,
                "distance_km": 6.9,
                "time_diff_h": 2.6,
                "dwell_min": 24,
                "track": "M 110,150 L 132,136 L 150,122 L 164,112",
                "evidence": [
                    {"ok": True, "text": "Passed within 6.9 km of estimated source"},
                    {"ok": True, "text": "Within source window"},
                    {"ok": None, "text": "Trajectory loosely compatible"},
                ],
            },
            {
                "mmsi": "273940015",
                "imo": "9223447",
                "name": "MV BLUE MERIDIAN",
                "flag": "Malta",
                "vessel_type": "Crude oil tanker",
                "final_score": 0.44,
                "spatial": 0.5,
                "temporal": 0.38,
                "trajectory": 0.4,
                "behaviour": 0.3,
                "distance_km": 14.2,
                "time_diff_h": 5.4,
                "dwell_min": 4,
                "track": "M 210,90 L 216,108 L 208,126 L 196,138",
                "evidence": [
                    {"ok": None, "text": "14.2 km from estimated source"},
                    {"ok": False, "text": "Outside tightest time window"},
                ],
            },
        ],
        "metrics": {
            "oil_iou": 0.71,
            "oil_f1": 0.76,
            "false_positive_rate": 0.11,
            "source_error_km": 7.8,
            "candidate_recall": 0.85,
            "top3_recall": 1.0,
            "processing_time_s": 44,
        },
    },
    {
        "id": "INV-2026-0003",
        "status": "lodged",
        "lodged_at": _days_ago_iso(0, 6, 10),
        "satellite": {
            "platform": "Sentinel-1",
            "product": "GRD",
            "timestamp": _days_ago_iso(0, 6, 10),
        },
        "spill": {
            "confidence": 0.66,
            "area_km2": 3.15,
            "perimeter_km": 7.4,
            "centroid": {"lat": 8.912, "lon": 76.554},
            "major_axis_km": 2.6,
            "minor_axis_km": 0.9,
            "orientation_deg": 88,
            "polygon": "M 180,150 L 200,146 L 214,156 L 208,172 L 190,174 L 178,164 Z",
        },
        "source": {
            "lat": 8.88,
            "lon": 76.51,
            "window_start": _days_ago_iso(0, 1, 0),
            "window_end": _days_ago_iso(0, 5, 0),
        },
        "vessels": [
            {
                "mmsi": "525018732",
                "imo": "9772341",
                "name": "MV MALABAR VOYAGER",
                "flag": "India",
                "vessel_type": "Product tanker",
                "final_score": 0.59,
                "spatial": 0.63,
                "temporal": 0.6,
                "trajectory": 0.55,
                "behaviour": 0.4,
                "distance_km": 9.8,
                "time_diff_h": 2.0,
                "dwell_min": 15,
                "track": "M 140,190 L 160,176 L 178,164 L 190,154",
                "evidence": [
                    {"ok": True, "text": "Passed within 9.8 km of estimated source"},
                    {"ok": None, "text": "Within a wider source window"},
                ],
            },
        ],
        "metrics": {
            "oil_iou": None,
            "oil_f1": None,
            "false_positive_rate": None,
            "source_error_km": None,
            "candidate_recall": None,
            "top3_recall": None,
            "processing_time_s": None,
        },
    },
    {
        "id": "INV-2026-0004",
        "status": "completed",
        "lodged_at": _days_ago_iso(9),
        "satellite": {
            "platform": "Sentinel-1",
            "product": "GRD",
            "timestamp": _days_ago_iso(9),
        },
        "spill": {
            "confidence": 0.95,
            "area_km2": 21.6,
            "perimeter_km": 24.9,
            "centroid": {"lat": 19.072, "lon": 72.881},
            "major_axis_km": 8.9,
            "minor_axis_km": 2.4,
            "orientation_deg": 30,
            "polygon": "M 160,120 L 200,112 L 232,128 L 228,156 L 194,166 L 162,148 Z",
        },
        "source": {
            "lat": 19.02,
            "lon": 72.83,
            "window_start": _days_ago_iso(9, 3, 0),
            "window_end": _days_ago_iso(9, 9, 0),
        },
        "vessels": [
            {
                "mmsi": "244550019",
                "imo": "9111203",
                "name": "MV NORTHERN TIDE",
                "flag": "Netherlands",
                "vessel_type": "Crude oil tanker",
                "final_score": 0.93,
                "spatial": 0.97,
                "temporal": 0.95,
                "trajectory": 0.92,
                "behaviour": 0.7,
                "distance_km": 1.8,
                "time_diff_h": 0.6,
                "dwell_min": 68,
                "track": "M 130,180 L 156,160 L 182,144 L 204,132",
                "evidence": [
                    {"ok": True, "text": "Passed within 1.8 km of estimated source"},
                    {"ok": True, "text": "Passed during estimated source window (0.6 h margin)"},
                    {"ok": True, "text": "Track direction consistent with source-to-spill path"},
                    {"ok": True, "text": "Remained in region for 68 minutes"},
                    {"ok": True, "text": "AIS track overlaps 88% of high-probability source corridor"},
                ],
            },
            {
                "mmsi": "636019204",
                "imo": "9299456",
                "name": "MV SOUTHERN CROSS",
                "flag": "Marshall Islands",
                "vessel_type": "Bulk carrier",
                "final_score": 0.38,
                "spatial": 0.42,
                "temporal": 0.3,
                "trajectory": 0.35,
                "behaviour": 0.25,
                "distance_km": 18.9,
                "time_diff_h": 7.2,
                "dwell_min": 3,
                "track": "M 250,100 L 244,120 L 238,142 L 228,156",
                "evidence": [
                    {"ok": False, "text": "Well outside source window"},
                    {"ok": None, "text": "18.9 km from estimated source"},
                ],
            },
        ],
        "metrics": {
            "oil_iou": 0.9,
            "oil_f1": 0.93,
            "false_positive_rate": 0.03,
            "source_error_km": 2.2,
            "candidate_recall": 1.0,
            "top3_recall": 1.0,
            "processing_time_s": 31,
        },
    },
    {
        "id": "INV-2026-0005",
        "status": "pending",
        "lodged_at": _days_ago_iso(14),
        "satellite": {
            "platform": "Sentinel-1",
            "product": "GRD",
            "timestamp": _days_ago_iso(14),
        },
        "spill": {
            "confidence": 0.72,
            "area_km2": 5.05,
            "perimeter_km": 9.8,
            "centroid": {"lat": 11.652, "lon": 92.749},
            "major_axis_km": 3.4,
            "minor_axis_km": 1.1,
            "orientation_deg": 64,
            "polygon": "M 170,140 L 192,132 L 208,146 L 200,164 L 180,166 L 166,154 Z",
        },
        "source": {
            "lat": 11.6,
            "lon": 92.7,
            "window_start": _days_ago_iso(14, 20, 0),
            "window_end": _days_ago_iso(14, 2, 0),
        },
        "vessels": [
            {
                "mmsi": "574102893",
                "imo": "9500217",
                "name": "MV ANDAMAN PRIDE",
                "flag": "India",
                "vessel_type": "Fishing support vessel",
                "final_score": 0.47,
                "spatial": 0.52,
                "temporal": 0.48,
                "trajectory": 0.4,
                "behaviour": 0.35,
                "distance_km": 12.6,
                "time_diff_h": 4.0,
                "dwell_min": 9,
                "track": "M 120,170 L 142,160 L 160,150 L 176,142",
                "evidence": [
                    {"ok": None, "text": "12.6 km from estimated source"},
                    {"ok": None, "text": "Within a wider time window"},
                ],
            },
        ],
        "metrics": {
            "oil_iou": None,
            "oil_f1": None,
            "false_positive_rate": None,
            "source_error_km": None,
            "candidate_recall": None,
            "top3_recall": None,
            "processing_time_s": None,
        },
    },
    {
        "id": "INV-2026-0006",
        "status": "completed",
        "lodged_at": _days_ago_iso(27),
        "satellite": {
            "platform": "Sentinel-1",
            "product": "GRD",
            "timestamp": _days_ago_iso(27),
        },
        "spill": {
            "confidence": 0.88,
            "area_km2": 9.9,
            "perimeter_km": 15.2,
            "centroid": {"lat": 22.311, "lon": 69.104},
            "major_axis_km": 5.6,
            "minor_axis_km": 1.6,
            "orientation_deg": 55,
            "polygon": "M 150,130 L 182,122 L 204,136 L 196,158 L 168,162 L 148,148 Z",
        },
        "source": {
            "lat": 22.27,
            "lon": 69.05,
            "window_start": _days_ago_iso(27, 1, 0),
            "window_end": _days_ago_iso(27, 7, 0),
        },
        "vessels": [
            {
                "mmsi": "419720056",
                "imo": "9345021",
                "name": "MV KUTCH MARINER",
                "flag": "India",
                "vessel_type": "Product tanker",
                "final_score": 0.81,
                "spatial": 0.85,
                "temporal": 0.83,
                "trajectory": 0.78,
                "behaviour": 0.55,
                "distance_km": 4.4,
                "time_diff_h": 1.8,
                "dwell_min": 35,
                "track": "M 110,160 L 134,146 L 156,134 L 172,124",
                "evidence": [
                    {"ok": True, "text": "Passed within 4.4 km of estimated source"},
                    {"ok": True, "text": "Passed during estimated source window"},
                    {"ok": True, "text": "Trajectory consistent with source-to-spill path"},
                ],
            },
        ],
        "metrics": {
            "oil_iou": 0.8,
            "oil_f1": 0.85,
            "false_positive_rate": 0.08,
            "source_error_km": 5.0,
            "candidate_recall": 0.9,
            "top3_recall": 1.0,
            "processing_time_s": 40,
        },
    },
]


def get_all() -> List[Dict[str, Any]]:
    return INVESTIGATIONS


def get_by_id(investigation_id: str) -> Optional[Dict[str, Any]]:
    return next((inv for inv in INVESTIGATIONS if inv["id"] == investigation_id), None)


def get_vessel(investigation_id: str, mmsi: str) -> Optional[Dict[str, Any]]:
    inv = get_by_id(investigation_id)
    if not inv:
        return None
    return next((v for v in inv["vessels"] if v["mmsi"] == mmsi), None)


def find_vessel_anywhere(mmsi: str) -> Optional[Dict[str, Any]]:
    """GET /api/vessels/{mmsi} has no investigation context, so scan all records."""
    for inv in INVESTIGATIONS:
        for v in inv["vessels"]:
            if v["mmsi"] == mmsi:
                return v
    return None
