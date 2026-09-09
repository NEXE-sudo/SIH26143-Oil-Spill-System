import React, { useEffect, useState } from "react";
import { driftHindcast, getAttribution, getReport, getSpill, getVessel } from "./lib/api.js";

// ---------------------------------------------------------------------------
// Investigation detail — the map + evidence dashboard, opened from the
// landing page's report list. Takes a full investigation record as a prop
// instead of hardcoded demo data, and adds a Key Findings strip up top with
// the three things investigators need first: spill origin coordinates, the
// estimated date/time of origin, and the identity of the top suspect vessel.
// ---------------------------------------------------------------------------

const LAYERS = [
  { id: "satellite", label: "Satellite image", default: true },
  { id: "oil", label: "Detected oil", default: true },
  { id: "polygon", label: "Spill polygon", default: true },
  { id: "source", label: "Source probability", default: true },
  { id: "ais", label: "AIS vessels", default: true },
  { id: "tracks", label: "Vessel tracks", default: true },
  { id: "wind", label: "Wind vectors", default: false },
  { id: "current", label: "Ocean currents", default: false },
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
const PX_PER_KM = 3.2; // tuned so a ~24h drift track stays on-map

function polygonCentroid(pathD) {
  const nums = (pathD.match(/-?[\d.]+/g) || []).map(Number);
  let sx = 0,
    sy = 0,
    n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    sx += nums[i];
    sy += nums[i + 1];
    n++;
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 200, y: 150 };
}

function makeMapProjection(inv) {
  const anchor = polygonCentroid(inv.spill.polygon);
  const lat0 = inv.spill.centroid.lat;
  const lon0 = inv.spill.centroid.lon;
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);

  return function toMapXY(lat, lon) {
    const dxKm = (lon - lon0) * kmPerDegLon;
    const dyKm = (lat - lat0) * KM_PER_DEG_LAT;
    return { x: anchor.x + dxKm * PX_PER_KM, y: anchor.y - dyKm * PX_PER_KM };
  };
}

function fmtUTC(iso) {
  const d = new Date(iso);
  return d.toISOString().slice(11, 16) + " UTC";
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}
function fmtDateTime(iso) {
  return `${fmtDate(iso)} · ${fmtUTC(iso)}`;
}

function scoreColor(v) {
  if (v >= 0.75) return "var(--good)";
  if (v >= 0.5) return "var(--warn)";
  return "var(--muted-2)";
}

// ---------------------------------------------------------------------------

