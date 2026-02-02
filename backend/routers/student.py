"""
Student API routes for class access without real accounts.
Students join using email + passcode and get assigned an environment.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from db.database import SessionLocal
from db.models import Class, ClassEnvironment, ClassStudent, EnvironmentVM
from typing import Optional, List
import uuid
import datetime
import logging

router = APIRouter(prefix="/student", tags=["student"])
logger = logging.getLogger("training_portal")

from .auth import get_admin_user, get_current_user
from db.models import User
from services.notification_service import notification_service

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============ Schemas ============

class JoinClassRequest(BaseModel):
    email: EmailStr
    passcode: str
    name: Optional[str] = None  # Optional display name

class JoinClassResponse(BaseModel):
    success: bool
    session_token: Optional[str] = None
    class_name: Optional[str] = None
    message: str

class VMInfo(BaseModel):
    id: int
    name: str
    role: Optional[str]
    os_type: Optional[str]
    status: Optional[str]
    ip_address: Optional[str]
    cpu_cores: Optional[int] = None
    ram_mb: Optional[int] = None
    disk_gb: Optional[int] = None

class EnvironmentResponse(BaseModel):
    id: int
    student_number: Optional[int]
    status: Optional[str]
    class_name: str
    class_description: Optional[str]
    time_remaining: Optional[str]
    vms: List[VMInfo]

class StudentSessionResponse(BaseModel):
    email: str
    name: Optional[str]
    class_name: str
    joined_at: str


# ============ Routes ============

@router.post("/join/{join_token}", response_model=JoinClassResponse)
async def join_class(
    join_token: str, 
    request: JoinClassRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Join a class using the join token and passcode.
    Creates or retrieves student session and assigns an environment.
    """
    # Find class by join token
    cls = db.query(Class).filter(Class.join_token == join_token).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Validate passcode
    if cls.passcode != request.passcode:
        raise HTTPException(status_code=401, detail="Invalid passcode")
    
    # Check if class is active
    if cls.status != "active":
        raise HTTPException(status_code=400, detail="Class is not currently active")
    
    # Check if class has ended
    if cls.end_date and datetime.datetime.utcnow() > cls.end_date:
        raise HTTPException(status_code=400, detail="Class has ended")
    
    # Check if student already joined
    existing_student = db.query(ClassStudent).filter(
        ClassStudent.email == request.email,
        ClassStudent.class_id == cls.id
    ).first()
    
    if existing_student:
        # If class doesn't allow multiple environments, return existing session
        if not getattr(cls, 'allow_multi_env', False):
            existing_student.last_active = datetime.datetime.utcnow()
            db.commit()
            return JoinClassResponse(
                success=True,
                session_token=existing_student.session_token,
                class_name=cls.name,
                message="Welcome back!"
            )
        # If it does allow multiple, we proceed to find/create a new environment for them
    
    # Find an available environment
    # An environment is available if it exists, is 'ready', and is not assigned to ANY student
    assigned_env_ids = db.query(ClassStudent.environment_id).filter(
        ClassStudent.class_id == cls.id,
        ClassStudent.environment_id.isnot(None)
    ).all()
    assigned_env_ids = [s.environment_id for s in assigned_env_ids]
    
    available_env = db.query(ClassEnvironment).filter(
        ClassEnvironment.class_id == cls.id,
        ClassEnvironment.status == "ready",
        ~ClassEnvironment.id.in_(assigned_env_ids) if assigned_env_ids else True
    ).first()
    
    if not available_env:
        # Check if we can provision a new one on-demand
        # With +1 pool strategy, we allow up to max_users + 1 environments
        current_env_count = db.query(ClassEnvironment).filter(ClassEnvironment.class_id == cls.id).count()
        if current_env_count < cls.max_users + 1:  # +1 for buffer
            from services.provisioning_service import provisioning_service
            import asyncio
            
            next_student_num = current_env_count + 1
            logger.info(f"On-demand provisioning for student {next_student_num} in class {cls.name}")
            
            try:
                loop = asyncio.get_event_loop()
                result = loop.run_until_complete(provisioning_service.provision_environment(db, cls.id, next_student_num))
                
                if result["success"]:
                    available_env = db.query(ClassEnvironment).filter(ClassEnvironment.id == result["environment_id"]).first()
                else:
                    raise HTTPException(status_code=500, detail=f"Failed to provision environment: {result.get('message')}")
            except Exception as e:
                logger.error(f"On-demand provisioning error: {e}")
                raise HTTPException(status_code=500, detail=f"Provisioning failed: {str(e)}")
        else:
            raise HTTPException(status_code=400, detail="Class is full. Maximum number of students reached.")
    
    # Extract username from email for VM naming (e.g., "john.smith@company.com" -> "john.smith")
    email_username = request.email.split("@")[0][:15]  # Max 15 chars for VM name compatibility
    
    # Rename VMs in this environment to include the student's username
    from services.vsphere_service import vsphere_service
    from services.proxmox_service import proxmox_service
    
    connection_id = cls.template.connection_id if cls.template else None
    provider = cls.template.provider.lower() if cls.template and cls.template.provider else "vsphere"
    
    env_vms = db.query(EnvironmentVM).filter(EnvironmentVM.env_id == available_env.id).all()
    for vm in env_vms:
        # Build new VM name: ClassName-Username-OriginalVMName
        # Strip off the old student number prefix if present
        original_parts = vm.vm_name.split("-")
        if len(original_parts) >= 3:
            # Format: ClassName-StudentX-VMName -> ClassName-username-VMName
            base_vm_part = "-".join(original_parts[2:])  # Get everything after StudentX
        else:
            base_vm_part = vm.vm_name
        
        new_vm_name = f"{cls.name[:20]}-{email_username}-{base_vm_part}".replace(" ", "_")[:63]  # VM name max 63 chars
        
        try:
            if provider == "proxmox":
                proxmox_service.rename_vm(int(vm.vm_moid), new_vm_name, connection_id=connection_id)
            else:
                vsphere_service.rename_vm(vm.vm_moid, new_vm_name, connection_id=connection_id)
            
            # Update DB record
            vm.vm_name = new_vm_name
            db.add(vm)
        except Exception as rename_err:
            logger.warning(f"Failed to rename VM {vm.vm_name}: {rename_err}")
    
    # Update environment with claim info
    available_env.status = "claimed"
    available_env.claimed_at = datetime.datetime.utcnow()
    available_env.claimed_by_email = request.email
    available_env.name = request.email  # Update display name to student email
    db.add(available_env)
    
    # Create student session
    session_token = str(uuid.uuid4())
    student = ClassStudent(
        email=request.email,
        name=request.name,
        class_id=cls.id,
        environment_id=available_env.id,
        session_token=session_token
    )
    db.add(student)
    db.commit()
    
    logger.info(f"Student {request.email} joined class '{cls.name}' with environment #{available_env.student_number}")
    
    # Trigger background provisioning of a new spare environment if we're below the buffer threshold
    remaining_available = db.query(ClassEnvironment).filter(
        ClassEnvironment.class_id == cls.id,
        ClassEnvironment.status == "ready",
        ~ClassEnvironment.id.in_([s.environment_id for s in db.query(ClassStudent.environment_id).filter(ClassStudent.class_id == cls.id, ClassStudent.environment_id.isnot(None)).all()])
    ).count()
    
    current_env_count = db.query(ClassEnvironment).filter(ClassEnvironment.class_id == cls.id).count()
    
    if remaining_available == 0 and current_env_count < cls.max_users + 1:
        # Queue background provisioning of a spare environment
        async def provision_spare():
            from services.provisioning_service import provisioning_service
            spare_db = SessionLocal()
            try:
                next_num = current_env_count + 1
                logger.info(f"Background provisioning spare environment #{next_num} for class {cls.name}")
                result = await provisioning_service.provision_environment(spare_db, cls.id, next_num)
                if result["success"]:
                    spare_env = spare_db.query(ClassEnvironment).filter(ClassEnvironment.id == result["environment_id"]).first()
                    if spare_env:
                        spare_env.is_spare = True
                        spare_db.add(spare_env)
                        spare_db.commit()
                    logger.info(f"Spare environment provisioned for class {cls.name}")
                else:
                    logger.error(f"Failed to provision spare: {result.get('message')}")
            except Exception as e:
                logger.error(f"Spare provisioning error: {e}")
            finally:
                spare_db.close()
        
        background_tasks.add_task(provision_spare)
    
    # Notify instructor that student joined
    await notification_service.notify_student_joined(
        db=db,
        class_=cls,
        student_name=request.name or request.email,
        student_email=request.email,
        environment_name=f"Environment #{available_env.student_number}",
        background_tasks=background_tasks
    )
    
    return JoinClassResponse(
        success=True,
        session_token=session_token,
        class_name=cls.name,
        message=f"Successfully joined! You've been assigned Environment #{available_env.student_number}"
    )



