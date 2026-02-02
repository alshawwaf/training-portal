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
    smtp_validate_certs: bool = False
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
    Returns detailed connection info for debugging.
    """
    import logging
    logger = logging.getLogger("training_portal.email")
    
    # Get current SMTP settings for debugging
    settings = db.query(SystemSetting).filter(SystemSetting.category == "smtp").all()
    settings_map = {s.key: s.value for s in settings}
    
    # Build connection info for debug response
    connection_info = {
        "server": settings_map.get("smtp_server", "Not configured"),
        "port": int(settings_map.get("smtp_port", 25)),
        "encryption": {
            "ssl_tls": settings_map.get("smtp_ssl", "false") == "true",
            "starttls": settings_map.get("smtp_starttls", "false") == "true",
            "validate_certs": settings_map.get("smtp_validate_certs", "false") == "true"
        },
        "authentication": {
            "enabled": settings_map.get("smtp_use_auth", "false") == "true",
            "username": settings_map.get("smtp_username", "") if settings_map.get("smtp_use_auth", "false") == "true" else None
        },
        "from_address": settings_map.get("smtp_from", "Not configured"),
        "admin_email": settings_map.get("smtp_to", None)
    }
    
    # Log detailed connection attempt
    logger.info(f"=== EMAIL TEST START ===")
    logger.info(f"Recipients: {', '.join(email_data.to)}")
    logger.info(f"Server: {connection_info['server']}:{connection_info['port']}")
    logger.info(f"SSL/TLS: {connection_info['encryption']['ssl_tls']}, STARTTLS: {connection_info['encryption']['starttls']}")
    logger.info(f"Authentication: {connection_info['authentication']['enabled']}")
    if connection_info['authentication']['enabled']:
        logger.info(f"Auth Username: {connection_info['authentication']['username']}")
    logger.info(f"From: {connection_info['from_address']}")
    
    # Log the attempt to database
    logging_service.log_action(
        db, "SEND_TEST_EMAIL", f"To: {', '.join(email_data.to)}", 
        "INFO", "EMAIL", 
        f"Server: {connection_info['server']}:{connection_info['port']} | SSL: {connection_info['encryption']['ssl_tls']} | STARTTLS: {connection_info['encryption']['starttls']} | Auth: {connection_info['authentication']['enabled']}", 
        user_id=admin.id
    )
    
    # Reload config to ensure we have latest settings
    await email_service.load_config(db)

    if not email_service.fastmail:
        logger.error("Email service not configured - fastmail is None")
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
        logger.info(f"=== EMAIL TEST SUCCESS ===")
        logging_service.log_action(
            db, "SEND_TEST_EMAIL", f"To: {', '.join(email_data.to)}", 
            "SUCCESS", "EMAIL", "Test email sent successfully", user_id=admin.id
        )
        return {
            "success": True, 
            "message": f"Email sent successfully to {', '.join(email_data.to)}",
            "connection_info": connection_info
        }
    except Exception as e:
        error_detail = str(e)
        logger.error(f"=== EMAIL TEST FAILED ===")
        logger.error(f"Error: {error_detail}")
        logging_service.log_action(
            db, "SEND_TEST_EMAIL", f"To: {', '.join(email_data.to)}", 
            "ERROR", "EMAIL", f"Failed: {error_detail}", user_id=admin.id
        )
        raise HTTPException(status_code=500, detail=error_detail)



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
        "INFO", "EMAIL", f"Updating email configuration (SSL: {settings.smtp_ssl}, TLS: {settings.smtp_starttls}, ValidateCerts: {settings.smtp_validate_certs}, Auth: {settings.smtp_use_auth})", 
        user_id=admin.id
    )
    
    settings_to_save = {
        "smtp_server": settings.smtp_server,
        "smtp_port": str(settings.smtp_port),
        "smtp_from": settings.smtp_from,
        "smtp_to": settings.smtp_to or settings.smtp_from,
        "smtp_ssl": "true" if settings.smtp_ssl else "false",
        "smtp_starttls": "true" if settings.smtp_starttls else "false",
        "smtp_validate_certs": "true" if settings.smtp_validate_certs else "false",
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


# === Certificate Management Endpoints ===

class CertificateUploadSchema(BaseModel):
    certificate: str  # PEM-encoded certificate
    
class ClientCertUploadSchema(BaseModel):
    certificate: str  # PEM-encoded client certificate
    private_key: str  # PEM-encoded private key
    key_password: Optional[str] = None  # Optional password for encrypted keys


@router.get("/certificates/status")
async def get_certificate_status(
    admin = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get status of configured certificates."""
    ca_cert = db.query(SystemSetting).filter(SystemSetting.key == "smtp_ca_cert").first()
    client_cert = db.query(SystemSetting).filter(SystemSetting.key == "smtp_client_cert").first()
    client_key = db.query(SystemSetting).filter(SystemSetting.key == "smtp_client_key").first()
    
    def get_cert_info(pem_data: str) -> dict:
        """Extract basic info from a PEM certificate."""
        if not pem_data:
            return None
        try:
            import ssl
            import tempfile
            import os
            from datetime import datetime
            
            # Write to temp file to parse
            with tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False) as f:
                f.write(pem_data)
                temp_path = f.name
            
            try:
                # Load and parse certificate
                cert = ssl._ssl._test_decode_cert(temp_path)
                return {
                    "subject": dict(x[0] for x in cert.get('subject', [])),
                    "issuer": dict(x[0] for x in cert.get('issuer', [])),
                    "not_before": cert.get('notBefore'),
                    "not_after": cert.get('notAfter'),
                    "serial_number": cert.get('serialNumber')
                }
            finally:
                os.unlink(temp_path)
        except Exception as e:
            return {"error": str(e), "configured": True}
    
    return {
        "ca_certificate": {
            "configured": bool(ca_cert and ca_cert.value),
            "info": get_cert_info(ca_cert.value if ca_cert else None)
        },
        "client_certificate": {
            "configured": bool(client_cert and client_cert.value),
            "info": get_cert_info(client_cert.value if client_cert else None)
        },
        "client_key": {
            "configured": bool(client_key and client_key.value)
        },
        "mtls_enabled": bool(client_cert and client_cert.value and client_key and client_key.value)
    }


