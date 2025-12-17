"""
Migration script to add level and source columns to action_logs table.
Run this inside the backend container.
"""
from db.database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # Add level column
        try:
            conn.execute(text("ALTER TABLE action_logs ADD COLUMN level VARCHAR DEFAULT 'INFO'"))
            print('Added level column')
        except Exception as e:
            print(f'level column: {e}')
        
        # Add source column
        try:
            conn.execute(text("ALTER TABLE action_logs ADD COLUMN source VARCHAR DEFAULT 'APP'"))
            print('Added source column')
        except Exception as e:
            print(f'source column: {e}')
        
        conn.commit()
        print('Migration complete!')

if __name__ == "__main__":
    migrate()
