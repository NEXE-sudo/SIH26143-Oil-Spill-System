"""
Central app settings. Scientific/tunable parameters (detection thresholds,
AIS radius/window, attribution weights, drift duration) belong in
configs/*.yaml per roadmap §63 — not here. This module only holds
service-level config (CORS, env, paths).
"""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parent.parent
CONFIGS_DIR = BACKEND_ROOT.parent / "configs"

load_dotenv(BACKEND_ROOT / ".env")

CORS_ALLOW_ORIGINS = os.environ.get(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

ENV = os.environ.get("APP_ENV", "development")

PLACEHOLDER_DATABASE_URLS = {
    "postgresql://user:password@host:5432/dbname",
}

DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.strip() in PLACEHOLDER_DATABASE_URLS:
    DATABASE_URL = None

if DATABASE_URL:
    try:
        engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    except Exception:
        engine = None
        SessionLocal = None
else:
    engine = None
    SessionLocal = None


def get_db():
    """Dependency helper to yield a database session per API request."""
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured in environment.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
