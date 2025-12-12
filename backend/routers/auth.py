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

class LoginRequest(BaseModel):
    email: str
    password: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

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

    sys.stderr.write("DEBUG LOGIN: Success\n")
    sys.stderr.flush()
    # For mock token, we'll just sign user ID if we had JWT, but for now simple string
    return {"token": f"local-user-{user.id}", "user": {"name": user.name, "email": user.email, "role": user.role}}

@router.post("/change-password")
def change_password(data: PasswordChangeRequest, db: Session = Depends(get_db)):
    # In a real app, we'd get current user from token.
    # We will assume we are updating the DEFAULT ADMIN for now, or we should verify the token.
    # Since we don't have a real token verification middleware for local tokens yet (it's a mock token),
    # verifying the current password is a good enough check for now.
    
    user_email = os.getenv("SUPERADMIN_EMAIL", "admin@cpdemo.com")
    user = db.query(User).filter(User.email == user_email).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    
    return {"message": "Password updated successfully"}

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