@router.post("/certificates/ca")
async def upload_ca_certificate(
    data: CertificateUploadSchema,
    admin = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Upload a custom CA certificate for SMTP server verification."""
    # Validate it's a valid PEM certificate
    if "-----BEGIN CERTIFICATE-----" not in data.certificate:
        raise HTTPException(status_code=400, detail="Invalid certificate format. Must be PEM encoded.")
    
    # Store in database
    setting = db.query(SystemSetting).filter(SystemSetting.key == "smtp_ca_cert").first()
    if setting:
        setting.value = data.certificate
    else:
        setting = SystemSetting(
            key="smtp_ca_cert",
            value=data.certificate,
            category="smtp",
            description="Custom CA Certificate",
            is_secret=False
        )
        db.add(setting)
    
    db.commit()
    
    logging_service.log_action(
        db, "UPLOAD_CA_CERT", "CA Certificate", 
        "SUCCESS", "EMAIL", "Custom CA certificate uploaded", 
        user_id=admin.id
    )
    
    # Reload email config
    await email_service.load_config(db)
    
    return {"success": True, "message": "CA certificate uploaded successfully"}


@router.post("/certificates/client")
async def upload_client_certificate(
    data: ClientCertUploadSchema,
    admin = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Upload client certificate and key for mTLS authentication."""
    # Validate certificate
    if "-----BEGIN CERTIFICATE-----" not in data.certificate:
        raise HTTPException(status_code=400, detail="Invalid certificate format. Must be PEM encoded.")
    
    # Validate private key
    if "-----BEGIN" not in data.private_key or "PRIVATE KEY-----" not in data.private_key:
        raise HTTPException(status_code=400, detail="Invalid private key format. Must be PEM encoded.")
    
    # Validate key matches certificate (optional validation)
    try:
        import ssl
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False) as cert_file:
            cert_file.write(data.certificate)
            cert_path = cert_file.name
            
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False) as key_file:
            key_file.write(data.private_key)
            key_path = key_file.name
        
        try:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            context.load_cert_chain(cert_path, key_path, password=data.key_password)
        except ssl.SSLError as e:
            raise HTTPException(status_code=400, detail=f"Certificate/key validation failed: {str(e)}")
        finally:
            os.unlink(cert_path)
            os.unlink(key_path)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")
    
    # Store certificate
    for key, value in [
        ("smtp_client_cert", data.certificate),
        ("smtp_client_key", data.private_key),
        ("smtp_key_password", data.key_password or "")
    ]:
        setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if setting:
            setting.value = value
        else:
            setting = SystemSetting(
                key=key,
                value=value,
                category="smtp",
                description=key.replace("smtp_", "").replace("_", " ").title(),
                is_secret=(key in ["smtp_client_key", "smtp_key_password"])
            )
            db.add(setting)
    
    db.commit()
    
    logging_service.log_action(
        db, "UPLOAD_CLIENT_CERT", "Client Certificate", 
        "SUCCESS", "EMAIL", "Client certificate and key uploaded for mTLS", 
        user_id=admin.id
    )
    
    # Reload email config
    await email_service.load_config(db)
    
    return {"success": True, "message": "Client certificate uploaded successfully for mTLS"}


@router.delete("/certificates/{cert_type}")
async def delete_certificate(
    cert_type: str,
    admin = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Delete a certificate. cert_type can be 'ca' or 'client'."""
    if cert_type == "ca":
        keys_to_delete = ["smtp_ca_cert"]
    elif cert_type == "client":
        keys_to_delete = ["smtp_client_cert", "smtp_client_key", "smtp_key_password"]
    else:
        raise HTTPException(status_code=400, detail="Invalid certificate type. Use 'ca' or 'client'.")
    
    for key in keys_to_delete:
        setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if setting:
            db.delete(setting)
    
    db.commit()
    
    logging_service.log_action(
        db, "DELETE_CERT", f"{cert_type.upper()} Certificate", 
        "SUCCESS", "EMAIL", f"{cert_type.upper()} certificate deleted", 
        user_id=admin.id
    )
    
    # Reload email config
    await email_service.load_config(db)
    
    return {"success": True, "message": f"{cert_type.upper()} certificate deleted successfully"}
