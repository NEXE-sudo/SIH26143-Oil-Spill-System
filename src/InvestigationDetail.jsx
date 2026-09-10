import React, { useEffect, useMemo, useState } from "react";

import {

  Circle,

  CircleMarker,

  MapContainer,

  Polyline,

  TileLayer,

  useMap,

} from "react-leaflet";

import {

  driftHindcast,

  getAttribution,

  getReport,

  getSpill,

  getVessel,

} from "./lib/api.js";

// ---------------------------------------------------------------------------

// Investigation detail workspace

// ---------------------------------------------------------------------------

const LAYERS = [

  { id: "satellite", label: "Satellite image", default: true },

  { id: "oil", label: "Detected oil", default: true },

  { id: "polygon", label: "Spill polygon", default: true },

  { id: "source", label: "Source probability", default: true },

  { id: "ais", label: "AIS vessels", default: true },

  { id: "tracks", label: "Vessel tracks", default: true },

  { id: "wind", label: "Wind vectors (ERA5)", default: true },

  { id: "current", label: "Ocean currents (Copernicus)", default: true },

  { id: "drift", label: "Drift hindcast", default: true },

];

// The spill polygon / vessel tracks are hand-authored SVG-space art, not

// derived from real lat/lon — they're sized to sit nicely in the 400x300

// map regardless of the investigation's real-world location. To place

// anything with a *real* lat/lon (source estimate, drift track) on the

// same map, we anchor a local projection at the spill's own centroid: the

// spill's real lat/lon centroid maps to its polygon's SVG centroid, and

// everything else is placed by real-world offset (km) from there, via an

// equirectangular approximation (accurate enough at this scale) times a

// fixed px-per-km zoom.

const KM_PER_DEG_LAT = 111.0;

const PX_PER_KM = 3.2; // tuned so a \~24h drift track stays on-map

function polygonCentroid(pathD) {

  const nums = (pathD.match(/-?[\d.]+/g) || []).map(Number);

  let sx = 0;

  let sy = 0;

  let n = 0;

  for (let i = 0; i + 1 < nums.length; i += 2) {

    sx += nums[i];

    sy += nums[i + 1];

    n++;

  }

  return n > 0

    ? { x: sx / n, y: sy / n }

    : { x: 200, y: 150 };

}

function makeMapProjection(inv) {

  const anchor = polygonCentroid(inv.spill.polygon);

  const lat0 = inv.spill.centroid.lat;

  const lon0 = inv.spill.centroid.lon;

  const kmPerDegLon =

    KM_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);

  return function toMapXY(lat, lon) {

    const dxKm = (lon - lon0) * kmPerDegLon;

    const dyKm = (lat - lat0) * KM_PER_DEG_LAT;

    return {

      x: anchor.x + dxKm * PX_PER_KM,

      y: anchor.y - dyKm * PX_PER_KM,

    };

  };

}

function svgPathToLatLngs(pathD, inv) {

  const nums = (pathD.match(/-?[\d.]+/g) || []).map(Number);

  if (nums.length < 2) return [];

  const anchor = polygonCentroid(inv.spill.polygon);

  const lat0 = inv.spill.centroid.lat;

  const lon0 = inv.spill.centroid.lon;

  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);

  const points = [];

  for (let i = 0; i + 1 < nums.length; i += 2) {

    const x = nums[i];

    const y = nums[i + 1];

    const dxKm = (x - anchor.x) / PX_PER_KM;

    const dyKm = (anchor.y - y) / PX_PER_KM;

    const lon = lon0 + dxKm / kmPerDegLon;

    const lat = lat0 + dyKm / KM_PER_DEG_LAT;

    points.push([lat, lon]);

  }

  return points;

}

function svgPathToLatLngs(pathD, inv) {

  const nums = (pathD.match(/-?[\d.]+/g) || []).map(Number);

  if (nums.length < 2) return [];

  const anchor = polygonCentroid(inv.spill.polygon);

  const lat0 = inv.spill.centroid.lat;

  const lon0 = inv.spill.centroid.lon;

  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);

  const points = [];

  for (let i = 0; i + 1 < nums.length; i += 2) {

    const x = nums[i];

    const y = nums[i + 1];

    const dxKm = (x - anchor.x) / PX_PER_KM;

    const dyKm = (anchor.y - y) / PX_PER_KM;

    const lon = lon0 + dxKm / kmPerDegLon;

    const lat = lat0 + dyKm / KM_PER_DEG_LAT;

    points.push([lat, lon]);

  }

  return points;

}