export default function InvestigationDetail({ investigation, onClose }) {
  const inv = investigation;
  const [layers, setLayers] = useState(
    Object.fromEntries(LAYERS.map((l) => [l.id, l.default]))
  );
  const [drift, setDrift] = useState(null); // DriftHindcastResponse | null
  const [driftError, setDriftError] = useState(null);
  const [spill, setSpill] = useState(inv.spill); // SpillGeometry, replaced once /api/spills/{id} resolves
  const [vessels, setVessels] = useState(inv.vessels); // VesselCandidate[], replaced once attribution resolves
  const [selectedVessel, setSelectedVessel] = useState(inv.vessels[0]?.mmsi ?? null);

  function toggleLayer(id) {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  useEffect(() => {
    let cancelled = false;
    const spillId = "SPL-" + inv.id.replace(/^INV-/, "");

    driftHindcast({ spill_id: spillId })
      .then((res) => {
        if (!cancelled) {
          setDrift(res);
          setDriftError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("Drift hindcast unavailable:", err.message);
          setDriftError(err.message);
        }
      });

    getSpill(spillId)
      .then((res) => {
        if (!cancelled) setSpill(res.spill);
      })
      .catch((err) => {
        console.warn("Spill detail unavailable, using embedded record:", err.message);
      });

    getAttribution(inv.id)
      .then((res) => {
        if (!cancelled) setVessels(res.ranked_vessels);
      })
      .catch((err) => {
        console.warn("Attribution unavailable, using embedded candidates:", err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [inv.id]);

  // Keep the rest of the tree reading `inv.spill` / `inv.vessels` unchanged —
  // this just swaps in live values once each fetch resolves, embedded mock
  // data as the fallback/initial render.
  const liveInv = { ...inv, spill, vessels };

  const activeVessel = vessels.find((v) => v.mmsi === selectedVessel) || null;
  const topVessel = vessels[0];

  return (
    <div className="shell detail-shell">
      <TopBar inv={liveInv} onClose={onClose} />
      <KeyFindings inv={liveInv} topVessel={topVessel} />

      <div className="main">
        <MapPanel
          inv={liveInv}
          layers={layers}
          toggleLayer={toggleLayer}
          selectedVessel={selectedVessel}
          setSelectedVessel={setSelectedVessel}
          drift={drift}
        />
        <EvidenceRail
          inv={liveInv}
          activeVessel={activeVessel}
          selectedVessel={selectedVessel}
          setSelectedVessel={setSelectedVessel}
          drift={drift}
          driftError={driftError}
        />
      </div>

      <StatusBar inv={liveInv} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function TopBar({ inv, onClose }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState(null);

  function handleViewReport() {
    setReportOpen(true);
    if (report || reportError) return; // already fetched for this vessel session
    getReport(inv.id)
      .then((res) => setReport(res))
      .catch((err) => setReportError(err.message));
  }

  return (
    <header className="topbar">
      <button className="btn-back" onClick={onClose} aria-label="Back to reports">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path
            d="M15 5 8 12l7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Reports
      </button>

      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M2 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="12" cy="8" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 3.8v8.4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </span>
        <div>
          <div className="brand-title">Maritime Oil Spill Intelligence</div>
          <div className="brand-sub">SIH26143 · NTRO investigation console</div>
        </div>
      </div>

      <div className="topbar-inv">
        <span className="inv-id">{inv.id}</span>
        <span className="dot" />
        <span>{inv.satellite.platform}</span>
        <span className="dot" />
        <span>{fmtDate(inv.satellite.timestamp)}</span>
        <span className="dot" />
        <span>{fmtUTC(inv.satellite.timestamp)}</span>
        <span className="dot" />
        <button className="btn-report" onClick={handleViewReport}>
          View report
        </button>
      </div>

      {reportOpen && (
        <div className="report-popover" role="dialog" aria-label="Investigation report">
          <div className="report-popover-head">
            <span>Report — {inv.id}</span>
            <button onClick={() => setReportOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          {reportError && <p className="hint-text">Report unavailable: {reportError}</p>}
          {!reportError && !report && <p className="hint-text">Loading report…</p>}
          {report && (
            <div className="report-popover-body">
              <p>
                Status <strong>{report.status}</strong> · lodged {fmtDateTime(report.lodged_at)}
              </p>
              <p>
                Spill centroid {report.spill.centroid.lat.toFixed(3)}°N,{" "}
                {report.spill.centroid.lon.toFixed(3)}°E · {report.spill.area_km2.toFixed(1)} km²
              </p>
              <p>
                Top suspect {report.vessels[0]?.name ?? "—"} (
                {((report.vessels[0]?.final_score ?? 0) * 100).toFixed(0)}% confidence)
              </p>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

function KeyFindings({ inv, topVessel }) {
  return (
    <div className="key-findings">
      <div className="kf-item">
        <div className="kf-label">Spill coordinates</div>
        <div className="kf-value">
          {inv.spill.centroid.lat.toFixed(3)}°N, {inv.spill.centroid.lon.toFixed(3)}°E
        </div>
      </div>
      <div className="kf-sep" />
      <div className="kf-item">
        <div className="kf-label">Estimated origin window</div>
        <div className="kf-value">
          {fmtDateTime(inv.source.window_start)} — {fmtUTC(inv.source.window_end)}
        </div>
        <div className="kf-sub">
          {inv.source.lat.toFixed(3)}°N, {inv.source.lon.toFixed(3)}°E
        </div>
      </div>
      <div className="kf-sep" />
      <div className="kf-item">
        <div className="kf-label">Top suspect vessel</div>
        {topVessel ? (
          <>
            <div className="kf-value">{topVessel.name}</div>
            <div className="kf-sub">
              MMSI {topVessel.mmsi}
              {topVessel.imo ? ` · IMO ${topVessel.imo}` : ""}
              {topVessel.flag ? ` · ${topVessel.flag} flag` : ""}
            </div>
          </>
        ) : (
          <div className="kf-value kf-empty">No candidate identified yet</div>
        )}
      </div>
      <div className="kf-sep" />
      <div className="kf-item kf-item-score">
        <div className="kf-label">Attribution confidence</div>
        <div className="kf-value" style={{ color: topVessel ? scoreColor(topVessel.final_score) : undefined }}>
          {topVessel ? `${(topVessel.final_score * 100).toFixed(0)}%` : "—"}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MapPanel({ inv, layers, toggleLayer, selectedVessel, setSelectedVessel, drift }) {
  const toMapXY = makeMapProjection(inv);

  const driftPath =
    drift && drift.track.length > 1
      ? "M " +
        drift.track
          .map((t) => {
            const { x, y } = toMapXY(t.centroid.lat, t.centroid.lon);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" L ")
      : null;
  return (
    <section className="map-panel">
      <div className="map-frame">
        <svg viewBox="0 0 400 300" className="map-svg" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="srcGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="oceanGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0d1620" />
              <stop offset="100%" stopColor="#0a121b" />
            </linearGradient>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#16222f" strokeWidth="0.5" />
            </pattern>
          </defs>

          <rect x="0" y="0" width="400" height="300" fill="url(#oceanGrad)" />
          {layers.satellite && <rect x="0" y="0" width="400" height="300" fill="url(#grid)" />}

          <path
            d="M 0,40 Q 40,55 55,90 Q 65,120 40,160 Q 20,190 40,230 Q 55,260 30,300 L 0,300 Z"
            fill="#0f1b26"
            stroke="#1c2b3a"
            strokeWidth="1"
          />

          {layers.wind &&
            Array.from({ length: 24 }).map((_, i) => {
              const x = 60 + (i % 6) * 55;
              const y = 30 + Math.floor(i / 6) * 60;
              return (
                <g key={"w" + i} opacity="0.35" transform={`translate(${x},${y}) rotate(35)`}>
                  <line x1="0" y1="0" x2="14" y2="0" stroke="#7dd3fc" strokeWidth="1" />
                  <path d="M 14,0 L 10,-2.5 M 14,0 L 10,2.5" stroke="#7dd3fc" strokeWidth="1" />
                </g>
              );
            })}

          {layers.current && (
            <g opacity="0.3" stroke="#38bdf8" fill="none" strokeWidth="1">
              <path d="M 20,250 Q 100,230 180,250 T 380,240" />
              <path d="M 20,270 Q 100,255 180,270 T 380,260" />
            </g>
          )}

          {layers.source &&
            (() => {
              const { x, y } = toMapXY(inv.source.lat, inv.source.lon);
              return <ellipse cx={x} cy={y} rx="46" ry="34" fill="url(#srcGlow)" />;
            })()}
          {layers.source &&
            (() => {
              const { x, y } = toMapXY(inv.source.lat, inv.source.lon);
              return <circle cx={x} cy={y} r="3" fill="var(--amber)" stroke="#0a0e14" strokeWidth="1" />;
            })()}

          {layers.drift && driftPath && (
            <path
              d={driftPath}
              fill="none"
              stroke="var(--amber)"
              strokeWidth="1.4"
              strokeDasharray="1 3"
              opacity="0.85"
            />
          )}
          {layers.drift &&
            drift &&
            drift.track.length > 1 &&
            (() => {
              const { x, y } = toMapXY(drift.track[0].centroid.lat, drift.track[0].centroid.lon);
              return (
                <circle cx={x} cy={y} r="2.5" fill="var(--amber)" stroke="#0a0e14" strokeWidth="0.75" />
              );
            })()}

          {layers.tracks &&
            inv.vessels.map((v) => (
              <path
                key={v.mmsi}
                d={v.track}
                fill="none"
                stroke={v.mmsi === selectedVessel ? "var(--accent)" : "#3a4a5c"}
                strokeWidth={v.mmsi === selectedVessel ? 2 : 1.2}
                strokeDasharray={v.mmsi === selectedVessel ? "none" : "3 3"}
                opacity={v.mmsi === selectedVessel ? 1 : 0.6}
              />
            ))}

          {layers.ais &&
            inv.vessels.map((v) => {
              const lastPoint = v.track.trim().split(" ").pop(); // e.g. "210,140"
              const [x, y] = lastPoint.split(",").map(Number);
              return (
                <g
                  key={v.mmsi}
                  transform={`translate(${x},${y})`}
                  className="vessel-marker"
                  onClick={() => setSelectedVessel(v.mmsi)}
                >
                  <circle r="9" fill="transparent" />
                  <path
                    d="M -4,4 L 0,-5 L 4,4 Z"
                    fill={v.mmsi === selectedVessel ? "var(--accent)" : "#8b96a5"}
                    stroke="#0a0e14"
                    strokeWidth="0.75"
                  />
                </g>
              );
            })}

          {layers.oil && <path d={inv.spill.polygon} fill="var(--danger)" opacity="0.25" />}

          {layers.polygon && (
            <path
              d={inv.spill.polygon}
              fill="none"
              stroke="var(--danger)"
              strokeWidth="1.6"
              strokeDasharray="2 2"
            />
          )}
        </svg>

        <div className="map-readout">
          <span>Area {inv.spill.area_km2.toFixed(1)} km²</span>
          <span className="dot" />
          <span>Confidence {(inv.spill.confidence * 100).toFixed(0)}%</span>
          <span className="dot" />
          <span>{fmtUTC(inv.satellite.timestamp)}</span>
        </div>
      </div>

      <LayerToggles layers={layers} toggleLayer={toggleLayer} />
    </section>
  );
}

function LayerToggles({ layers, toggleLayer }) {
  return (
    <div className="layer-toggles">
      <div className="layer-toggles-label">Map layers</div>
      <div className="layer-grid">
        {LAYERS.map((l) => (
          <label key={l.id} className="layer-item">
            <input type="checkbox" checked={!!layers[l.id]} onChange={() => toggleLayer(l.id)} />
            <span>{l.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EvidenceRail({ inv, activeVessel, selectedVessel, setSelectedVessel, drift, driftError }) {
  const [vesselHistory, setVesselHistory] = useState(null); // VesselDetailResponse | null

  useEffect(() => {
    if (!selectedVessel) {
      setVesselHistory(null);
      return;
    }
    let cancelled = false;
    getVessel(selectedVessel)
      .then((res) => {
        if (!cancelled) setVesselHistory(res);
      })
      .catch((err) => {
        console.warn("Vessel history unavailable:", err.message);
        if (!cancelled) setVesselHistory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedVessel]);

  const source = drift ? drift.source_estimate : inv.source;
  return (
    <aside className="rail">
      <RailSection title="Detection">
        <div className="stat-grid">
          <Stat label="Area" value={`${inv.spill.area_km2.toFixed(1)} km²`} />
          <Stat label="Perimeter" value={`${inv.spill.perimeter_km.toFixed(1)} km`} />
          <Stat label="Confidence" value={`${(inv.spill.confidence * 100).toFixed(0)}%`} accent="good" />
          <Stat label="Orientation" value={`${inv.spill.orientation_deg}°`} />
          <Stat label="Major axis" value={`${inv.spill.major_axis_km} km`} />
          <Stat label="Minor axis" value={`${inv.spill.minor_axis_km} km`} />
        </div>
        <div className="coord-line">
          Centroid {inv.spill.centroid.lat.toFixed(3)}°N, {inv.spill.centroid.lon.toFixed(3)}°E
        </div>
      </RailSection>

      <RailSection title="Source estimation">
        <div className="coord-line coord-line-lg">
          {source.lat.toFixed(2)}°N, {source.lon.toFixed(2)}°E
        </div>
        <div className="source-window">
          <span>{fmtUTC(source.window_start)}</span>
          <span className="window-bar" />
          <span>{fmtUTC(source.window_end)}</span>
        </div>
        <p className="hint-text">
          Estimated from a backward drift hindcast using wind and current forcing. Treated
          as a probability region, not a single point.
          {driftError && " (live hindcast unavailable — showing last known estimate.)"}
        </p>
      </RailSection>

      <RailSection title={`Suspect vessels (${inv.vessels.length})`}>
        <div className="vessel-list">
          {inv.vessels.map((v, i) => (
            <button
              key={v.mmsi}
              className={"vessel-row" + (v.mmsi === selectedVessel ? " selected" : "")}
              onClick={() => setSelectedVessel(v.mmsi)}
            >
              <span className="vessel-rank">{i + 1}</span>
              <span className="vessel-name-block">
                <span className="vessel-name">{v.name}</span>
                <span className="vessel-mmsi">MMSI {v.mmsi}</span>
              </span>
              <span className="vessel-score-block">
                <span className="vessel-score" style={{ color: scoreColor(v.final_score) }}>
                  {(v.final_score * 100).toFixed(0)}%
                </span>
                <span className="vessel-bar-track">
                  <span
                    className="vessel-bar-fill"
                    style={{ width: `${v.final_score * 100}%`, background: scoreColor(v.final_score) }}
                  />
                </span>
              </span>
            </button>
          ))}
        </div>
      </RailSection>

      {activeVessel && (
        <RailSection title="Vessel identification">
          <div className="id-grid">
            <div className="id-row">
              <span className="id-label">Vessel name</span>
              <span className="id-value">{activeVessel.name}</span>
            </div>
            <div className="id-row">
              <span className="id-label">MMSI</span>
              <span className="id-value id-mono">{activeVessel.mmsi}</span>
            </div>
            <div className="id-row">
              <span className="id-label">IMO number</span>
              <span className="id-value id-mono">{activeVessel.imo || "Unknown"}</span>
            </div>
            <div className="id-row">
              <span className="id-label">Flag state</span>
              <span className="id-value">{activeVessel.flag || "Unknown"}</span>
            </div>
            <div className="id-row">
              <span className="id-label">Vessel type</span>
              <span className="id-value">{activeVessel.vessel_type || "Unknown"}</span>
            </div>
            {vesselHistory && vesselHistory.involved_in.length > 1 && (
              <div className="id-row">
                <span className="id-label">Also flagged in</span>
                <span className="id-value">
                  {vesselHistory.involved_in.filter((id) => id !== inv.id).join(", ")}
                </span>
              </div>
            )}
          </div>
        </RailSection>
      )}

      {activeVessel && (
        <RailSection title="Evidence detail">
          <div className="evidence-header">
            <div>
              <div className="vessel-name">{activeVessel.name}</div>
              <div className="vessel-mmsi">MMSI {activeVessel.mmsi}</div>
            </div>
            <div className="evidence-score" style={{ color: scoreColor(activeVessel.final_score) }}>
              {(activeVessel.final_score * 100).toFixed(0)}%
            </div>
          </div>

          <div className="score-breakdown">
            <ScoreBar label="Spatial" value={activeVessel.spatial} />
            <ScoreBar label="Temporal" value={activeVessel.temporal} />
            <ScoreBar label="Trajectory" value={activeVessel.trajectory} />
            <ScoreBar label="Behaviour" value={activeVessel.behaviour} />
          </div>

          <div className="stat-grid stat-grid-3">
            <Stat label="Distance" value={`${activeVessel.distance_km} km`} small />
            <Stat label="Time Δ" value={`${activeVessel.time_diff_h} h`} small />
            <Stat label="Dwell" value={`${activeVessel.dwell_min} min`} small />
          </div>

          <ul className="evidence-list">
            {activeVessel.evidence.map((e, i) => (
              <li key={i} className={e.ok === true ? "ok" : e.ok === false ? "no" : "warn"}>
                <span className="evidence-icon">{e.ok === true ? "✓" : e.ok === false ? "–" : "!"}</span>
                {e.text}
              </li>
            ))}
          </ul>

          <p className="disclaimer">
            Investigative ranking, not proof of responsibility. Final determination belongs
            to authorised investigators.
          </p>
        </RailSection>
      )}
    </aside>
  );
}

function RailSection({ title, children }) {
  return (
    <div className="rail-section">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value, accent, small }) {
  return (
    <div className={"stat" + (small ? " stat-sm" : "")}>
      <div className="stat-value" style={accent === "good" ? { color: "var(--good)" } : undefined}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ScoreBar({ label, value }) {
  return (
    <div className="score-bar-row">
      <span className="score-bar-label">{label}</span>
      <span className="score-bar-track">
        <span className="score-bar-fill" style={{ width: `${value * 100}%`, background: scoreColor(value) }} />
      </span>
      <span className="score-bar-value">{value.toFixed(2)}</span>
    </div>
  );
}

function StatusBar({ inv }) {
  const m = inv.metrics;
  return (
    <footer className="statusbar">
      <span>Oil IoU {m.oil_iou != null ? m.oil_iou.toFixed(2) : "—"}</span>
      <span className="dot" />
      <span>Oil F1 {m.oil_f1 != null ? m.oil_f1.toFixed(2) : "—"}</span>
      <span className="dot" />
      <span>Source error {m.source_error_km != null ? `${m.source_error_km} km` : "—"}</span>
      <span className="dot" />
      <span>
        Candidate recall {m.candidate_recall != null ? `${(m.candidate_recall * 100).toFixed(0)}%` : "—"}
      </span>
      <span className="dot" />
      <span>Processing {m.processing_time_s != null ? `${m.processing_time_s}s` : "—"}</span>
      <span className="statusbar-fill" />
      <span className="build-tag">{inv.id}</span>
    </footer>
  );
}
