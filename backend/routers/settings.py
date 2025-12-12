from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import SystemSetting
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/settings", tags=["settings"])

class SettingBase(BaseModel):
    key: str
    value: str
    category: str
    description: Optional[str] = None
    is_secret: bool = False

class SettingUpdate(BaseModel):
    value: str

class SettingRead(SettingBase):
    pass

    class Config:
        from_attributes = True

@router.get("/", response_model=List[SettingRead])
def get_settings(category: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(SystemSetting)
    if category:
        query = query.filter(SystemSetting.category == category)
    
    settings = query.all()
    
    # Mask secrets
    for s in settings:
        if s.is_secret and s.value:
            s.value = "********"
            
    return settings

from services.email_service import email_service

@router.put("/{key}", response_model=SettingRead)
async def update_setting(key: str, setting: SettingUpdate, db: Session = Depends(get_db)):
    db_setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not db_setting:
        # Create if not exists (for convenience)
        # But usually we want restricted creation. For now, we allow update to act as upsert if needed,
        # or just fail. Let's fail for now to enforce seeding, or upsert? Upsert is better for flexibility.
        raise HTTPException(status_code=404, detail="Setting not found")
    
    db_setting.value = setting.value
    db.commit()
    db.refresh(db_setting)
    
    # Reload email config if an SMTP setting was changed
    if db_setting.category == "smtp":
        await email_service.load_config(db)
    
    # Mask if secret
    if db_setting.is_secret:
        db_setting.value = "********"
        
    return db_setting

@router.post("/", response_model=SettingRead)
async def create_setting(setting: SettingBase, db: Session = Depends(get_db)):
    db_setting = db.query(SystemSetting).filter(SystemSetting.key == setting.key).first()
    if db_setting:
        raise HTTPException(status_code=400, detail="Setting already exists")
    
    new_setting = SystemSetting(**setting.dict())
    db.add(new_setting)
    db.commit()
    db.refresh(new_setting)

    # Reload email config if an SMTP setting was created
    if new_setting.category == "smtp":
        await email_service.load_config(db)
        
    return new_setting
