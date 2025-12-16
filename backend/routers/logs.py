from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from db.database import get_db
from db.models import ActionLog, User
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/logs", tags=["logs"])

# Pydantic Schemas
class ActionLogRead(BaseModel):
    id: int
    action: str
    entity_name: str
    status: str
    details: Optional[str]
    user_id: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True

# Helper Function
def log_action(db: Session, action: str, entity_name: str, status: str, details: str = None, user_id: int = None):
    """
    Log a system action.
    This can be called from other routers.
    """
    try:
        new_log = ActionLog(
            action=action,
            entity_name=entity_name,
            status=status,
            details=details,
            user_id=user_id
        )
        db.add(new_log)
        db.commit()
    except Exception as e:
        print(f"Failed to write log: {e}") # Non-blocking error

@router.get("/", response_model=List[ActionLogRead])
def get_logs(
    skip: int = 0, 
    limit: int = 50, 
    action: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Fetch paginated system logs"""
    query = db.query(ActionLog).order_by(desc(ActionLog.created_at))
    
    if action:
        query = query.filter(ActionLog.action == action)
        
    return query.offset(skip).limit(limit).all()
