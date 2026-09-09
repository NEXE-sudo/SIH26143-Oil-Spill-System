import React, { useState } from "react";
import AuthPage from "./AuthPage.jsx";
import LandingPage from "./LandingPage.jsx";
import InvestigationDetail from "./InvestigationDetail.jsx";
import { REPORTS } from "./data/reports.js";

// ---------------------------------------------------------------------------
// Top-level app: gates everything behind AuthPage (username + password
// only). Once signed in, shows the reports landing page, and opens the
// full investigation detail view (map + evidence dashboard) as a
// full-screen overlay when a report card is clicked.
// ---------------------------------------------------------------------------

export default function App() {
  const [session, setSession] = useState(null); // { username } | null
  const [openReportId, setOpenReportId] = useState(null);

  if (!session) {
    return <AuthPage onAuthenticated={(user) => setSession(user)} />;
  }

  const openReport = REPORTS.find((r) => r.id === openReportId) || null;

  return (
    <>
      <LandingPage
        reports={REPORTS}
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
