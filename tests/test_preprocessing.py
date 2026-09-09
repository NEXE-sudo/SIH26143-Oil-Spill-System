"""
Unit tests for backend/app/services/preprocessing.py.

Run from repo root (after generating the fixture once):
    python scripts/make_sample_sar_scene.py
    pip install -r backend/requirements.txt pytest
    PYTHONPATH=backend pytest tests/test_preprocessing.py
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.services.preprocessing import preprocess_scene  # noqa: E402

SAMPLE_SCENE = Path(__file__).resolve().parent.parent / "data" / "samples" / "sar" / "demo_scene.tif"


@pytest.fixture(scope="module")
def sample_scene() -> Path:
    if not SAMPLE_SCENE.exists():
        pytest.skip(
            "No sample scene found — run `python scripts/make_sample_sar_scene.py` first."
        )
    return SAMPLE_SCENE


def test_preprocess_scene_runs_and_saves(sample_scene: Path):
    out_path = preprocess_scene(str(sample_scene))
    assert Path(out_path).exists()


def test_preprocess_scene_output_is_normalised(sample_scene: Path):
    out_path = preprocess_scene(str(sample_scene))
    arr = np.load(out_path)
    assert arr.min() >= 0.0
    assert arr.max() <= 1.0


def test_preprocess_scene_respects_patch_size(sample_scene: Path):
    out_path = preprocess_scene(str(sample_scene), patch_size=64)
    arr = np.load(out_path)
    assert arr.shape[-2:] == (64, 64)


def test_preprocess_scene_missing_file_raises():
    with pytest.raises(FileNotFoundError):
        preprocess_scene("data/samples/sar/does_not_exist.tif")


def test_preprocess_scene_rejects_bad_patch_size(sample_scene: Path):
    with pytest.raises(ValueError):
        preprocess_scene(str(sample_scene), patch_size=0)
