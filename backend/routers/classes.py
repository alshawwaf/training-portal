from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Class, ClassStatus, ClassEnvironment, EnvironmentVM, Template
from services.vsphere_service import vsphere_service
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
    blueprint_id: Optional[str] = None # Legacy Proxmox
    template_id: Optional[int] = None # vSphere Template ID
    max_users: int
    passcode: str
    start_date: datetime
    end_date: datetime
    status: Optional[str] = "draft"
    description: Optional[str] = None

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    blueprint_id: Optional[str] = None
    template_id: Optional[int] = None
    max_users: Optional[int] = None
    passcode: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    description: Optional[str] = None

# Template Info Schema
class TemplateInfo(BaseModel):
    id: int
    name: str
    icon: str
    provider: str
    
    class Config:
        from_attributes = True

class ClassRead(BaseModel):
    id: int
    name: str
    blueprint_id: Optional[str] = None
    template_id: Optional[int] = None
    template: Optional[TemplateInfo] = None
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
        template_id=cls.template_id,
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
    from sqlalchemy.orm import joinedload
    
    query = db.query(Class).options(joinedload(Class.template))
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
    
    # Clean up vSphere resources (DELETE VMs)
    # Re-use the delete_all_environments logic but we need to call it directly
    # Since delete_all_environments is a route handler, we should extract the logic or call it carefully.
    # Ideally, we should refactor the logic into a service or a helper function.
    # For now, let's just call the logic directly here or call the function if possible (dependency injection makes it tricky).
    # Easier: Just duplicate the loop or move logic to a helper.
    # Let's move logic to a helper function within this file or just implement it here to be safe and explicit.
    
    environments = db.query(ClassEnvironment).filter(ClassEnvironment.class_id == class_id).all()
    for env in environments:
        # Delete VMs
        for vm in env.vms:
            try:
                vsphere_service.delete_vm(vm.vm_moid)
            except Exception as e:
                print(f"Failed to delete VM {vm.vm_name}: {e}")
            db.delete(vm)
        db.delete(env)

    
    # Delete the Class Folder from vSphere
    # Assuming the folder structure is SE_Training_Portal/[ClassName]
    try:
        vsphere_service.delete_folder(db_class.name)
    except Exception as e:
         print(f"Failed to delete folder {db_class.name}: {e}")

    db.delete(db_class)
    db.commit()
    
    # Update all_classes backup
    save_all_backups(db)
    
    # Remove individual backup
    backup_file = BACKUP_DIR / f"class_{class_id}.json"
    if backup_file.exists():
        backup_file.unlink()
    
    return {"message": "Class and all associated resources deleted successfully"}

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

