import pandas as pd
from app.db import SessionLocal
from app.models.investigation import Vessel, AISPointRecord


def ingest_ais_csv(csv_path: str, limit: int | None = 5000):
    print("Reading CSV...", flush=True)
    df = pd.read_csv(csv_path)
    if limit:
        df = df.head(limit)
    print(f"Loaded {len(df)} rows.", flush=True)

    db = SessionLocal()
    try:
        print("Querying existing vessels...", flush=True)
        existing_mmsis = {v.mmsi for v in db.query(Vessel.mmsi).all()}
        print(f"Found {len(existing_mmsis)} existing vessels.", flush=True)

        new_vessels = {}
        for _, row in df.iterrows():
            mmsi = str(row["MMSI"])
            if mmsi not in existing_mmsis and mmsi not in new_vessels:
                new_vessels[mmsi] = Vessel(
                    mmsi=mmsi,
                    imo=str(row.get("IMO", "")) or None,
                    name=str(row.get("VesselName", "")) or "Unknown",
                    flag="Unknown",
                    vessel_type=str(row.get("VesselType", "")) or "Unknown",
                )

        print(f"Committing {len(new_vessels)} new vessels FIRST...", flush=True)
        db.add_all(new_vessels.values())
        db.commit()
        print("Vessels committed successfully.", flush=True)

        print("Building AIS point records...", flush=True)
        ais_points = [
            AISPointRecord(
                mmsi=str(row["MMSI"]),
                timestamp=pd.to_datetime(row["BaseDateTime"]),
                lat=float(row["LAT"]),
                lon=float(row["LON"]),
                sog_knots=float(row["SOG"]) if pd.notna(row.get("SOG")) else None,
                cog_deg=float(row["COG"]) if pd.notna(row.get("COG")) else None,
                heading_deg=float(row["Heading"]) if pd.notna(row.get("Heading")) else None,
                nav_status=str(row.get("Status", "")) or None,
            )
            for _, row in df.iterrows()
        ]
        print(f"Committing {len(ais_points)} AIS points...", flush=True)
        db.add_all(ais_points)
        db.commit()
        print(f"DONE. Ingested {len(ais_points)} AIS points, {len(new_vessels)} new vessels.", flush=True)

    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", flush=True)
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    ingest_ais_csv(r"C:\Users\gopal\OneDrive\Desktop\AIS_2023_06_15.csv")