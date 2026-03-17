import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
import getpass


def load_csv_data(csv_path: Path, required_columns: list[str]) -> pd.DataFrame:
    """Load CSV data, normalize column names, and validate required columns."""
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    data_frame = pd.read_csv(csv_path)

    # Normalize column names to lowercase for consistent matching
    data_frame.columns = [col.strip().lower() for col in data_frame.columns]

    missing_columns = [col for col in required_columns if col not in data_frame.columns]
    if missing_columns:
        raise ValueError(
            f"Missing required columns in {csv_path.name}: {', '.join(missing_columns)}"
        )

    return data_frame


def main() -> int:
    """Read CSVs and persist data into PostgreSQL."""
    # Database connection settings (override via environment variables if needed)
    db_name = os.getenv("MEDIASSIST_DB_NAME", "mediassist")
    db_user = os.getenv("MEDIASSIST_DB_USER")
    db_password = os.getenv("MEDIASSIST_DB_PASSWORD")
    db_host = os.getenv("MEDIASSIST_DB_HOST", "localhost")
    db_port = int(os.getenv("MEDIASSIST_DB_PORT", "5432"))

    # Prompt for credentials if not set
    if not db_user:
        db_user = input("Enter PostgreSQL username: ").strip()
    if not db_password:
        db_password = getpass.getpass("Enter PostgreSQL password: ")

    # CSV file paths (relative to this script)
    base_dir = Path(__file__).resolve().parent
    tft_csv_path = base_dir / "dataset" / "tft_predictions.csv"
    alerts_csv_path = base_dir / "dataset" / "inventory_alerts.csv"

    # Required columns for validation
    tft_columns = [
        "series_id",
        "day_1",
        "day_2",
        "day_3",
        "day_4",
        "day_5",
        "day_6",
        "day_7",
    ]
    alerts_columns = [
        "medicine_category",
        "alert_type",
        "avg_7day_demand",
        "current_stock",
    ]

    try:
        connection_url = (
            f"postgresql+psycopg2://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        )
        engine = create_engine(connection_url)
    except SQLAlchemyError as exc:
        print(f"Database connection failed: {exc}")
        return 1

    try:
        # Load CSV data
        tft_data = load_csv_data(tft_csv_path, tft_columns)
        alerts_data = load_csv_data(alerts_csv_path, alerts_columns)

        # Write to PostgreSQL (creates tables if they don't exist)
        tft_data.to_sql("tft_predictions", engine, if_exists="append", index=False)
        alerts_data.to_sql("inventory_alerts", engine, if_exists="append", index=False)

        print("Data successfully inserted into PostgreSQL.")
        return 0

    except FileNotFoundError as exc:
        print(f"File error: {exc}")
        return 1
    except ValueError as exc:
        print(f"Validation error: {exc}")
        return 1
    except SQLAlchemyError as exc:
        print(f"Database operation failed: {exc}")
        print(
            "Check credentials. You can set MEDIASSIST_DB_USER and "
            "MEDIASSIST_DB_PASSWORD (and optional MEDIASSIST_DB_HOST, "
            "MEDIASSIST_DB_PORT, MEDIASSIST_DB_NAME)."
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
