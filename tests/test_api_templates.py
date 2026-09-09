"""
Smoke tests for every route in backend/app/api/.

Run from repo root:
    pip install -r backend/requirements.txt pytest httpx
    PYTHONPATH=backend pytest tests/

These check the response shapes hold (status codes + key fields) against
the mock dataset — they are not meant to validate the real science once
services/ stops raising NotImplementedError.
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402
from app.data import mock_investigations as store  # noqa: E402
from app.services.ais import candidate_vessels  # noqa: E402
from app.services.attribution import score_and_rank  # noqa: E402
from app.services.drift import hindcast  # noqa: E402

client = TestClient(app)

KNOWN_INVESTIGATION_ID = "INV-2026-0001"
KNOWN_MMSI = "357219004"


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_list_investigations():
    r = client.get("/api/investigations")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) >= 1
    assert "lodged" in body["status_labels"]


def test_get_investigation():
    r = client.get(f"/api/investigations/{KNOWN_INVESTIGATION_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == KNOWN_INVESTIGATION_ID


def test_get_investigation_404():
    r = client.get("/api/investigations/DOES-NOT-EXIST")
    assert r.status_code == 404


def test_create_investigation_requires_scene_or_aoi():
    r = client.post("/api/investigations", json={})
    assert r.status_code == 400


def test_create_investigation():
    r = client.post("/api/investigations", json={"aoi_bbox": [0, 0, 1, 1]})
    assert r.status_code == 201
    assert r.json()["status"] == "lodged"


def test_search_scenes():
    r = client.post(
        "/api/scenes/search",
        json={
            "aoi_bbox": [0, 0, 1, 1],
            "time_start": "2026-09-08T00:00:00Z",
            "time_end": "2026-09-09T00:00:00Z",
        },
    )
    assert r.status_code == 200
    assert len(r.json()["results"]) >= 1


def test_detect_spill():
    r = client.post("/api/spills/detect", json={"scene_id": "sample"})
    assert r.status_code == 200
    assert "spill_id" in r.json()


def test_get_spill_and_geometry():
    spill_id = f"SPL-{KNOWN_INVESTIGATION_ID.removeprefix('INV-')}"
    r = client.get(f"/api/spills/{spill_id}")
    assert r.status_code == 200

    r2 = client.get(f"/api/spills/{spill_id}/geometry")
    assert r2.status_code == 200
    assert "area_km2" in r2.json()


def test_get_spill_404():
    r = client.get("/api/spills/SPL-9999-9999")
    assert r.status_code == 404


def test_drift_hindcast_and_forecast():
    spill_id = f"SPL-{KNOWN_INVESTIGATION_ID.removeprefix('INV-')}"
    r = client.post("/api/drift/hindcast", json={"spill_id": spill_id})
    assert r.status_code == 200
    assert len(r.json()["track"]) > 0
    assert r.json()["source_mode"] in {"cached_forcing", "synthetic_fallback", "real_forcing"}

    r2 = client.post("/api/drift/forecast", json={"spill_id": spill_id})
    assert r2.status_code == 200
    assert len(r2.json()["track"]) > 0
    assert r2.json()["source_mode"] in {"cached_forcing", "synthetic_fallback", "real_forcing"}

    drift_step = r.json()["track"][0]
    assert "wind" in drift_step
    assert "current" in drift_step
    assert set(drift_step["wind"]).issuperset({"u_m_s", "v_m_s"})
    assert set(drift_step["current"]).issuperset({"u_m_s", "v_m_s"})


def test_vessel_candidates():
    r = client.get(f"/api/vessels/candidates?investigation_id={KNOWN_INVESTIGATION_ID}")
    assert r.status_code == 200
    assert len(r.json()["candidates"]) >= 1


def test_get_vessel():
    r = client.get(f"/api/vessels/{KNOWN_MMSI}")
    assert r.status_code == 200
    body = r.json()
    assert body["mmsi"] == KNOWN_MMSI
    assert KNOWN_INVESTIGATION_ID in body["involved_in"]


def test_get_vessel_404():
    r = client.get("/api/vessels/000000000")
    assert r.status_code == 404


def test_attribution_run_and_get():
    r = client.post("/api/attribution/run", json={"investigation_id": KNOWN_INVESTIGATION_ID})
    assert r.status_code == 200
    ranked = r.json()["ranked_vessels"]
    scores = [v["final_score"] for v in ranked]
    assert scores == sorted(scores, reverse=True)

    r2 = client.get(f"/api/attribution/{KNOWN_INVESTIGATION_ID}")
    assert r2.status_code == 200


def test_get_report():
    r = client.get(f"/api/reports/{KNOWN_INVESTIGATION_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == KNOWN_INVESTIGATION_ID


def test_drift_service_builds_hindcast_track():
    inv = store.get_by_id(KNOWN_INVESTIGATION_ID)
    spill = {"id": f"SPL-{KNOWN_INVESTIGATION_ID.removeprefix('INV-')}", **inv["spill"]}
    start = inv["satellite"]["timestamp"]
    result = hindcast(spill, start, duration_hours=24, timestep_minutes=15)
    assert "source_estimate" in result
    assert len(result["track"]) > 1
    assert result["source_estimate"]["lat"]


def test_ais_candidate_filter_and_attribution_ranking():
    inv = store.get_by_id(KNOWN_INVESTIGATION_ID)
    source = inv["source"]
    candidates = candidate_vessels(source, spatial_radius_km=25, time_window_hours=24)
    assert len(candidates) >= 1

    ranked = score_and_rank(inv, {"spatial": 0.3, "temporal": 0.25, "trajectory": 0.2, "behaviour": 0.15, "context": 0.1}, 25, 24)
    assert len(ranked) >= 1
    assert ranked[0]["final_score"] >= ranked[-1]["final_score"]
    assert all("evidence" in v for v in ranked)


@pytest.mark.parametrize("path", ["/api/reports/nope", "/api/attribution/nope"])
def test_various_404s(path):
    r = client.get(path)
    assert r.status_code == 404