function fmtUTC(iso) {

  if (!iso) return "—";

  const d = new Date(iso);

  return `${d.toISOString().slice(11, 16)} UTC`;

}

function fmtDate(iso) {

  if (!iso) return "—";

  const d = new Date(iso);

  return d.toISOString().slice(0, 10);

}

function fmtDateTime(iso) {

  if (!iso) return "—";

  return `${fmtDate(iso)} · ${fmtUTC(iso)}`;

}

function scoreColor(value) {

  if (value == null) return "var(--muted-2)";

  if (value >= 0.75) return "var(--good)";

  if (value >= 0.5) return "var(--warn)";

  return "var(--muted-2)";

}

// ---------------------------------------------------------------------------

// Main page

// ---------------------------------------------------------------------------

export default function InvestigationDetail({

  investigation,

  onClose,

  session,

  onSignOut,

}) {

  const inv = investigation;

  const [layers, setLayers] = useState(

    Object.fromEntries(LAYERS.map((l) => [l.id, l.default])),

  );

  const [drift, setDrift] = useState(null); // DriftHindcastResponse | null

  const [driftError, setDriftError] = useState(null);

  const [spill, setSpill] = useState(inv.spill); // SpillGeometry, replaced once /api/spills/{id} resolves

  const [vessels, setVessels] = useState(inv.vessels); // VesselCandidate[], replaced once attribution resolves

  const [selectedVessel, setSelectedVessel] = useState(

    inv.vessels[0]?.mmsi ?? null,

  );

  

  useEffect(() => {

    let cancelled = false;

    const spillId = `SPL-${inv.id.replace(/^INV-/, "")}`;

    driftHindcast({ spill_id: spillId })

      .then((response) => {

        if (!cancelled) {

          setDrift(response);

          setDriftError(null);

        }

      })

      .catch((error) => {

        if (!cancelled) {

          console.warn(

            "Drift hindcast unavailable:",

            error.message

          );

          setDriftError(error.message);

        }

      });

    getSpill(spillId)

      .then((response) => {

        if (!cancelled && response?.spill) {

          setSpill(response.spill);

        }

      })

      .catch((err) => {

        console.warn(

          "Spill detail unavailable, using embedded record:",

          err.message,

        );

      });

    getAttribution(inv.id)

      .then((response) => {

        if (!cancelled && response?.ranked_vessels) {

          setVessels(response.ranked_vessels);

          if (

            response.ranked_vessels.length &&

            !selectedVessel

          ) {

            setSelectedVessel(

              response.ranked_vessels[0].mmsi

            );

          }

        }

      })

      .catch((err) => {

        console.warn(

          "Attribution unavailable, using embedded candidates:",

          err.message,

        );

      });

    return () => {

      cancelled = true;

    };

  }, [inv.id]);

  function toggleLayer(id) {

    setLayers((previous) => ({

      ...previous,

      [id]: !previous[id],

    }));

  }

  const liveInv = useMemo(

    () => ({

      ...inv,

      spill,

      vessels,

    }),

    [inv, spill, vessels]

  );

  const activeVessel =

    vessels.find(

      (vessel) => vessel.mmsi === selectedVessel

    ) || null;

  return (

    <div className="shell detail-shell">

      <InvestigationHeader

        inv={liveInv}

        onClose={onClose}

        session={session}

        onSignOut={onSignOut}

      />

      <main className="investigation-workspace">

        <InvestigationMap

          inv={liveInv}

          layers={layers}

          toggleLayer={toggleLayer}

          selectedVessel={selectedVessel}

          setSelectedVessel={setSelectedVessel}

          drift={drift}

        />

        <IntelligencePanel

          inv={liveInv}

          vessels={vessels}

          activeVessel={activeVessel}

          selectedVessel={selectedVessel}

          setSelectedVessel={setSelectedVessel}

          drift={drift}

          driftError={driftError}

        />

      </main>

      <DataQualityBar inv={liveInv} />

    </div>

  );

}

// ---------------------------------------------------------------------------

// Header

// ---------------------------------------------------------------------------

