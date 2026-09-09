#!/usr/bin/env bash
# Run the full app (FastAPI backend + React frontend) with one command.
#
# Prefers Docker Compose (docker-compose.yml already defines both services
# with correct ports/CORS). Falls back to running both natively — a Python
# venv for the backend, npm for the frontend — if Docker isn't available.
#
# Note: this does NOT run PyGNOME. The drift model reads precomputed
# results from backend/data/drift_runs/ (see scripts/run_pygnome_drift.py,
# run separately in a conda env) and falls back to a synthetic model
# otherwise — neither path needs PyGNOME inside this app.
#
# Usage:
#   ./run.sh              # auto-detect Docker, else native
#   ./run.sh docker        # force Docker Compose
#   ./run.sh native         # force native venv + npm
#   ./run.sh down            # stop Docker Compose services

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

MODE="${1:-auto}"

have_docker() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

run_docker() {
  echo "Starting via Docker Compose (backend on :8000, frontend on :5173)..."
  docker compose up --build
}

run_native() {
  echo "Starting natively (Python venv + npm)..."

  if [ ! -d backend/.venv ]; then
    echo "Creating backend venv..."
    python3 -m venv backend/.venv
  fi
  # shellcheck disable=SC1091
  source backend/.venv/bin/activate
  pip install -q -r backend/requirements.txt

  if [ ! -d node_modules ]; then
    echo "Installing frontend deps..."
    npm install
  fi

  (
    cd backend
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
    echo $! > /tmp/oilspill-backend.pid
  )
  trap 'kill "$(cat /tmp/oilspill-backend.pid 2>/dev/null)" 2>/dev/null || true' EXIT

  echo "Backend: http://localhost:8000  (docs at /docs)"
  echo "Frontend: http://localhost:5173"
  npm run dev -- --host
}

case "$MODE" in
  docker)
    run_docker
    ;;
  native)
    run_native
    ;;
  down)
    docker compose down
    ;;
  auto)
    if have_docker; then
      run_docker
    else
      echo "Docker not found — falling back to native run."
      run_native
    fi
    ;;
  *)
    echo "Usage: $0 [docker|native|down]"
    exit 1
    ;;
esac