@router.get("/environment", response_model=EnvironmentResponse)
def get_student_environment(session_token: str, db: Session = Depends(get_db)):
    """
    Get the student's assigned environment and VMs.
    """
    student = db.query(ClassStudent).filter(ClassStudent.session_token == session_token).first()
    if not student:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Update last active
    student.last_active = datetime.datetime.utcnow()
    db.commit()
    
    env = student.environment
    if not env:
        raise HTTPException(status_code=404, detail="No environment assigned")
    
    cls = student.class_
    
    # Calculate time remaining
    time_remaining = None
    if cls.end_date:
        remaining = cls.end_date - datetime.datetime.utcnow()
        if remaining.total_seconds() > 0:
            days = remaining.days
            hours, remainder = divmod(remaining.seconds, 3600)
            minutes, _ = divmod(remainder, 60)
            if days > 0:
                time_remaining = f"{days}d {hours}h"
            else:
                time_remaining = f"{hours}h {minutes}m"
    
    # Sync VM states with vSphere if possible
    from services.vsphere_service import vsphere_service
    connection_id = cls.template.connection_id if cls and cls.template else None
    
    # Get current VMs from DB
    db_vms = db.query(EnvironmentVM).filter(EnvironmentVM.env_id == env.id).all()
    vm_list = []
    
    for vm in db_vms:
        # Fetch live state from vSphere
        try:
            live_state = vsphere_service.get_vm_power_state(vm.vm_moid, connection_id=connection_id)
            if live_state.get("success"):
                new_status = live_state.get("state", vm.status)
                if vm.status != new_status:
                    vm.status = new_status
                    db.add(vm)
            
            # Fetch live IP and specs if powered on
            if vm.status == "poweredOn":
                try:
                    si = vsphere_service.get_session(connection_id)
                    from pyVmomi import vim
                    vm_obj = vsphere_service._get_obj([vim.VirtualMachine], vm.vm_moid, si)
                    if vm_obj:
                        # Sync IP
                        if vm_obj.guest and vm_obj.guest.ipAddress:
                            if vm.ip_address != vm_obj.guest.ipAddress:
                                vm.ip_address = vm_obj.guest.ipAddress
                                db.add(vm)
                        
                        # Sync hardware specs if missing
                        if (vm.cpu_cores is None or vm.ram_mb is None) and vm_obj.config and vm_obj.config.hardware:
                            vm.cpu_cores = vm_obj.config.hardware.numCPU
                            vm.ram_mb = vm_obj.config.hardware.memoryMB
                            
                            # Calculate disk
                            total_disk_kb = 0
                            for device in vm_obj.config.hardware.device:
                                if isinstance(device, vim.vm.device.VirtualDisk):
                                    total_disk_kb += device.capacityInKB
                            if total_disk_kb > 0:
                                vm.disk_gb = int(total_disk_kb / 1024 / 1024)
                            db.add(vm)
                except:
                    pass
        except Exception as e:
            logger.warning(f"Failed to sync state for VM {vm.vm_name}: {e}")


    db.commit()

    # Re-fetch for response with hardware specs
    vm_list = [
        VMInfo(
            id=vm.id,
            name=vm.vm_name,
            role=vm.role,
            os_type=vm.os_type,
            status=vm.status or "unknown",
            ip_address=vm.ip_address,
            cpu_cores=vm.cpu_cores,
            ram_mb=vm.ram_mb,
            disk_gb=vm.disk_gb
        )
        for vm in db_vms
    ]
    
    return EnvironmentResponse(
        id=env.id,
        student_number=env.student_number,
        status=env.status,
        class_name=cls.name,
        class_description=cls.description,
        time_remaining=time_remaining,
        vms=vm_list
    )


