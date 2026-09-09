"""GET /api/reports/{id} — roadmap §64.

Returns the same full Investigation shape as GET /api/investigations/{id}.
Kept as a distinct route because the roadmap treats "report" (the
investigator-facing writeup/export) as its own service (services table,
report_service in §56/§60) — for the internal-round PoC a report IS the
investigation record, but this indirection lets a real PDF/export
service (see the docx/pdf export path) replace the body later without
the frontend changing which URL it calls.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.data import mock_investigations as store
from app.schemas.investigation import Investigation

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/{report_id}", response_model=Investigation)
def get_report(report_id: str) -> Investigation:
    # TODO: once services/report.py exists, this should assemble a report
    # (narrative + evidence + citations) rather than return the raw record.
    inv = store.get_by_id(report_id)
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")
    return inv
