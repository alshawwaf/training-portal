from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Class
from services.proxmox_service import proxmox_service
from datetime import datetime

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    # 1. Fetch Classes for stats
    classes = db.query(Class).all()
    
    # Total Students (sum of max_users)
    total_students = sum(c.max_users for c in classes)
    
    # Upcoming/Active Classes
    # We can refine this logic based on status or dates
    upcoming_classes = len([c for c in classes if c.status == 'upcoming' or (c.start_date and c.start_date > datetime.utcnow())])
    
    # 2. Fetch Active Environments (Running VMs)
    active_environments = 0
    try:
        vms = proxmox_service.get_vms()
        if vms:
            # Count VMs that are running
            active_environments = len([vm for vm in vms if vm.get('status') == 'running'])
    except Exception as e:
        print(f"Error fetching Proxmox stats: {e}")
        # non-critical, default to 0
        
    return {
        "active_environments": active_environments,
        "total_students": total_students,
        "upcoming_classes": upcoming_classes,
        "total_classes": len(classes)
    }
