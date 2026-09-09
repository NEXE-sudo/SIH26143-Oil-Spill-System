# Backend — API Templates

FastAPI backend implementing the endpoint surface from the roadmap
(§56–65). Every route currently serves data from
`app/data/mock_investigations.py` (a Python port of the frontend's
`src/data/reports.js`), so the frontend can be pointed at real HTTP
endpoints today, with the response shapes it already expects.

## Run it

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Docs at `http://localhost:8000/docs`.

## Structure

```
app/
├── main.py              # FastAPI app, CORS, router registration
├── config.py            # env/service config (NOT scientific params — those go in configs/*.yaml)
├── api/                 # route handlers, one file per roadmap §64 group
│   ├── investigations.py
│   ├── scenes.py
│   ├── spills.py
│   ├── drift.py
│   ├── vessels.py
│   ├── attribution.py
│   └── reports.py
├── schemas/             # Pydantic request/response models (the frontend data contract)
├── services/            # stubs for the real pipeline — each raises NotImplementedError
│   ├── sentinel.py       # scene search/download
│   ├── preprocessing.py  # SAR calibration/speckle filter/land mask
│   ├── detection.py      # oil vs look-alike classification
│   ├── segmentation.py   # mask -> polygon
│   ├── geometry.py       # area/perimeter/centroid/axes
│   ├── drift.py          # PyGNOME hindcast/forecast
│   ├── ais.py            # AIS candidate filtering + track reconstruction
│   └── attribution.py    # scoring + ranking
├── data/
│   └── mock_investigations.py  # fixture data, ported from src/data/reports.js
└── models/               # reserved for ORM models once SQLite/PostGIS is wired in (§60)
```

## Endpoints implemented (templates)

| Method | Path                                  | Status                          |
|--------|----------------------------------------|----------------------------------|
| GET    | `/api/investigations`                 | mock data                       |
| GET    | `/api/investigations/{id}`            | mock data                       |
| POST   | `/api/investigations`                 | creates a stub "lodged" record  |
| POST   | `/api/scenes/search`                  | returns one sample scene        |
| POST   | `/api/spills/detect`                  | mock data                       |
| GET    | `/api/spills/{id}`                    | mock data                       |
| GET    | `/api/spills/{id}/geometry`           | mock data                       |
| POST   | `/api/drift/hindcast`                 | synthetic track                 |
| POST   | `/api/drift/forecast`                 | synthetic track                 |
| GET    | `/api/vessels/candidates`             | mock data                       |
| GET    | `/api/vessels/{mmsi}`                 | mock data                       |
| POST   | `/api/attribution/run`                | re-ranks mock candidates        |
| GET    | `/api/attribution/{investigation_id}` | re-ranks mock candidates        |
| GET    | `/api/reports/{id}`                   | mock data                       |

Every handler that stands in for real science has a `# TODO:` pointing
at the `services/` module that should eventually replace it — the route
signatures and response shapes are meant to stay stable across that
swap.
