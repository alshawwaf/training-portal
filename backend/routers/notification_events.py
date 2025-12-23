from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import NotificationEvent
from pydantic import BaseModel
from typing import List, Optional
from services.logging_service import logging_service
from .auth import get_admin_user
from db.models import User

router = APIRouter(prefix="/notification-events", tags=["notification-events"])


class NotificationEventRead(BaseModel):
    id: int
    event_type: str
    name: str
    description: Optional[str] = None
    email_enabled: bool

    class Config:
        from_attributes = True


class NotificationEventUpdate(BaseModel):
    email_enabled: bool


@router.get("/", response_model=List[NotificationEventRead])
def get_notification_events(db: Session = Depends(get_db)):
    """Get all configurable notification events."""
    events = db.query(NotificationEvent).order_by(NotificationEvent.name).all()
    return events


@router.put("/{event_type}", response_model=NotificationEventRead)
def update_notification_event(
    event_type: str, 
    update: NotificationEventUpdate, 
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Update a notification event's email enabled status."""
    event = db.query(NotificationEvent).filter(NotificationEvent.event_type == event_type).first()
    if not event:
        raise HTTPException(status_code=404, detail="Notification event not found")
    
    old_status = event.email_enabled
    event.email_enabled = update.email_enabled
    db.commit()
    db.refresh(event)
    
    # Log the change
    status_text = "enabled" if update.email_enabled else "disabled"
    logging_service.log_action(
        db, "UPDATE_NOTIFICATION_EVENT", f"{event.name}", 
        "SUCCESS", "EMAIL", f"Notification '{event.name}' {status_text}", 
        user_id=admin.id
    )
    
    return event


@router.post("/bulk-update")
def bulk_update_notification_events(
    updates: dict,  # {"event_type": bool, ...}
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """Bulk update multiple notification events."""
    updated_count = 0
    for event_type, enabled in updates.items():
        event = db.query(NotificationEvent).filter(NotificationEvent.event_type == event_type).first()
        if event:
            event.email_enabled = enabled
            updated_count += 1
    
    db.commit()
    
    logging_service.log_action(
        db, "BULK_UPDATE_NOTIFICATIONS", f"{updated_count} events", 
        "SUCCESS", "EMAIL", f"Updated {updated_count} notification event settings", 
        user_id=admin.id
    )
    
    return {"message": f"Updated {updated_count} notification events"}

