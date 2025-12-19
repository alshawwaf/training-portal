from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Class, ClassStatus, ClassEnvironment, EnvironmentVM, Template, TemplateVM
from services.vsphere_service import vsphere_service
from services.guacamole_service import guacamole_service
from services.logging_service import logging_service
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
import json
import base64
import os
import uuid
from pathlib import Path

import logging
router = APIRouter(prefix="/classes", tags=["classes"])
logger = logging.getLogger("classes")

# Import auth dependency
from .auth import get_current_user
from db.models import User

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
    passcode: str = "Cpwins!1"  # Default password
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
    join_token: Optional[str] = None  # Shareable link token
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
def create_class(cls: ClassCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Validate status
    status = cls.status if cls.status in VALID_STATUSES else "draft"
    
    # Check for existing class with same name
    existing_class = db.query(Class).filter(Class.name == cls.name).first()
    if existing_class:
        raise HTTPException(status_code=400, detail="Class name already exists")
    
    # Generate unique join token for shareable link
    join_token = str(uuid.uuid4())[:8]  # Short 8-char token
    
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
        instructor_id=current_user.id,  # Set to current user
        join_token=join_token
    )
    db.add(db_class)
    db.commit()
    db.refresh(db_class)
    
    # Log Action
    logging_service.log_action(db, "CREATE_CLASS", f"Class: {db_class.name}", "SUCCESS", f"Created class with template {cls.template_id}", user_id=current_user.id)

    # Save JSON backup
    save_backup(db_class)
    save_all_backups(db)
    
    return db_class