function InvestigationHeader({ inv, onClose, session, onSignOut }) {
  const [report, setReport] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  async function handleViewReport() {
    setReportOpen(true);
    if (report) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const response = await getReport(inv.id);
      if (response?.pdf_url) {
        window.open(response.pdf_url, "_blank", "noopener,noreferrer");
        setReportOpen(false);
        return;
      }
      setReport(response);
    } catch (error) {
      setReportError(error.message);
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <>
      <header className="topbar investigation-header">
        <button type="button" className="btn-back" onClick={onClose} aria-label="Back to reports">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Reports</span>
        </button>

        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M2 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="12" cy="8" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 3.8v8.4" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </span>
          <div>
            <div className="brand-title">Maritime Oil Spill Intelligence</div>
            <div className="brand-sub">SIH26143 · NTRO investigation console</div>
          </div>
        </div>

        <div className="investigation-header-meta">
          <div className="investigation-id">{inv.id}</div>
          <span className="investigation-status">{inv.status || "ACTIVE"}</span>
          <button type="button" className="btn-report" onClick={handleViewReport} disabled={reportLoading}>
            {reportLoading ? "Preparing…" : "View report"}
          </button>
        </div>

        {session && <ProfileMenu session={session} onSignOut={onSignOut} />}
      </header>

      {reportOpen && (
        <ReportDialog report={report} loading={reportLoading} error={reportError} onClose={() => setReportOpen(false)} />
      )}
    </>
  );
}

