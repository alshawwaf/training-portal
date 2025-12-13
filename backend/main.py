from fastapi import FastAPI, Depends
from db.database import engine, Base, SessionLocal
from db.models import User, UserRole, SystemSetting, Template
from routers import auth, classes, settings, preferences, email, templates, dashboard, infrastructure
from services.proxmox_service import proxmox_service
from services.email_service import email_service
from services.vsphere_service import vsphere_service
from sqlalchemy.orm import Session
import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler
import os
import bcrypt

# Create logs directory
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

# Configure Logging
def setup_logging():
    logger = logging.getLogger("se_portal")
    logger.setLevel(logging.DEBUG)

    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(console_format)

    # File Handler (Rotating)
    file_handler = RotatingFileHandler(
        LOG_DIR / "app.log", 
        maxBytes=10*1024*1024, # 10MB
        backupCount=5
    )
    file_handler.setLevel(logging.DEBUG)
    file_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s')
    file_handler.setFormatter(file_format)

    # Add handlers
    if not logger.handlers:
        logger.addHandler(console_handler)
        logger.addHandler(file_handler)
    
    return logger

logger = setup_logging()

# Password Hashing
def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Create Tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SE Training Portal API", version="1.0.0")

from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

@app.middleware("http")
async def log_requests(request: Request, call_next):
    sys.stderr.write(f"REQUEST START: {request.method} {request.url}\n")
    sys.stderr.flush()
    response = await call_next(request)
    sys.stderr.write(f"REQUEST END: {request.method} {request.url} Status: {response.status_code}\n")
    sys.stderr.flush()
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup Event for Seeding
@app.on_event("startup")
async def startup_event():
    logger.info("Starting up application...")
    db = SessionLocal()
    try:
        # Seed Admin User
        user = db.query(User).filter(User.email == os.getenv("SUPERADMIN_EMAIL", "admin@example.com")).first()
        if not user:
            logger.info("Seeding superadmin user...")
            hashed_pw = get_password_hash(os.getenv("SUPERADMIN_PASSWORD", "admin123"))
            admin_user = User(
                email=os.getenv("SUPERADMIN_EMAIL", "admin@example.com"),
                name="Super Admin",
                role=UserRole.ADMIN,
                hashed_password=hashed_pw
            )
            db.add(admin_user)
            db.commit()
        
        # Seed Default System Settings
        defaults = {
            "proxmox_host": "192.168.1.100",
            "proxmox_node": "pve",
            "backup_retention_days": "7",
            # SMTP Defaults - Use Superadmin email as default
            "smtp_server": "smtp.example.com",
            "smtp_port": "587",
            "smtp_username": os.getenv("SUPERADMIN_EMAIL", "admin@cpdemo.com"),
            "smtp_password": "password",
            "smtp_from": os.getenv("SUPERADMIN_EMAIL", "admin@cpdemo.com"),
            "smtp_tls": "true",
            "smtp_ssl": "false",
            # AWS Defaults
            "aws_access_key_id": os.getenv("AWS_ACCESS_KEY_ID", ""),
            "aws_secret_access_key": os.getenv("AWS_SECRET_ACCESS_KEY", ""),
            "aws_region": os.getenv("AWS_REGION", "us-east-1"),
            # Azure Defaults
            "azure_subscription_id": os.getenv("AZURE_SUBSCRIPTION_ID", ""),
            "azure_tenant_id": os.getenv("AZURE_TENANT_ID", ""),
            "azure_client_id": os.getenv("AZURE_CLIENT_ID", ""),
            "azure_client_secret": os.getenv("AZURE_CLIENT_SECRET", ""),
            # GCP Defaults
            "gcp_project_id": os.getenv("GCP_PROJECT_ID", ""),
            "gcp_service_account_json": os.getenv("GCP_SERVICE_ACCOUNT_JSON", "{}"),
            # CloudShare Defaults
            "cloudshare_api_id": os.getenv("CLOUDSHARE_API_ID", ""),
            "cloudshare_api_key": os.getenv("CLOUDSHARE_API_KEY", ""),
            # Skytap Defaults
            "skytap_username": os.getenv("SKYTAP_USERNAME", ""),
            "skytap_api_token": os.getenv("SKYTAP_API_TOKEN", "")
        }
        
        for key, val in defaults.items():
            setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if not setting:
                is_secret = "password" in key or "secret" in key or "token" in key or "key" in key
                
                if key.startswith("smtp"):
                    category = "smtp"
                elif key.startswith("aws"):
                    category = "aws"
                elif key.startswith("azure"):
                    category = "azure"
                elif key.startswith("gcp"):
                    category = "gcp"
                elif key.startswith("cloudshare"):
                    category = "cloudshare"
                elif key.startswith("skytap"):
                    category = "skytap"
                elif key.startswith("proxmox"):
                    category = "proxmox"
                else:
                    category = "general"

                new_setting = SystemSetting(
                    key=key, 
                    value=val, 
                    category=category,
                    description=key.replace("_", " ").title(),
                    is_secret=is_secret
                )
                db.add(new_setting)
        
        db.commit()

        # Initialize Services
        proxmox_service.load_config(db)
        await email_service.load_config(db)
        
        # Seed Default Templates
        default_templates = [
            {"name": "Base Environment", "description": "Standard training setup with basic tools", "icon": "🖥️", "provider": "Proxmox"},
            {"name": "Advanced Security", "description": "Multi-VM security testing environment", "icon": "🔒", "provider": "AWS"},
            {"name": "Network Simulation", "description": "Complex network topology for advanced training", "icon": "🌐", "provider": "Azure"},
        ]
        for tpl in default_templates:
            existing = db.query(Template).filter(Template.name == tpl["name"]).first()
            if not existing:
                new_tpl = Template(**tpl)
                db.add(new_tpl)
            else:
                 # Update provider for existing templates if missing
                 if not existing.provider:
                     existing.provider = tpl.get("provider", "Proxmox")
                     db.add(existing)
        db.commit()
        
    except Exception as e:
        logger.error(f"Failed to seed database or load services: {e}")
    finally:
        db.close()

app.include_router(auth.router)
app.include_router(classes.router)
app.include_router(settings.router)
app.include_router(preferences.router)
app.include_router(email.router)
app.include_router(templates.router)
app.include_router(dashboard.router)
app.include_router(infrastructure.router)

@app.get("/")
def read_root():
    p_status = "Disconnected"
    if proxmox_service.mock_mode:
        p_status = "Mock Mode"
    elif proxmox_service.proxmox:
        p_status = "Connected"

    logger.debug(f"Root endpoint called. Proxmox Status: {p_status}")
    return {
        "message": "Welcome to the SE Training Portal API",
        "proxmox_status": p_status
    }

@app.get("/health")
def health_check():
    return {"status": "ok"}
