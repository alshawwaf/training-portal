from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Class, User, ClassEnvironment
from .auth import get_instructor_user
from services.vsphere_service import vsphere_service
from services.proxmox_service import proxmox_service
from db.models import InfrastructureConnection
from datetime import datetime

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    vendor: str = Query("vsphere", description="Vendor to fetch VM stats from: vsphere, proxmox, or all"),
    current_user: User = Depends(get_instructor_user)
):
    # 1. Fetch Classes for stats
    classes = db.query(Class).all()
    
    # Total Students (sum of max_users)
    total_students = sum(c.max_users for c in classes)
    
    # Upcoming/Active Classes
    upcoming_classes = len([c for c in classes if c.status == 'upcoming' or (c.start_date and c.start_date > datetime.utcnow())])
    
    # 2. Fetch Active Environments based on active classes
    # We count provisioned environments for classes that are currently 'active'
    active_environments = db.query(ClassEnvironment)\
        .join(Class)\
        .filter(Class.status == 'active')\
        .count()
    
    return {
        "active_environments": active_environments,
        "total_students": total_students,
        "upcoming_classes": upcoming_classes,
        "total_classes": len(classes),
        "vendor": vendor
    }
