from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from backend.app.schemas.report import InvestigationReportPayload
from backend.app.services.report import generate_investigation_report

router = APIRouter(prefix="/reports", tags=["Reports"])

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
    Retrieve a previously generated investigation report by ID.
    Currently returns 501 Not Implemented until database session is configured.
    """
    # TODO: Fetch from SQLite DB using ReportModel
    raise HTTPException(status_code=501, detail="Database persistence not yet configured")
