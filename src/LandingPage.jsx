import React, { useMemo, useState } from "react";
import { STATUS_LABELS } from "./data/reports.js";

// ---------------------------------------------------------------------------
// Landing dashboard: shows the four headline counters (lodged, pending,
// completed, total in the last 31 days) and a list of reports. Clicking a
// report calls onOpenReport(report) so the parent can show the detail view.
// ---------------------------------------------------------------------------

function fmtShortDateTime(iso) {
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function withinDays(iso, days) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return now - then <= days * 24 * 60 * 60 * 1000;
}

function scoreColor(v) {
  if (v == null) return "var(--muted-2)";
  if (v >= 0.75) return "var(--good)";
  if (v >= 0.5) return "var(--warn)";
  return "var(--muted-2)";
}

export default function LandingPage({ reports, onOpenReport, session, onSignOut }) {
  const [filter, setFilter] = useState("all");

  const recent = useMemo(() => reports.filter((r) => withinDays(r.lodged_at, 31)), [reports]);

  const counts = useMemo(() => {
    const c = { lodged: 0, pending: 0, completed: 0 };
    for (const r of recent) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [recent]);

  const visible = useMemo(() => {
    const list = filter === "all" ? recent : recent.filter((r) => r.status === filter);
    return [...list].sort((a, b) => new Date(b.lodged_at) - new Date(a.lodged_at));
  }, [recent, filter]);

  return (
    <div className="landing">
      <header className="landing-topbar">
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

        {session && (
          <div className="landing-session">
            <span className="session-user">{session.username}</span>
            <button className="btn-signout" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        )}
      </header>

      <main className="landing-main">
        <div className="landing-heading">
          <h1>Reports</h1>
          <p>Detections and investigations lodged in the last 31 days.</p>
        </div>

        <div className="stat-cards">
          <StatCard label="Lodged" value={counts.lodged || 0} tone="accent" />
          <StatCard label="Pending" value={counts.pending || 0} tone="warn" />
          <StatCard label="Completed" value={counts.completed || 0} tone="good" />
          <StatCard label="Total (31 days)" value={recent.length} tone="neutral" />
        </div>

        <div className="report-filters">
          {["all", "lodged", "pending", "completed"].map((f) => (
            <button
              key={f}
              className={"filter-chip" + (filter === f ? " active" : "")}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : STATUS_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="report-list">
          {visible.length === 0 && (
            <div className="report-empty">No reports match this filter.</div>
          )}
          {visible.map((r) => {
            const topVessel = r.vessels[0];
            return (
              <button key={r.id} className="report-card" onClick={() => onOpenReport(r)}>
                <div className="report-card-top">
                  <span className="report-id">{r.id}</span>
                  <StatusPill status={r.status} />
                </div>

                <div className="report-card-body">
                  <div className="report-field">
                    <span className="report-field-label">Spill coordinates</span>
                    <span className="report-field-value">
                      {r.spill.centroid.lat.toFixed(3)}°N, {r.spill.centroid.lon.toFixed(3)}°E
                    </span>
                  </div>
                  <div className="report-field">
                    <span className="report-field-label">Origin window</span>
                    <span className="report-field-value">
                      {fmtShortDateTime(r.source.window_start)}
                    </span>
                  </div>
                  <div className="report-field">
                    <span className="report-field-label">Top suspect vessel</span>
                    <span className="report-field-value">
                      {topVessel ? `${topVessel.name} · MMSI ${topVessel.mmsi}` : "Not yet identified"}
                    </span>
                  </div>
                </div>

                <div className="report-card-footer">
                  <span className="report-lodged">Lodged {fmtShortDateTime(r.lodged_at)}</span>
                  {topVessel && (
                    <span
                      className="report-score"
                      style={{ color: scoreColor(topVessel.final_score) }}
                    >
                      {(topVessel.final_score * 100).toFixed(0)}% attribution confidence
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <div className={"stat-card tone-" + tone}>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}

function StatusPill({ status }) {
  return <span className={"status-pill status-" + status}>{STATUS_LABELS[status]}</span>;
}