function ReportDialog({ report, loading, error, onClose }) {
  return (
    <div className="report-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="report-dialog" role="dialog" aria-modal="true" aria-label="Investigation report" onClick={(event) => event.stopPropagation()}>
        <div className="report-dialog-header">
          <div>
            <div className="report-dialog-title">Investigation report</div>
            <div className="report-dialog-subtitle">PDF generation will be provided by the backend.</div>
          </div>
          <button type="button" className="report-dialog-close" onClick={onClose} aria-label="Close report">×</button>
        </div>
        <div className="report-dialog-body">
          {loading && <div className="report-loading">Loading report…</div>}
          {error && <div className="report-error">Report unavailable: {error}</div>}
          {!loading && !error && !report && <div className="report-loading">No report data available.</div>}
          {report && (
            <div className="report-summary">
              <div className="report-summary-row"><span>Status</span><strong>{report.status || "—"}</strong></div>
              <div className="report-summary-row"><span>Lodged</span><strong>{fmtDateTime(report.lodged_at)}</strong></div>
              <div className="report-summary-row"><span>Spill centroid</span><strong>{report.spill?.centroid ? `${report.spill.centroid.lat.toFixed(3)}°N, ${report.spill.centroid.lon.toFixed(3)}°E` : "—"}</strong></div>
              <div className="report-summary-row"><span>Area</span><strong>{report.spill?.area_km2 != null ? `${report.spill.area_km2.toFixed(1)} km²` : "—"}</strong></div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MapCenterSync({ center }) {

  const map = useMap();

  useEffect(() => {

    map.setView(center, map.getZoom(), { animate: true, duration: 0.8 });

  }, [center, map]);

  return null;

}

function InvestigationMap({

  inv,

  layers,

  toggleLayer,

  selectedVessel,

  setSelectedVessel,

  drift,

}) {

  const [driftIndex, setDriftIndex] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);

  const [playDirection, setPlayDirection] = useState(1);

  const [pulse, setPulse] = useState(0);

  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {

    if (!drift || !drift.track || drift.track.length === 0) return;

    setDriftIndex(drift.track.length - 1);

    setIsPlaying(false);

    setPulse(0);

  }, [drift?.spill_id, drift?.track?.length]);

  useEffect(() => {

    if (!drift || !drift.track || drift.track.length === 0 || !isPlaying)

      return;

    const timer = window.setInterval(() => {

      setPulse((value) => (value + 1) % 10);

      setDriftIndex((current) => {

        const next = current + playDirection;

        if (next >= drift.track.length || next < 0) {

          setIsPlaying(false);

          return current;

        }

        return next;

      });

    }, 550);

    return () => window.clearInterval(timer);

  }, [drift, isPlaying, playDirection]);

  const currentDriftStep =

    drift && drift.track.length ? drift.track[driftIndex] : null;

  const visibleTrack =

    drift && drift.track.length ? drift.track.slice(0, driftIndex + 1) : [];

  const driftSourceLabel =

    drift?.source_mode === "real_forcing"

      ? "REAL FORCING"

      : drift?.source_mode === "cached_forcing"

        ? "CACHED RUN"

        : "SYNTHETIC FALLBACK";

  const vesselTracks = inv.vessels

    .map((v) => ({

      ...v,

      points: svgPathToLatLngs(v.track, inv),

    }))

    .filter((v) => v.points.length > 1);

  const jumpBySteps = (stepDelta) => {

    if (!drift || !drift.track || drift.track.length === 0) return;

    setIsPlaying(false);

    setDriftIndex((current) => {

      const next = current + stepDelta;

      if (next < 0) return 0;

      if (next >= drift.track.length) return drift.track.length - 1;

      return next;

    });

  };

  const spillCenter = [inv.spill.centroid.lat, inv.spill.centroid.lon];

  const activeCenter = currentDriftStep

    ? [currentDriftStep.centroid.lat, currentDriftStep.centroid.lon]

    : spillCenter;

  const responseZoneRadiusMeters = Math.max(

    12000,

    inv.spill.area_km2 * 2400 + pulse * 250,

  );

  const oilRadiusMeters = Math.max(

    1800,

    inv.spill.area_km2 * 900 + pulse * 120,

  );

  return (

    <section className="map-panel">

      <div className="map-frame">

        <MapContainer

          center={activeCenter}

          zoom={10}

          scrollWheelZoom={false}

          zoomControl={false}

          className="live-map"

        >

          <MapCenterSync center={activeCenter} />

          <TileLayer

            attribution="Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"

            url="https\://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

          />

          {(!focusMode || layers.oil) && layers.oil && (

            <Circle

              center={activeCenter}

              radius={oilRadiusMeters}

              pathOptions={{

                color: "#fb7185",

                fillColor: "#fb7185",

                fillOpacity: focusMode ? 0.54 : 0.34,

                weight: 1.4,

              }}

            />

          )}

          {layers.oil && (

            <Circle

              center={activeCenter}

              radius={responseZoneRadiusMeters}

              pathOptions={{

                color: "#f59e0b",

                fillColor: "#f59e0b",

                fillOpacity: focusMode ? 0.12 : 0.06,

                weight: 1,

                dashArray: "8 8",

              }}

            />

          )}

          {layers.source && (

            <CircleMarker

              center={[inv.source.lat, inv.source.lon]}

              radius={7}

              pathOptions={{

                color: "#f5a623",

                fillColor: "#f5a623",

                fillOpacity: 0.9,

                weight: 1,

              }}

            />

          )}

          {layers.drift && visibleTrack.length > 1 && (

            <Polyline

              positions={visibleTrack.map((t) => [

                t.centroid.lat,

                t.centroid.lon,

              ])}

              pathOptions={{

                color: "#f5a623",

                weight: 2.4,

                opacity: 0.9,

                dashArray: "8 8",

              }}

            />

          )}

          {layers.drift && currentDriftStep && (

            <CircleMarker

              center={[

                currentDriftStep.centroid.lat,

                currentDriftStep.centroid.lon,

              ]}

              radius={7}

              pathOptions={{

                color: "#58c4ff",

                fillColor: "#58c4ff",

                fillOpacity: 0.95,

                weight: 1.5,

              }}

            />

          )}

          {layers.wind && currentDriftStep?.wind && (

            <Polyline

              positions={[

                [currentDriftStep.centroid.lat, currentDriftStep.centroid.lon],

                [

                  currentDriftStep.centroid.lat +

                    currentDriftStep.wind.v_m_s * 0.015,

                  currentDriftStep.centroid.lon +

                    currentDriftStep.wind.u_m_s * 0.015,

                ],

              ]}

              pathOptions={{

                color: "#7dd3fc",

                weight: 2,

                opacity: 0.9,

              }}

            />

          )}

          {layers.current && currentDriftStep?.current && (

            <Polyline

              positions={[

                [currentDriftStep.centroid.lat, currentDriftStep.centroid.lon],

                [

                  currentDriftStep.centroid.lat +

                    currentDriftStep.current.v_m_s * 0.025,

                  currentDriftStep.centroid.lon +

                    currentDriftStep.current.u_m_s * 0.025,

                ],

              ]}

              pathOptions={{

                color: "#34d399",

                weight: 2,

                opacity: 0.9,

              }}

            />

          )}

          {layers.tracks &&

            vesselTracks.map((v) => (

              <Polyline

                key={v.mmsi}

                positions={v.points}

                pathOptions={{

                  color: v.mmsi === selectedVessel ? "#58c4ff" : "#7a8897",

                  weight: v.mmsi === selectedVessel ? 3 : 1.8,

                  opacity:

                    focusMode && v.mmsi !== selectedVessel

                      ? 0.18

                      : v.mmsi === selectedVessel

                        ? 1

                        : 0.6,

                  dashArray: v.mmsi === selectedVessel ? undefined : "5 6",

                }}

                eventHandlers={{

                  click: () => setSelectedVessel(v.mmsi),

                }}

              />

            ))}

          {layers.ais &&

            vesselTracks.map((v) => {

              const last = v.points[v.points.length - 1];

              return (

                <CircleMarker

                  key={v.mmsi}

                  center={last}

                  radius={v.mmsi === selectedVessel ? 7 : 5}

                  pathOptions={{

                    color: v.mmsi === selectedVessel ? "#58c4ff" : "#dbe2ea",

                    fillColor:

                      v.mmsi === selectedVessel ? "#58c4ff" : "#dbe2ea",

                    fillOpacity:

                      focusMode && v.mmsi !== selectedVessel ? 0.2 : 0.9,

                    weight: 1,

                  }}

                  eventHandlers={{

                    click: () => setSelectedVessel(v.mmsi),

                  }}

                />

              );

            })}

        </MapContainer>

        <div className="map-overlay map-overlay-top-left">

          <span className="map-overlay-title">

            Detection

          </span>

          <span className="map-overlay-value">

            {inv.spill.area_km2.toFixed(1)} km²

          </span>

        </div>

        <div className="map-overlay map-overlay-bottom-left">

          <span>

            {inv.spill.centroid.lat.toFixed(3)}°N

          </span>

          <span className="dot" />

          <span>Confidence {(inv.spill.confidence * 100).toFixed(0)}%</span>

          <span className="dot" />

          <span>{fmtUTC(inv.satellite.timestamp)}</span>

        </div>

        <div className="ops-badge">

          <span className="ops-dot" />

          Operational drift view

        </div>

        <div className="map-legend">

          <span>

            <i className="legend-swatch wind" /> Wind

          </span>

          <span>

            <i className="legend-swatch current" /> Current

          </span>

          <span>

            <i className="legend-swatch drift" /> Drift

          </span>

          <span>

            <i className="legend-swatch spill" /> Oil

          </span>

          <button

            type="button"

            className={"focus-toggle" + (focusMode ? " active" : "")}

            onClick={() => setFocusMode((prev) => !prev)}

          >

            {focusMode ? "Exit focus" : "Focus mode"}

          </button>

        </div>

        {drift && drift.track && drift.track.length > 1 && (

          <div className="drift-controls">

            <div className="drift-controls-header">

              <span>Drift timeline</span>

              <span className="drift-live-tag">{driftSourceLabel}</span>

            </div>

            <div className="drift-controls-time">

              <strong>

                {currentDriftStep

                  ? fmtDateTime(currentDriftStep.timestamp)

                  : "—"}

              </strong>

            </div>

            <div className="drift-controls-actions">

              <button type="button" onClick={() => jumpBySteps(-24)}>

                −24h

              </button>

              <button

                type="button"

                onClick={() => {

                  setPlayDirection(-1);

                  setIsPlaying(true);

                }}

              >

                ◀ Back

              </button>

              <button

                type="button"

                onClick={() => setIsPlaying((prev) => !prev)}

              >

                {isPlaying ? "Pause" : "Play"}

              </button>

              <button

                type="button"

                onClick={() => {

                  setPlayDirection(1);

                  setIsPlaying(true);

                }}

              >

                Forward ▶

              </button>

              <button type="button" onClick={() => jumpBySteps(24)}>

                +24h

              </button>

            </div>

            <input

              type="range"

              min={0}

              max={Math.max(0, drift.track.length - 1)}

              value={driftIndex}

              onChange={(e) => {

                setIsPlaying(false);

                setDriftIndex(Number(e.target.value));

              }}

            />

            <div className="drift-range-labels">

              <span>{fmtUTC(drift.track[0].timestamp)}</span>

              <span>

                {fmtUTC(drift.track[drift.track.length - 1].timestamp)}

              </span>

            </div>

          </div>

        )}

      </div>

      <MapLayers layers={layers} toggleLayer={toggleLayer} />

    </section>

  );

}

// ---------------------------------------------------------------------------

// Layer controls

// ---------------------------------------------------------------------------

function MapLayers({

  layers,

  toggleLayer,

}) {

  const groups = ["Base", "Detection", "Vessels", "Environment"];

  return (

    <div className="layer-toggles">

      <div className="layer-toggles-label">Map layers</div>

      <div className="layer-grid">

        {LAYERS.map((l) => (

          <label key={l.id} className="layer-item">

            <input

              type="checkbox"

              checked={!!layers[l.id]}

              onChange={() => toggleLayer(l.id)}

            />

            <span>{l.label}</span>

          </label>

        ))}

      </div>

    </div>

  );

}

// ---------------------------------------------------------------------------

// Intelligence panel

// ---------------------------------------------------------------------------

function IntelligencePanel({
  inv,
  vessels,
  activeVessel,
  selectedVessel,
  setSelectedVessel,
  drift,
  driftError,
}) {
  return (
    <aside className="intelligence-panel">
      <DetectionSection inv={inv} />

      <SourceSection
        inv={inv}
        drift={drift}
        driftError={driftError}
      />

      <VesselCandidates
        vessels={vessels}
        selectedVessel={selectedVessel}
        setSelectedVessel={setSelectedVessel}
      />

      <SelectedVessel
        vessel={activeVessel}
      />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function DetectionSection({ inv }) {
  return (
    <section className="intelligence-section">
      <SectionHeading
        eyebrow="Analysis"
        title="Detection"
      />

      <div className="detection-summary">
        <div className="detection-main">
          <span className="metric-label">
            Detected area
          </span>

          <strong className="metric-primary">
            {inv.spill.area_km2.toFixed(1)}
            <small> km²</small>
          </strong>
        </div>

        <div className="detection-confidence">
          <span className="metric-label">
            Confidence
          </span>

          <strong
            style={{
              color: "var(--good)",
            }}
          >
            {(
              inv.spill.confidence * 100
            ).toFixed(0)}
            %
          </strong>
        </div>
      </div>

      <div className="compact-metrics">
        <Metric
          label="Perimeter"
          value={`${inv.spill.perimeter_km.toFixed(1)} km`}
        />

        <Metric
          label="Orientation"
          value={`${inv.spill.orientation_deg}°`}
        />

        <Metric
          label="Major axis"
          value={`${inv.spill.major_axis_km} km`}
        />

        <Metric
          label="Minor axis"
          value={`${inv.spill.minor_axis_km} km`}
        />
      </div>

      <div className="coordinate-block">
        <span>Centroid</span>

        <strong>
          {inv.spill.centroid.lat.toFixed(3)}°N{" "}
          {inv.spill.centroid.lon.toFixed(3)}°E
        </strong>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Source estimation
// ---------------------------------------------------------------------------

function SourceSection({
  inv,
  drift,
  driftError,
}) {
  const source =
    drift?.source_estimate || inv.source;

  return (
    <section className="intelligence-section">
      <SectionHeading
        eyebrow="Hindcast"
        title="Source estimate"
      />

      <div className="source-coordinate">
        {source.lat.toFixed(3)}°N{" "}
        {source.lon.toFixed(3)}°E
      </div>

      <div className="source-window">
        <span>
          {fmtUTC(source.window_start)}
        </span>

        <div className="source-window-track">
          <span />
        </div>

        <span>
          {fmtUTC(source.window_end)}
        </span>
      </div>

      <div className="source-date">
        {fmtDateTime(source.window_start)}
      </div>

      <p className="intelligence-note">
        Backward drift estimate using wind and
        current forcing. The result represents a
        probability region rather than a single
        definitive origin point.
      </p>

      {driftError && (
        <div className="data-warning">
          Live hindcast unavailable — showing the
          latest available estimate.
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Vessel candidates
// ---------------------------------------------------------------------------

function VesselCandidates({
  vessels,
  selectedVessel,
  setSelectedVessel,
}) {
  return (
    <section className="intelligence-section">
      <SectionHeading
        eyebrow="Attribution"
        title="Candidate vessels"
        count={vessels.length}
      />

      <div className="candidate-list">
        {vessels.length === 0 ? (
          <div className="candidate-empty">
            No candidate vessels identified yet.
          </div>
        ) : (
          vessels.map((vessel, index) => {
            const selected =
              vessel.mmsi === selectedVessel;

            return (
              <button
                key={vessel.mmsi}
                type="button"
                className={`candidate-row ${
                  selected ? "selected" : ""
                }`}
                onClick={() =>
                  setSelectedVessel(
                    vessel.mmsi
                  )
                }
              >
                <span className="candidate-rank">
                  {String(index + 1).padStart(
                    2,
                    "0"
                  )}
                </span>

                <span className="candidate-main">
                  <span className="candidate-name">
                    {vessel.name}
                  </span>

                  <span className="candidate-mmsi">
                    MMSI {vessel.mmsi}
                  </span>
                </span>

                <span
                  className="candidate-score"
                  style={{
                    color: scoreColor(
                      vessel.final_score
                    ),
                  }}
                >
                  {(
                    vessel.final_score * 100
                  ).toFixed(0)}
                  %
                </span>

                <span className="candidate-bar">
                  <span
                    style={{
                      width: `${
                        vessel.final_score * 100
                      }%`,
                      background:
                        scoreColor(
                          vessel.final_score
                        ),
                    }}
                  />
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Selected vessel
// ---------------------------------------------------------------------------

function SelectedVessel({ vessel }) {
  const [vesselHistory, setVesselHistory] =
    useState(null);

  const [showEvidence, setShowEvidence] =
    useState(false);

  useEffect(() => {
    if (!vessel?.mmsi) {
      setVesselHistory(null);
      return;
    }

    let cancelled = false;

    getVessel(vessel.mmsi)
      .then((response) => {
        if (!cancelled) {
          setVesselHistory(response);
        }
      })
      .catch((error) => {
        console.warn(
          "Vessel detail unavailable:",
          error.message
        );

        if (!cancelled) {
          setVesselHistory(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [vessel?.mmsi]);

  if (!vessel) {
    return (
      <section className="intelligence-section selected-vessel-section">
        <SectionHeading
          eyebrow="Investigation"
          title="Selected vessel"
        />

        <div className="vessel-empty">
          Select a candidate vessel to inspect
          its evidence and trajectory.
        </div>
      </section>
    );
  }

  return (
    <section className="intelligence-section selected-vessel-section">
      <SectionHeading
        eyebrow="Investigation"
        title="Selected vessel"
      />

      <div className="selected-vessel-header">
        <div className="selected-vessel-name-block">
          <div className="selected-vessel-name">
            {vessel.name}
          </div>

          <div className="selected-vessel-meta">
            MMSI {vessel.mmsi}
          </div>
        </div>

        <div
          className="selected-vessel-score"
          style={{
            color: scoreColor(
              vessel.final_score
            ),
          }}
        >
          {(vessel.final_score * 100).toFixed(0)}%
        </div>
      </div>

      <div className="selected-vessel-details">
        <DetailRow
          label="IMO"
          value={vessel.imo || "Unknown"}
          mono
        />

        <DetailRow
          label="Flag"
          value={vessel.flag || "Unknown"}
        />

        <DetailRow
          label="Type"
          value={
            vessel.vessel_type || "Unknown"
          }
        />

        {vesselHistory?.involved_in?.length >
          1 && (
          <DetailRow
            label="Other investigations"
            value={vesselHistory.involved_in
              .filter(
                (id) => id !== vessel.investigation_id
              )
              .join(", ")}
          />
        )}
      </div>

      <div className="evidence-metrics">
        <EvidenceMetric
          label="Spatial"
          value={vessel.spatial}
        />

        <EvidenceMetric
          label="Temporal"
          value={vessel.temporal}
        />

        <EvidenceMetric
          label="Trajectory"
          value={vessel.trajectory}
        />

        <EvidenceMetric
          label="Behaviour"
          value={vessel.behaviour}
        />
      </div>

      <div className="vessel-context-metrics">
        <Metric
          label="Distance"
          value={`${vessel.distance_km} km`}
        />

        <Metric
          label="Time Δ"
          value={`${vessel.time_diff_h} h`}
        />

        <Metric
          label="Dwell"
          value={`${vessel.dwell_min} min`}
        />
      </div>

      <button
        type="button"
        className="evidence-toggle"
        onClick={() =>
          setShowEvidence((value) => !value)
        }
        aria-expanded={showEvidence}
      >
        <span>Evidence details</span>
        <span>
          {showEvidence ? "−" : "+"}
        </span>
      </button>

      {showEvidence && (
        <div className="evidence-details">
          {vessel.evidence?.length ? (
            <ul className="evidence-list">
              {vessel.evidence.map(
                (evidence, index) => (
                  <li
                    key={`${vessel.mmsi}-${index}`}
                    className={
                      evidence.ok === true
                        ? "ok"
                        : evidence.ok === false
                        ? "no"
                        : "warn"
                    }
                  >
                    <span className="evidence-icon">
                      {evidence.ok === true
                        ? "✓"
                        : evidence.ok === false
                        ? "–"
                        : "!"}
                    </span>

                    <span>{evidence.text}</span>
                  </li>
                )
              )}
            </ul>
          ) : (
            <p className="intelligence-note">
              No detailed evidence is available
              for this candidate yet.
            </p>
          )}
        </div>
      )}

      <div className="investigative-notice">
        <strong>
          Investigative use only
        </strong>

        <span>
          Correlation does not establish
          responsibility. Final determination
          belongs to authorised investigators.
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small reusable UI primitives
// ---------------------------------------------------------------------------

function SectionHeading({
  eyebrow,
  title,
  count,
}) {
  return (
    <div className="intelligence-heading">
      <div>
        <div className="intelligence-eyebrow">
          {eyebrow}
        </div>

        <h2>{title}</h2>
      </div>

      {count != null && (
        <span className="section-count">
          {count}
        </span>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="compact-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}) {
  return (
    <div className="detail-row">
      <span>{label}</span>

      <strong className={mono ? "mono" : ""}>
        {value}
      </strong>
    </div>
  );
}

function EvidenceMetric({
  label,
  value,
}) {
  return (
    <div className="evidence-metric">
      <div className="evidence-metric-head">
        <span>{label}</span>

        <strong>
          {value != null
            ? value.toFixed(2)
            : "—"}
        </strong>
      </div>

      <div className="evidence-progress">
        <span
          style={{
            width:
              value != null
                ? `${value * 100}%`
                : "0%",
            background:
              scoreColor(value),
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data quality
// ---------------------------------------------------------------------------

function DataQualityBar({ inv }) {
  const metrics = [
    {
      label: "IoU",
      value:
        inv.metrics?.oil_iou != null
          ? inv.metrics.oil_iou.toFixed(2)
          : "—",
    },
    {
      label: "F1",
      value:
        inv.metrics?.oil_f1 != null
          ? inv.metrics.oil_f1.toFixed(2)
          : "—",
    },
    {
      label: "Source error",
      value:
        inv.metrics?.source_error_km != null
          ? `${inv.metrics.source_error_km} km`
          : "—",
    },
    {
      label: "Candidate recall",
      value:
        inv.metrics?.candidate_recall != null
          ? `${(
              inv.metrics.candidate_recall *
              100
            ).toFixed(0)}%`
          : "—",
    },
    {
      label: "Processing",
      value:
        inv.metrics?.processing_time_s != null
          ? `${inv.metrics.processing_time_s}s`
          : "—",
    },
  ];

  return (
    <footer className="investigation-data-bar">
      <div className="data-quality-title">
        Data quality
      </div>

      <div className="data-quality-metrics">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="data-quality-metric"
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>

      <div className="data-quality-id">
        {inv.id}
      </div>
    </footer>
  );
}

function ProfileMenu({ session, onSignOut }) {
  const [open, setOpen] = useState(false);
  const username = session?.username || "Investigator";
  const initials = username
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function handleSignOut() {
    setOpen(false);
    onSignOut?.();
  }

  return (
    <div className="profile-menu">
      <button
        type="button"
        className={`profile-trigger${open ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="profile-avatar" aria-hidden="true">{initials}</span>
        <span className="profile-identity">
          <span className="profile-name">{username}</span>
          <span className="profile-role">Investigator</span>
        </span>
        <span className="profile-chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-header">
            <span className="profile-avatar profile-avatar-large">{initials}</span>
            <div className="profile-dropdown-identity">
              <span className="profile-dropdown-name">{username}</span>
              <span className="profile-dropdown-role">Field Investigator</span>
            </div>
          </div>
          <div className="profile-divider" />
          <button type="button" className="profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>Account</button>
          <button type="button" className="profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>Session details</button>
          <div className="profile-divider" />
          <button type="button" className="profile-menu-item profile-menu-signout" role="menuitem" onClick={handleSignOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
