"""Build and cache drift runs for all mock investigations.

This is the repository's operational bridge between forcing-data acquisition and
API serving. It writes `{spill_id}_hindcast.json` and `{spill_id}_forecast.json`
under backend/data/drift_runs/, which app/services/drift.py reads before
falling back to the synthetic model.

If the real forcing files are available, the cached runs should ideally be
produced by scripts/run_pygnome_drift.py. When not available, this script uses
backend/app/services/drift.py to generate a deterministic, cacheable fallback so
frontend/API behavior remains stable.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.data import mock_investigations as store
from app.services.drift import forecast, hindcast

OUT_DIR = BACKEND / "data" / "drift_runs"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    for inv in store.INVESTIGATIONS:
        spill_id = "SPL-" + inv["id"].removeprefix("INV-")
        spill = {"id": spill_id, **inv["spill"]}
        start_time = inv["satellite"]["timestamp"]

        hind = hindcast(spill, start_time, duration_hours=24, timestep_minutes=15)
        fore = forecast(spill, start_time, duration_hours=24, timestep_minutes=15)

        hind_path = OUT_DIR / f"{spill_id}_hindcast.json"
        fore_path = OUT_DIR / f"{spill_id}_forecast.json"

        hind_path.write_text(json.dumps(hind, indent=2))
        fore_path.write_text(json.dumps(fore, indent=2))

        print(f"cached {hind_path.name} and {fore_path.name}")


if __name__ == "__main__":
    main()
