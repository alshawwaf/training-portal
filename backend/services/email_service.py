import logging
import datetime
import os
from typing import List, Dict, Any, Optional
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr
from db.models import SystemSetting, NotificationEvent
from sqlalchemy.orm import Session

logger = logging.getLogger("se_portal.email_service")

# Base URL for email links - reads from FRONTEND_URL or BASE_URL env variable
BASE_URL = os.getenv("FRONTEND_URL") or os.getenv("BASE_URL", "http://localhost:9090")

class EmailService:
    def __init__(self):
        self.conf: Optional[ConnectionConfig] = None
        self.fastmail: Optional[FastMail] = None
        self.admin_email: Optional[str] = None

    async def load_config(self, db: Session):
        """Reloads SMTP configuration from the database."""
        try:
            settings = db.query(SystemSetting).filter(SystemSetting.category == "smtp").all()
            settings_map = {s.key: s.value for s in settings}

            # Minimum required settings
            required = ["smtp_server", "smtp_port", "smtp_from"]
            if not all(k in settings_map for k in required):
                logger.warning("Email configuration incomplete - missing required settings.")
                self.fastmail = None
                return

            # Get security settings with defaults
            use_ssl = settings_map.get("smtp_ssl", "false").lower() == "true"
            use_starttls = settings_map.get("smtp_starttls", "false").lower() == "true"
            use_credentials = settings_map.get("smtp_use_auth", "false").lower() == "true"
            validate_certs = settings_map.get("smtp_validate_certs", "false").lower() == "true"
            
            # Store admin email for notifications
            self.admin_email = settings_map.get("smtp_to", settings_map.get("smtp_from"))

            # Build config - username/password only required if auth is enabled
            config_params = {
                "MAIL_USERNAME": settings_map.get("smtp_username", "") if use_credentials else "",
                "MAIL_PASSWORD": settings_map.get("smtp_password", "") if use_credentials else "",
                "MAIL_FROM": settings_map["smtp_from"],
                "MAIL_PORT": int(settings_map["smtp_port"]),
                "MAIL_SERVER": settings_map["smtp_server"],
                "MAIL_STARTTLS": use_starttls,
                "MAIL_SSL_TLS": use_ssl,
                "USE_CREDENTIALS": use_credentials,
                "VALIDATE_CERTS": validate_certs
            }

            self.conf = ConnectionConfig(**config_params)
            self.fastmail = FastMail(self.conf)
            logger.info(f"Email configuration loaded successfully. Server: {settings_map['smtp_server']}:{settings_map['smtp_port']}")
        except Exception as e:
            logger.error(f"Failed to load email config: {e}")
            self.fastmail = None

    def is_configured(self) -> bool:
        """Check if email service is properly configured."""
        return self.fastmail is not None

    async def check_event_enabled(self, db: Session, event_type: str) -> bool:
        """Check if a notification event is enabled for email."""
        event = db.query(NotificationEvent).filter(NotificationEvent.event_type == event_type).first()
        return event.email_enabled if event else False

    async def send_email(
        self,
        subject: str,
        recipients: List[EmailStr],
        body: Dict[str, Any],
        template_name: str = "default.html" 
    ):
        """
        Sends an email using the configured SMTP server.
        """
        if not self.fastmail:
            logger.warning("Email service not configured. Skipping email send.")
            return

        html_content = self._build_html_template(subject, body)

        message = MessageSchema(
            subject=subject,
            recipients=recipients,
            body=html_content,
            subtype=MessageType.html
        )

        try:
            await self.fastmail.send_message(message)
            logger.info(f"Email sent to {recipients}")
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            raise e

    async def send_notification(
        self,
        db: Session,
        event_type: str,
        subject: str,
        message: str,
        recipients: Optional[List[str]] = None,
        url: Optional[str] = None
    ):
        """Send a notification email if the event type is enabled."""
        if not await self.check_event_enabled(db, event_type):
            logger.debug(f"Notification event '{event_type}' is disabled. Skipping email.")
            return

        # Default to admin email if no recipients specified
        if not recipients and self.admin_email:
            recipients = [self.admin_email]

        if not recipients:
            logger.warning("No recipients for notification email.")
            return

        await self.send_email(
            subject=subject,
            recipients=recipients,
            body={"message": message, "url": url}
        )

    def _build_button_html(self, url: Optional[str]) -> str:
        """Build button HTML with full URL."""
        if not url:
            return ""
        
        # Make relative URLs absolute
        if url.startswith("/"):
            full_url = f"{BASE_URL}{url}"
        else:
            full_url = url
        
        # Use table-based layout for maximum email client compatibility
        return f'''
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                                            <tr>
                                                <td align="center">
                                                    <a href="{full_url}" 
                                                       style="display: inline-block; padding: 14px 32px; 
                                                              background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); 
                                                              color: #ffffff; text-decoration: none; border-radius: 10px; 
                                                              font-weight: 600; font-size: 14px; 
                                                              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                                              box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);"
                                                    >Access Portal</a>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td align="center" style="padding-top: 12px;">
                                                    <p style="margin: 0; font-size: 12px; color: #64748b;">
                                                        Or copy this link: <a href="{full_url}" style="color: #60a5fa;">{full_url}</a>
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
        '''

    def _build_html_template(self, subject: str, body: Dict[str, Any]) -> str:
        """Build professional HTML email template matching app design."""
        button_html = self._build_button_html(body.get('url'))
        
        return f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-height: 100vh;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <!-- Main Container -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 520px; margin: 0 auto;">
                    <!-- Logo/Header -->
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <table role="presentation" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 12px 16px; border-radius: 12px;">
                                        <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">SE Training Portal</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Card -->
                    <tr>
                        <td>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid #334155; overflow: hidden;">
                                <!-- Card Header -->
                                <tr>
                                    <td style="padding: 32px 32px 24px 32px; border-bottom: 1px solid #334155;">
                                        <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #f1f5f9; letter-spacing: -0.3px;">{subject}</h1>
                                    </td>
                                </tr>
                                
                                <!-- Card Body -->
                                <tr>
                                    <td style="padding: 24px 32px 32px 32px;">
                                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.7; color: #94a3b8;">{body.get('message', '')}</p>
                                        
                                        {button_html}
                                        
                                        <!-- Signature -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #334155;">
                                            <tr>
                                                <td>
                                                    <p style="margin: 0; font-size: 14px; color: #64748b;">Best regards,</p>
                                                    <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">SE Training Team</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 24px 0;">
                            <p style="margin: 0 0 8px 0; font-size: 12px; color: #475569;">This is an automated notification from SE Training Portal</p>
                            <p style="margin: 0; font-size: 12px; color: #475569;">&copy; {datetime.datetime.now().year} <span style="font-weight: 600; color: #64748b;">Check Point Software Technologies Ltd.</span></p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        """

email_service = EmailService()
