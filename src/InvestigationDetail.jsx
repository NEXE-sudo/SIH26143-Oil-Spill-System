import React, { useEffect, useMemo, useState } from "react";
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
  { id: "satellite", label: "Satellite image", group: "Base", default: true },
  { id: "oil", label: "Detected oil", group: "Detection", default: true },
  { id: "polygon", label: "Spill boundary", group: "Detection", default: true },
  { id: "source", label: "Source region", group: "Detection", default: true },
  { id: "ais", label: "AIS vessels", group: "Vessels", default: true },
  { id: "tracks", label: "Vessel tracks", group: "Vessels", default: true },
  { id: "wind", label: "Wind vectors", group: "Environment", default: false },
  { id: "current", label: "Ocean currents", group: "Environment", default: false },
  { id: "drift", label: "Drift hindcast", group: "Environment", default: true },
];

const KM_PER_DEG_LAT = 111;
const PX_PER_KM = 3.2;

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
    Object.fromEntries(
      LAYERS.map((layer) => [layer.id, layer.default])
    )
  );

  const [spill, setSpill] = useState(inv.spill);
  const [vessels, setVessels] = useState(inv.vessels || []);
  const [drift, setDrift] = useState(null);

  const [selectedVessel, setSelectedVessel] = useState(
    inv.vessels?.[0]?.mmsi ?? null
  );

  const [driftError, setDriftError] = useState(null);

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
      .catch((error) => {
        console.warn(
          "Spill detail unavailable:",
          error.message
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
      .catch((error) => {
        console.warn(
          "Attribution unavailable:",
          error.message
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

function InvestigationHeader({
  inv,
  onClose,
  session,
  onSignOut,
}) {
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

      // Future backend PDF integration:
      // if response.pdf_url exists, open it directly.
      if (response?.pdf_url) {
        window.open(
          response.pdf_url,
          "_blank",
          "noopener,noreferrer"
        );
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
        <button
          type="button"
          className="btn-back"
          onClick={onClose}
          aria-label="Back to reports"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <path
              d="M15 5 8 12l7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <span>Reports</span>
        </button>

        <div className="brand">
          <span
            className="brand-mark"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M2 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle
                cx="12"
                cy="8"
                r="4.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M12 3.8v8.4"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </span>

          <div>
            <div className="brand-title">
              KYMA
            </div>
          </div>
        </div>

        <div className="investigation-header-meta">
          <div className="investigation-id">
            {inv.id}
          </div>

          <span className="investigation-status">
            {inv.status || "ACTIVE"}
          </span>

          <button
            type="button"
            className="btn-report"
            onClick={handleViewReport}
            disabled={reportLoading}
          >
            {reportLoading ? "Preparing…" : "View report"}
          </button>

          {session && (
            <ProfileMenu
              session={session}
              onSignOut={onSignOut}
            />
          )}
        </div>
      </header>

      {reportOpen && (
        <ReportDialog
          report={report}
          loading={reportLoading}
          error={reportError}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Report dialog
// ---------------------------------------------------------------------------

function ReportDialog({
  report,
  loading,
  error,
  onClose,
}) {
  return (
    <div
      className="report-dialog-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="report-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Investigation report"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="report-dialog-header">
          <div>
            <div className="report-dialog-title">
              Investigation report
            </div>

            <div className="report-dialog-subtitle">
              PDF generation will be provided by the backend.
            </div>
          </div>

          <button
            type="button"
            className="report-dialog-close"
            onClick={onClose}
            aria-label="Close report"
          >
            ×
          </button>
        </div>

        <div className="report-dialog-body">
          {loading && (
            <div className="report-loading">
              Loading report…
            </div>
          )}

          {error && (
            <div className="report-error">
              Report unavailable: {error}
            </div>
          )}

          {!loading && !error && !report && (
            <div className="report-loading">
              No report data available.
            </div>
          )}

          {report && (
            <div className="report-summary">
              <div className="report-summary-row">
                <span>Status</span>
                <strong>{report.status || "—"}</strong>
              </div>

              <div className="report-summary-row">
                <span>Lodged</span>
                <strong>
                  {fmtDateTime(report.lodged_at)}
                </strong>
              </div>

              <div className="report-summary-row">
                <span>Spill centroid</span>
                <strong>
                  {report.spill?.centroid
                    ? `${report.spill.centroid.lat.toFixed(
                        3
                      )}°N, ${report.spill.centroid.lon.toFixed(
                        3
                      )}°E`
                    : "—"}
                </strong>
              </div>

              <div className="report-summary-row">
                <span>Area</span>
                <strong>
                  {report.spill?.area_km2 != null
                    ? `${report.spill.area_km2.toFixed(
                        1
                      )} km²`
                    : "—"}
                </strong>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

function InvestigationMap({
  inv,
  layers,
  toggleLayer,
  selectedVessel,
  setSelectedVessel,
  drift,
}) {
  const toMapXY = makeMapProjection(inv);

  const driftPath =
    layers.drift &&
    drift?.track?.length > 1
      ? `M ${drift.track
          .map((point) => {
            const { x, y } = toMapXY(
              point.centroid.lat,
              point.centroid.lon
            );

            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" L ")}`
      : null;

  return (
    <section className="investigation-map">
      <div className="map-toolbar">
        <div>
          <span className="map-toolbar-label">
            Investigation area
          </span>

          <span className="map-toolbar-value">
            {fmtDate(inv.satellite?.timestamp)}
          </span>
        </div>

        <div className="map-toolbar-source">
          {inv.satellite?.platform || "Satellite"}
        </div>
      </div>

      <div className="map-frame investigation-map-frame">
        <svg
          viewBox="0 0 400 300"
          className="map-svg"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label="Investigation map"
        >
          <defs>
            <radialGradient
              id="srcGlow"
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop
                offset="0%"
                stopColor="var(--amber)"
                stopOpacity="0.55"
              />
              <stop
                offset="100%"
                stopColor="var(--amber)"
                stopOpacity="0"
              />
            </radialGradient>

            <linearGradient
              id="oceanGrad"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="#0d1620"
              />
              <stop
                offset="100%"
                stopColor="#0a121b"
              />
            </linearGradient>

            <pattern
              id="mapGrid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="#16222f"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>

          <rect
            x="0"
            y="0"
            width="400"
            height="300"
            fill="url(#oceanGrad)"
          />

          {layers.satellite && (
            <rect
              x="0"
              y="0"
              width="400"
              height="300"
              fill="url(#mapGrid)"
            />
          )}

          <path
            d="M 0,40 Q 40,55 55,90 Q 65,120 40,160 Q 20,190 40,230 Q 55,260 30,300 L 0,300 Z"
            fill="#0f1b26"
            stroke="#1c2b3a"
            strokeWidth="1"
          />

          {layers.wind &&
            Array.from({ length: 24 }).map((_, index) => {
              const x =
                60 + (index % 6) * 55;
              const y =
                30 +
                Math.floor(index / 6) * 60;

              return (
                <g
                  key={`wind-${index}`}
                  opacity="0.35"
                  transform={`translate(${x},${y}) rotate(35)`}
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="14"
                    y2="0"
                    stroke="#7dd3fc"
                    strokeWidth="1"
                  />

                  <path
                    d="M 14,0 L 10,-2.5 M 14,0 L 10,2.5"
                    stroke="#7dd3fc"
                    strokeWidth="1"
                  />
                </g>
              );
            })}

          {layers.current && (
            <g
              opacity="0.3"
              stroke="#38bdf8"
              fill="none"
              strokeWidth="1"
            >
              <path d="M 20,250 Q 100,230 180,250 T 380,240" />
              <path d="M 20,270 Q 100,255 180,270 T 380,260" />
            </g>
          )}

          {layers.source &&
            (() => {
              const { x, y } = toMapXY(
                inv.source.lat,
                inv.source.lon
              );

              return (
                <>
                  <ellipse
                    cx={x}
                    cy={y}
                    rx="46"
                    ry="34"
                    fill="url(#srcGlow)"
                    className="source-pulse"
                  />

                  <circle
                    cx={x}
                    cy={y}
                    r="3"
                    fill="var(--amber)"
                    stroke="#0a0e14"
                    strokeWidth="1"
                  />
                </>
              );
            })()}

          {driftPath && (
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
            drift?.track?.length > 1 &&
            (() => {
              const { x, y } = toMapXY(
                drift.track[0].centroid.lat,
                drift.track[0].centroid.lon
              );

              return (
                <circle
                  cx={x}
                  cy={y}
                  r="2.5"
                  fill="var(--amber)"
                  stroke="#0a0e14"
                  strokeWidth="0.75"
                />
              );
            })()}

          {layers.tracks &&
            inv.vessels.map((vessel) => (
              <path
                key={vessel.mmsi}
                d={vessel.track}
                fill="none"
                stroke={
                  vessel.mmsi === selectedVessel
                    ? "var(--accent)"
                    : "#3a4a5c"
                }
                strokeWidth={
                  vessel.mmsi === selectedVessel
                    ? 2
                    : 1.2
                }
                strokeDasharray={
                  vessel.mmsi === selectedVessel
                    ? "none"
                    : "3 3"
                }
                opacity={
                  vessel.mmsi === selectedVessel
                    ? 1
                    : 0.6
                }
                className={
                  vessel.mmsi === selectedVessel
                    ? "vessel-track-selected"
                    : ""
                }
              />
            ))}

          {layers.ais &&
            inv.vessels.map((vessel) => {
              const lastPoint = vessel.track
                .trim()
                .split(" ")
                .pop();

              const [x, y] = lastPoint
                .split(",")
                .map(Number);

              const selected =
                vessel.mmsi === selectedVessel;

              return (
                <g
                  key={vessel.mmsi}
                  transform={`translate(${x},${y})`}
                  className={`vessel-marker ${
                    selected
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedVessel(
                      vessel.mmsi
                    )
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" ||
                      event.key === " "
                    ) {
                      setSelectedVessel(
                        vessel.mmsi
                      );
                    }
                  }}
                >
                  <circle
                    r={selected ? 11 : 9}
                    fill="transparent"
                  />

                  {selected && (
                    <circle
                      r="8"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="0.7"
                      opacity="0.4"
                      className="vessel-selection-ring"
                    />
                  )}

                  <path
                    d="M 0,-7 L 3.2,4 L 0,2.2 L -3.2,4 Z"
                    fill={selected ? "var(--accent)" : "#8b96a5"}
                    stroke="#0a0e14"
                    strokeWidth="0.7"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

          {layers.oil && (
            <path
              d={inv.spill.polygon}
              fill="var(--danger)"
              opacity="0.25"
            />
          )}

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

          <span>
            {inv.spill.centroid.lon.toFixed(3)}°E
          </span>
        </div>

        <div className="map-overlay map-overlay-bottom-right">
          <span>
            {(
              inv.spill.confidence * 100
            ).toFixed(0)}
            % detection confidence
          </span>
        </div>
      </div>

      <MapLayers
        layers={layers}
        toggleLayer={toggleLayer}
      />
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
    <div className="map-layers">
      <div className="map-layers-header">
        <span>Layers</span>
      </div>

      <div className="map-layers-groups">
        {groups.map((group) => {
          const groupLayers = LAYERS.filter(
            (layer) => layer.group === group
          );

          return (
            <div
              key={group}
              className="map-layer-group"
            >
              <span className="map-layer-group-title">
                {group}
              </span>

              <div className="map-layer-items">
                {groupLayers.map((layer) => (
                  <label
                    key={layer.id}
                    className="map-layer-item"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(
                        layers[layer.id]
                      )}
                      onChange={() =>
                        toggleLayer(layer.id)
                      }
                    />

                    <span>{layer.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
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