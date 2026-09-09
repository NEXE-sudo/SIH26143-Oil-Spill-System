"""
SAR preprocessing — calibration, speckle filtering, land masking, terrain
correction, dB conversion. Feeds services/detection.py.

TODO: wrap SNAP / snappy or an equivalent SAR toolbox pipeline here.
"""

from __future__ import annotations


def preprocess_scene(scene_path: str) -> str:
    raise NotImplementedError("Implement SAR calibration + speckle filtering + land masking.")