# PROVISION CLASS
@router.post("/{class_id}/provision")
def provision_class(class_id: int, db: Session = Depends(get_db)):
    """Provision environments for the class based on selected template"""
    db_class = db.query(Class).filter(Class.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")

    if not db_class.template_id:
        raise HTTPException(status_code=400, detail="Class does not have a vSphere template assigned")

    # Check if already provisioned
    existing_envs = db.query(ClassEnvironment).filter(ClassEnvironment.class_id == class_id).count()
    if existing_envs > 0:
        raise HTTPException(status_code=400, detail="Class environments already provisioned")

    # Get Template details
    template = db.query(Template).filter(Template.id == db_class.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Assigned template not found")

    if not template.vms:
         raise HTTPException(status_code=400, detail="Template has no VMs to provision")

    provisioned_count = 0
    errors = []

    try:
        # Create environments for max_users
        for i in range(1, db_class.max_users + 1):
            env_name = f"Student {i}"
            
            # Create Environment Record
            env = ClassEnvironment(
                class_id=class_id,
                name=env_name
            )
            db.add(env)
            db.flush() # Get ID

            # Provision VMs for this environment
            for tmpl_vm in template.vms:
                new_vm_name = f"{db_class.name}-{env_name}-{tmpl_vm.vm_name}".replace(" ", "_")
                
                # Call vSphere Service to clone/provision
                folder_path = ["SE_Training_Portal", db_class.name, env_name]
                result = vsphere_service.provision_vm(
                    vm_moid=tmpl_vm.vm_moid,
                    new_name=new_vm_name,
                    folder_path=folder_path
                )
                
                if result["success"]:
                    # Create Environment VM Record
                    env_vm = EnvironmentVM(
                        env_id=env.id,
                        vm_name=result.get("vm_name", new_vm_name),
                        vm_moid=result.get("vm_moid", "unknown"),
                        ip_address=result.get("ip_address"),
                        access_url=None 
                    )
                    db.add(env_vm)
                else:
                    errors.append(f"Failed to provision {new_vm_name}: {result['message']}")
                    # Prevent zombie environment
                    db.delete(env)
            
            provisioned_count += 1
            
        db.commit()
        
        return {
            "success": True, 
            "message": f"Provisioned {provisioned_count} environments",
            "errors": errors
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# LIST ENVIRONMENTS
@router.get("/{class_id}/environments")
def get_class_environments(class_id: int, db: Session = Depends(get_db)):
    """Get all environments for a class including VM details and power state"""
    db_class = db.query(Class).filter(Class.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")

    envs = db.query(ClassEnvironment).filter(ClassEnvironment.class_id == class_id).all()
    
    result = []
    for env in envs:
        vms = db.query(EnvironmentVM).filter(EnvironmentVM.env_id == env.id).all()
        vm_list = []
        for vm in vms:
            # Fetch latest state from vSphere (mock or real)
            state_info = vsphere_service.get_vm_power_state(vm.vm_moid)
            vm_list.append({
                "id": vm.id,
                "name": vm.vm_name,
                "moid": vm.vm_moid,
                "ip_address": vm.ip_address,
                "power_state": state_info.get("state", "unknown"),
                "access_url": vm.access_url
            })
            
        result.append({
            "id": env.id,
            "name": env.name,
            "user_id": env.user_id,
            "created_at": env.created_at,
            "vms": vm_list
        })
        
    return result

class VMPowerAction(BaseModel):
    action: str # start, stop, restart, reset

# CONTROL VM POWER
@router.post("/environments/{class_id}/vms/{vm_id}/power")
def control_vm_power(class_id: int, vm_id: int, body: VMPowerAction, db: Session = Depends(get_db)):
    """Control power state of a specific VM in an environment"""
    vm = db.query(EnvironmentVM).filter(EnvironmentVM.id == vm_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
        
    # Verify VM belongs to an environment of the class (security check)
    env = db.query(ClassEnvironment).filter(ClassEnvironment.id == vm.env_id).first()
    if not env or env.class_id != class_id:
        raise HTTPException(status_code=403, detail="VM does not belong to this class")

    result = vsphere_service.control_vm_power(vm.vm_moid, body.action)
    
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
        
    return result

@router.delete("/environments/{class_id}/vms/{vm_id}")
def delete_vm(class_id: int, vm_id: int, db: Session = Depends(get_db)):
    """Delete a specific VM from an environment"""
    vm = db.query(EnvironmentVM).filter(EnvironmentVM.id == vm_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
        
    # Verify VM belongs to an environment of the class (security check)
    env = db.query(ClassEnvironment).filter(ClassEnvironment.id == vm.env_id).first()
    if not env or env.class_id != class_id:
        raise HTTPException(status_code=403, detail="VM does not belong to this class")

    # Call service to delete from vSphere
    result = vsphere_service.delete_vm(vm.vm_moid)
    
    if not result["success"]:
        # If VM not found in vSphere, we still want to delete from DB to clean up "zombies"
        if "not found" in str(result.get("message", "")).lower():
             pass 
        else:
             raise HTTPException(status_code=500, detail=result["message"])
        
    # Remove from DB
    db.delete(vm)
    db.commit()
        
    return {"success": True, "message": "VM deleted"}

@router.post("/environments/{env_id}/power")
def control_environment_power(env_id: int, body: VMPowerAction, db: Session = Depends(get_db)):
    """Control power state of all VMs in an environment"""
    env = db.query(ClassEnvironment).filter(ClassEnvironment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
        
    success_count = 0
    errors = []
    
    for vm in env.vms:
        try:
            result = vsphere_service.control_vm_power(vm.vm_moid, body.action)
            if result["success"]:
                success_count += 1
                # Update DB state if returned
                if result.get("power_state"):
                     vm.power_state = result["power_state"] # Note: control_vm_power implies this update in service? 
                     # Service returns new_state but usually doesn't update DB. 
                     # Actually control_vm_power endpoint updates DB. Service does NOT update DB.
                     # We must update DB here.
            else:
                errors.append(f"{vm.name}: {result.get('message', 'Unknown error')}")
                
        except Exception as e:
            errors.append(f"{vm.name}: {str(e)}")
            
    db.commit()

    return {
        "success": len(errors) == 0,
        "message": f"Power action '{body.action}' completed for {success_count} VMs",
        "errors": errors if errors else None
    }

@router.post("/environments/{env_id}/revert")
def revert_environment(env_id: int, db: Session = Depends(get_db)):
    """Revert all VMs in an environment to their initial snapshot"""
    env = db.query(ClassEnvironment).filter(ClassEnvironment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
        
    success_count = 0
    errors = []
    
    for vm in env.vms:
        try:
            result = vsphere_service.revert_vm(vm.vm_moid)
            if result["success"]:
                success_count += 1
            else:
                errors.append(f"{vm.name}: {result.get('message', 'Unknown error')}")
        except Exception as e:
            errors.append(f"{vm.name}: {str(e)}")
            
    return {
        "success": len(errors) == 0,
        "message": f"Reverted {success_count} VMs",
        "errors": errors if errors else None
    }

@router.delete("/environments/{env_id}")
def delete_environment_by_id(env_id: int, db: Session = Depends(get_db)):
    """Delete an environment by ID and all its VMs"""
    env = db.query(ClassEnvironment).filter(ClassEnvironment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
        
    success_count = 0
    errors = []
    
    # Create list of VMs to delete to avoid modification during iteration issues
    vms_to_delete = list(env.vms)
    
    for vm in vms_to_delete:
        try:
            # Delete from vSphere
            result = vsphere_service.delete_vm(vm.vm_moid)
            if not result["success"] and "not found" not in str(result.get("message", "")).lower():
                 errors.append(f"{vm.name}: {result.get('message', 'Unknown error')}")
            
            # Delete from DB
            db.delete(vm)
            success_count += 1
        except Exception as e:
            errors.append(f"{vm.name}: {str(e)}")
            
    # Delete environment from DB
    db.delete(env)
    db.commit()
    
    return {
        "success": len(errors) == 0,
        "message": f"Deleted environment with {success_count} VMs",
        "errors": errors if errors else None
    }

# BULK ACTIONS
@router.post("/{class_id}/environments/suspend-all")
def suspend_all_vms(class_id: int, db: Session = Depends(get_db)):
    """Suspend all VMs in all environments for a class"""
    db_class = db.query(Class).filter(Class.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")
    
    environments = db.query(ClassEnvironment).filter(ClassEnvironment.class_id == class_id).all()
    
    success_count = 0
    errors = []
    
    for env in environments:
        for vm in env.vms:
            try:
                result = vsphere_service.control_vm_power(vm.vm_moid, "suspend")
                if result["success"]:
                    success_count += 1
                else:
                    errors.append(f"{vm.name}: {result.get('message', 'Unknown error')}")
            except Exception as e:
                errors.append(f"{vm.name}: {str(e)}")
    
    return {
        "success": len(errors) == 0,
        "message": f"Suspended {success_count} VMs",
        "errors": errors if errors else None
    }


@router.post("/{class_id}/environments/revert-all")
def revert_all_vms(class_id: int, db: Session = Depends(get_db)):
    """Revert all VMs to their initial snapshot in all environments for a class"""
    db_class = db.query(Class).filter(Class.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")
    
    environments = db.query(ClassEnvironment).filter(ClassEnvironment.class_id == class_id).all()
    
    success_count = 0
    errors = []
    
    for env in environments:
        for vm in env.vms:
            try:
                result = vsphere_service.revert_vm(vm.vm_moid)
                if result["success"]:
                    success_count += 1
                else:
                    errors.append(f"{vm.name}: {result.get('message', 'Unknown error')}")
            except Exception as e:
                errors.append(f"{vm.name}: {str(e)}")
    
    return {
        "success": len(errors) == 0,
        "message": f"Reverted {success_count} VMs",
        "errors": errors if errors else None
    }


@router.delete("/{class_id}/environments")
def delete_all_environments(class_id: int, db: Session = Depends(get_db)):
    """Delete all environments and their VMs for a class"""
    db_class = db.query(Class).filter(Class.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")
    
    environments = db.query(ClassEnvironment).filter(ClassEnvironment.class_id == class_id).all()
    
    success_count = 0
    errors = []
    
    for env in environments:
        for vm in env.vms:
            try:
                result = vsphere_service.delete_vm(vm.vm_moid)
                if result["success"]:
                    success_count += 1
                else:
                    # Ignore "not found" errors (zombie cleanup)
                    if "not found" not in str(result.get("message", "")).lower():
                        errors.append(f"{vm.name}: {result.get('message', 'Unknown error')}")
                # Delete from DB regardless
                db.delete(vm)
            except Exception as e:
                errors.append(f"{vm.name}: {str(e)}")
        
        # Delete environment
        db.delete(env)
    
    db.commit()
    
    return {
        "success": len(errors) == 0,
        "message": f"Deleted {success_count} VMs and {len(environments)} environments",
        "errors": errors if errors else None
    }
