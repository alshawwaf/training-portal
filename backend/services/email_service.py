import logging
from typing import List, Dict, Any, Optional
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr
from db.models import SystemSetting
from sqlalchemy.orm import Session
from db.database import get_db

logger = logging.getLogger("se_portal.email_service")

class EmailService:
    def __init__(self):
        self.conf: Optional[ConnectionConfig] = None
        self.fastmail: Optional[FastMail] = None

    async def load_config(self, db: Session):
        """Reloads SMTP configuration from the database."""
        try:
            settings = db.query(SystemSetting).filter(SystemSetting.category == "smtp").all()
            settings_map = {s.key: s.value for s in settings}

            if not all(k in settings_map for k in ["smtp_username", "smtp_password", "smtp_from", "smtp_port", "smtp_server"]):
                logger.warning("Email configuration incomplete in database.")
                self.fastmail = None
                return

            self.conf = ConnectionConfig(
                MAIL_USERNAME=settings_map["smtp_username"],
                MAIL_PASSWORD=settings_map["smtp_password"],
                MAIL_FROM=settings_map["smtp_from"],
                MAIL_PORT=int(settings_map["smtp_port"]),
                MAIL_SERVER=settings_map["smtp_server"],
                MAIL_STARTTLS=settings_map.get("smtp_tls", "true").lower() == "true",
                MAIL_SSL_TLS=settings_map.get("smtp_ssl", "false").lower() == "true",
                USE_CREDENTIALS=settings_map.get("smtp_use_auth", "true").lower() == "true",
                VALIDATE_CERTS=settings_map.get("smtp_validate_certs", "true").lower() == "true"
            )
            self.fastmail = FastMail(self.conf)
            logger.info("Email configuration loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load email config: {e}")
            self.fastmail = None

    async def send_email(
        self,
        subject: str,
        recipients: List[EmailStr],
        body: Dict[str, Any],
        template_name: str = "default.html" 
    ):
        """
        Sends an email using the configured SMTP server.
        NOTE: Ideally use a template engine like Jinja2. For now, we will use a simple HTML string.
        """
        if not self.fastmail:
            logger.warning("Email service not configured. Skipping email send.")
            return

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f7f9; }}
                .container {{ max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }}
                .header {{ background: linear-gradient(135deg, #005bb7 0%, #003366 100%); padding: 30px; text-align: center; color: white; }}
                .content {{ padding: 30px; }}
                .footer {{ background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }}
                .button {{ display: inline-block; padding: 12px 24px; background-color: #005bb7; color: white !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }}
                .highlight {{ color: #005bb7; font-weight: bold; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin:0; font-size: 24px;">SE Training Portal</h1>
                </div>
                <div class="content">
                    <h2 style="color: #1e293b; margin-top: 0;">{subject}</h2>
                    <p>{body.get('message', '')}</p>
                    {f'<div style="text-align: center;"><a href="{body.get("url")}" class="button">Access Portal</a></div>' if body.get('url') else ''}
                    <p style="margin-top: 30px;">Best regards,<br><span class="highlight">Check Point SE Training Team</span></p>
                </div>
                <div class="footer">
                    <p>This is an automated notification from the SE Training Portal.</p>
                    <p>&copy; {datetime.datetime.now().year} Check Point Software Technologies Ltd. All rights reserved.</p>
                    <p style="font-size: 10px; opacity: 0.7;">Powered by SE Training Portal</p>
                </div>
            </div>
        </body>
        </html>
        """

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

email_service = EmailService()
