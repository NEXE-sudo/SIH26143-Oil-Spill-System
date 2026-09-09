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

All data is currently mocked (`DEMO_INVESTIGATION` in `src/App.jsx`) so
the UI can be demoed without a backend. Wire it up to the FastAPI
endpoints described in roadmap §64 (`/api/spills/{id}`,
`/api/vessels/candidates`, `/api/attribution/{investigation_id}`, etc.)
by replacing that constant with fetched data.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL (default `http://localhost:5173`).

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Next steps toward the real system

- Swap the mock SVG map for MapLibre GL JS or Leaflet with real
  Sentinel-1 tile overlays and GeoJSON spill polygons (roadmap §58–59).
- Replace `DEMO_INVESTIGATION` with API calls once the FastAPI backend
  (roadmap §57, §64) is running.
- Add an investigations list / new-investigation flow (roadmap §58
  suggested pages: `/investigations`, `/investigations/new`).
