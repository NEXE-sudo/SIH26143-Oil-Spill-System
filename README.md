# SIH26143 — Maritime Oil Spill Intelligence (Frontend)

React + Vite frontend for the internal-round PoC described in the
SIH26143 development roadmap: a maritime investigation dashboard that
shows a detected oil slick, its estimated source region, reconstructed
AIS vessel tracks, and a ranked, explainable list of suspect vessels.

## What's implemented

- **Top bar** — investigation identity (ID, satellite, timestamp) and a
  "Load demo investigation" action (roadmap §74 Demo Mode).
- **Map panel** — SVG-based investigation map with toggleable layers
  (satellite, detected oil, spill polygon, source probability, AIS
  vessels, vessel tracks, wind, currents) per roadmap §59.
- **Evidence rail** — Detection stats (area, confidence, geometry),
  Source estimation (origin + time window), ranked Suspect vessels,
  and a per-vessel Evidence detail panel with the spatial / temporal /
  trajectory / behaviour score breakdown and an evidence checklist —
  matching the explainable-attribution example in roadmap §52.
- **Status bar** — model/pipeline metrics (IoU, F1, source error,
  candidate recall, processing time) instead of a single misleading
  "accuracy" number, per roadmap §128.
- A visible disclaimer ("investigative ranking, not proof") is always
  shown alongside vessel evidence, per roadmap §53.
- **API integration** — the landing page loads investigations from the
  FastAPI backend, while the detail view loads spill geometry, vessel
  attribution, report data, and drift hindcasts through the shared API
  client in `src/lib/api.js`.

The backend currently serves deterministic mock investigation data through
the FastAPI endpoint surface, while the frontend keeps the bundled reports
in `src/data/reports.js` as an offline fallback when the backend is
unavailable. Set `VITE_API_BASE_URL` to point the frontend at another API
instance; it defaults to `http://localhost:8000`.

## Run locally

Start the backend in one terminal:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Then start the frontend from the repository root in another terminal:

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`). The FastAPI
interactive docs are available at `http://localhost:8000/docs`.

To run both services with Docker Compose:

```bash
docker compose up --build
```

The frontend falls back to bundled mock reports if the backend is not
running, but detail-view API requests will remain unavailable until the
backend is started.

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Next steps toward the real system

- `POST /api/spills/detect` now runs a real pipeline — adaptive local-contrast
  detection (`services/detection.py`) → mask vectorization
  (`services/segmentation.py`) → area/perimeter/centroid/axis geometry
  (`services/geometry.py`) — against a preprocessed scene, instead of
  returning mock data. It's untrained thresholding, not a classifier: it
  finds real dark patches but can't yet tell oil from a look-alike (see the
  module docstrings). `GET /api/spills/{id}` and `/geometry` still read the
  mock store — those serve already-detected investigations by id, not fresh
  detections.
- `SpillGeometry.polygon` is now a GeoJSON `Polygon` string in real lon/lat,
  not a fixed-viewBox SVG path — so **swap the mock SVG map for MapLibre GL
  JS or Leaflet with real Sentinel-1 tile overlays and this GeoJSON polygon**
  (roadmap §58–59). `leaflet`/`react-leaflet` are already in `package.json`
  but unused — `InvestigationDetail.jsx`'s SVG map is the piece to replace.
- Next model step: fine-tune a U-Net (pretrained encoder) on the Krestenitis
  et al. SAR oil-spill dataset to replace the thresholding in
  `detection.py` — same `(mask, confidence)` return contract, so
  `segmentation.py`/`geometry.py` don't need to change.
- Add an investigations list / new-investigation flow (roadmap §58
  suggested pages: `/investigations`, `/investigations/new`).
