from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import UserPreference, User
from pydantic import BaseModel
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
def get_preferences(db: Session = Depends(get_db)):
    # In a real app, we'd get user from token. For now, use admin user
    user_email = os.getenv("SUPERADMIN_EMAIL", "admin@cpdemo.com")
    user = db.query(User).filter(User.email == user_email).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if not prefs:
        # Create default preferences
        prefs = UserPreference(user_id=user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    
    return prefs

@router.put("/", response_model=PreferenceRead)
def update_preferences(pref_update: PreferenceUpdate, db: Session = Depends(get_db)):
    user_email = os.getenv("SUPERADMIN_EMAIL", "admin@cpdemo.com")
    user = db.query(User).filter(User.email == user_email).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if not prefs:
        prefs = UserPreference(user_id=user.id)
        db.add(prefs)
    
    if pref_update.email_notifications is not None:
        prefs.email_notifications = pref_update.email_notifications
    if pref_update.browser_notifications is not None:
        prefs.browser_notifications = pref_update.browser_notifications
    
    db.commit()
    db.refresh(prefs)
    return prefs
