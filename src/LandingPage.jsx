import React, { useMemo, useState } from "react";
import { STATUS_LABELS } from "./data/reports.js";

function fmtShortDateTime(iso) {
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function withinDays(iso, days) {
  const then = new Date(iso).getTime();
  const now = Date.now();

  return now - then <= days * 24 * 60 * 60 * 1000;
}

function scoreColor(value) {
  if (value == null) return "var(--muted-2)";
  if (value >= 0.75) return "var(--good)";
  if (value >= 0.5) return "var(--warn)";
  return "var(--muted-2)";
}

export default function LandingPage({
  reports,
  loadError,
  onOpenReport,
  session,
  onSignOut,
}) {
  const [filter, setFilter] = useState("all");

  const recent = useMemo(
    () =>
      reports.filter((report) =>
        withinDays(report.lodged_at, 31)
      ),
    [reports]
  );

  const counts = useMemo(() => {
    const result = {
      lodged: 0,
      pending: 0,
      completed: 0,
    };

    for (const report of recent) {
      result[report.status] =
        (result[report.status] || 0) + 1;
    }

    return result;
  }, [recent]);

  const visible = useMemo(() => {
    const list =
      filter === "all"
        ? recent
        : recent.filter(
            (report) => report.status === filter
          );

    return [...list].sort(
      (a, b) =>
        new Date(b.lodged_at).getTime() -
        new Date(a.lodged_at).getTime()
    );
  }, [recent, filter]);

  return (
    <div className="landing">
      {/* =====================================================
          LANDING PAGE TOPBAR
      ====================================================== */}
      <header className="landing-topbar">
        <div className="brand">
          <span
            className="brand-mark"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
            >
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

        <div className="landing-topbar-actions">
          <span className="landing-page-title">
            
          </span>

          {session && (
            <ProfileMenu
              session={session}
              onSignOut={onSignOut}
            />
          )}
        </div>
      </header>

      {/* =====================================================
          BACKEND STATUS
      ====================================================== */}
      {loadError && (
        <div className="landing-banner" role="status">
          Backend unreachable — showing sample data. (
          {loadError})
        </div>
      )}

      {/* =====================================================
          MAIN CONTENT
      ====================================================== */}
      <main className="landing-main">
        <div className="landing-heading">
          <h1>Reports</h1>

          <p>
            Detections and investigations lodged in the last
            31 days.
          </p>
        </div>

        {/* ===================================================
            STAT CARDS
        ==================================================== */}
        <div className="stat-cards">
          <StatCard
            label="Lodged"
            value={counts.lodged || 0}
            tone="accent"
          />

          <StatCard
            label="Pending"
            value={counts.pending || 0}
            tone="warn"
          />

          <StatCard
            label="Completed"
            value={counts.completed || 0}
            tone="good"
          />

          <StatCard
            label="Total (31 days)"
            value={recent.length}
            tone="neutral"
          />
        </div>

        {/* ===================================================
            FILTERS
        ==================================================== */}
        <div className="report-filters">
          {[
            "all",
            "lodged",
            "pending",
            "completed",
          ].map((status) => (
            <button
              key={status}
              type="button"
              className={`filter-chip${
                filter === status ? " active" : ""
              }`}
              onClick={() => setFilter(status)}
            >
              {status === "all"
                ? "All"
                : STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        {/* ===================================================
            REPORT LIST
        ==================================================== */}
        <div className="report-list">
          {visible.length === 0 && (
            <div className="report-empty">
              No reports match this filter.
            </div>
          )}

          {visible.map((report) => {
            const topVessel = report.vessels?.[0];

            return (
              <button
                key={report.id}
                type="button"
                className="report-card"
                onClick={() => onOpenReport(report)}
                aria-label={`Open investigation ${report.id}`}
              >
                <div className="report-card-top">
                  <span className="report-id">
                    {report.id}
                  </span>

                  <StatusPill
                    status={report.status}
                  />
                </div>

                <div className="report-card-body">
                  <div className="report-field">
                    <span className="report-field-label">
                      Spill coordinates
                    </span>

                    <span className="report-field-value">
                      {report.spill.centroid.lat.toFixed(3)}
                      °N,{" "}
                      {report.spill.centroid.lon.toFixed(3)}
                      °E
                    </span>
                  </div>

                  <div className="report-field">
                    <span className="report-field-label">
                      Origin window
                    </span>

                    <span className="report-field-value">
                      {fmtShortDateTime(
                        report.source.window_start
                      )}
                    </span>
                  </div>

                  <div className="report-field">
                    <span className="report-field-label">
                      Top suspect vessel
                    </span>

                    <span className="report-field-value">
                      {topVessel
                        ? `${topVessel.name} · MMSI ${topVessel.mmsi}`
                        : "Not yet identified"}
                    </span>
                  </div>
                </div>

                <div className="report-card-footer">
                  <span className="report-lodged">
                    Lodged{" "}
                    {fmtShortDateTime(
                      report.lodged_at
                    )}
                  </span>

                  {topVessel && (
                    <span
                      className="report-score"
                      style={{
                        color: scoreColor(
                          topVessel.final_score
                        ),
                      }}
                    >
                      {(
                        topVessel.final_score * 100
                      ).toFixed(0)}
                      % attribution confidence
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

/* =========================================================
   STAT CARD
   ========================================================= */

function StatCard({ label, value, tone }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-card-value">
        {value}
      </div>

      <div className="stat-card-label">
        {label}
      </div>
    </div>
  );
}

/* =========================================================
   STATUS PILL
   ========================================================= */

function StatusPill({ status }) {
  return (
    <span
      className={`status-pill status-${status}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/* =========================================================
   PROFILE MENU
   ========================================================= */

function ProfileMenu({ session, onSignOut }) {
  const [open, setOpen] = useState(false);

  const username =
    session?.username || "Investigator";

  const initials = username
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function closeMenu() {
    setOpen(false);
  }

  function handleSignOut() {
    closeMenu();
    onSignOut?.();
  }

  return (
    <div className="profile-menu">
      <button
        type="button"
        className={`profile-trigger${
          open ? " active" : ""
        }`}
        onClick={() =>
          setOpen((value) => !value)
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span
          className="profile-avatar"
          aria-hidden="true"
        >
          {initials}
        </span>

        <span className="profile-identity">
          <span className="profile-name">
            {username}
          </span>

          <span className="profile-role">
            Investigator
          </span>
        </span>

        <span
          className="profile-chevron"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
          >
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div
          className="profile-dropdown"
          role="menu"
        >
          <div className="profile-dropdown-header">
            <span className="profile-avatar profile-avatar-large">
              {initials}
            </span>

            <div className="profile-dropdown-identity">
              <span className="profile-dropdown-name">
                {username}
              </span>

              <span className="profile-dropdown-role">
                Field Investigator
              </span>
            </div>
          </div>

          <div className="profile-divider" />

          <button
            type="button"
            className="profile-menu-item"
            role="menuitem"
            onClick={closeMenu}
          >
            Account
          </button>

          <button
            type="button"
            className="profile-menu-item"
            role="menuitem"
            onClick={closeMenu}
          >
            Session details
          </button>

          <div className="profile-divider" />

          <button
            type="button"
            className="profile-menu-item profile-menu-signout"
            role="menuitem"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}