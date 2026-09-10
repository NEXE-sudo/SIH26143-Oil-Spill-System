import csv
import json
from datetime import datetime
from pathlib import Path

from app.config import engine, SessionLocal
from app.models import Base, AISRecord, SpillDetection

# Create tables in Supabase if they don't exist
Base.metadata.create_all(bind=engine)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

def ingest_ais():
    db = SessionLocal()
    csv_file = DATA_DIR / "ais_sample.csv"
    
    if not csv_file.exists():
        print(f"Skipping AIS: {csv_file} not found.")
        return

    print("Ingesting AIS data...")
    records = []
    with open(csv_file, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(
                AISRecord(
                    mmsi=row["MMSI"],
                    lat=float(row["LAT"]),
                    lon=float(row["LON"]),
                    timestamp=datetime.fromisoformat(row["BaseDateTime"]),
                    speed=float(row.get("SOG", 0.0)),
                    heading=float(row.get("Heading", 0.0))
                )
            )
            
    db.bulk_save_objects(records)
    db.commit()
    db.close()
    print(f"Successfully loaded {len(records)} AIS records.")

def ingest_spills():
    db = SessionLocal()
    geojson_file = DATA_DIR / "sentinel1_scene.geojson"
    
    if not geojson_file.exists():
        print(f"Skipping Spills: {geojson_file} not found.")
        return

    print("Ingesting Spill Detection data...")
    with open(geojson_file, mode="r", encoding="utf-8") as f:
        data = json.load(f)

    records = []
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [0, 0])
        
        records.append(
            SpillDetection(
                scene_id=props.get("scene_id", "SENTINEL1_DEMO_001"),
                longitude=coords[0],
                latitude=coords[1],
                area_km2=props.get("area_km2", 1.25),
                confidence=props.get("confidence", 0.88)
            )
        )

    db.bulk_save_objects(records)
    db.commit()
    db.close()
    print(f"Successfully loaded {len(records)} Spill detections.")

if __name__ == "__main__":
    ingest_ais()
    ingest_spills()