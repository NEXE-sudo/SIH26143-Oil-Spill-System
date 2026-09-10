import React, { useEffect, useState } from "react";
import AuthPage from "./AuthPage.jsx";
import LandingPage from "./LandingPage.jsx";
import InvestigationDetail from "./InvestigationDetail.jsx";
import { REPORTS } from "./data/reports.js";
import { listInvestigations } from "./lib/api.js";
import { useAuth } from "./context/AuthContext.jsx";

// ---------------------------------------------------------------------------
// Top-level app: gates everything behind Supabase auth. Once the session is
// active, the app loads the investigations list and opens the detail view.
// ---------------------------------------------------------------------------

export default function App() {
  const { session, loading, logout } = useAuth();
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
          console.warn("Falling back to mock investigations:", err.message);
          setLoadError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-title">Loading session…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  const openReport = reports.find((r) => r.id === openReportId) || null;

  return (
    <>
      <LandingPage
        reports={reports}
        loadError={loadError}
        onOpenReport={(r) => setOpenReportId(r.id)}
        session={session}
        onSignOut={logout}
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