@router.get("/session", response_model=StudentSessionResponse)
def get_session_info(session_token: str, db: Session = Depends(get_db)):
    """
    Get current student session information.
    """
    student = db.query(ClassStudent).filter(ClassStudent.session_token == session_token).first()
    if not student:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    return StudentSessionResponse(
        email=student.email,
        name=student.name,
        class_name=student.class_.name,
        joined_at=student.joined_at.isoformat()
    )


@router.post("/vm/{vm_id}/power")
def control_student_vm(vm_id: int, action: str, session_token: str, db: Session = Depends(get_db)):
    """
    Control power state of a VM in the student's environment.
    Allowed actions: start, stop, suspend, revert
    """
    from services.vsphere_service import vsphere_service
    
    student = db.query(ClassStudent).filter(ClassStudent.session_token == session_token).first()
    if not student:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Verify VM belongs to student's environment
    vm = db.query(EnvironmentVM).filter(
        EnvironmentVM.id == vm_id,
        EnvironmentVM.env_id == student.environment_id
    ).first()
    
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found in your environment")
    
    allowed_actions = ["start", "stop", "suspend", "revert"]
    if action not in allowed_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action. Allowed: {allowed_actions}")
    
    # Get connection_id from template
    connection_id = student.class_.template.connection_id if student.class_ and student.class_.template else None
    
    try:
        if action == "revert":
            result = vsphere_service.revert_vm(vm.vm_moid, connection_id=connection_id)
        else:
            result = vsphere_service.control_vm_power(vm.vm_moid, action, connection_id=connection_id)
        
        # Immediate state sync after action
        if result.get("success"):
            live_state = vsphere_service.get_vm_power_state(vm.vm_moid, connection_id=connection_id)
            if live_state.get("success"):
                vm.status = live_state.get("state", vm.status)
                db.add(vm)
                db.commit()

        logger.info(f"Student {student.email} performed {action} on VM {vm.vm_name}")
        
        return {"success": True, "message": f"VM {action} initiated", "result": result}
    except Exception as e:
        logger.error(f"VM power control failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vm/{vm_id}/console")
