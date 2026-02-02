from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import UserPreference, User
from pydantic import BaseModel
from .auth import get_current_user
import os

router = APIRouter(prefix="/preferences", tags=["preferences"])

class PreferenceRead(BaseModel):
    email_notifications: bool
    browser_notifications: bool

    class Config:
        from_attributes = True

class PreferenceUpdate(BaseModel):
    email_notifications: bool = None
    browser_notifications: bool = None

@router.get("/", response_model=PreferenceRead)
def get_preferences(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        prefs = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
        if not prefs:
            from services.logging_service import logging_service
            # Create default preferences
            try:
                prefs = UserPreference(user_id=current_user.id)
                db.add(prefs)
                db.commit()
                db.refresh(prefs)
            except Exception as e:
                db.rollback()
                # Handle race condition where it might have been created by another request
                prefs = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
                if not prefs:
                    logging_service.log_action(db, "CREATE_PREFS_ERROR", f"User {current_user.id}", "ERROR", "APP", str(e), current_user.id)
                    raise e
        
        return prefs
    except Exception as e:
        # Catch all to prevent 500 crash without logs
        import traceback
        print(f"Preferences Error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to load preferences: {str(e)}")

@router.put("/", response_model=PreferenceRead)
def update_preferences(pref_update: PreferenceUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    prefs = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    if not prefs:
        prefs = UserPreference(user_id=current_user.id)
        db.add(prefs)
    
    if pref_update.email_notifications is not None:
        prefs.email_notifications = pref_update.email_notifications
    if pref_update.browser_notifications is not None:
        prefs.browser_notifications = pref_update.browser_notifications
    
    db.commit()
    db.refresh(prefs)
    return prefs
