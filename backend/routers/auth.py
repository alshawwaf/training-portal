from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer
import msal
import os
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import User
from pydantic import BaseModel
import bcrypt
import random
import string
from services.email_service import email_service
from typing import List
import datetime

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/local-login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if token.startswith("local-user-"):
        try:
            user_id = int(token.split("-")[-1])
            user = db.query(User).filter(User.id == user_id).first()
            if user is None:
                raise credentials_exception
            return user
        except ValueError:
            raise credentials_exception
            
    elif token == "mock-dev-token":
        # Return first admin user for dev convenience
        user = db.query(User).filter(User.role == "admin").first()
        if not user:
             # Fallback if no admin exists (should be seeded)
             raise credentials_exception
        return user
        
    # TODO: Implement real Azure AD token validation here
    # For now, fail other tokens
    raise credentials_exception

def verify_password(plain_password, hashed_password):
    if not hashed_password:
        return False
    # bcrypt.checkpw requires bytes
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    # bcrypt.hashpw returns bytes, we decode to store as string
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Configuration (These should be in .env)
CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "your-client-id")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "your-client-secret")
TENANT_ID = os.getenv("AZURE_TENANT_ID", "your-tenant-id")
AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
REDIRECT_PATH = "/auth/callback"
SCOPE = ["User.Read"]

# Frontend URL for redirects (configurable for different ports)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:9999")
ALLOWED_DOMAINS = os.getenv("ALLOWED_DOMAINS", "checkpoint.com").split(",")

class RegisterRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: str
    confirm_password: str

class VerifyEmailRequest(BaseModel):
    email: str
    code: str

class LoginRequest(BaseModel):
    email: str
    password: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class ProfileUpdateRequest(BaseModel):
    first_name: str
    last_name: str
    email: str  # Not used for update, just echoed back
    current_password: str | None = None  # Required if setting new password
    new_password: str | None = None  # Optional - only update if provided

def _build_msal_app():
    return msal.ConfidentialClientApplication(
        CLIENT_ID, authority=AUTHORITY,
        client_credential=CLIENT_SECRET
    )

import logging
logger = logging.getLogger("se_portal.auth")

import sys

@router.post("/local-login")
def local_login(creds: LoginRequest, db: Session = Depends(get_db)):
    sys.stderr.write(f"DEBUG LOGIN: Attempt for {creds.email}\n")
    sys.stderr.flush()
    
    # Log DB info to be sure
    try:
        db_path = db.bind.url.database
        sys.stderr.write(f"DEBUG LOGIN: DB Path: {db_path}\n")
    except:
        sys.stderr.write("DEBUG LOGIN: Could not get DB path\n")
        
    user = db.query(User).filter(User.email == creds.email).first()
    
    if not user:
        sys.stderr.write("DEBUG LOGIN: User not found\n")
        sys.stderr.flush()
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    sys.stderr.write(f"DEBUG LOGIN: User found. Role: {user.role}. Hash: {user.hashed_password}\n")
    if not user.hashed_password:
        raise HTTPException(status_code=401, detail="Local login not enabled for this user")
    
    is_valid = verify_password(creds.password, user.hashed_password)
    sys.stderr.write(f"DEBUG LOGIN: Check Result: {is_valid}\n")
    sys.stderr.flush()
    
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    
    if not user.is_email_confirmed:
        raise HTTPException(status_code=403, detail="Email not confirmed")

    sys.stderr.write("DEBUG LOGIN: Success\n")
    sys.stderr.flush()
    
    # Update last login
    user.last_login = datetime.datetime.utcnow()
    db.commit()

    # For mock token, we'll just sign user ID if we had JWT, but for now simple string
    return {
        "token": f"local-user-{user.id}", 
        "user": {
            "name": user.name, 
            "email": user.email, 
            "role": user.role,
            "must_change_password": user.password_reset_required
        }
    }