def get_vm_console(vm_id: int, session_token: str, db: Session = Depends(get_db)):
    """
    Get console access URL for a VM.
    """
    from services.vsphere_service import vsphere_service
    
    student = db.query(ClassStudent).filter(ClassStudent.session_token == session_token).first()
    if not student:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Verify VM belongs to student's environment
    vm = db.query(EnvironmentVM).filter(
        EnvironmentVM.id == vm_id,
        EnvironmentVM.env_id == student.environment_id
    ).first()
    
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found in your environment")
    
    try:
        # If powered on but no IP, try one last time to sync it
        if vm.status == "poweredOn" and not vm.ip_address:
            try:
                connection_id = student.class_.template.connection_id if student.class_ and student.class_.template else None
                si = vsphere_service.get_session(connection_id)
                from pyVmomi import vim
                vm_obj = vsphere_service._get_obj([vim.VirtualMachine], vm.vm_moid, si)
                if vm_obj and vm_obj.guest and vm_obj.guest.ipAddress:
                    vm.ip_address = vm_obj.guest.ipAddress
                    db.add(vm)
                    db.commit()
            except:
                pass

        # Generate console URL - points to the Guacamole router endpoint which serves the HTML console
        console_url = f"/api/console/{student.class_id}/{student.environment_id}/{vm.id}"
        
        logger.info(f"Console access granted for student {student.email}: VM={vm.vm_name}, URL={console_url}")
        
        return {
            "success": True,
            "vm_name": vm.vm_name,
            "console_url": console_url,
            "ip_address": vm.ip_address
        }
    except Exception as e:
        logger.error(f"Failed to get console URL for VM {vm_id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/logout")
def logout_student(session_token: str, db: Session = Depends(get_db)):
    """
    Log out student session.
    """
    student = db.query(ClassStudent).filter(ClassStudent.session_token == session_token).first()
    if student:
        # Generate new token to invalidate old session
        student.session_token = str(uuid.uuid4())
        db.commit()
    
    return {"success": True, "message": "Logged out"}


@router.get("/class/{join_token}/info")
def get_class_info(join_token: str, db: Session = Depends(get_db)):
    """
    Get basic class info for join page (no auth required).
    """
    cls = db.query(Class).filter(Class.join_token == join_token).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    
    return {
        "name": cls.name,
        "description": cls.description,
        "status": cls.status,
        "start_date": cls.start_date.isoformat() if cls.start_date else None,
        "end_date": cls.end_date.isoformat() if cls.end_date else None,
        "is_active": cls.status == "active"
    }


# ============ Admin Routes ============

@router.get("/admin/sessions")
def get_all_student_sessions(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """
    Get all active student sessions across all classes (Admin only).
    Returns student email, name, class info, environment info, joined time, last active.
    """
    students = db.query(ClassStudent).all()
    
    result = []
    for s in students:
        cls = s.class_
        env = s.environment
        
        # Get VMs for environment
        vms = []
        if env:
            env_vms = db.query(EnvironmentVM).filter(EnvironmentVM.env_id == env.id).all()
            vms = [{"id": vm.id, "name": vm.vm_name, "status": vm.status, "ip": vm.ip_address} for vm in env_vms]
        
        result.append({
            "id": s.id,
            "email": s.email,
            "name": s.name,
            "class_id": s.class_id,
            "class_name": cls.name if cls else "Unknown",
            "class_status": cls.status if cls else "unknown",
            "environment_id": s.environment_id,
            "environment_name": env.name if env else None,
            "student_number": env.student_number if env else None,
            "joined_at": s.joined_at.isoformat() if s.joined_at else None,
            "last_active": s.last_active.isoformat() if s.last_active else None,
            "vms": vms
        })
    
    return result
