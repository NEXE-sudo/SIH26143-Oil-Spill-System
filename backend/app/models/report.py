from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class ReportModel(Base):
    __tablename__ = "reports"
    
    investigation_id = Column(String, primary_key=True, index=True)
    generated_at = Column(DateTime)
    analyst_id = Column(String)
    payload_json = Column(Text, doc="JSON serialized InvestigationReportPayload")
