import psycopg2
import os
from dotenv import load_dotenv
from pathlib import Path

def migrate():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)
    
    url = os.getenv("DATABASE_URL")
    print(f"Connecting to {url}")
    
    try:
        conn = psycopg2.connect(url)
        cur = conn.cursor()
        
        # Check if column exists
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='templates' AND column_name='provider'")
        if not cur.fetchone():
            print("Adding provider column to templates table...")
            cur.execute("ALTER TABLE templates ADD COLUMN provider VARCHAR(255) DEFAULT 'vSphere'")
            conn.commit()
            print("Successfully added provider column.")
        else:
            print("Provider column already exists.")
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    migrate()
