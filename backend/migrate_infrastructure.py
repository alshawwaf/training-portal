import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from pathlib import Path

# Load .env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not set")
    sys.exit(1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def migrate():
    db = SessionLocal()
    try:
        print("Creating infrastructure_connections table...")
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS infrastructure_connections (
                id SERIAL PRIMARY KEY,
                name VARCHAR,
                provider VARCHAR,
                host VARCHAR,
                port INTEGER,
                "user" VARCHAR,
                password VARCHAR,
                token_id VARCHAR,
                token_secret VARCHAR,
                node VARCHAR,
                verify_ssl BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_infrastructure_connections_id ON infrastructure_connections (id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_infrastructure_connections_name ON infrastructure_connections (name)"))
        
        print("Updating templates table...")
        # Check if connection_id column exists
        result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='templates' AND column_name='connection_id'"))
        if result.fetchone():
            print("connection_id column already exists in templates.")
        else:
            print("Adding connection_id column to templates...")
            db.execute(text("ALTER TABLE templates ADD COLUMN connection_id INTEGER REFERENCES infrastructure_connections(id)"))
            
        db.commit()
        print("Migration complete!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
