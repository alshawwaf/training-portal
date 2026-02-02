from fastapi import FastAPI, Depends
from db.database import engine, Base, SessionLocal
from db.models import User, UserRole, SystemSetting, Template, NotificationEvent
from routers import auth, classes, settings, preferences, email, templates, dashboard, infrastructure, infrastructure_connections, logs, guacamole, console_ws, users, student, instructor, notification_events, networks
from services.proxmox_service import proxmox_service
from services.email_service import email_service
from services.vsphere_service import vsphere_service
from services.class_status_scheduler import class_status_scheduler
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
    # Read log level from environment variable
    log_level_str = os.getenv("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)
    
    logger = logging.getLogger("training_portal")
    logger.setLevel(logging.DEBUG)  # Capture everything, handlers filter

    # Console Handler - uses LOG_LEVEL
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(console_format)

    # File Handler (Rotating) - always DEBUG for troubleshooting
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

app = FastAPI(title="Training Portal API", version="1.0.0")

# Mount static files for WMKS SDK
from fastapi.staticfiles import StaticFiles
STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
# Also mount at /api/static for frontend proxy compatibility
app.mount("/api/static", StaticFiles(directory=str(STATIC_DIR)), name="api_static")


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
    import asyncio
    logger.info("Starting up application...")
    
    # Debug: Print all routes
    for route in app.routes:
        if hasattr(route, "path"):
            logger.info(f"Route: {route.path} [{route.name}]")
            
    db = SessionLocal()
    try:
        # DB Migration helper - safely add column if it doesn't exist
        from sqlalchemy import text, inspect
        
        def safe_add_column(table: str, column: str, column_type: str, default: str = None):
            """Safely add a column to a table if it doesn't exist."""
            try:
                inspector = inspect(db.bind)
                existing_columns = [c['name'] for c in inspector.get_columns(table)]
                if column not in existing_columns:
                    sql = f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"
                    if default:
                        sql += f" DEFAULT {default}"
                    db.execute(text(sql))
                    db.commit() # Commit DDL immediately
                    logger.info(f"Migration: Added column {column} to {table}")
            except Exception as e:
                db.rollback()
                logger.warning(f"Migration warning for {table}.{column}: {e}")
        
        try:
            # Templates table
            safe_add_column("templates", "provider", "VARCHAR(255)", "'vSphere'")
            safe_add_column("templates", "status", "VARCHAR(255)", "'source_only'")
            
            # Classes table
            safe_add_column("classes", "join_token", "VARCHAR(255)", "NULL")
            safe_add_column("classes", "allow_multi_env", "BOOLEAN", "FALSE")
            safe_add_column("classes", "target_datastore", "VARCHAR(255)", "NULL")
            
            # Class environments table
            safe_add_column("class_environments", "student_number", "INTEGER", "NULL")
            safe_add_column("class_environments", "status", "VARCHAR(255)", "'ready'")
            safe_add_column("class_environments", "is_spare", "BOOLEAN", "FALSE")
            safe_add_column("class_environments", "claimed_at", "TIMESTAMP", "NULL")
            safe_add_column("class_environments", "claimed_by_email", "VARCHAR(255)", "NULL")
            
            # Environment VMs table
            safe_add_column("environment_vms", "role", "VARCHAR(255)", "NULL")
            safe_add_column("environment_vms", "os_type", "VARCHAR(255)", "NULL")
            safe_add_column("environment_vms", "status", "VARCHAR(255)", "'poweredOff'")
            safe_add_column("environment_vms", "template_vm_id", "INTEGER", "NULL")
            safe_add_column("networks", "color", "VARCHAR(255)", "NULL")
            safe_add_column("networks", "isolation_mode", "VARCHAR(255)", "'isolated'")

            # Template VM Networks (Advanced Settings)
            safe_add_column("template_vm_networks", "adapter_type", "VARCHAR(255)", "'virtio'")
            safe_add_column("template_vm_networks", "firewall", "BOOLEAN", "FALSE")
            safe_add_column("template_vm_networks", "mtu", "INTEGER", "NULL")
            safe_add_column("template_vm_networks", "mac_address", "VARCHAR(255)", "NULL")
            safe_add_column("template_vm_networks", "rate_limit", "INTEGER", "NULL")
            safe_add_column("template_vm_networks", "queues", "INTEGER", "NULL")
            safe_add_column("template_vm_networks", "link_down", "BOOLEAN", "FALSE")
            
            # Network Management Tables - PostgreSQL compatible
            try:
                db.execute(text("""
                    CREATE TABLE IF NOT EXISTS networks (
                        id SERIAL PRIMARY KEY, 
                        connection_id INTEGER REFERENCES infrastructure_connections(id), 
                        name VARCHAR(255), 
                        description TEXT, 
                        is_isolated BOOLEAN DEFAULT TRUE, 
                        static_vlan INTEGER,
                        network_identifier VARCHAR(255)
                    )
                """))
            except Exception as table_err:
                logger.warning(f"Networks table creation: {table_err}")
            
            try:
                db.execute(text("""
                    CREATE TABLE IF NOT EXISTS template_vm_networks (
                        id SERIAL PRIMARY KEY, 
                        vm_id INTEGER REFERENCES template_vms(id) ON DELETE CASCADE, 
                        network_id INTEGER REFERENCES networks(id), 
                        nic_name VARCHAR(255)
                    )
                """))
            except Exception as table_err:
                logger.warning(f"Template VM networks table creation: {table_err}")
                
            try:
                db.execute(text("""
                    CREATE TABLE IF NOT EXISTS class_networks (
                        id SERIAL PRIMARY KEY, 
                        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE, 
                        environment_id INTEGER REFERENCES class_environments(id) ON DELETE CASCADE, 
                        network_id INTEGER REFERENCES networks(id) ON DELETE CASCADE, 
                        vlan_id INTEGER
                    )
                """))
            except Exception as table_err:
                logger.warning(f"Class networks table creation: {table_err}")
            
            # Add network_identifier if networks table already existed without it
            safe_add_column("networks", "network_identifier", "VARCHAR(255)", "NULL")
            
            # New columns for TemplateVM
            safe_add_column("template_vms", "source_moid", "VARCHAR(255)", "NULL")

            db.commit()
            logger.info("Database migration: columns verified/added.")
        except Exception as e:
            logger.error(f"Migration error: {e}")
            db.rollback()



        # Seed Admin User (only if NO admin exists yet)
        existing_admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
        if not existing_admin:
            logger.info("Seeding superadmin user...")
            hashed_pw = get_password_hash(os.getenv("SUPERADMIN_PASSWORD", "admin123"))
            admin_user = User(
                email=os.getenv("SUPERADMIN_EMAIL", "admin@example.com"),
                first_name="Super",
                last_name="Admin",
                name="Super Admin",
                role=UserRole.ADMIN,
                hashed_password=hashed_pw,
                is_active=True,
                is_email_confirmed=True
            )
            db.add(admin_user)
            db.commit()
        else:
            logger.debug(f"Admin user already exists: {existing_admin.email}")
        
        # Seed Default System Settings
        defaults = {
            "proxmox_host": "",
            "proxmox_node": "",
            "backup_retention_days": "7",
            # SMTP Defaults - Production ready configuration
            "smtp_server": "smtp.example.com",
            "smtp_port": "587",
            "smtp_from": "noreply@example.com",
            "smtp_to": "admin@example.com",
            "smtp_ssl": "false",
            "smtp_starttls": "false",
            "smtp_use_auth": "false",
            "smtp_username": "",
            "smtp_password": "",
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
            # vSphere Defaults
            "vsphere_host": os.getenv("VSPHERE_HOST", ""),
            "vsphere_port": os.getenv("VSPHERE_PORT", "443"),
            "vsphere_user": os.getenv("VSPHERE_USER", "administrator@vsphere.local"),
            "vsphere_password": os.getenv("VSPHERE_PASSWORD", ""),
            "vsphere_verify_ssl": os.getenv("VSPHERE_VERIFY_SSL", "false")
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
                elif key.startswith("proxmox"):
                    category = "proxmox"
                elif key.startswith("vsphere"):
                    category = "vsphere"
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

        # Seed Notification Events
        notification_events_defaults = [
            {"event_type": "class_created", "name": "Class Created", "description": "When a new training class is created", "email_enabled": True},
            {"event_type": "class_started", "name": "Class Started", "description": "When a class session begins", "email_enabled": True},
            {"event_type": "class_completed", "name": "Class Completed", "description": "When a class ends or is marked complete", "email_enabled": True},
            {"event_type": "student_joined", "name": "Student Joined", "description": "When a student joins a class", "email_enabled": True},
            {"event_type": "environment_provisioned", "name": "Environment Provisioned", "description": "When a student environment is ready", "email_enabled": True},
            {"event_type": "environment_error", "name": "Environment Error", "description": "When environment provisioning fails", "email_enabled": True},
            {"event_type": "user_invited", "name": "User Invited", "description": "When a new user is invited to the platform", "email_enabled": True},
            {"event_type": "user_registered", "name": "User Registered", "description": "When a new user completes registration", "email_enabled": True},
            {"event_type": "system_alert", "name": "System Alert", "description": "Critical system notifications", "email_enabled": True},
        ]
        
        for event_data in notification_events_defaults:
            event = db.query(NotificationEvent).filter(NotificationEvent.event_type == event_data["event_type"]).first()
            if not event:
                new_event = NotificationEvent(**event_data)
                db.add(new_event)
        
        db.commit()

        # Initialize email service only (fast)
        await email_service.load_config(db)
        
        # Load vSphere/Proxmox config (but don't connect yet)
        proxmox_service.load_config(db)
        vsphere_service.load_config(db)
        
        # Start class status scheduler
        class_status_scheduler.start()
        
        logger.info("Startup complete. Infrastructure connections are now managed on-demand via the UI.")
        
    except Exception as e:
        logger.error(f"Failed to seed database or load services: {e}")
    finally:
        db.close()

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(classes.router)
app.include_router(settings.router)
app.include_router(preferences.router)
app.include_router(email.router)
app.include_router(templates.router)
app.include_router(dashboard.router)
app.include_router(infrastructure.router)
app.include_router(logs.router)
app.include_router(guacamole.router)
app.include_router(console_ws.router)
app.include_router(student.router)
app.include_router(instructor.router)
app.include_router(infrastructure_connections.router)
app.include_router(notification_events.router)
app.include_router(networks.router)

@app.get("/")
def read_root():
    p_status = "Connected" if proxmox_service.proxmox else "Disconnected"

    logger.debug(f"Root endpoint called. Proxmox Status: {p_status}")
    return {
        "message": "Welcome to the Training Portal API",
        "proxmox_status": p_status
    }

@app.get("/health")
def health_check():
    return {"status": "ok"}
