from db.database import SessionLocal
from db.models import User
# from routers.auth import verify_password # Avoid importing router to keep simple
import bcrypt

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

db = SessionLocal()
email = "debug@example.com"
pw = "debug123"

print(f"Checking user {email}...")
user = db.query(User).filter(User.email == email).first()

if not user:
    print("User NOT FOUND")
else:
    print(f"User FOUND. ID: {user.id}")
    print(f"Stored Hash: {user.hashed_password}")
    
    try:
        is_valid = verify_password(pw, user.hashed_password)
        print(f"Verify Result: {is_valid}")
    except Exception as e:
        print(f"Verify Error: {e}")
