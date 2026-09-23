"""
Oil-spill detection — finds candidate dark patches (oil looks darker than
open water in SAR VV backscatter) in a preprocessed scene and returns a
binary mask, with a per-region confidence score.

Used by: app/api/spills.py (POST /api/spills/detect), feeds services/segmentation.py.

Config: configs/detection.yaml (threshold, min_area_km2 — do not hard-code).

Method: adaptive local-contrast thresholding (a lightweight, untrained
stand-in for the CFAR-style detectors used in the SAR oil-spill literature),
not a trained classifier. It separates dark regions from surrounding water
reliably, but it cannot distinguish oil from a look-alike (biogenic slick,
wind shadow, rain cell) — see the module docstring note below and
configs/detection.yaml. Swapping in a trained model (e.g. a U-Net fine-tuned
on the Krestenitis et al. SAR oil-spill dataset) later is a drop-in
replacement: it should return the same (mask, confidence) contract so
services/segmentation.py doesn't need to change.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
from scipy import ndimage
from skimage.filters import threshold_local

_REPO_ROOT = Path(__file__).resolve().parents[3]
PROCESSED_DIR = _REPO_ROOT / "data" / "processed"

# Local window (pixels) used to estimate the neighbourhood background level.
# Must be odd; larger = smoother background estimate, less sensitive to
# small, genuinely dark patches.
_LOCAL_BLOCK_SIZE = 51

# Minimum size (pixels) for a connected dark region to survive as a
# candidate before the km^2 area filter in configs/detection.yaml is applied
# (that filter needs real pixel spacing, which segmentation.py has via the
# scene's geotransform — this is just a cheap first-pass despeckle).
_MIN_REGION_PIXELS = 25


def run(
    scene_id: str,
    threshold: float = 0.50,
    processed_path: Optional[str] = None,
) -> dict:
    """
    Detect candidate oil-slick regions in a preprocessed scene.

    Args:
        scene_id: identifier used to locate the preprocessed .npy array
            under data/processed/ when processed_path isn't given directly
            (i.e. <scene_id>_processed.npy, matching preprocessing.py's
            output naming).
        threshold: sensitivity in [0, 1]; higher = only very dark, high
            local-contrast pixels are flagged. Comes from
            configs/detection.yaml unless overridden by the caller (e.g. a
            request body field).
        processed_path: optional direct path to a preprocessed .npy array,
            bypassing scene_id-based lookup (used by tests/CLI).

    Returns:
        {
            "mask": np.ndarray[bool]  (H, W) — True where classified as oil,
            "confidence": float        — mean local contrast in the flagged
                                          region, in [0, 1], as a rough proxy
                                          for detection confidence,
            "n_regions": int           — number of connected candidate
                                          regions after despeckling,
        }
    """
    if not 0.0 <= threshold <= 1.0:
        raise ValueError(f"threshold must be in [0, 1], got {threshold}")

    path = Path(processed_path) if processed_path else PROCESSED_DIR / f"{scene_id}_processed.npy"
    if not path.exists():
        raise FileNotFoundError(
            f"Preprocessed scene not found: {path}. Run preprocessing.preprocess_scene() first."
        )

    bands = np.load(path)  # (n_bands, H, W), already normalised to [0, 1]
    vv = bands[0]

    # Oil dampens capillary waves -> lower backscatter -> darker pixel than
    # its local surroundings. Compare each pixel against a locally-adaptive
    # background estimate rather than a single global threshold, since
    # ambient sea brightness varies across a scene (wind, incidence angle).
    local_bg = threshold_local(vv, block_size=_LOCAL_BLOCK_SIZE, method="gaussian")
    contrast = np.clip(local_bg - vv, 0, None)  # how much darker than local background
    contrast_norm = contrast / (contrast.max() + 1e-6)

    raw_mask = contrast_norm > (1.0 - threshold)

    # Despeckle: drop connected components smaller than _MIN_REGION_PIXELS
    # (residual speckle survives preprocessing's NL-means filter as
    # occasional single-pixel dropouts).
    labeled, n = ndimage.label(raw_mask)
    if n > 0:
        sizes = ndimage.sum(raw_mask, labeled, range(1, n + 1))
        keep = np.zeros(n + 1, dtype=bool)
        keep[1:] = sizes >= _MIN_REGION_PIXELS
        mask = keep[labeled]
        n_regions = int(keep.sum())
    else:
        mask = raw_mask
        n_regions = 0

    confidence = float(contrast_norm[mask].mean()) if mask.any() else 0.0

    return {"mask": mask, "confidence": confidence, "n_regions": n_regions}
