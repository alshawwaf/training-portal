from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Class, ClassStatus
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
import json
import os
from pathlib import Path

router = APIRouter(prefix="/classes", tags=["classes"])

# JSON backup directory
BACKUP_DIR = Path("data/backups/classes")
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

# Status choices for validation
VALID_STATUSES = [s.value for s in ClassStatus]

# Pydantic Schemas
class ClassCreate(BaseModel):
    name: str
    blueprint_id: str
    max_users: int
    passcode: str
    start_date: datetime
    end_date: datetime
    status: Optional[str] = "draft"
    description: Optional[str] = None

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    blueprint_id: Optional[str] = None
    max_users: Optional[int] = None
    passcode: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    description: Optional[str] = None

class ClassRead(BaseModel):
    id: int
    name: str
    blueprint_id: str
    max_users: int
    passcode: str
    start_date: datetime
    end_date: datetime
    instructor_id: int
    status: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

def save_backup(db_class: Class):
    """Save a JSON backup of the class"""
    backup_file = BACKUP_DIR / f"class_{db_class.id}.json"
    backup_data = {
        "class": db_class.to_dict(),
        "backup_timestamp": datetime.utcnow().isoformat(),
        "version": 1
    }
    with open(backup_file, 'w') as f:
        json.dump(backup_data, f, indent=2)

def save_all_backups(db: Session):
    """Save backup of all classes"""
    classes = db.query(Class).all()
    all_backup = {
        "classes": [c.to_dict() for c in classes],
        "backup_timestamp": datetime.utcnow().isoformat(),
        "total_count": len(classes)
    }
    with open(BACKUP_DIR / "all_classes.json", 'w') as f:
        json.dump(all_backup, f, indent=2)

# CREATE
@router.post("/", response_model=ClassRead)
def create_class(cls: ClassCreate, db: Session = Depends(get_db)):
    # Validate status
    status = cls.status if cls.status in VALID_STATUSES else "draft"
    
    db_class = Class(
        name=cls.name,
        blueprint_id=cls.blueprint_id,
        max_users=cls.max_users,
        passcode=cls.passcode,
        start_date=cls.start_date,
        end_date=cls.end_date,
        status=status,
        description=cls.description,
        instructor_id=1  # Mock instructor
    )
    db.add(db_class)
    db.commit()
    db.refresh(db_class)
    
    # Save JSON backup
    save_backup(db_class)
    save_all_backups(db)
    
    return db_class

# READ ALL
@router.get("/", response_model=List[ClassRead])
def list_classes(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Class)
    if status and status in VALID_STATUSES:
        query = query.filter(Class.status == status)
    return query.all()

# READ ONE
@router.get("/{class_id}", response_model=ClassRead)
def get_class(class_id: int, db: Session = Depends(get_db)):
    db_class = db.query(Class).filter(Class.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")
    return db_class

# UPDATE
@router.put("/{class_id}", response_model=ClassRead)
def update_class(class_id: int, cls: ClassUpdate, db: Session = Depends(get_db)):
    db_class = db.query(Class).filter(Class.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")
    
    update_data = cls.dict(exclude_unset=True)
    
    # Validate status if provided
    if 'status' in update_data and update_data['status'] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {VALID_STATUSES}")
    
    for key, value in update_data.items():
        setattr(db_class, key, value)
    
    db.commit()
    db.refresh(db_class)
    
    # Save JSON backup
    save_backup(db_class)
    save_all_backups(db)
    
    return db_class

# DELETE
@router.delete("/{class_id}")
def delete_class(class_id: int, db: Session = Depends(get_db)):
    db_class = db.query(Class).filter(Class.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Archive backup before deletion
    archive_file = BACKUP_DIR / f"class_{class_id}_archived_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    archive_data = {
        "class": db_class.to_dict(),
        "archived_at": datetime.utcnow().isoformat(),
        "reason": "deleted"
    }
    with open(archive_file, 'w') as f:
        json.dump(archive_data, f, indent=2)
    
    db.delete(db_class)
    db.commit()
    
    # Update all_classes backup
    save_all_backups(db)
    
    # Remove individual backup
    backup_file = BACKUP_DIR / f"class_{class_id}.json"
    if backup_file.exists():
        backup_file.unlink()
    
    return {"message": "Class deleted successfully"}

# GET STATUSES
@router.get("/meta/statuses")
def get_statuses():
    """Return all available class statuses"""
    return {
        "statuses": [
            {"value": "draft", "label": "Draft", "color": "gray"},
            {"value": "upcoming", "label": "Upcoming", "color": "blue"},
            {"value": "active", "label": "Active", "color": "green"},
            {"value": "completed", "label": "Completed", "color": "purple"},
            {"value": "cancelled", "label": "Cancelled", "color": "red"},
            {"value": "postponed", "label": "Postponed", "color": "amber"},
        ]
    }

# EXPORT BACKUP
@router.get("/backup/export")
def export_backup(db: Session = Depends(get_db)):
    """Export all classes as JSON"""
    classes = db.query(Class).all()
    return {
        "classes": [c.to_dict() for c in classes],
        "exported_at": datetime.utcnow().isoformat(),
        "total_count": len(classes)
    }
