// ---------------------------------------------------------------------------
// Frontend API client for the FastAPI backend under backend/app/.
//
// Each function here mirrors one route in backend/app/api/ and returns data
// in the exact shape src/data/reports.js used to hardcode — so components
// can switch from `import { REPORTS } from "./data/reports.js"` to
// `import { listInvestigations } from "./lib/api.js"` without reshaping
// anything downstream.
//
// Base URL comes from VITE_API_BASE_URL (see .env.example), defaulting to
// the local FastAPI dev server started via `uvicorn app.main:app --reload`.
// ---------------------------------------------------------------------------

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${options.method || "GET"} ${path} failed: ${res.status} ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- Investigations --------------------------------------------------------

/** GET /api/investigations — replaces the REPORTS array + STATUS_LABELS. */
export async function listInvestigations() {
  const data = await request("/api/investigations");
  return { reports: data.items, statusLabels: data.status_labels };
}

/** GET /api/investigations/{id} — backs InvestigationDetail.jsx. */
export function getInvestigation(id) {
  return request(`/api/investigations/${encodeURIComponent(id)}`);
}

/**
 * POST /api/investigations — kick off a new investigation.
 * payload: { scene_id? , aoi_bbox?, time_start?, time_end?, notes? }
 */
export function createInvestigation(payload) {
  return request("/api/investigations", { method: "POST", body: JSON.stringify(payload) });
}

// ---- Scenes -----------------------------------------------------------------

/** POST /api/scenes/search */
export function searchScenes(payload) {
  return request("/api/scenes/search", { method: "POST", body: JSON.stringify(payload) });
}

// ---- Spills -------------------------------------------------------------------

/** POST /api/spills/detect */
export function detectSpill(payload) {
  return request("/api/spills/detect", { method: "POST", body: JSON.stringify(payload) });
}

/** GET /api/spills/{id} */
export function getSpill(spillId) {
  return request(`/api/spills/${encodeURIComponent(spillId)}`);
}

/** GET /api/spills/{id}/geometry */
export function getSpillGeometry(spillId) {
  return request(`/api/spills/${encodeURIComponent(spillId)}/geometry`);
}

// ---- Drift --------------------------------------------------------------------

/** POST /api/drift/hindcast — body: { spill_id, duration_hours?, timestep_minutes? } */
export function driftHindcast(payload) {
  return request("/api/drift/hindcast", { method: "POST", body: JSON.stringify(payload) });
}

/** POST /api/drift/forecast — body: { spill_id, duration_hours?, timestep_minutes? } */
export function driftForecast(payload) {
  return request("/api/drift/forecast", { method: "POST", body: JSON.stringify(payload) });
}

// ---- Vessels --------------------------------------------------------------------

/** GET /api/vessels/candidates?investigation_id=... */
export function getVesselCandidates(investigationId) {
  return request(`/api/vessels/candidates?investigation_id=${encodeURIComponent(investigationId)}`);
}

/** GET /api/vessels/{mmsi} */
export function getVessel(mmsi) {
  return request(`/api/vessels/${encodeURIComponent(mmsi)}`);
}

// ---- Attribution --------------------------------------------------------------

/** POST /api/attribution/run — body: { investigation_id, spatial_radius_km?, time_window_hours?, weights? } */
export function runAttribution(payload) {
  return request("/api/attribution/run", { method: "POST", body: JSON.stringify(payload) });
}

/** GET /api/attribution/{investigation_id} */
export function getAttribution(investigationId) {
  return request(`/api/attribution/${encodeURIComponent(investigationId)}`);
}

// ---- Reports --------------------------------------------------------------------

/** GET /api/reports/{id} */
export function getReport(reportId) {
  return request(`/api/reports/${encodeURIComponent(reportId)}`);
}
