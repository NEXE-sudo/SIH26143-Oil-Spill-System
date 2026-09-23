"""
Unit tests for the detection -> segmentation -> geometry pipeline
(backend/app/services/{detection,segmentation,geometry}.py).

Builds a synthetic georeferenced scene with a known embedded dark ellipse
(standing in for a slick) so the tests can assert the pipeline recovers a
polygon in roughly the right place, size, and orientation — not just that it
runs without raising.

Run from repo root:
    PYTHONPATH=backend pytest tests/test_detection_pipeline.py
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import rasterio  # noqa: E402
from rasterio.transform import from_origin  # noqa: E402

from app.services import detection, geometry, preprocessing, segmentation  # noqa: E402

# Ellipse parameters used to build the fixture, reused by assertions below.
_H, _W = 256, 256
_CY, _CX, _A, _B = 130, 140, 55, 18  # center (px), semi-major, semi-minor (px)
_DEG_PER_PX = 0.0002
_ORIGIN_LON, _ORIGIN_LAT = 72.80, 18.95


@pytest.fixture(scope="module")
def synthetic_scene(tmp_path_factory) -> Path:
    rng = np.random.default_rng(0)
    vv = 0.6 + 0.05 * rng.standard_normal((_H, _W))
    yy, xx = np.mgrid[0:_H, 0:_W]
    ellipse = ((xx - _CX) / _A) ** 2 + ((yy - _CY) / _B) ** 2 <= 1
    vv[ellipse] -= 0.35
    vv = np.clip(vv, 0, 1).astype("float32")
    data = np.stack([vv, vv.copy()])

    out_dir = tmp_path_factory.mktemp("scenes")
    path = out_dir / "synthetic_scene.tif"
    transform = from_origin(_ORIGIN_LON, _ORIGIN_LAT, _DEG_PER_PX, _DEG_PER_PX)
    with rasterio.open(
        path, "w", driver="GTiff", height=_H, width=_W, count=2,
        dtype="float32", crs="EPSG:4326", transform=transform,
    ) as dst:
        dst.write(data)
    return path


@pytest.fixture(scope="module")
def processed_path(synthetic_scene: Path) -> str:
    return preprocessing.preprocess_scene(str(synthetic_scene))


def test_detection_finds_one_region(processed_path):
    result = detection.run("synthetic_scene", threshold=0.5, processed_path=processed_path)
    assert result["n_regions"] == 1
    assert result["mask"].any()
    assert 0.0 < result["confidence"] <= 1.0


def test_detection_rejects_bad_threshold(processed_path):
    with pytest.raises(ValueError):
        detection.run("synthetic_scene", threshold=1.5, processed_path=processed_path)


def test_detection_missing_scene_raises():
    with pytest.raises(FileNotFoundError):
        detection.run("does_not_exist", processed_path="data/processed/does_not_exist_processed.npy")


def test_segmentation_produces_valid_geojson_polygon(synthetic_scene, processed_path):
    result = detection.run("synthetic_scene", threshold=0.5, processed_path=processed_path)
    poly = segmentation.mask_to_polygon(result["mask"], scene_path=str(synthetic_scene), output="geojson")
    parsed = json.loads(poly)
    assert parsed["type"] == "Polygon"
    assert len(parsed["coordinates"][0]) >= 3


def test_segmentation_empty_mask_raises():
    empty_mask = np.zeros((10, 10), dtype=bool)
    with pytest.raises(ValueError):
        segmentation.mask_to_polygon(empty_mask)


def test_geometry_recovers_expected_footprint(synthetic_scene, processed_path):
    result = detection.run("synthetic_scene", threshold=0.5, processed_path=processed_path)
    poly = segmentation.mask_to_polygon(result["mask"], scene_path=str(synthetic_scene), output="geojson")
    geom = geometry.compute(poly)

    km_per_deg_lat = 111.32
    km_per_px = _DEG_PER_PX * km_per_deg_lat
    expected_major_km = 2 * _A * km_per_px
    expected_minor_km = 2 * _B * km_per_px

    # Loose bounds: the detector's darkness threshold trims the ellipse a
    # little at its edges, and the PCA axis fit is an approximation, not an
    # exact ellipse refit — this checks "same ballpark", not pixel-exact.
    assert expected_minor_km * 0.4 < geom["minor_axis_km"] < expected_major_km
    assert expected_major_km * 0.4 < geom["major_axis_km"] < expected_major_km * 1.3

    expected_lon = _ORIGIN_LON + _CX * _DEG_PER_PX
    expected_lat = _ORIGIN_LAT - _CY * _DEG_PER_PX
    assert math.isclose(geom["centroid"]["lon"], expected_lon, abs_tol=0.01)
    assert math.isclose(geom["centroid"]["lat"], expected_lat, abs_tol=0.01)

    assert geom["area_km2"] > 0
    assert geom["perimeter_km"] > 0


def test_geometry_accepts_wkt():
    from shapely.geometry import Polygon

    square = Polygon([(72.0, 19.0), (72.01, 19.0), (72.01, 19.01), (72.0, 19.01)])
    geom = geometry.compute(square.wkt)
    assert geom["area_km2"] > 0