@router.post("/register")
async def register(data: RegisterRequest, db: Session = Depends(get_db)):
    # 1. Validate domain
    domain = data.email.split("@")[-1].lower()
    if domain not in [d.strip().lower() for d in ALLOWED_DOMAINS]:
        raise HTTPException(
            status_code=400, 
            detail=f"Registration only allowed for domains: {', '.join(ALLOWED_DOMAINS)}"
        )
    
    # 2. Check if user exists
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # 3. Validate password confirmation
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    # 4. Create user
    confirmation_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    new_user = User(
        first_name=data.first_name,
        last_name=data.last_name,
        name=f"{data.first_name} {data.last_name}",
        email=data.email,
        hashed_password=get_password_hash(data.password),
        is_active=True,
        is_email_confirmed=False,
        confirmation_code=confirmation_code
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # 4. Send email
    try:
        await email_service.load_config(db)
        await email_service.send_email(
            subject="Confirm your SE Training Portal account",
            recipients=[data.email],
            body={"message": f"Welcome to SE Training Portal! Your confirmation code is: {confirmation_code}"}
        )
    except Exception as e:
        logger.error(f"Failed to send confirmation email: {e}")
        # We don't fail registration if email fails, but maybe we should?
        # For now, just log it.
    
    return {"message": "Registration successful. Please check your email for confirmation code."}

@router.post("/verify-email")
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_email_confirmed:
        return {"message": "Email already confirmed"}
    
    if user.confirmation_code != data.code:
        raise HTTPException(status_code=400, detail="Invalid confirmation code")
    
    user.is_email_confirmed = True
    user.confirmation_code = None
    
    # Assign default Student group if it exists
    from db.models import Group, UserGroup
    student_group = db.query(Group).filter(Group.name == "Student").first()
    if student_group:
        user_group = UserGroup(user_id=user.id, group_id=student_group.id)
        db.add(user_group)
    
    db.commit()
    return {"message": "Email confirmed successfully. You can now login."}

@router.post("/change-password")
async def change_password(data: PasswordChangeRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change password for the currently authenticated user."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    
    return {"message": "Password updated successfully"}

@router.put("/profile")
async def update_profile(data: ProfileUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update profile for the currently authenticated user."""
    sys.stderr.write(f"DEBUG PROFILE UPDATE: User ID={current_user.id}, Name update: {data.first_name} {data.last_name}\n")
    sys.stderr.flush()
    
    # Update name only (email is not editable)
    current_user.name = f"{data.first_name} {data.last_name}".strip()
    
    # Update password only if both current and new password are provided
    if data.new_password and len(data.new_password) >= 6:
        # Verify current password first
        if not data.current_password:
            raise HTTPException(status_code=400, detail="Current password is required to change password")
        if not verify_password(data.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        
        current_user.hashed_password = get_password_hash(data.new_password)
        sys.stderr.write(f"DEBUG PROFILE UPDATE: Password also updated\n")
        sys.stderr.flush()
    
    db.commit()
    db.refresh(current_user)
    
    sys.stderr.write(f"DEBUG PROFILE UPDATE: Success! New name={current_user.name}\n")
    sys.stderr.flush()
    
    return {"message": "Profile updated successfully", "user": {"name": current_user.name, "email": current_user.email, "role": current_user.role}}

@router.get("/login")
async def login(request: Request):
    # Check if we are in Dev/Mock mode (Weak check on default string)
    if CLIENT_ID == "your-client-id" or CLIENT_ID == "your-client-id-here":
        # Mock Login Flow - Auto Redirect for testing easy access
        return RedirectResponse(url=f"{FRONTEND_URL}/dashboard?token=mock-dev-token")

    # Create MSAL instance
    msal_app = _build_msal_app()
    # Generate Auth URL
    auth_url = msal_app.get_authorization_request_url(
        SCOPE,
        redirect_uri=str(request.base_url)[:-1] + REDIRECT_PATH
    )
    return RedirectResponse(auth_url)

@router.get("/callback")
async def authorized(request: Request, code: str, db: Session = Depends(get_db)):
    msal_app = _build_msal_app()
    result = msal_app.acquire_token_by_authorization_code(
        code,
        scopes=SCOPE,
        redirect_uri=str(request.base_url)[:-1] + REDIRECT_PATH
    )
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result.get("error_description"))

    # Extract user info
    user_info = result.get("id_token_claims")
    oid = user_info.get("oid")
    email = user_info.get("preferred_username") or user_info.get("email")
    name = user_info.get("name")

    # Sync user to DB
    user = db.query(User).filter(User.oid == oid).first()
    if not user:
        user = User(oid=oid, email=email, name=name)
        db.add(user)
        db.commit()
        db.refresh(user)
    
    # Redirect to frontend with token
    return RedirectResponse(url=f"{FRONTEND_URL}/dashboard?token={result['access_token']}")
