"""
DB engine/session setup.

Roadmap §60: SQLite is sufficient for the internal round; PostgreSQL +
PostGIS is the recommended upgrade for the full project. Swapping later
only means changing DATABASE_URL — the models in app/models/ are plain
SQLAlchemy and don't assume SQLite.

This module is scaffolding: nothing in app/api/ reads from this database
yet (routes still serve app/data/mock_investigations.py). Wiring a route
over to real persistence means swapping its mock-data calls for a
SessionLocal() + query, using the models below.
"""


from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./oilspill.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: `db: Session = Depends(get_db)`."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Call once at startup or from a setup script."""
    import app.models.investigation  # noqa: F401 — ensure models are registered on Base

    Base.metadata.create_all(bind=engine)
