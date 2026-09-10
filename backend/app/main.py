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

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import attribution, drift, investigations, reports, scenes, spills, vessels
from app.auth import get_current_user
from app.config import CORS_ALLOW_ORIGINS

from sqlalchemy.orm import Session
from app.config import get_db
from sqlalchemy import text

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

app.include_router(
    investigations.router,
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    scenes.router,
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    spills.router,
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    drift.router,
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    vessels.router,
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    attribution.router,
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    reports.router,
    dependencies=[Depends(get_current_user)],
)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}



@app.get("/db-check", tags=["meta"])
def db_check(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT 1")).scalar()
    return {"status": "connected", "result": result}