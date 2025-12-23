import logging
import datetime
from typing import List, Dict, Any, Optional
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr
from db.models import SystemSetting, NotificationEvent
from sqlalchemy.orm import Session

logger = logging.getLogger("se_portal.email_service")

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

    def _build_html_template(self, subject: str, body: Dict[str, Any]) -> str:
        """Build professional HTML email template."""
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{ font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f0f2f5; }}
                .wrapper {{ padding: 40px 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
                .header {{ background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%); padding: 40px 30px; text-align: center; }}
                .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }}
                .header p {{ margin: 8px 0 0; font-size: 13px; color: rgba(255,255,255,0.7); }}
                .content {{ padding: 40px 30px; }}
                .content h2 {{ color: #1e3a5f; margin: 0 0 20px; font-size: 20px; font-weight: 600; }}
                .content p {{ margin: 0 0 16px; color: #4a5568; font-size: 15px; }}
                .button {{ display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 20px; box-shadow: 0 4px 14px rgba(59,130,246,0.35); }}
                .button:hover {{ background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); }}
                .footer {{ background: #f8fafc; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; }}
                .footer p {{ margin: 0 0 8px; font-size: 12px; color: #64748b; }}
                .footer .brand {{ font-weight: 600; color: #1e3a5f; }}
                .divider {{ height: 1px; background: linear-gradient(90deg, transparent, #e2e8f0, transparent); margin: 24px 0; }}
            </style>
        </head>
        <body>
            <div class="wrapper">
                <div class="container">
                    <div class="header">
                        <h1>SE Training Portal</h1>
                        <p>Training Environment Management</p>
                    </div>
                    <div class="content">
                        <h2>{subject}</h2>
                        <p>{body.get('message', '')}</p>
                        {f'<div class="divider"></div><div style="text-align: center;"><a href="{body.get("url")}" class="button">Access Portal</a></div>' if body.get('url') else ''}
                        <div class="divider"></div>
                        <p style="color: #64748b; font-size: 13px;">Best regards,<br><span style="color: #1e3a5f; font-weight: 600;">SE Training Team</span></p>
                    </div>
                    <div class="footer">
                        <p>This is an automated notification from the SE Training Portal.</p>
                        <p>&copy; {datetime.datetime.now().year} <span class="brand">Check Point Software Technologies Ltd.</span></p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """

email_service = EmailService()
