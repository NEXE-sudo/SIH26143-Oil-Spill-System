import io
import datetime
from pathlib import Path
from typing import Optional

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
from reportlab.pdfgen import canvas

from app.schemas.report import InvestigationReportPayload

class ReportGenerator:
    def __init__(self, payload: InvestigationReportPayload):
        self.payload = payload
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self):
        self.styles.add(ParagraphStyle(
            name='Disclaimer',
            parent=self.styles['Italic'],
            fontSize=8,
            textColor=colors.firebrick,
            alignment=1, # Center
            spaceAfter=10
        ))
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            textColor=colors.darkblue,
            spaceBefore=15,
            spaceAfter=10
        ))
        self.styles.add(ParagraphStyle(
            name='SubSectionHeader',
            parent=self.styles['Heading3'],
            fontSize=12,
            textColor=colors.black,
            spaceBefore=10,
            spaceAfter=5
        ))
        self.styles.add(ParagraphStyle(
            name='NormalText',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=5
        ))

    def _header_footer(self, canvas_obj: canvas.Canvas, doc: SimpleDocTemplate):
        canvas_obj.saveState()
        
        # Header
        canvas_obj.setFont("Helvetica-Bold", 10)
        canvas_obj.drawString(inch, A4[1] - 0.5 * inch, f"MARITIME OIL SPILL INVESTIGATION REPORT - ID: {self.payload.investigation_id}")
        
        # Footer
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.drawString(inch, 0.5 * inch, f"Generated at: {self.payload.generated_at.isoformat()} | Analyst: {self.payload.analyst_id}")
        canvas_obj.drawRightString(A4[0] - inch, 0.5 * inch, f"Page {doc.page}")
        
        canvas_obj.restoreState()

    def generate_pdf(self) -> bytes:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=inch,
            leftMargin=inch,
            topMargin=inch,
            bottomMargin=inch
        )
        
        elements = []
        
        # 1. Title and Disclaimer
        elements.extend(self._build_title_section())
        
        # 2. Transparency & Metadata
        elements.extend(self._build_transparency_section())
        
        # 3. Satellite & Spill Details
        elements.extend(self._build_spill_details())
        
        # 4. Drift Hindcast
        elements.extend(self._build_drift_details())
        
        # 5. Candidate Funnel
        elements.extend(self._build_candidate_funnel())
        
        # 6. Suspect Evidence
        elements.extend(self._build_suspects_section())
        
        # 7. Visualization
        vis_elements = self._build_visualizations()
        if vis_elements:
            elements.extend(vis_elements)
            
        doc.build(elements, onFirstPage=self._header_footer, onLaterPages=self._header_footer)
        buffer.seek(0)
        return buffer.read()

    def _build_title_section(self):
        title = Paragraph(f"Investigation Report: {self.payload.investigation_id}", self.styles['Title'])
        
        disclaimer_text = (
            "<b>MANDATORY DISCLAIMER:</b><br/>"
            "This document constitutes an investigative evidence briefing based on spatial-temporal correlation and physical simulation. "
            "It does not establish definitive legal culpability. The system produces an evidence-backed ranking of candidate vessels "
            "for authorized investigator review."
        )
        disclaimer = Paragraph(disclaimer_text, self.styles['Disclaimer'])
        return [title, Spacer(1, 15), disclaimer, Spacer(1, 15)]
        
    def _build_transparency_section(self):
        header = Paragraph("Deterministic Attribution Transparency", self.styles['SectionHeader'])
        
        data = [
            ["Model Version", self.payload.model_version],
            ["Rules Configuration", self.payload.rules_version],
            ["Attribution Scoring Weights", "Spatial: 30%, Temporal: 20%, Trajectory: 20%, Behaviour: 15%, Context: 15%"]
        ]
        
        t = Table(data, colWidths=[2*inch, 4*inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (0,-1), colors.lightgrey),
            ('TEXTCOLOR', (0,0), (-1,-1), colors.black),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ]))
        
        return [header, t, Spacer(1, 15)]
        
    def _build_spill_details(self):
        header = Paragraph("Observation Details", self.styles['SectionHeader'])
        
        sat = self.payload.satellite
        spill = self.payload.spill
        
        sat_para = Paragraph(
            f"<b>Satellite:</b> {sat.platform} {sat.product} {sat.polarisation}<br/>"
            f"<b>Acquired:</b> {sat.acquisition_timestamp.isoformat()}<br/>"
            f"<b>BBox:</b> {sat.footprint_bbox}", 
            self.styles['NormalText']
        )
        spill_para = Paragraph(
            f"<b>Spill ID:</b> {spill.spill_id} (Confidence: {spill.confidence:.2f})<br/>"
            f"<b>Area:</b> {spill.area_km2:.2f} km² | <b>Perimeter:</b> {spill.perimeter_km:.2f} km<br/>"
            f"<b>Centroid:</b> Lat {spill.centroid.get('lat', 0.0):.4f}, Lon {spill.centroid.get('lon', 0.0):.4f}<br/>"
            f"<b>Lookalike Probability:</b> {spill.lookalike_probability:.2f}", 
            self.styles['NormalText']
        )
        
        return [
            header, 
            Paragraph("Satellite Imagery", self.styles['SubSectionHeader']), sat_para, 
            Paragraph("Spill Geometry", self.styles['SubSectionHeader']), spill_para, 
            Spacer(1, 15)
        ]

    def _build_drift_details(self):
        header = Paragraph("Drift Hindcasting Details", self.styles['SectionHeader'])
        d = self.payload.drift_hindcast
        
        details = (f"<b>Model:</b> {d.model_type}<br/>"
                   f"<b>Wind Source:</b> {d.wind_source} | <b>Current Source:</b> {d.current_source}<br/>"
                   f"<b>Estimated Origin Centroid:</b> Lat {d.estimated_origin_centroid.get('lat', 0.0):.4f}, Lon {d.estimated_origin_centroid.get('lon', 0.0):.4f}<br/>"
                   f"<b>Source Window:</b> {d.source_window_start.isoformat()} to {d.source_window_end.isoformat()}<br/>"
                   f"<b>Timestep:</b> {d.simulation_timestep_mins} mins")
        
        return [header, Paragraph(details, self.styles['NormalText']), Spacer(1, 15)]

    def _build_candidate_funnel(self):
        header = Paragraph("Candidate Funnel", self.styles['SectionHeader'])
        c = self.payload.candidate_filtering
        
        details = (f"<b>Total Vessels Detected:</b> {c.total_vessels_detected}<br/>"
                   f"<b>Spatial Candidates:</b> {c.spatial_candidates}<br/>"
                   f"<b>Temporal Candidates:</b> {c.temporal_candidates}<br/>"
                   f"<b>High Priority Candidates:</b> {c.high_priority_candidates}")
                   
        return [header, Paragraph(details, self.styles['NormalText']), Spacer(1, 15)]

    def _build_suspects_section(self):
        elements = [Paragraph("Suspect Evidence Ranking", self.styles['SectionHeader'])]
        
        for suspect in self.payload.suspects:
            title = Paragraph(f"#{suspect.rank} - {suspect.vessel_name} (MMSI: {suspect.mmsi}) - {suspect.assessment}", self.styles['SubSectionHeader'])
            
            info = (f"<b>Type:</b> {suspect.vessel_type} | <b>Final Score:</b> {suspect.final_score:.2f}<br/>"
                    f"<b>Sub-scores:</b> Spatial={suspect.score_spatial:.2f}, Temporal={suspect.score_temporal:.2f}, Trajectory={suspect.score_trajectory:.2f}, Behaviour={suspect.score_behaviour:.2f}, Context={suspect.score_context:.2f}<br/>"
                    f"<b>Closest Approach:</b> {suspect.closest_approach_km:.2f} km | <b>Time Diff:</b> {suspect.time_difference_hours:.2f} hrs<br/>"
                    f"<b>Dwell Time:</b> {suspect.dwell_time_mins:.2f} mins | <b>Corridor Overlap:</b> {suspect.source_corridor_overlap_pct:.2f}%")
            
            info_para = Paragraph(info, self.styles['NormalText'])
            
            ev_list_data = [[Paragraph(f"• {ev}", self.styles['NormalText'])] for ev in suspect.evidence_statements]
            if ev_list_data:
                ev_table = Table(ev_list_data, colWidths=[6*inch])
                ev_table.setStyle(TableStyle([
                    ('TOPPADDING', (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                ]))
            else:
                ev_table = Paragraph("No specific evidence statements provided.", self.styles['NormalText'])
            
            elements.append(KeepTogether([title, info_para, Spacer(1, 5), Paragraph("<b>Key Evidence:</b>", self.styles['NormalText']), ev_table, Spacer(1, 10)]))
            
        return elements

    def _build_visualizations(self):
        elements = [PageBreak(), Paragraph("Geospatial Overview", self.styles['SectionHeader'])]
        
        try:
            import geopandas as gpd
            from shapely.geometry import Point, box
            from matplotlib.lines import Line2D
            
            # Generate plot in memory
            fig, ax = plt.subplots(figsize=(7, 5))
            
            # Create geometries
            spill_lon, spill_lat = self.payload.spill.centroid.get('lon', 0.0), self.payload.spill.centroid.get('lat', 0.0)
            origin_lon, origin_lat = self.payload.drift_hindcast.estimated_origin_centroid.get('lon', 0.0), self.payload.drift_hindcast.estimated_origin_centroid.get('lat', 0.0)
            
            spill_pt = Point(spill_lon, spill_lat)
            origin_pt = Point(origin_lon, origin_lat)
            
            bbox = self.payload.satellite.footprint_bbox
            sat_box = box(bbox[0], bbox[1], bbox[2], bbox[3]) if len(bbox) == 4 else None
            
            # Create GeoDataFrames
            gdf_points = gpd.GeoDataFrame(
                {'type': ['Spill Centroid', 'Estimated Origin']}, 
                geometry=[spill_pt, origin_pt],
                crs="EPSG:4326"
            )
            
            if sat_box:
                gdf_box = gpd.GeoDataFrame({'type': ['Sat Footprint']}, geometry=[sat_box], crs="EPSG:4326")
                gdf_box.plot(ax=ax, facecolor='none', edgecolor='gray', linestyle='--', linewidth=1.5, label='Sat Footprint')
            
            # Plot points
            gdf_points[gdf_points['type'] == 'Spill Centroid'].plot(ax=ax, color='red', marker='o', markersize=50, label='Spill Centroid')
            gdf_points[gdf_points['type'] == 'Estimated Origin'].plot(ax=ax, color='blue', marker='x', markersize=50, label='Estimated Origin')
            
            ax.set_xlabel('Longitude')
            ax.set_ylabel('Latitude')
            ax.set_title('Geospatial Overview: Spill & Origin')
            ax.grid(True, linestyle=':', alpha=0.6)
            
            # Add legend manually
            legend_elements = [
                Line2D([0], [0], marker='o', color='w', label='Spill Centroid', markerfacecolor='red', markersize=8),
                Line2D([0], [0], marker='x', color='blue', label='Estimated Origin', markersize=8, linestyle='None'),
            ]
            if sat_box:
                legend_elements.append(Line2D([0], [0], color='gray', linestyle='--', label='Sat Footprint'))
                
            ax.legend(handles=legend_elements, loc='best')
            
            img_buffer = io.BytesIO()
            plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight')
            plt.close(fig)
            img_buffer.seek(0)
            
            img = Image(img_buffer, width=6*inch, height=4*inch)
            elements.append(img)
            
        except Exception as e:
            elements.append(Paragraph(f"Error generating geospatial visualization: {str(e)}", self.styles['NormalText']))
            
        if self.payload.sar_image_path:
            elements.append(Spacer(1, 15))
            elements.append(Paragraph("SAR Imagery Overlays", self.styles['SubSectionHeader']))
            try:
                import base64
                img_source = self.payload.sar_image_path
                if not Path(img_source).exists():
                    if "," in img_source:
                        img_source = img_source.split(",")[1]
                    img_data = base64.b64decode(img_source)
                    img_source = io.BytesIO(img_data)
                sar_img = Image(img_source, width=5*inch, height=5*inch, kind='proportional')
                elements.append(sar_img)
            except Exception as e:
                elements.append(Paragraph(f"Could not load SAR imagery: {str(e)}", self.styles['NormalText']))
        
        return elements

def generate_investigation_report(payload: InvestigationReportPayload) -> bytes:
    """
    Generates a PDF report based on the provided investigation payload.
    Returns the PDF content as bytes.
    """
    generator = ReportGenerator(payload)
    return generator.generate_pdf()
