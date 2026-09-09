"""
ORM models mirroring roadmap §60:

    investigations
        ├── satellite_scenes
        ├── spills
        ├── spill_polygons
        ├── drift_runs
        ├── source_probability
        ├── vessels
        ├── ais_points
        ├── ais_tracks
        ├── attribution_scores
        └── reports

Not yet wired into app/api/ — those routes still read app/data/
mock_investigations.py. This module exists so persistence can be added
incrementally (investigation-by-investigation, endpoint-by-endpoint)
without redesigning the schema under time pressure later.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Investigation(Base):
    __tablename__ = "investigations"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. INV-2026-0001
    status: Mapped[str] = mapped_column(String, default="lodged")  # lodged | pending | completed
    lodged_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    satellite_scene: Mapped["SatelliteSceneRecord"] = relationship(
        back_populates="investigation", uselist=False, cascade="all, delete-orphan"
    )
    spill: Mapped["Spill"] = relationship(
        back_populates="investigation", uselist=False, cascade="all, delete-orphan"
    )
    drift_runs: Mapped[list["DriftRun"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan"
    )
    attribution_scores: Mapped[list["AttributionScore"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan"
    )
    report: Mapped["Report"] = relationship(
        back_populates="investigation", uselist=False, cascade="all, delete-orphan"
    )


class SatelliteSceneRecord(Base):
    __tablename__ = "satellite_scenes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"))
    platform: Mapped[str] = mapped_column(String)  # Sentinel-1 | Sentinel-2
    product: Mapped[str] = mapped_column(String)  # GRD | SLC | L2A ...
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    scene_ref: Mapped[str] = mapped_column(String, nullable=True)  # provider scene id / file path

    investigation: Mapped["Investigation"] = relationship(back_populates="satellite_scene")


class Spill(Base):
    __tablename__ = "spills"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. SPL-2026-0001
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"))
    confidence: Mapped[float] = mapped_column(Float)
    area_km2: Mapped[float] = mapped_column(Float)
    perimeter_km: Mapped[float] = mapped_column(Float)
    centroid_lat: Mapped[float] = mapped_column(Float)
    centroid_lon: Mapped[float] = mapped_column(Float)
    major_axis_km: Mapped[float] = mapped_column(Float)
    minor_axis_km: Mapped[float] = mapped_column(Float)
    orientation_deg: Mapped[float] = mapped_column(Float)

    investigation: Mapped["Investigation"] = relationship(back_populates="spill")
    polygon: Mapped["SpillPolygon"] = relationship(
        back_populates="spill", uselist=False, cascade="all, delete-orphan"
    )
    source_probability: Mapped["SourceProbability"] = relationship(
        back_populates="spill", uselist=False, cascade="all, delete-orphan"
    )


class SpillPolygon(Base):
    """Separate from Spill so PostGIS geometry columns can replace `wkt` later
    without touching the Spill table."""

    __tablename__ = "spill_polygons"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    spill_id: Mapped[str] = mapped_column(ForeignKey("spills.id"))
    wkt: Mapped[str] = mapped_column(String)  # WKT (or SVG path, for the internal-round demo)

    spill: Mapped["Spill"] = relationship(back_populates="polygon")


class DriftRun(Base):
    __tablename__ = "drift_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"))
    kind: Mapped[str] = mapped_column(String)  # hindcast | forecast
    duration_hours: Mapped[int] = mapped_column()
    timestep_minutes: Mapped[int] = mapped_column()
    track: Mapped[list] = mapped_column(JSON)  # list[{timestamp, centroid, polygon, uncertainty_radius_km}]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    investigation: Mapped["Investigation"] = relationship(back_populates="drift_runs")


class SourceProbability(Base):
    __tablename__ = "source_probability"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    spill_id: Mapped[str] = mapped_column(ForeignKey("spills.id"))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    window_start: Mapped[datetime] = mapped_column(DateTime)
    window_end: Mapped[datetime] = mapped_column(DateTime)
    heatmap_ref: Mapped[str] = mapped_column(String, nullable=True)  # URL/path to raster or geojson

    spill: Mapped["Spill"] = relationship(back_populates="source_probability")


class Vessel(Base):
    """Vessel master record — one row per MMSI, independent of any single
    investigation (a vessel can be a candidate in several)."""

    __tablename__ = "vessels"

    mmsi: Mapped[str] = mapped_column(String, primary_key=True)
    imo: Mapped[str] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String)
    flag: Mapped[str] = mapped_column(String)
    vessel_type: Mapped[str] = mapped_column(String)


class AISPointRecord(Base):
    __tablename__ = "ais_points"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    mmsi: Mapped[str] = mapped_column(ForeignKey("vessels.mmsi"))
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    sog_knots: Mapped[float] = mapped_column(Float, nullable=True)
    cog_deg: Mapped[float] = mapped_column(Float, nullable=True)
    heading_deg: Mapped[float] = mapped_column(Float, nullable=True)
    nav_status: Mapped[str] = mapped_column(String, nullable=True)


class AISTrack(Base):
    """A reconstructed, per-investigation slice of a vessel's AIS points
    (see services/ais.py::track_for) — kept distinct from the raw points so
    the same vessel can have different relevant windows per investigation."""

    __tablename__ = "ais_tracks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"))
    mmsi: Mapped[str] = mapped_column(ForeignKey("vessels.mmsi"))
    path: Mapped[str] = mapped_column(String)  # SVG path (map overlay) or WKT linestring


class AttributionScore(Base):
    __tablename__ = "attribution_scores"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"))
    mmsi: Mapped[str] = mapped_column(ForeignKey("vessels.mmsi"))
    final_score: Mapped[float] = mapped_column(Float)
    spatial: Mapped[float] = mapped_column(Float)
    temporal: Mapped[float] = mapped_column(Float)
    trajectory: Mapped[float] = mapped_column(Float)
    behaviour: Mapped[float] = mapped_column(Float)
    distance_km: Mapped[float] = mapped_column(Float)
    time_diff_h: Mapped[float] = mapped_column(Float)
    dwell_min: Mapped[float] = mapped_column(Float)
    evidence: Mapped[list] = mapped_column(JSON)  # list[{ok, text}]

    investigation: Mapped["Investigation"] = relationship(back_populates="attribution_scores")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # matches investigation id for now
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"))
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    summary: Mapped[str] = mapped_column(String, nullable=True)

    investigation: Mapped["Investigation"] = relationship(back_populates="report")
