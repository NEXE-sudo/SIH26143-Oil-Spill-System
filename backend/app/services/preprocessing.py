from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import rasterio  # The standard Python library for reading and writing geospatial raster data (satellite images containing coordinate systems).
from skimage.restoration import (
    denoise_nl_means,
)  # The specific algorithm chosen to remove radar speckle

# Config

# Resolve repo root relative to this file so it works from any CWD
_REPO_ROOT = Path(__file__).resolve().parents[3]
PROCESSED_DIR = _REPO_ROOT / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# NL-means denoising parameters
_NL_MEANS_PARAMS = dict(
    patch_size=5,  # The algorithm looks at small 5x5 pixel patches of the image to find similar patches for denoising
    patch_distance=6,  # The algorithm searches for similar patches within a 6x6 neighborhood
    h=0.1,  # filtering strength; 0.05-0.2 works for SAR
    fast_mode=True,  # ~10x faster, negligible quality loss
)


# Public API


def preprocess_scene(
    scene_path: str,
    patch_size: Optional[int] = None,
    land_mask_path: Optional[str] = None,
) -> str:

    scene_path_p = Path(scene_path)
    if not scene_path_p.exists():
        raise FileNotFoundError(f"Scene not found: {scene_path_p}")

    if patch_size is not None and patch_size < 1:
        raise ValueError(f"patch_size must be >= 1, got {patch_size}")

    # 1. Load
    """
    Safely reading the satellite data from disk
    It opens the satellite image file using rasterio,
    loads the entire image into RAM as a multi-dimensional
    array of numbers, and extracts the file's
    geospatial metadata (GPS bounds, projection info).
    The with block ensures that the file is safely closed on your hard drive as soon as
    the reading finishes.
    """
    with rasterio.open(scene_path_p) as src:
        bands = src.read()  # shape: (n_bands, height, width) -> VV, [VH]
        _profile = src.profile  # noqa: F841 — reserved for geometry.py's geometric correction step (roadmap §10); not consumed here yet

    n_bands = bands.shape[0]
    if n_bands > 2:
        raise ValueError(f"Expected 1 or 2 bands (VV, VH), got {n_bands}")

    # Memory & Performance Optimization
    # Cast to float32 EARLY — avoids float64 upcast in denoising
    bands = bands.astype(np.float32, copy=False)

    #  2. Calibration
    # CALIBRATION NOTE: raw Sentinel-1 GRD digital numbers are NOT physical
    # units — they'd need converting to the sigma-nought backscatter
    # coefficient via the product's calibration LUT (or SNAP's `gpt`
    # calibration graph) before anything downstream makes sense. Skipped
    # here because the Zenodo training/demo scenes are pre-calibrated.
    # Add this step back in when services/sentinel.py starts pulling raw
    # scenes from Copernicus.

    #  3. Optional land mask
    land_mask = None
    if land_mask_path:
        land_mask_path_p = Path(land_mask_path)
        if not land_mask_path_p.exists():
            raise FileNotFoundError(f"Land mask not found: {land_mask_path_p}")
        with rasterio.open(land_mask_path_p) as msk:
            land_mask = msk.read(1).astype(bool)  # (H, W)
        if land_mask.shape != bands.shape[1:]:
            raise ValueError(
                f"Land mask shape {land_mask.shape} != scene shape {bands.shape[1:]}"
            )

    #  4. Speckle reduction (NL-means)
    # SAR images have grainy "salt-and-pepper" speckle noise from how radar
    # waves interfere with each other. Non-local means preserves edges far
    # better than a median/Lee filter and is fast enough for 256x256 patches.
    denoised = np.stack(
        [denoise_nl_means(band, **_NL_MEANS_PARAMS) for band in bands]
    ).astype(np.float32, copy=False)

    # Zero out land pixels *after* denoising so filter doesn't bleed land values
    if land_mask is not None:
        denoised[:, land_mask] = 0.0

    # 5. Normalisation
    # Scale each band to 0-1 so the model sees a consistent input range
    # regardless of a scene's raw intensity spread. Clipping to the 1st/99th
    # percentile first stops a few extreme-bright pixels (ships, noise spikes)
    # Prevents metallic ships or radar spikes from washing out subtle water features.
    # from squashing everything else toward zero.

    normalised = np.zeros_like(denoised, dtype=np.float32)
    for i, band in enumerate(denoised):
        # Exclude land using the mask itself (not a value>0 heuristic —
        # real dB-scale SAR backscatter is negative, so ">0" would wrongly
        # exclude all genuine ocean data too, not just the zeroed land)
        valid = band[~land_mask] if land_mask is not None else band.ravel()
        valid = valid[np.isfinite(valid)]
        if valid.size == 0:
            # Entire band is land/masked — leave as zeros
            normalised[i] = 0.0
            continue

        lo, hi = np.percentile(valid, [1, 99])
        if hi <= lo:  # degenerate (constant) band
            normalised[i] = 0.0
            continue

        band = np.clip(band, lo, hi)
        normalised[i] = (band - lo) / (hi - lo + 1e-6)

    # 6. Optional patch extraction
    if patch_size:
        normalised = _center_crop_or_pad(normalised, patch_size)

    # 7. Save + return path
    out_path = PROCESSED_DIR / f"{scene_path_p.stem}_processed.npy"
    np.save(out_path, normalised)
    return str(out_path)


# Internal helpers


def _center_crop_or_pad(array: np.ndarray, size: int) -> np.ndarray:
    """
    Crop (or zero-pad) an (n_bands, H, W) array to (n_bands, size, size).

    Center-aligned: keeps the middle of the scene. If array is smaller than
    size, pads symmetrically with zeros.
    """
    if array.ndim != 3:
        raise ValueError(f"Expected (bands, H, W), got shape {array.shape}")
    _, h, w = array.shape

    out = np.zeros((array.shape[0], size, size), dtype=array.dtype)

    ch, cw = min(h, size), min(w, size)
    src_top = max(0, (h - size) // 2)
    src_left = max(0, (w - size) // 2)
    dst_top = max(0, (size - h) // 2)
    dst_left = max(0, (size - w) // 2)

    out[:, dst_top : dst_top + ch, dst_left : dst_left + cw] = array[
        :, src_top : src_top + ch, src_left : src_left + cw
    ]
    return out


# CLI for quick manual testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python preprocessing.py <scene.tif> [patch_size] [land_mask.tif]")
        sys.exit(1)

    scene = sys.argv[1]
    patch = int(sys.argv[2]) if len(sys.argv) > 2 else None
    mask = sys.argv[3] if len(sys.argv) > 3 else None

    out = preprocess_scene(scene, patch_size=patch, land_mask_path=mask)
    print(f"✅ Saved: {out}")
    arr = np.load(out)
    print(
        f"   Shape: {arr.shape} | Range: [{arr.min():.4f}, {arr.max():.4f}] | Dtype: {arr.dtype}"
    )