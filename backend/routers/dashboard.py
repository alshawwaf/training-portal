from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Class
from services.vsphere_service import vsphere_service
from services.proxmox_service import proxmox_service
from datetime import datetime

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    vendor: str = Query("vsphere", description="Vendor to fetch VM stats from: vsphere, proxmox, or all")
):
    # 1. Fetch Classes for stats
    classes = db.query(Class).all()
    
    # Total Students (sum of max_users)
    total_students = sum(c.max_users for c in classes)
    
    # Upcoming/Active Classes
    upcoming_classes = len([c for c in classes if c.status == 'upcoming' or (c.start_date and c.start_date > datetime.utcnow())])
    
    # 2. Fetch Active Environments based on vendor selection
    active_environments = 0
    
    if vendor in ["vsphere", "all"]:
        try:
            inventory = vsphere_service.get_inventory()
            if inventory and 'vms' in inventory:
                active_environments += len([vm for vm in inventory['vms'] if vm.get('power_state') == 'poweredOn'])
        except Exception as e:
            print(f"Error fetching vSphere stats: {e}")
    
    if vendor in ["proxmox", "all"]:
        try:
            vms = proxmox_service.get_vms()
            if vms:
                active_environments += len([vm for vm in vms if vm.get('status') == 'running'])
        except Exception as e:
            print(f"Error fetching Proxmox stats: {e}")
        
    return {
        "active_environments": active_environments,
        "total_students": total_students,
        "upcoming_classes": upcoming_classes,
        "total_classes": len(classes),
        "vendor": vendor
    }
