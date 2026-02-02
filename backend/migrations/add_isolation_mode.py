"""
Database migration to add isolation_mode column to networks table.

Run this script to add the new column:
    python migrations/add_isolation_mode.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from db.database import DATABASE_URL

def migrate():
    """Add isolation_mode column to networks table if it doesn't exist."""
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        # Check if column exists (SQLite version)
        result = conn.execute(text("PRAGMA table_info(networks)"))
        columns = [row[1] for row in result]
        
        if 'isolation_mode' not in columns:
            print("Adding 'isolation_mode' column to networks table...")
            conn.execute(text(
                "ALTER TABLE networks ADD COLUMN isolation_mode VARCHAR DEFAULT 'isolated'"
            ))
            conn.commit()
            print("Migration completed successfully!")
        else:
            print("Column 'isolation_mode' already exists. No migration needed.")

if __name__ == "__main__":
    migrate()
