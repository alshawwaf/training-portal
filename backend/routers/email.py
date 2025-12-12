from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import List
from services.email_service import email_service
from db.models import UserRole
from routers.auth import get_current_user

router = APIRouter(
    prefix="/email",
    tags=["email"],
    responses={404: {"description": "Not found"}},
)

class EmailSchema(BaseModel):
    to: List[EmailStr]
    subject: str = "Test Email from SE Portal"
    message: str = "This is a test email to verify your SMTP configuration."

@router.post("/test")
async def send_test_email(email_data: EmailSchema, current_user = Depends(get_current_user)):
    """
    Sends a test email to the specified recipients.
    Requires Admin privileges.
    """
    if current_user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Not authorized")

    if not email_service.fastmail:
        raise HTTPException(status_code=500, detail="Email service is not configured properly.")

    try:
        await email_service.send_email(
            subject=email_data.subject,
            recipients=email_data.to,
            body={"message": email_data.message}
        )
        return {"message": "Email sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
