import React, { useEffect, useState } from "react";
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Polyline,
  TileLayer,
  ZoomControl,
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

function svgPathToLatLngs(pathD, inv) {
  const nums = (pathD.match(/-?\d*\.?\d+/g) || []).map(Number);
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

function fmtCoordinate(value, axis, digits = 3) {
  const hemisphere =
    axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(digits)}°${hemisphere}`;
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
    Object.fromEntries(LAYERS.map((l) => [l.id, l.default])),
  );
  const [drift, setDrift] = useState(null); // DriftHindcastResponse | null
  const [driftError, setDriftError] = useState(null);
  const [spill, setSpill] = useState(inv.spill); // SpillGeometry, replaced once /api/spills/{id} resolves
  const [vessels, setVessels] = useState(inv.vessels); // VesselCandidate[], replaced once attribution resolves
  const [selectedVessel, setSelectedVessel] = useState(
    inv.vessels[0]?.mmsi ?? null,
  );

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
        console.warn(
          "Spill detail unavailable, using embedded record:",
          err.message,
        );
      });

    getAttribution(inv.id)
      .then((res) => {
        if (!cancelled) setVessels(res.ranked_vessels);
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
      <button
        className="btn-back"
        onClick={onClose}
        aria-label="Back to reports"
      >
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
            <circle
              cx="12"
              cy="8"
              r="4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
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
        <div
          className="report-popover"
          role="dialog"
          aria-label="Investigation report"
        >
          <div className="report-popover-head">
            <span>Report — {inv.id}</span>
            <button onClick={() => setReportOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          {reportError && (
            <p className="hint-text">Report unavailable: {reportError}</p>
          )}
          {!reportError && !report && (
            <p className="hint-text">Loading report…</p>
          )}
          {report && (
            <div className="report-popover-body">
              <p>
                Status <strong>{report.status}</strong> · lodged{" "}
                {fmtDateTime(report.lodged_at)}
              </p>
              <p>
                Spill centroid {fmtCoordinate(report.spill.centroid.lat, "lat")}
                , {fmtCoordinate(report.spill.centroid.lon, "lon")} ·{" "}
                {report.spill.area_km2.toFixed(1)} km²
              </p>
              <p>
                Top suspect {report.vessels[0]?.name ?? "—"} (
                {((report.vessels[0]?.final_score ?? 0) * 100).toFixed(0)}%
                confidence)
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
          {fmtCoordinate(inv.spill.centroid.lat, "lat")},{" "}
          {fmtCoordinate(inv.spill.centroid.lon, "lon")}
        </div>
      </div>
      <div className="kf-sep" />
      <div className="kf-item">
        <div className="kf-label">Estimated origin window</div>
        <div className="kf-value">
          {fmtDateTime(inv.source.window_start)} —{" "}
          {fmtUTC(inv.source.window_end)}
        </div>
        <div className="kf-sub">
          {fmtCoordinate(inv.source.lat, "lat")},{" "}
          {fmtCoordinate(inv.source.lon, "lon")}
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
        <div
          className="kf-value"
          style={{
            color: topVessel ? scoreColor(topVessel.final_score) : undefined,
          }}
        >
          {topVessel ? `${(topVessel.final_score * 100).toFixed(0)}%` : "—"}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MapCenterSync({ center }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true, duration: 0.8 });
  }, [center, map]);

  return null;
}

function MapPanel({
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

  const vesselPositions = vesselTracks.map((v) => {
    const progress = driftIndex / Math.max(1, (drift?.track?.length || 2) - 1);
    const scaled = progress * (v.points.length - 1);
    const lower = Math.floor(scaled);
    const upper = Math.min(v.points.length - 1, lower + 1);
    const fraction = scaled - lower;
    return {
      ...v,
      position: [
        v.points[lower][0] +
          (v.points[upper][0] - v.points[lower][0]) * fraction,
        v.points[lower][1] +
          (v.points[upper][1] - v.points[lower][1]) * fraction,
      ],
      trail: v.points.slice(0, upper + 1),
    };
  });

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
          <ZoomControl position="bottomright" />
          <MapCenterSync center={activeCenter} />
          <TileLayer
            attribution="Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />

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

          {layers.oil && currentDriftStep?.polygon?.startsWith("{") && (
            <GeoJSON
              key={`${currentDriftStep.timestamp}-${currentDriftStep.polygon}`}
              data={JSON.parse(currentDriftStep.polygon)}
              style={{
                color: "#fb7185",
                fillColor: "#fb7185",
                fillOpacity: focusMode ? 0.54 : 0.34,
                weight: 1.4,
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
            vesselPositions.map((v) => {
              return (
                <CircleMarker
                  key={v.mmsi}
                  center={v.position}
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

          {layers.tracks &&
            vesselPositions.map((v) => (
              <Polyline
                key={`moving-${v.mmsi}`}
                positions={v.trail}
                pathOptions={{ color: "#f8fafc", weight: 2, opacity: 0.75 }}
              />
            ))}
        </MapContainer>

        <div className="map-readout">
          <span>Area {inv.spill.area_km2.toFixed(1)} km²</span>
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
              <span>{fmtDateTime(drift.track[0].timestamp)}</span>
              <span>
                {fmtDateTime(drift.track[drift.track.length - 1].timestamp)}
              </span>
            </div>
          </div>
        )}
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

function EvidenceRail({
  inv,
  activeVessel,
  selectedVessel,
  setSelectedVessel,
  drift,
  driftError,
}) {
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
          <Stat
            label="Perimeter"
            value={`${inv.spill.perimeter_km.toFixed(1)} km`}
          />
          <Stat
            label="Confidence"
            value={`${(inv.spill.confidence * 100).toFixed(0)}%`}
            accent="good"
          />
          <Stat label="Orientation" value={`${inv.spill.orientation_deg}°`} />
          <Stat label="Major axis" value={`${inv.spill.major_axis_km} km`} />
          <Stat label="Minor axis" value={`${inv.spill.minor_axis_km} km`} />
        </div>
        <div className="coord-line">
          Centroid {fmtCoordinate(inv.spill.centroid.lat, "lat")},{" "}
          {fmtCoordinate(inv.spill.centroid.lon, "lon")}
        </div>
      </RailSection>

      <RailSection title="Source estimation">
        <div className="coord-line coord-line-lg">
          {fmtCoordinate(source.lat, "lat", 2)},{" "}
          {fmtCoordinate(source.lon, "lon", 2)}
        </div>
        <div className="source-window">
          <span>{fmtDateTime(source.window_start)}</span>
          <span className="window-bar" />
          <span>{fmtDateTime(source.window_end)}</span>
        </div>
        <p className="hint-text">
          Estimated from a backward drift hindcast using wind and current
          forcing. Treated as a probability region, not a single point.
          {driftError &&
            " (live hindcast unavailable — showing last known estimate.)"}
        </p>
      </RailSection>

      <RailSection title={`Suspect vessels (${inv.vessels.length})`}>
        <div className="vessel-list">
          {inv.vessels.map((v, i) => (
            <button
              key={v.mmsi}
              className={
                "vessel-row" + (v.mmsi === selectedVessel ? " selected" : "")
              }
              onClick={() => setSelectedVessel(v.mmsi)}
            >
              <span className="vessel-rank">{i + 1}</span>
              <span className="vessel-name-block">
                <span className="vessel-name">{v.name}</span>
                <span className="vessel-mmsi">MMSI {v.mmsi}</span>
              </span>
              <span className="vessel-score-block">
                <span
                  className="vessel-score"
                  style={{ color: scoreColor(v.final_score) }}
                >
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
              <span className="id-value id-mono">
                {activeVessel.imo || "Unknown"}
              </span>
            </div>
            <div className="id-row">
              <span className="id-label">Flag state</span>
              <span className="id-value">{activeVessel.flag || "Unknown"}</span>
            </div>
            <div className="id-row">
              <span className="id-label">Vessel type</span>
              <span className="id-value">
                {activeVessel.vessel_type || "Unknown"}
              </span>
            </div>
            {vesselHistory && vesselHistory.involved_in.length > 1 && (
              <div className="id-row">
                <span className="id-label">Also flagged in</span>
                <span className="id-value">
                  {vesselHistory.involved_in
                    .filter((id) => id !== inv.id)
                    .join(", ")}
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
            <div
              className="evidence-score"
              style={{ color: scoreColor(activeVessel.final_score) }}
            >
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
            <Stat
              label="Distance"
              value={`${activeVessel.distance_km} km`}
              small
            />
            <Stat
              label="Time Δ"
              value={`${activeVessel.time_diff_h} h`}
              small
            />
            <Stat label="Dwell" value={`${activeVessel.dwell_min} min`} small />
          </div>

          <ul className="evidence-list">
            {activeVessel.evidence.map((e, i) => (
              <li
                key={i}
                className={
                  e.ok === true ? "ok" : e.ok === false ? "no" : "warn"
                }
              >
                <span className="evidence-icon">
                  {e.ok === true ? "✓" : e.ok === false ? "–" : "!"}
                </span>
                {e.text}
              </li>
            ))}
          </ul>

          <p className="disclaimer">
            Investigative ranking, not proof of responsibility. Final
            determination belongs to authorised investigators.
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
      <div
        className="stat-value"
        style={accent === "good" ? { color: "var(--good)" } : undefined}
      >
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

function StatusBar({ inv }) {
  const m = inv.metrics;
  return (
    <footer className="statusbar">
      <span>Oil IoU {m.oil_iou != null ? m.oil_iou.toFixed(2) : "—"}</span>
      <span className="dot" />
      <span>Oil F1 {m.oil_f1 != null ? m.oil_f1.toFixed(2) : "—"}</span>
      <span className="dot" />
      <span>
        Source error{" "}
        {m.source_error_km != null ? `${m.source_error_km} km` : "—"}
      </span>
      <span className="dot" />
      <span>
        Candidate recall{" "}
        {m.candidate_recall != null
          ? `${(m.candidate_recall * 100).toFixed(0)}%`
          : "—"}
      </span>
      <span className="dot" />
      <span>
        Processing{" "}
        {m.processing_time_s != null ? `${m.processing_time_s}s` : "—"}
      </span>
      <span className="statusbar-fill" />
      <span className="build-tag">{inv.id}</span>
    </footer>
  );
}
