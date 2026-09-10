from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.data import mock_investigations as store
from app.schemas.report import InvestigationReportPayload
from app.services.report import generate_investigation_report

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.post("/generate-pdf", response_class=Response, summary="Generate Investigation Report PDF")
async def create_investigation_report(payload: InvestigationReportPayload):
    """
    Synthesizes multi-source intelligence (Observation: Sentinel-1 SAR; 
    Reconstruction: ERA5/Copernicus drift hindcasting; Attribution: Historical AIS) 
    into a standardised multi-page PDF briefing document suitable for presentation to NTRO.
    """
    try:
        pdf_bytes = generate_investigation_report(payload)
        
        headers = {
            "Content-Disposition": f'attachment; filename="report_{payload.investigation_id}.pdf"'
        }
        return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@router.get("/{investigation_id}", summary="Get Investigation Report")
async def get_investigation_report(investigation_id: str):
    """
    Return the investigation record used by the demo UI.
    This keeps the report endpoint aligned with the frontend contract while
    the real persistence layer is still being added.
    """
    record = store.get_by_id(investigation_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Report {investigation_id} not found")
    return record
