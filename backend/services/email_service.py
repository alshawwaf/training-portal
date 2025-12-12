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
        <html>
            <body>
                <h1>{subject}</h1>
                <p>{body.get('message', '')}</p>
                <br>
                <p>SE Training Portal</p>
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
