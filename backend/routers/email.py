from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from services.email_service import email_service
from services.logging_service import logging_service
from db.models import UserRole, SystemSetting
from db.database import get_db
from sqlalchemy.orm import Session
from .auth import get_admin_user

router = APIRouter(
    prefix="/email",
    tags=["email"],
    responses={404: {"description": "Not found"}},
)


class EmailSchema(BaseModel):
    to: List[EmailStr]
    subject: str = "Test Email from SE Portal"
    message: str = "This is a test email to verify your SMTP configuration."


class EmailSettingsSchema(BaseModel):
    smtp_server: str
    smtp_port: int
    smtp_from: EmailStr
    smtp_to: Optional[EmailStr] = None
    smtp_ssl: bool = False
    smtp_starttls: bool = False
    smtp_use_auth: bool = False
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None


@router.post("/test")
async def send_test_email(
    email_data: EmailSchema, 
    admin = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """
    Sends a test email to the specified recipients.
    Requires Admin privileges.
    """
    # Log the attempt
    logging_service.log_action(
        db, "SEND_TEST_EMAIL", f"To: {', '.join(email_data.to)}", 
        "INFO", "EMAIL", f"Sending test email", user_id=admin.id
    )
    
    # Reload config to ensure we have latest settings
    await email_service.load_config(db)

    if not email_service.fastmail:
        logging_service.log_action(
            db, "SEND_TEST_EMAIL", f"To: {', '.join(email_data.to)}", 
            "ERROR", "EMAIL", "Email service not configured", user_id=admin.id
        )
        raise HTTPException(
            status_code=500, 
            detail="Email service is not configured properly. Please check SMTP settings."
        )

    try:
        await email_service.send_email(
            subject=email_data.subject,
            recipients=email_data.to,
            body={"message": email_data.message}
        )
        logging_service.log_action(
            db, "SEND_TEST_EMAIL", f"To: {', '.join(email_data.to)}", 
            "SUCCESS", "EMAIL", "Test email sent successfully", user_id=admin.id
        )
        return {"success": True, "message": f"Email sent successfully to {', '.join(email_data.to)}"}
    except Exception as e:
        logging_service.log_action(
            db, "SEND_TEST_EMAIL", f"To: {', '.join(email_data.to)}", 
            "ERROR", "EMAIL", f"Failed: {str(e)}", user_id=admin.id
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings")
async def get_email_settings(
    admin = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get current email/SMTP settings."""
    settings = db.query(SystemSetting).filter(SystemSetting.category == "smtp").all()
    settings_map = {}
    for s in settings:
        # Mask password
        if s.key == "smtp_password" and s.value:
            settings_map[s.key] = "********"
        else:
            settings_map[s.key] = s.value
    
    return settings_map


@router.put("/settings")
async def save_email_settings(
    settings: EmailSettingsSchema,
    admin = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Save all email/SMTP settings at once."""
    logging_service.log_action(
        db, "UPDATE_EMAIL_SETTINGS", f"Server: {settings.smtp_server}:{settings.smtp_port}", 
        "INFO", "EMAIL", f"Updating email configuration (SSL: {settings.smtp_ssl}, TLS: {settings.smtp_starttls}, Auth: {settings.smtp_use_auth})", 
        user_id=admin.id
    )
    
    settings_to_save = {
        "smtp_server": settings.smtp_server,
        "smtp_port": str(settings.smtp_port),
        "smtp_from": settings.smtp_from,
        "smtp_to": settings.smtp_to or settings.smtp_from,
        "smtp_ssl": "true" if settings.smtp_ssl else "false",
        "smtp_starttls": "true" if settings.smtp_starttls else "false",
        "smtp_use_auth": "true" if settings.smtp_use_auth else "false",
    }
    
    # Only update credentials if provided and auth is enabled
    if settings.smtp_use_auth:
        if settings.smtp_username:
            settings_to_save["smtp_username"] = settings.smtp_username
        if settings.smtp_password and settings.smtp_password != "********":
            settings_to_save["smtp_password"] = settings.smtp_password

    for key, value in settings_to_save.items():
        db_setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if db_setting:
            db_setting.value = value
        else:
            # Create new setting
            new_setting = SystemSetting(
                key=key,
                value=value,
                category="smtp",
                description=key.replace("smtp_", "").replace("_", " ").title(),
                is_secret=(key == "smtp_password")
            )
            db.add(new_setting)
    
    db.commit()
    
    # Reload email config
    await email_service.load_config(db)
    
    logging_service.log_action(
        db, "UPDATE_EMAIL_SETTINGS", f"Server: {settings.smtp_server}:{settings.smtp_port}", 
        "SUCCESS", "EMAIL", "Email configuration saved and reloaded", 
        user_id=admin.id
    )
    
    return {"success": True, "message": "Email settings saved successfully"}


@router.get("/status")
async def get_email_status(
    admin = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Check if email service is configured and ready."""
    await email_service.load_config(db)
    return {
        "configured": email_service.is_configured(),
        "admin_email": email_service.admin_email
    }

