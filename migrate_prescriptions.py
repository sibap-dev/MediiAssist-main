#!/usr/bin/env python3
"""
Database migration script to add enhanced dosage timing fields to prescriptions table.
Run this script to update your existing database with the new fields.
"""

import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def resolve_database_url() -> str:
    """Resolve database URL from environment with sqlite fallback."""
    database_url = os.environ.get("DATABASE_URL", "sqlite:///mediassist.db")
    # Some hosts provide postgres:// which SQLAlchemy expects as postgresql://
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    return database_url

def migrate_database():
    """Add new fields to prescriptions table for enhanced dosage timing."""
    
    database_url = resolve_database_url()
    
    try:
        engine = create_engine(database_url)
        
        with engine.connect() as conn:
            # Start transaction
            trans = conn.begin()
            
            try:
                print("Adding new fields to prescriptions table...")
                
                # Add new columns for enhanced dosage timing
                migration_queries = [
                    """
                    ALTER TABLE prescriptions 
                    ADD COLUMN IF NOT EXISTS frequency_per_day INTEGER DEFAULT 1;
                    """,
                    """
                    ALTER TABLE prescriptions 
                    ADD COLUMN IF NOT EXISTS timing_relation VARCHAR(20) DEFAULT 'AF';
                    """,
                    """
                    ALTER TABLE prescriptions 
                    ADD COLUMN IF NOT EXISTS specific_times JSON;
                    """,
                    """
                    ALTER TABLE prescriptions 
                    ADD COLUMN IF NOT EXISTS dosage_amount VARCHAR(50);
                    """
                ]
                
                for query in migration_queries:
                    conn.execute(text(query))
                    print(f"✓ Executed: {query.strip()}")
                
                # Update existing records with default values
                update_query = """
                UPDATE prescriptions 
                SET 
                    frequency_per_day = CASE 
                        WHEN dosage ILIKE '%twice%' OR dosage ILIKE '%2 time%' THEN 2
                        WHEN dosage ILIKE '%thrice%' OR dosage ILIKE '%3 time%' THEN 3
                        WHEN dosage ILIKE '%four%' OR dosage ILIKE '%4 time%' THEN 4
                        ELSE 1
                    END,
                    timing_relation = CASE 
                        WHEN instructions ILIKE '%before food%' OR instructions ILIKE '%before meal%' THEN 'BF'
                        WHEN instructions ILIKE '%with food%' OR instructions ILIKE '%with meal%' THEN 'WF'
                        WHEN instructions ILIKE '%empty stomach%' THEN 'E'
                        ELSE 'AF'
                    END,
                    dosage_amount = COALESCE(dosage, '1 dose'),
                    specific_times = CASE frequency_per_day
                        WHEN 2 THEN '["08:00", "20:00"]'::json
                        WHEN 3 THEN '["08:00", "14:00", "20:00"]'::json
                        WHEN 4 THEN '["08:00", "12:00", "16:00", "20:00"]'::json
                        ELSE NULL
                    END
                WHERE frequency_per_day IS NULL OR timing_relation IS NULL;
                """
                
                conn.execute(text(update_query))
                print("✓ Updated existing prescriptions with default timing values")
                
                # Commit transaction
                trans.commit()
                print("\n🎉 Database migration completed successfully!")
                print("\nNew fields added:")
                print("  - frequency_per_day: How many times per day")
                print("  - timing_relation: BF/AF/WF/E (Before/After/With Food, Empty Stomach)")
                print("  - specific_times: JSON array of specific times")
                print("  - dosage_amount: Amount per dose (e.g., '1 tablet', '5ml')")
                
            except Exception as e:
                trans.rollback()
                raise e
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    print("MediAssist Database Migration")
    print("=" * 40)
    print("Adding enhanced dosage timing fields to prescriptions table...")
    print()
    
    migrate_database()