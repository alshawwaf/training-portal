
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.models import Base, Class, Template, ActionLog

DATABASE_URL = "sqlite:///./sql_app.db" # Or postgresql if configured
# Check .env for DB URL
import os
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL", "sqlite:///./sql_app.db")
print(f"Using DB URL: {db_url}")

engine = create_engine(db_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

# Find class tftf
c = db.query(Class).filter(Class.name.ilike("%tftf%")).first()
if not c:
    print("Class 'tftf' not found")
else:
    print(f"Class Found: {c.name} (ID: {c.id})")
    print(f"Template ID: {c.template_id}")
    
    t = db.query(Template).filter(Template.id == c.template_id).first()
    if t:
        print(f"Template: {t.name}")
        for vm in t.vms:
            print(f"  - VM Name: {vm.vm_name}, MOID: {vm.vm_moid}")
    else:
        print("Template not found for this class")

print("\nRecent Logs:")
count = db.query(ActionLog).count()
print(f"Total Logs: {count}")
logs = db.query(ActionLog).order_by(ActionLog.id.desc()).limit(10).all()
if not logs:
    print("No logs found.")
for l in logs:
    print(f"[{l.id}] {l.created_at} - {l.action} - {l.status} - {l.details}")
