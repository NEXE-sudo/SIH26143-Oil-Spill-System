"""
Oil-spill detection — classifies dark patches in a preprocessed SAR scene
as oil vs. look-alike (biogenic slick, wind shadow, etc).

Used by: app/api/spills.py (POST /api/spills/detect)

Config: configs/detection.yaml (threshold — do not hard-code).

TODO: load the trained model (see ml/detection/) and run inference here.
"""

from __future__ import annotations


def run(scene_id: str, threshold: float = 0.50) -> dict:
    raise NotImplementedError("Load ml/detection model and run inference on the preprocessed scene.")
