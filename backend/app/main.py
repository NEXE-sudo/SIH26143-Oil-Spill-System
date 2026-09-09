"""
FastAPI backend entrypoint — roadmap §56/§57.

Run locally:
    cd backend
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Frontend expects this at http://localhost:8000 by default; see
src/lib/api.js (VITE_API_BASE_URL).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import attribution, drift, investigations, reports, scenes, spills, vessels
from app.config import CORS_ALLOW_ORIGINS

app = FastAPI(
    title="SIH26143 Oil Spill Attribution API",
    description=(
        "API templates for the oil-spill detection -> drift -> AIS -> "
        "attribution pipeline described in the SIH26143 development roadmap."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(investigations.router)
app.include_router(scenes.router)
app.include_router(spills.router)
app.include_router(drift.router)
app.include_router(vessels.router)
app.include_router(attribution.router)
app.include_router(reports.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}
