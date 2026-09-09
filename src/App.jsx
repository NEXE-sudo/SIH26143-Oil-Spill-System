import React, { useState } from "react";
import LandingPage from "./LandingPage.jsx";
import InvestigationDetail from "./InvestigationDetail.jsx";
import { REPORTS } from "./data/reports.js";

// ---------------------------------------------------------------------------
// Top-level app: shows the reports landing page, and opens the full
// investigation detail view (map + evidence dashboard) as a full-screen
// overlay when a report card is clicked.
// ---------------------------------------------------------------------------

export default function App() {
  const [openReportId, setOpenReportId] = useState(null);

  const openReport = REPORTS.find((r) => r.id === openReportId) || null;

  return (
    <>
      <LandingPage reports={REPORTS} onOpenReport={(r) => setOpenReportId(r.id)} />

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