# READ ALL - Role-based filtering
@router.get("/", response_model=List[ClassRead])
def list_classes(status: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy.orm import joinedload
    
    query = db.query(Class).options(joinedload(Class.template))
    
    # Role-based filtering
    is_admin = current_user.role in ['admin', 'super_admin', 'administrator']
    
    if not is_admin:
        if current_user.role == 'instructor':
            # Instructors see only their own classes
            query = query.filter(Class.instructor_id == current_user.id)
        else:
            # Students see only classes they're enrolled in (have an environment)
            enrolled_class_ids = db.query(ClassEnvironment.class_id).filter(
                ClassEnvironment.user_id == current_user.id
            ).subquery()
            query = query.filter(Class.id.in_(enrolled_class_ids))
    
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
        
    # Check for name uniqueness if name is being updated
    if cls.name and cls.name != db_class.name:
        existing_class = db.query(Class).filter(Class.name == cls.name).first()
        if existing_class:
            raise HTTPException(status_code=400, detail="Class name already exists")
    
    for key, value in update_data.items():
        setattr(db_class, key, value)
    
    db.commit()
    db.refresh(db_class)
    
    # Save JSON backup
    save_backup(db_class)
    save_all_backups(db)
    
    return db_class

# DELETE
# DELETE
@router.delete("/{class_id}")
async def delete_class(class_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import StreamingResponse
    import json
    
    # Pre-validation (Synchronous)
    db_class = db.query(Class).filter(Class.id == class_id).first()
    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")
        
    class_name = db_class.name
    
    async def generate_updates():
        from db.database import SessionLocal
        session = SessionLocal()
        
        try:
            # Re-fetch class
            current_class = session.query(Class).filter(Class.id == class_id).first()
            if not current_class:
                yield json.dumps({"status": "error", "message": "Class not found during execution"}) + "\n"
                return

            logging_service.log_action(session, "DELETE_CLASS", f"Class: {class_name}", "STARTED", "Started deletion process")
            yield json.dumps({"status": "info", "message": f"Starting deletion for {class_name}..."}) + "\n"
            
            # Archive backup
            yield json.dumps({"status": "progress", "message": "Archiving class data...", "percent": 10}) + "\n"
            archive_file = BACKUP_DIR / f"class_{class_id}_archived_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
            archive_data = {
                "class": current_class.to_dict(),
                "archived_at": datetime.utcnow().isoformat(),
                "reason": "deleted"
            }
            with open(archive_file, 'w') as f:
                json.dump(archive_data, f, indent=2)
                
            # Delete VMs/Environments
            environments = session.query(ClassEnvironment).filter(ClassEnvironment.class_id == class_id).all()
            total_envs = len(environments)
            
            for i, env in enumerate(environments):
                yield json.dumps({"status": "progress", "message": f"Deleting environment: {env.name}...", "percent": 10 + int((i/total_envs)*60)}) + "\n"
                
                for vm in env.vms:
                    yield json.dumps({"status": "detail", "message": f"  - Deleting VM: {vm.vm_name}..."}) + "\n"
                    try:
                        # Get connection_id from template
                        connection_id = current_class.template.connection_id if current_class.template else None
                        vsphere_service.delete_vm(vm.vm_moid, connection_id=connection_id)
                    except Exception as e:
                        print(f"Failed to delete VM {vm.vm_name}: {e}")
                        yield json.dumps({"status": "warning", "message": f"    Failed to delete VM {vm.vm_name} from vSphere"}) + "\n"
                    session.delete(vm)
                
                session.delete(env)
                session.commit()
            
            # Delete Folder
            yield json.dumps({"status": "progress", "message": "Cleaning up vSphere resources...", "percent": 80}) + "\n"
            try:
                # Get connection_id from template
                connection_id = current_class.template.connection_id if current_class.template else None
                vsphere_service.delete_folder(class_name, connection_id=connection_id)
            except Exception as e:
                print(f"Failed to delete folder {class_name}: {e}")
                yield json.dumps({"status": "warning", "message": f"Failed to delete vSphere folder"}) + "\n"

            # Delete Class Record
            session.delete(current_class)
            session.commit()
            
            # Update Backups
            yield json.dumps({"status": "progress", "message": "Updating backups...", "percent": 90}) + "\n"
            save_all_backups(session)
            
            backup_file = BACKUP_DIR / f"class_{class_id}.json"
            if backup_file.exists():
                backup_file.unlink()

            logging_service.log_action(session, "DELETE_CLASS", f"Class: {class_name}", "SUCCESS", "Deleted class and associated resources")
            yield json.dumps({"status": "completed", "message": "Class and all associated resources deleted successfully", "percent": 100}) + "\n"
            
        except Exception as e:
            logging_service.log_action(session, "DELETE_CLASS", f"Class: {class_name}", "ERROR", f"Deletion failed: {str(e)}")
            yield json.dumps({"status": "error", "message": f"Critical Failure: {str(e)}"}) + "\n"
        finally:
            session.close()

    return StreamingResponse(generate_updates(), media_type="application/x-ndjson")

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

# PROVISION CLASS (STREAMING)
@router.post("/{class_id}/provision")
async def provision_class(class_id: int, db: Session = Depends(get_db)):
    """Provision environments for the class with streaming status updates"""
    from fastapi.responses import StreamingResponse
    import json
    import time

    # Pre-validation (Synchronous checks before stream starts)
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

    # Generator for Streaming Response
    async def generate_updates():
        # Session for DB operations in main loop
        from db.database import SessionLocal
        session = SessionLocal()
        
        try:
            # Re-fetch objects
            current_class = session.query(Class).filter(Class.id == class_id).first()
            if not current_class:
                raise Exception("Class not found during provisioning execution")
            
            # Re-fetch template
            current_template = session.query(Template).filter(Template.id == current_class.template_id).first()
            if not current_template:
                raise Exception("Template not found during provisioning execution")
                
            max_users = current_class.max_users
            class_name = current_class.name
            
            # Log Start
            logging_service.log_action(session, "PROVISION_CLASS", f"Class: {class_name}", "STARTED", f"Started provisioning for {max_users} students")
            yield json.dumps({"status": "info", "message": f"Starting provisioning for {class_name}..."}) + "\n"

            # 1. Create all ClassEnvironment records first
            environments = []
            for i in range(1, max_users + 1):
                env_name = f"Student {i}"
                env = ClassEnvironment(class_id=class_id, name=env_name)
                session.add(env)
                session.commit()
                session.refresh(env)
                environments.append(env)
                yield json.dumps({"status": "progress", "message": f"Created environment record: {env_name}", "percent": 5}) + "\n"

            # 2. Prepare Provisioning Tasks
            import asyncio
            import os
            import logging
            
            provisioning_mode = os.getenv("PROVISIONING_MODE", "parallel").lower()
            vsphere_logger = logging.getLogger("vsphere")
            
            tasks = []
            # Limit concurrency to avoid overwhelming vCenter
            concurrency_limit = 5 
            semaphore = asyncio.Semaphore(concurrency_limit) # only used in parallel mode

            # Helper for single VM provision
            async def provision_single_vm(env, tmpl_vm):
                vm_name = f"{class_name}-{env.name}-{tmpl_vm.vm_name}".replace(" ", "_")
                folder_path = ["SE_Training_Portal", class_name, env.name]
                
                # Wrapper to include metadata in result
                def do_provision():
                    return vsphere_service.provision_vm(
                        vm_moid=tmpl_vm.vm_moid,
                        new_name=vm_name,
                        folder_path=folder_path,
                        connection_id=current_template.connection_id
                    )

                if provisioning_mode == "parallel":
                    async with semaphore:
                        loop = asyncio.get_event_loop()
                        # Run blocking call in executor
                        result = await loop.run_in_executor(None, do_provision)
                else:
                    # Sequential mode (just await the executor without semaphore or run directly if async - but service is sync)
                    loop = asyncio.get_event_loop()
                    result = await loop.run_in_executor(None, do_provision)

                return {
                    "result": result,
                    "env_id": env.id,
                    "vm_name": vm_name,
                    "tmpl_vm_name": tmpl_vm.vm_name,
                    "guest_os": tmpl_vm.guest_os,  # Guest OS from template
                    "access_protocol": tmpl_vm.access_protocol,  # Protocol from template
                    "access_port": tmpl_vm.access_port  # Port from template
                }

            # Queue tasks
            for env in environments:
                for tmpl_vm in current_template.vms:
                    tasks.append(provision_single_vm(env, tmpl_vm))

            yield json.dumps({"status": "info", "message": f"Queued {len(tasks)} VM provisioning tasks (Mode: {provisioning_mode})..."}) + "\n"

            # 3. Execute and Stream Results
            completed_count = 0
            errors = []
            
            if provisioning_mode == "parallel":
                # Parallel Execution
                for future in asyncio.as_completed(tasks):
                    data = await future
                    result = data["result"]
                    env_id = data["env_id"]
                    vm_name = data["vm_name"]
                    
                    if result["success"]:
                        # Save to DB
                        env_vm = EnvironmentVM(
                            env_id=env_id,
                            vm_name=result.get("vm_name", vm_name),
                            vm_moid=result.get("vm_moid", "unknown"),
                            ip_address=result.get("ip_address"),
                            access_url=None,
                            guest_os=data.get("guest_os"),  # From template VM
                            access_protocol=data.get("access_protocol"),  # From template VM
                            access_port=data.get("access_port")  # From template VM
                        )
                        session.add(env_vm)
                        session.commit()
                        yield json.dumps({"status": "success", "message": f"  ✓ Created {vm_name}"}) + "\n"
                    else:
                        error_msg = result['message']
                        errors.append(f"{vm_name}: {error_msg}")
                        yield json.dumps({"status": "error", "message": f"  ✗ Failed {vm_name}: {error_msg}"}) + "\n"
                    
                    completed_count += 1
                    # Progress update (5% to 95%)
                    percent = 5 + int((completed_count / len(tasks)) * 90)
                    yield json.dumps({"status": "progress", "message": f"Provisioning... ({completed_count}/{len(tasks)})", "percent": percent}) + "\n"
            
            else:
                # Sequential Execution (Linear Loop)
                for task in tasks:
                    data = await task # This runs them sequentially because we await each one
                    result = data["result"]
                    env_id = data["env_id"]
                    vm_name = data["vm_name"]
                    
                    if result["success"]:
                        env_vm = EnvironmentVM(
                            env_id=env_id,
                            vm_name=result.get("vm_name", vm_name),
                            vm_moid=result.get("vm_moid", "unknown"),
                            ip_address=result.get("ip_address"),
                            access_url=None,
                            guest_os=data.get("guest_os"),  # From template VM
                            access_protocol=data.get("access_protocol"),  # From template VM
                            access_port=data.get("access_port")  # From template VM
                        )
                        session.add(env_vm)
                        session.commit()
                        yield json.dumps({"status": "success", "message": f"  ✓ Created {vm_name}"}) + "\n"
                    else:
                        error_msg = result['message']
                        errors.append(f"{vm_name}: {error_msg}")
                        yield json.dumps({"status": "error", "message": f"  ✗ Failed {vm_name}: {error_msg}"}) + "\n"

                    completed_count += 1
                    percent = 5 + int((completed_count / len(tasks)) * 90)
                    yield json.dumps({"status": "progress", "message": f"Provisioning... ({completed_count}/{len(tasks)})", "percent": percent}) + "\n"

            if errors:
                logging_service.log_action(session, "PROVISION_CLASS", f"Class: {db_class.name}", "WARNING", f"Completed with {len(errors)} errors: {', '.join(errors)}")
                yield json.dumps({"status": "completed_with_errors", "message": f"Completed with {len(errors)} errors.", "errors": errors, "percent": 100}) + "\n"
            else:
                logging_service.log_action(session, "PROVISION_CLASS", f"Class: {db_class.name}", "SUCCESS", f"Successfully provisioned {completed_count} VMs")
                yield json.dumps({"status": "completed", "message": "All environments provisioned successfully!", "percent": 100}) + "\n"
                
        except Exception as e:
            logging_service.log_action(session, "PROVISION_CLASS", f"Class: {db_class.name}", "ERROR", f"Critical Failure: {str(e)}")
            yield json.dumps({"status": "error", "message": f"Critical Failure: {str(e)}"}) + "\n"
        finally:
            session.close()

    return StreamingResponse(generate_updates(), media_type="application/x-ndjson")

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
            # Get connection_id from template
            connection_id = db_class.template.connection_id if db_class.template else None
            # Fetch latest state from vSphere (mock or real)
            state_info = vsphere_service.get_vm_power_state(vm.vm_moid, connection_id=connection_id)
            vm_list.append({
                "id": vm.id,
                "name": vm.vm_name,
                "moid": vm.vm_moid,
                "ip_address": vm.ip_address,
                "power_state": state_info.get("state", "unknown"),
                "access_url": vm.access_url,
                "guest_os": vm.guest_os,  # For automatic console button detection
                "access_protocol": vm.access_protocol,  # ssh, rdp, vnc from template
                "access_port": vm.access_port  # 22, 3389, etc. from template
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

    # Get connection_id from template
    connection_id = env.class_.template.connection_id if env and env.class_ and env.class_.template else None
    result = vsphere_service.control_vm_power(vm.vm_moid, body.action, connection_id=connection_id)
    
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
    connection_id = env.class_.template.connection_id if env and env.class_ and env.class_.template else None
    result = vsphere_service.delete_vm(vm.vm_moid, connection_id=connection_id)
    
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


# VMRC CONSOLE ACCESS (Hypervisor-level, works without IP)
@router.get("/environments/{class_id}/vms/{vm_id}/vmrc")
def get_vmrc_console(class_id: int, vm_id: int, db: Session = Depends(get_db)):
    """
    Get VMRC (VMware Remote Console) URL for a VM.
    This is hypervisor-level console access that works even when VM has no IP.
    Requires VMRC client installed on user's machine.
    """
    vm = db.query(EnvironmentVM).filter(EnvironmentVM.id == vm_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
        
    # Verify VM belongs to an environment of the class (security check)
    env = db.query(ClassEnvironment).filter(ClassEnvironment.id == vm.env_id).first()
    if not env or env.class_id != class_id:
        raise HTTPException(status_code=403, detail="VM does not belong to this class")

    if not vm.vm_moid:
        raise HTTPException(status_code=400, detail="VM does not have a vSphere MOID")

    # Generate VMRC ticket via vSphere API
    connection_id = env.class_.template.connection_id if env and env.class_ and env.class_.template else None
    result = vsphere_service.generate_vmrc_ticket(vm.vm_moid, connection_id=connection_id)
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to generate VMRC ticket"))
        
    return {
        "success": True,
        "vmrc_uri": result.get("uri"),
        "ticket": result.get("ticket"),
        "vm_name": vm.vm_name,
        "message": "Open VMRC URL in browser or VMRC client"
    }


# HTML5 CONSOLE ACCESS (Browser-based, no client required)
@router.get("/environments/{class_id}/vms/{vm_id}/console")
def get_html5_console(
    class_id: int, 
    vm_id: int, 
    protocol: str = None,  # Optional: rdp, ssh, vnc (default: vnc for console)
    db: Session = Depends(get_db)
):
    """
    Unified console access for VMs via Guacamole.
    
    Access Types:
    - VNC/Console: Always works - connects to hypervisor's VM screen (no IP needed)
    - RDP: Requires VM IP address - Windows remote desktop
    - SSH: Requires VM IP address - Linux terminal
    
    Default behavior:
    - vSphere VMs: VNC console (works without IP)
    - Proxmox VMs: VNC console (works without IP)
    - If protocol=rdp or protocol=ssh and no IP: shows error
    
    Query params:
        protocol: Optional override (rdp, ssh, vnc)
    """
    from fastapi.responses import RedirectResponse, HTMLResponse
    
    vm = db.query(EnvironmentVM).filter(EnvironmentVM.id == vm_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
        
    # Verify VM belongs to an environment of the class (security check)
    env = db.query(ClassEnvironment).filter(ClassEnvironment.id == vm.env_id).first()
    if not env or env.class_id != class_id:
        raise HTTPException(status_code=403, detail="VM does not belong to this class")
    
    # Determine the protocol
    # Default to VNC (console) which works without IP
    final_protocol = (protocol or "vnc").lower()
    
    # SSH and RDP require an IP address
    if final_protocol in ["ssh", "rdp"] and not vm.ip_address:
        return HTMLResponse(content=f"""
<!DOCTYPE html>
<html>
<head>
    <title>{final_protocol.upper()} - {vm.vm_name}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               background: #1a1a2e; color: #eee; display: flex; align-items: center; 
               justify-content: center; min-height: 100vh; margin: 0; }}
        .warning {{ background: #2a2a3e; padding: 40px; border-radius: 12px; text-align: center; 
                   border: 1px solid #fbbf24; max-width: 500px; }}
        h1 {{ color: #fbbf24; margin-bottom: 16px; }}
        p {{ color: #aaa; line-height: 1.6; }}
        .btn {{ display: inline-block; margin-top: 20px; padding: 12px 24px; 
               background: #3b82f6; color: white; text-decoration: none;
               border-radius: 8px; font-weight: 500; margin: 8px; }}
        .btn:hover {{ background: #2563eb; }}
        .btn-secondary {{ background: #4b5563; }}
        .btn-secondary:hover {{ background: #374151; }}
    </style>
</head>
<body>
    <div class="warning">
        <h1>⚠️ No IP Address for {final_protocol.upper()}</h1>
        <p><strong>{final_protocol.upper()}</strong> requires the VM to have an IP address.</p>
        <p>The VM <strong>{vm.vm_name}</strong> does not have an IP address yet.</p>
        <p>You can use <strong>Console</strong> instead, which works without an IP.</p>
        <a href="/api/classes/environments/{class_id}/vms/{vm_id}/console?protocol=vnc" class="btn">Open Console (VNC)</a>
        <a href="javascript:location.reload()" class="btn btn-secondary">Retry {final_protocol.upper()}</a>
    </div>
</body>
</html>
""", status_code=400)
    
    # Build redirect URL to the Guacamole console endpoint
    base_url = f"/api/console/{class_id}/{env.id}/{vm_id}"
    if final_protocol:
        base_url += f"?protocol={final_protocol}"
    
    return RedirectResponse(url=base_url, status_code=302)




@router.post("/environments/{env_id}/power")
def control_environment_power(env_id: int, body: VMPowerAction, db: Session = Depends(get_db)):
    """Control power state of all VMs in an environment"""
    env = db.query(ClassEnvironment).filter(ClassEnvironment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
        
    # Get connection_id from template
    connection_id = env.class_.template.connection_id if env.class_ and env.class_.template else None
    
    for vm in env.vms:
        try:
            result = vsphere_service.control_vm_power(vm.vm_moid, body.action, connection_id=connection_id)
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
        
    # Get connection_id from template
    connection_id = env.class_.template.connection_id if env.class_ and env.class_.template else None
    
    for vm in env.vms:
        try:
            result = vsphere_service.revert_vm(vm.vm_moid, connection_id=connection_id)
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
    
    # Get connection_id from template
    connection_id = env.class_.template.connection_id if env.class_ and env.class_.template else None
    
    for vm in vms_to_delete:
        try:
            # Delete from vSphere
            result = vsphere_service.delete_vm(vm.vm_moid, connection_id=connection_id)
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
    connection_id = db_class.template.connection_id if db_class.template else None
    
    for env in environments:
        for vm in env.vms:
            try:
                result = vsphere_service.control_vm_power(vm.vm_moid, "suspend", connection_id=connection_id)
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
    connection_id = db_class.template.connection_id if db_class.template else None
    
    for env in environments:
        for vm in env.vms:
            try:
                result = vsphere_service.revert_vm(vm.vm_moid, connection_id=connection_id)
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
    connection_id = db_class.template.connection_id if db_class.template else None
    
    for env in environments:
        for vm in env.vms:
            try:
                result = vsphere_service.delete_vm(vm.vm_moid, connection_id=connection_id)
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

@router.get("/{class_id}/environments/{env_id}/vms/{vm_id}/console")
def get_vm_console(class_id: int, env_id: int, vm_id: int, db: Session = Depends(get_db)):
    """
    Get HTML5 console URL for a VM via Apache Guacamole.
    Supports RDP (Windows), SSH (Linux), and VNC (console) connections.
    """
    # 1. Verify ownership/existence
    env_vm = db.query(EnvironmentVM).filter(EnvironmentVM.id == vm_id).first()
    if not env_vm:
        raise HTTPException(status_code=404, detail="VM not found in database")
        
    class_env = db.query(ClassEnvironment).filter(ClassEnvironment.id == env_id).first()
    if not class_env or class_env.class_id != class_id:
        raise HTTPException(status_code=404, detail="Environment not found matching this class")
        
    if env_vm.env_id != env_id:
        raise HTTPException(status_code=400, detail="VM does not belong to this environment")

    # 2. Get the class and template to determine protocol settings
    db_class = db.query(Class).filter(Class.id == class_id).first()
    
    # Default protocol and port
    protocol = "rdp"
    port = 3389
    vm_username = None
    vm_password = None
    
    # Try to get protocol from template VM configuration
    if db_class and db_class.template_id:
        # Find matching template VM by name pattern
        template_vms = db.query(TemplateVM).filter(TemplateVM.template_id == db_class.template_id).all()
        for tvm in template_vms:
            # Match by checking if the env VM name contains the template VM name
            if tvm.vm_name in env_vm.vm_name:
                protocol = tvm.access_protocol or "rdp"
                port = tvm.access_port or {"rdp": 3389, "ssh": 22, "vnc": 5900}.get(protocol, 3389)
                break
    
    # 3. Generate Guacamole console URL
    result = guacamole_service.get_console_url_for_vm(
        vm_id=env_vm.id,
        vm_name=env_vm.vm_name,
        ip_address=env_vm.ip_address,
        protocol=protocol,
        port=port,
        username=vm_username,
        password=vm_password,
        student_name=class_env.name
    )
    
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
        
    return result
