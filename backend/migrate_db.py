import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add parent directory to path to import models if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not set")
    sys.exit(1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def migrate():
    db = SessionLocal()
    try:
        print("Checking users table schema...")
        
        # Check if columns exist
        result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='first_name'"))
        if result.fetchone():
            print("first_name column already exists.")
        else:
            print("Adding first_name column...")
            db.execute(text("ALTER TABLE users ADD COLUMN first_name VARCHAR"))
            
        result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='last_name'"))
        if result.fetchone():
            print("last_name column already exists.")
        else:
            print("Adding last_name column...")
            db.execute(text("ALTER TABLE users ADD COLUMN last_name VARCHAR"))
            
        db.commit()
        
        print("Backfilling user names...")
        # Backfill names
        users = db.execute(text("SELECT id, name FROM users")).fetchall()
        for user in users:
            uid, name = user
            if name:
                parts = name.split(" ", 1)
                first = parts[0]
                last = parts[1] if len(parts) > 1 else ""
                
                print(f"Updating user {uid}: {first} {last}")
                query = text("UPDATE users SET first_name=:first, last_name=:last WHERE id=:uid")
                db.execute(query, {"first": first, "last": last, "uid": uid})
        
        db.commit()
        print("Migration complete!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
