"""
Fetch real wind (ERA5 / CDS) and ocean current (Copernicus Marine) data for
the INV-2026-0001 demo case (Bay of Bengal, off Chennai) and save as NetCDF
to data/raw/forcing/. Run this once, ahead of time, in your conda/PyGNOME
environment — not from the FastAPI app.

Requires:
    pip install cdsapi copernicusmarine
    CDS account + ~/.cdsapirc          (https://cds.climate.copernicus.eu)
    Copernicus Marine account          (`copernicusmarine login` once)

Usage:
    python scripts/fetch_forcing_data.py --date 2026-09-05 \
        --bbox 12.5 79.5 14.5 81.5 --hours 30

--bbox is south west north east (lat/lon degrees), matching the mock
investigation's spill centroid (13.421, 80.192) with margin. --hours sets
how many hours of coverage to pull, centered loosely on the demo's
satellite timestamp so both the hindcast (backward) and forecast (forward)
windows have forcing data.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "forcing"


def fetch_wind(date: str, bbox: tuple[float, float, float, float], out_path: Path) -> None:
    import cdsapi

    south, west, north, east = bbox
    day = datetime.fromisoformat(date)
    client = cdsapi.Client()
    client.retrieve(
        "reanalysis-era5-single-levels",
        {
            "product_type": ["reanalysis"],
            "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
            "year": [str(day.year)],
            "month": [f"{day.month:02d}"],
            "day": [f"{day.day:02d}", f"{(day + timedelta(days=1)).day:02d}"],
            "time": [f"{h:02d}:00" for h in range(24)],
            "area": [north, west, south, east],
            "data_format": "netcdf",
        },
        str(out_path),
    )


def fetch_currents(date: str, bbox: tuple[float, float, float, float], out_path: Path) -> None:
    import copernicusmarine

    south, west, north, east = bbox
    start = datetime.fromisoformat(date)
    end = start + timedelta(days=2)
    copernicusmarine.subset(
        dataset_id="cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i",
        variables=["uo", "vo"],
        minimum_longitude=west,
        maximum_longitude=east,
        minimum_latitude=south,
        maximum_latitude=north,
        minimum_depth=0,
        maximum_depth=1,
        start_datetime=start.isoformat(),
        end_datetime=end.isoformat(),
        output_filename=out_path.name,
        output_directory=str(out_path.parent),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYY-MM-DD, e.g. 2026-09-05")
    parser.add_argument(
        "--bbox", nargs=4, type=float, metavar=("SOUTH", "WEST", "NORTH", "EAST"), required=True
    )
    parser.add_argument("--out-prefix", default="chennai_demo")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bbox = tuple(args.bbox)

    wind_out = OUT_DIR / f"{args.out_prefix}_wind.nc"
    current_out = OUT_DIR / f"{args.out_prefix}_currents.nc"

    print(f"Fetching ERA5 wind -> {wind_out}")
    fetch_wind(args.date, bbox, wind_out)

    print(f"Fetching Copernicus Marine currents -> {current_out}")
    fetch_currents(args.date, bbox, current_out)

    print("Done. Pass these paths to scripts/run_pygnome_drift.py.")


if __name__ == "__main__":
    main()
