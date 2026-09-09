import React, { useEffect, useState } from "react";
import AuthPage from "./AuthPage.jsx";
import LandingPage from "./LandingPage.jsx";
import InvestigationDetail from "./InvestigationDetail.jsx";
import { REPORTS } from "./data/reports.js";
import { listInvestigations } from "./lib/api.js";

// ---------------------------------------------------------------------------
// Top-level app: gates everything behind AuthPage (username + password
// only). Once signed in, shows the reports landing page, and opens the
// full investigation detail view (map + evidence dashboard) as a
// full-screen overlay when a report card is clicked.
//
// Data comes from the FastAPI backend (backend/app/, see src/lib/api.js).
// If the backend isn't running (e.g. local frontend-only work), this falls
// back to the bundled mock dataset in src/data/reports.js so the UI still
// renders.
// ---------------------------------------------------------------------------

export default function App() {
  const [session, setSession] = useState(null); // { username } | null
  const [openReportId, setOpenReportId] = useState(null);

  const [reports, setReports] = useState(REPORTS);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    listInvestigations()
      .then(({ reports: fetched }) => {
        if (!cancelled) {
          setReports(fetched);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // Backend not reachable — keep showing the mock dataset so the
          // dashboard still works, but surface the failure.
          console.warn("Falling back to mock investigations:", err.message);
          setLoadError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) {
    return <AuthPage onAuthenticated={(user) => setSession(user)} />;
  }

  const openReport = reports.find((r) => r.id === openReportId) || null;

  return (
    <>
      <LandingPage
        reports={reports}
        loadError={loadError}
        onOpenReport={(r) => setOpenReportId(r.id)}
        session={session}
        onSignOut={() => setSession(null)}
      />

      {openReport && (
        <div className="detail-overlay">
          <InvestigationDetail
            investigation={openReport}
            onClose={() => setOpenReportId(null)}
          />
        </div>
      )}
    </>
  );
}
