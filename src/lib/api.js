// ---------------------------------------------------------------------------
// Frontend API client for the FastAPI backend under backend/app/.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase.js";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function getSupabaseAccessToken() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch (error) {
    console.warn("Supabase session lookup failed:", error);
    return null;
  }
}

async function request(path, options = {}) {
  const token = await getSupabaseAccessToken();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error = new Error(
      `API ${options.method || "GET"} ${path} failed: ${res.status} ${body}`,
    );
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- Investigations --------------------------------------------------------

/** GET /api/investigations */
export async function listInvestigations() {
  const data = await request("/api/investigations");
  return { reports: data.items, statusLabels: data.status_labels };
}

/** GET /api/investigations/{id} */
export function getInvestigation(id) {
  return request(`/api/investigations/${encodeURIComponent(id)}`);
}

/** POST /api/investigations */
export function createInvestigation(payload) {
  return request("/api/investigations", {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (error.status === 429) {
      console.error(
        "Rate limit exceeded on createInvestigation. Please try again later.",
      );
    }
    throw error;
  });
}

// ---- Scenes -----------------------------------------------------------------

/** POST /api/scenes/search */
export function searchScenes(payload) {
  return request("/api/scenes/search", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---- Spills -------------------------------------------------------------------

/** POST /api/spills/detect */
export function detectSpill(payload) {
  return request("/api/spills/detect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

/** POST /api/drift/hindcast */
export function driftHindcast(payload) {
  return request("/api/drift/hindcast", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/drift/forecast */
export function driftForecast(payload) {
  return request("/api/drift/forecast", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---- Vessels --------------------------------------------------------------------

/** GET /api/vessels/candidates?investigation_id=... */
export function getVesselCandidates(investigationId) {
  return request(
    `/api/vessels/candidates?investigation_id=${encodeURIComponent(investigationId)}`,
  );
}

/** GET /api/vessels/{mmsi} */
export function getVessel(mmsi) {
  return request(`/api/vessels/${encodeURIComponent(mmsi)}`);
}

// ---- Attribution --------------------------------------------------------------

/** POST /api/attribution/run */
export function runAttribution(payload) {
  return request("/api/attribution/run", {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (error.status === 429) {
      console.error(
        "Rate limit exceeded on runAttribution. Please try again later.",
      );
    }
    throw error;
  });
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
