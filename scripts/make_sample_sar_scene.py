"""
Generates a tiny synthetic 2-band (VV, VH) GeoTIFF that looks roughly like
a calibrated Sentinel-1 crop with a dark "slick-shaped" patch in the middle
and speckle noise everywhere. This exists purely so teammates can run and
test preprocess_scene() without first downloading the ~40 GB Zenodo dataset.

Run from repo root:
    python scripts/make_sample_sar_scene.py

Writes: data/samples/sar/demo_scene.tif
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

OUT_PATH = Path("data/samples/sar/demo_scene.tif")
SIZE = 256


def make_band(rng: np.random.Generator, dark_center: bool) -> np.ndarray:
    # Base "ocean" backscatter: fairly bright, noisy.
    band = rng.normal(loc=0.6, scale=0.05, size=(SIZE, SIZE)).astype(np.float32)

    if dark_center:
        yy, xx = np.mgrid[0:SIZE, 0:SIZE]
        cy, cx = SIZE * 0.55, SIZE * 0.45
        slick = ((yy - cy) / 40) ** 2 + ((xx - cx) / 70) ** 2 < 1
        band[slick] *= 0.25  # oil suppresses backscatter -> darker patch

    # Speckle: multiplicative noise, the real SAR kind.
    speckle = rng.gamma(shape=4.0, scale=1 / 4.0, size=band.shape).astype(np.float32)
    band *= speckle

    # A couple of very bright "ship" pixels to stress-test normalisation.
    for _ in range(3):
        y, x = rng.integers(0, SIZE, size=2)
        band[y, x] = 5.0

    return band


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed=42)

    vv = make_band(rng, dark_center=True)
    vh = make_band(rng, dark_center=True)
    stacked = np.stack([vv, vh])

    # Roughly place it somewhere in the Bay of Bengal for realism — exact
    # georeferencing doesn't matter for this fixture, just that it's valid.
    transform = from_origin(80.0, 13.5, 0.0001, 0.0001)

    # Passed as explicit kwargs (not **profile-unpacked) so static type
    # checkers can match each one against rasterio's real signature —
    # unpacking a plain dict here confuses pyright/Pylance's stubs into
    # trying to match "transform" against an unrelated bool-typed kwarg.
    with rasterio.open(
        OUT_PATH,
        "w",
        driver="GTiff",
        height=SIZE,
        width=SIZE,
        count=2,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
    ) as dst:
        dst.write(stacked)

    print(f"Wrote {OUT_PATH} ({SIZE}x{SIZE}, 2 bands)")


if __name__ == "__main__":
    main()