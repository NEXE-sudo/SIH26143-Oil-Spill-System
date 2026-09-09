"""POST /api/scenes/search — roadmap §64.

TODO: delegate to services/sentinel.py once Copernicus/Sentinel-Hub
credentials are configured (see .env.example). Returns a static sample
scene for the internal-round demo so the frontend's "new investigation"
flow has something to select from without live network access.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.spill import SceneResult, SceneSearchRequest, SceneSearchResponse

router = APIRouter(prefix="/api/scenes", tags=["scenes"])


@router.post("/search", response_model=SceneSearchResponse)
def search_scenes(payload: SceneSearchRequest) -> SceneSearchResponse:
    # TODO: services.sentinel.search(payload.aoi_bbox, payload.time_start, payload.time_end, ...)
    sample = SceneResult(
        scene_id="S1A_IW_GRDH_1SDV_SAMPLE",
        platform=payload.platform or "Sentinel-1",
        product=payload.product or "GRD",
        timestamp=payload.time_start,
        preview_url=None,
        cloud_cover_pct=None,
    )
    return SceneSearchResponse(results=[sample])
