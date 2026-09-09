"""
Run a real PyGNOME particle-tracking simulation (forecast + hindcast) for
one investigation and cache the result as JSON for the backend to serve.

Run this in your conda/PyGNOME environment — it is never imported by the
FastAPI app. Output lands in backend/data/drift_runs/, which
app/services/drift.py reads at request time without needing PyGNOME
installed.

Requires: the conda-forge `pygnome` (NOAA GNOME) package, plus the wind/
current NetCDF files produced by scripts/fetch_forcing_data.py.

Usage:
    python scripts/run_pygnome_drift.py \
        --spill-id SPL-2026-0001 \
        --centroid-lat 13.421 --centroid-lon 80.192 \
        --start-time 2026-09-05T10:35:00Z \
        --wind data/raw/forcing/chennai_demo_wind.nc \
        --currents data/raw/forcing/chennai_demo_currents.nc \
        --duration-hours 24 --timestep-minutes 15
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "backend" / "data" / "drift_runs"

# Rough centroid spread (degrees) of the mock spill polygon, used only to
# seed a small particle cloud instead of a single point.
SEED_SPREAD_DEG = 0.02
N_PARTICLES = 200


def _build_model(start_time: datetime, duration_hours: int, wind_path: str, currents_path: str,
                  centroid: tuple[float, float], backward: bool):
    from gnome.model import Model
    from gnome.spill import point_line_release_spill
    from gnome.movers import RandomMover
    from gnome.movers.wind_movers import GridWindMover
    from gnome.movers.current_movers import GridCurrentMover
    from gnome.environment import Wind, GridCurrent

    duration = timedelta(hours=duration_hours)
    model_start = start_time - duration if backward else start_time

    model = Model(
        start_time=model_start,
        duration=duration,
        time_step=15 * 60,
        uncertain=True,
    )

    lat, lon = centroid
    model.spills += point_line_release_spill(
        num_elements=N_PARTICLES,
        start_position=(lon, lat, 0.0),
        release_time=model_start,
    )

    current = GridCurrent.from_netCDF(filename=currents_path)
    current_mover = GridCurrentMover(current)
    if backward:
        current_mover.current.data *= -1
    model.movers += current_mover

    wind = Wind(filename=wind_path)
    wind_mover = GridWindMover(wind)
    if backward:
        wind_mover.wind.timeseries["value"] *= -1
    model.movers += wind_mover

    model.movers += RandomMover(diffusion_coef=50000)  # cm^2/s, roughly ERA5-scale eddy diffusion

    return model


def _run(model, backward: bool) -> list[dict]:
    track = []
    for step in model:
        positions = step["positions"]
        lons = positions[:, 0]
        lats = positions[:, 1]
        centroid_lat = float(lats.mean())
        centroid_lon = float(lons.mean())
        spread_km = float(
            max(lats.std(), lons.std()) * 111.0
        )  # crude deg->km conversion for a rough uncertainty radius
        track.append(
            {
                "timestamp": step["step_num"],  # placeholder, overwritten below with real time
                "centroid": {"lat": centroid_lat, "lon": centroid_lon},
                "polygon": None,
                "uncertainty_radius_km": round(spread_km, 2),
            }
        )
    if backward:
        track.reverse()
    return track


def _attach_timestamps(track: list[dict], start_time: datetime, timestep_minutes: int, backward: bool) -> None:
    sign = -1 if backward else 1
    n = len(track)
    for i, point in enumerate(track):
        step_index = (n - 1 - i) if backward else i
        offset = timedelta(minutes=sign * step_index * timestep_minutes) if not backward else timedelta(
            minutes=-1 * (n - 1 - i) * timestep_minutes
        )
        ts = start_time + offset if not backward else start_time - timedelta(minutes=(n - 1 - i) * timestep_minutes)
        point["timestamp"] = ts.isoformat().replace("+00:00", "Z")


def run_direction(spill_id: str, centroid: tuple[float, float], start_time: datetime,
                   duration_hours: int, timestep_minutes: int, wind_path: str, currents_path: str,
                   backward: bool) -> dict:
    model = _build_model(start_time, duration_hours, wind_path, currents_path, centroid, backward)
    track = _run(model, backward)
    _attach_timestamps(track, start_time, timestep_minutes, backward)

    result: dict = {"spill_id": spill_id, "track": track}
    if backward:
        origin = track[0]["centroid"]
        result["source_estimate"] = {
            "lat": origin["lat"],
            "lon": origin["lon"],
            "window_start": track[0]["timestamp"],
            "window_end": track[min(3, len(track) - 1)]["timestamp"],
        }
        result["source_probability_heatmap"] = None
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spill-id", required=True)
    parser.add_argument("--centroid-lat", type=float, required=True)
    parser.add_argument("--centroid-lon", type=float, required=True)
    parser.add_argument("--start-time", required=True, help="ISO-8601 UTC, e.g. 2026-09-05T10:35:00Z")
    parser.add_argument("--wind", required=True)
    parser.add_argument("--currents", required=True)
    parser.add_argument("--duration-hours", type=int, default=24)
    parser.add_argument("--timestep-minutes", type=int, default=15)
    args = parser.parse_args()

    start_time = datetime.fromisoformat(args.start_time.replace("Z", "+00:00"))
    centroid = (args.centroid_lat, args.centroid_lon)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    forecast = run_direction(
        args.spill_id, centroid, start_time, args.duration_hours, args.timestep_minutes,
        args.wind, args.currents, backward=False,
    )
    forecast_path = OUT_DIR / f"{args.spill_id}_forecast.json"
    forecast_path.write_text(json.dumps(forecast, indent=2))
    print(f"Wrote {forecast_path}")

    hindcast = run_direction(
        args.spill_id, centroid, start_time, args.duration_hours, args.timestep_minutes,
        args.wind, args.currents, backward=True,
    )
    hindcast_path = OUT_DIR / f"{args.spill_id}_hindcast.json"
    hindcast_path.write_text(json.dumps(hindcast, indent=2))
    print(f"Wrote {hindcast_path}")


if __name__ == "__main__":
    main()
