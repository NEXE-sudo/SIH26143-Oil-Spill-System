import React, { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Demo data — mirrors the shape described in the SIH26143 roadmap
// (spill geometry, source estimate, AIS candidate vessels, attribution score)
// ---------------------------------------------------------------------------

const DEMO_INVESTIGATION = {
  id: "INV-2026-0001",
  satellite: { platform: "Sentinel-1", product: "GRD", timestamp: "2026-09-08T10:35:00Z" },
  spill: {
    confidence: 0.91,
    area_km2: 12.83,
    perimeter_km: 17.4,
    centroid: { lat: 13.421, lon: 80.192 },
    major_axis_km: 6.4,
    minor_axis_km: 1.9,
    orientation_deg: 41,
    // polygon in a local 0-100 svg coordinate space for the mock map
    polygon: "M 168,132 L 198,124 L 224,134 L 232,150 L 214,168 L 182,166 L 162,152 Z",
  },
  source: {
    lat: 13.39,
    lon: 80.14,
    window_start: "2026-09-08T02:00:00Z",
    window_end: "2026-09-08T08:00:00Z",
  },
  vessels: [
    {
      mmsi: "357219004",
      name: "MV KAVERI STAR",
      final_score: 0.87,
      spatial: 0.96,
      temporal: 0.91,
      trajectory: 0.88,
      behaviour: 0.62,
      distance_km: 3.2,
      time_diff_h: 1.4,
      dwell_min: 42,
      track: "M 150,180 L 172,160 L 196,148 L 210,140",
      evidence: [
        { ok: true, text: "Passed within 3.2 km of estimated source" },
        { ok: true, text: "Passed during estimated source window" },
        { ok: true, text: "Track direction consistent with source-to-spill path" },
        { ok: true, text: "Remained in region for 42 minutes" },
        { ok: null, text: "Moderate behavioural anomaly" },
        { ok: true, text: "AIS track overlaps 71% of high-probability source corridor" },
      ],
    },
    {
      mmsi: "412998231",
      name: "MV DELTA HORIZON",
      final_score: 0.73,
      spatial: 0.81,
      temporal: 0.7,
      trajectory: 0.75,
      behaviour: 0.4,
      distance_km: 8.6,
      time_diff_h: 3.1,
      dwell_min: 18,
      track: "M 120,210 L 140,190 L 158,172 L 176,158",
      evidence: [
        { ok: true, text: "Passed within 8.6 km of estimated source" },
        { ok: true, text: "Within source window with 3.1 h margin" },
        { ok: null, text: "Trajectory partially compatible" },
        { ok: false, text: "No unusual behaviour detected" },
      ],
    },
    {
      mmsi: "563102887",
      name: "MV OSPREY TRADER",
      final_score: 0.51,
      spatial: 0.58,
      temporal: 0.44,
      trajectory: 0.52,
      behaviour: 0.35,
      distance_km: 21.4,
      time_diff_h: 6.8,
      dwell_min: 6,
      track: "M 240,110 L 250,130 L 246,150 L 236,164",
      evidence: [
        { ok: null, text: "21.4 km from estimated source — moderate distance" },
        { ok: null, text: "6.8 h outside tightest source window" },
        { ok: false, text: "No dwell time near source" },
      ],
    },
  ],
  metrics: {
    oil_iou: 0.84,
    oil_f1: 0.89,
    false_positive_rate: 0.06,
    source_error_km: 4.1,
    candidate_recall: 0.93,
    top3_recall: 1.0,
    processing_time_s: 38,
  },
};

const LAYERS = [
  { id: "satellite", label: "Satellite image", default: true },
  { id: "oil", label: "Detected oil", default: true },
  { id: "polygon", label: "Spill polygon", default: true },
  { id: "source", label: "Source probability", default: true },
  { id: "ais", label: "AIS vessels", default: true },
  { id: "tracks", label: "Vessel tracks", default: true },
  { id: "wind", label: "Wind vectors", default: false },
  { id: "current", label: "Ocean currents", default: false },
];

function fmtUTC(iso) {
  const d = new Date(iso);
  return d.toISOString().slice(11, 16) + " UTC";
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function scoreColor(v) {
  if (v >= 0.75) return "var(--good)";
  if (v >= 0.5) return "var(--warn)";
  return "var(--muted-2)";
}

// ---------------------------------------------------------------------------

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [layers, setLayers] = useState(
    Object.fromEntries(LAYERS.map((l) => [l.id, l.default]))
  );
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [stage, setStage] = useState(0); // pipeline progress while "loading"
  const inv = DEMO_INVESTIGATION;

  const stages = [
    "Fetching Sentinel-1 scene",
    "Running SAR preprocessing",
    "Detecting oil signature",
    "Segmenting spill polygon",
    "Computing drift hindcast",
    "Querying historical AIS",
    "Scoring candidate vessels",
  ];

  useEffect(() => {
    if (!loading) return;
    if (stage >= stages.length) {
      const t = setTimeout(() => {
        setLoading(false);
        setLoaded(true);
        setSelectedVessel(inv.vessels[0].mmsi);
      }, 300);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStage((s) => s + 1), 260);
    return () => clearTimeout(t);
  }, [loading, stage]);

  function handleLoadDemo() {
    setStage(0);
    setLoading(true);
  }

  function toggleLayer(id) {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const activeVessel = inv.vessels.find((v) => v.mmsi === selectedVessel) || null;

  return (
    <div className="shell">
      <TopBar loaded={loaded} inv={inv} onLoadDemo={handleLoadDemo} loading={loading} />

      {!loaded && !loading && <EmptyState onLoadDemo={handleLoadDemo} />}

      {loading && <LoadingState stages={stages} stage={stage} />}

      {loaded && (
        <div className="main">
          <MapPanel
            inv={inv}
            layers={layers}
            toggleLayer={toggleLayer}
            selectedVessel={selectedVessel}
            setSelectedVessel={setSelectedVessel}
          />
          <EvidenceRail
            inv={inv}
            activeVessel={activeVessel}
            selectedVessel={selectedVessel}
            setSelectedVessel={setSelectedVessel}
          />
        </div>
      )}

      <StatusBar loaded={loaded} inv={inv} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function TopBar({ loaded, inv, onLoadDemo, loading }) {
  return (
    <header className="topbar">
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
            <path
              d="M2 21c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              opacity="0.5"
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

      {loaded && (
        <div className="topbar-inv">
          <span className="inv-id">{inv.id}</span>
          <span className="dot" />
          <span>{inv.satellite.platform}</span>
          <span className="dot" />
          <span>{fmtDate(inv.satellite.timestamp)}</span>
          <span className="dot" />
          <span>{fmtUTC(inv.satellite.timestamp)}</span>
        </div>
      )}

      <button className="btn-demo" onClick={onLoadDemo} disabled={loading}>
        {loading ? "Loading…" : loaded ? "Reload demo investigation" : "Load demo investigation"}
      </button>
    </header>
  );
}

function EmptyState({ onLoadDemo }) {
  return (
    <div className="empty">
      <div className="empty-inner">
        <svg viewBox="0 0 120 120" width="88" height="88" className="empty-icon">
          <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
          <circle cx="60" cy="60" r="30" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
          <circle cx="60" cy="60" r="2.5" fill="currentColor" />
          <line x1="60" y1="4" x2="60" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          <line x1="60" y1="102" x2="60" y2="116" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          <line x1="4" y1="60" x2="18" y2="60" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          <line x1="102" y1="60" x2="116" y2="60" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        </svg>
        <h1>No investigation open</h1>
        <p>
          Load a Sentinel-1 scene to detect a slick, trace its drift, and cross-reference
          historical AIS traffic against the estimated source window.
        </p>
        <button className="btn-primary" onClick={onLoadDemo}>
          Load demo investigation
        </button>
      </div>
    </div>
  );
}

function LoadingState({ stages, stage }) {
  return (
    <div className="empty">
      <div className="empty-inner loading-inner">
        <h1>Running investigation pipeline</h1>
        <ul className="pipeline-list">
          {stages.map((s, i) => (
            <li key={s} className={i < stage ? "done" : i === stage ? "active" : ""}>
              <span className="pipeline-marker">
                {i < stage ? "✓" : i === stage ? <span className="spinner" /> : ""}
              </span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MapPanel({ inv, layers, toggleLayer, selectedVessel, setSelectedVessel }) {
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

          {/* coastline suggestion */}
          <path
            d="M 0,40 Q 40,55 55,90 Q 65,120 40,160 Q 20,190 40,230 Q 55,260 30,300 L 0,300 Z"
            fill="#0f1b26"
            stroke="#1c2b3a"
            strokeWidth="1"
          />

          {/* wind vectors */}
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

          {/* ocean current streamlines */}
          {layers.current && (
            <g opacity="0.3" stroke="#38bdf8" fill="none" strokeWidth="1">
              <path d="M 20,250 Q 100,230 180,250 T 380,240" />
              <path d="M 20,270 Q 100,255 180,270 T 380,260" />
            </g>
          )}

          {/* source probability field */}
          {layers.source && (
            <ellipse
              cx={80 + inv.source.lon * 4}
              cy={40 + (14 - inv.source.lat) * 90}
              rx="46"
              ry="34"
              fill="url(#srcGlow)"
            />
          )}
          {layers.source && (
            <circle
              cx={80 + inv.source.lon * 4}
              cy={40 + (14 - inv.source.lat) * 90}
              r="3"
              fill="var(--amber)"
              stroke="#0a0e14"
              strokeWidth="1"
            />
          )}

          {/* AIS vessel tracks */}
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

          {/* AIS vessel markers */}
          {layers.ais &&
            inv.vessels.map((v) => {
              const end = v.track.split(" ").slice(-2);
              const x = parseFloat(end[0]);
              const y = parseFloat(end[1]);
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

          {/* oil detection highlight */}
          {layers.oil && (
            <path d={inv.spill.polygon} fill="var(--danger)" opacity="0.25" />
          )}

          {/* spill polygon outline */}
          {layers.polygon && (
            <path
              d={inv.spill.polygon}
              fill="none"
              stroke="var(--danger)"
              strokeWidth="1.6"
              strokeDasharray="2 2"
            />
          )}
          {layers.polygon && (
            <circle
              cx={(168 + 232) / 2}
              cy={(124 + 168) / 2}
              r="2"
              fill="var(--danger)"
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

function EvidenceRail({ inv, activeVessel, selectedVessel, setSelectedVessel }) {
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
          {inv.source.lat.toFixed(2)}°N, {inv.source.lon.toFixed(2)}°E
        </div>
        <div className="source-window">
          <span>{fmtUTC(inv.source.window_start)}</span>
          <span className="window-bar" />
          <span>{fmtUTC(inv.source.window_end)}</span>
        </div>
        <p className="hint-text">
          Estimated from a backward drift hindcast using wind and current forcing. Treated
          as a probability region, not a single point.
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
                    style={{
                      width: `${v.final_score * 100}%`,
                      background: scoreColor(v.final_score),
                    }}
                  />
                </span>
              </span>
            </button>
          ))}
        </div>
      </RailSection>

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
                <span className="evidence-icon">
                  {e.ok === true ? "✓" : e.ok === false ? "–" : "!"}
                </span>
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
        <span
          className="score-bar-fill"
          style={{ width: `${value * 100}%`, background: scoreColor(value) }}
        />
      </span>
      <span className="score-bar-value">{value.toFixed(2)}</span>
    </div>
  );
}

function StatusBar({ loaded, inv }) {
  return (
    <footer className="statusbar">
      <span>Oil IoU {loaded ? inv.metrics.oil_iou.toFixed(2) : "—"}</span>
      <span className="dot" />
      <span>Oil F1 {loaded ? inv.metrics.oil_f1.toFixed(2) : "—"}</span>
      <span className="dot" />
      <span>Source error {loaded ? `${inv.metrics.source_error_km} km` : "—"}</span>
      <span className="dot" />
      <span>Candidate recall {loaded ? `${(inv.metrics.candidate_recall * 100).toFixed(0)}%` : "—"}</span>
      <span className="dot" />
      <span>Processing {loaded ? `${inv.metrics.processing_time_s}s` : "—"}</span>
      <span className="statusbar-fill" />
      <span className="build-tag">v0.1-internal-demo</span>
    </footer>
  );
}
