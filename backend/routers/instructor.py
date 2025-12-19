"""
Instructor Console API routes.
Provides instructors with class-wide visibility and control over student environments.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Class, ClassEnvironment, ClassStudent, EnvironmentVM, User
from services.vsphere_service import vsphere_service
from .auth import get_current_user
from pydantic import BaseModel
from typing import Optional, List
import datetime
import logging

router = APIRouter(prefix="/instructor", tags=["instructor"])
logger = logging.getLogger("instructor")


# ============ Schemas ============

class VMStatus(BaseModel):
    id: int
    name: str
    status: str
    ip_address: Optional[str]

class StudentInfo(BaseModel):
    id: int
    email: str
    name: Optional[str]
    environment_id: Optional[int]
    environment_name: Optional[str]
    status: str  # active, idle, offline
    joined_at: Optional[str]
    last_active: Optional[str]
    needs_help: bool
    vms: List[VMStatus]

class ClassStudentsResponse(BaseModel):
    class_id: int
    class_name: str
    class_status: str
    total_students: int
    active_students: int
    needs_help_count: int
    students: List[StudentInfo]


class StudentActionRequest(BaseModel):
    action: str  # revert, restart_all, message


class BroadcastRequest(BaseModel):
    message: str


# ============ Helper Functions ============

def get_activity_status(last_active: datetime.datetime) -> str:
    """Determine student activity status based on last activity time"""
    if not last_active:
        return "offline"
    
    now = datetime.datetime.utcnow()
    diff = now - last_active
    
    if diff.total_seconds() < 300:  # 5 minutes
        return "active"
    elif diff.total_seconds() < 1800:  # 30 minutes
        return "idle"
    else:
        return "offline"


# ============ Routes ============

@router.get("/classes")
def get_instructor_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of classes the instructor can monitor.
    Admins see all classes, instructors see only their own.
    """
    is_admin = current_user.role in ['admin', 'super_admin', 'administrator']
    
    if is_admin:
        classes = db.query(Class).filter(Class.status.in_(['active', 'upcoming'])).all()
    else:
        classes = db.query(Class).filter(
            Class.instructor_id == current_user.id,
            Class.status.in_(['active', 'upcoming'])
        ).all()
    
    result = []
    for cls in classes:
        # Count students
        student_count = db.query(ClassStudent).filter(ClassStudent.class_id == cls.id).count()
        # Count environments
        env_count = db.query(ClassEnvironment).filter(ClassEnvironment.class_id == cls.id).count()
        
        result.append({
            "id": cls.id,
            "name": cls.name,
            "status": cls.status,
            "student_count": student_count,
            "environment_count": env_count,
            "start_date": cls.start_date.isoformat() if cls.start_date else None,
            "end_date": cls.end_date.isoformat() if cls.end_date else None
        })
    
    return result


@router.get("/class/{class_id}/students", response_model=ClassStudentsResponse)
def get_class_students(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all students in a class with their environment status and VMs.
    This is the main data endpoint for the Instructor Console.
    """
    # Verify class exists
    cls = db.query(Class).filter(Class.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Check permissions
    is_admin = current_user.role in ['admin', 'super_admin', 'administrator']
    if not is_admin and cls.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this class")
    
    # Get all students who joined this class
    students = db.query(ClassStudent).filter(ClassStudent.class_id == class_id).all()
    
    student_list = []
    active_count = 0
    help_count = 0
    
    for student in students:
        # Get activity status
        status = get_activity_status(student.last_active)
        if status == "active":
            active_count += 1
        
        # Get environment and VMs
        vms = []
        env_name = None
        env_id = None
        
        if student.environment_id:
            env = db.query(ClassEnvironment).filter(
                ClassEnvironment.id == student.environment_id
            ).first()
            
            if env:
                env_id = env.id
                env_name = env.name
                
                # Get VMs for this environment
                env_vms = db.query(EnvironmentVM).filter(
                    EnvironmentVM.env_id == env.id
                ).all()
                
                # Get connection_id from template
                connection_id = cls.template.connection_id if cls.template else None
                for vm in env_vms:
                    # Get current power state
                    state_info = vsphere_service.get_vm_power_state(vm.vm_moid, connection_id=connection_id)
                    vms.append(VMStatus(
                        id=vm.id,
                        name=vm.vm_name,
                        status=state_info.get("state", "unknown"),
                        ip_address=vm.ip_address
                    ))
        
        # Check if student needs help (placeholder for future help request feature)
        needs_help = False  # Will be populated when help system is implemented
        if needs_help:
            help_count += 1
        
        student_list.append(StudentInfo(
            id=student.id,
            email=student.email,
            name=student.name,
            environment_id=env_id,
            environment_name=env_name,
            status=status,
            joined_at=student.joined_at.isoformat() if student.joined_at else None,
            last_active=student.last_active.isoformat() if student.last_active else None,
            needs_help=needs_help,
            vms=vms
        ))
    
    return ClassStudentsResponse(
        class_id=cls.id,
        class_name=cls.name,
        class_status=cls.status,
        total_students=len(students),
        active_students=active_count,
        needs_help_count=help_count,
        students=student_list
    )


@router.post("/class/{class_id}/student/{student_id}/action")
def perform_student_action(
    class_id: int,
    student_id: int,
    request: StudentActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Perform an action on a student's environment.
    Actions: revert, restart_all, power_off_all
    """
    # Verify class
    cls = db.query(Class).filter(Class.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Check permissions
    is_admin = current_user.role in ['admin', 'super_admin', 'administrator']
    if not is_admin and cls.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get student
    student = db.query(ClassStudent).filter(
        ClassStudent.id == student_id,
        ClassStudent.class_id == class_id
    ).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in this class")
    
    if not student.environment_id:
        raise HTTPException(status_code=400, detail="Student has no assigned environment")
    
    # Get environment
    env = db.query(ClassEnvironment).filter(
        ClassEnvironment.id == student.environment_id
    ).first()
    
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    
    # Get VMs
    vms = db.query(EnvironmentVM).filter(EnvironmentVM.env_id == env.id).all()
    
    results = []
    errors = []
    
    for vm in vms:
        try:
            # Get connection_id from template
            connection_id = cls.template.connection_id if cls.template else None
            if request.action == "revert":
                result = vsphere_service.revert_vm(vm.vm_moid, connection_id=connection_id)
            elif request.action == "restart_all":
                result = vsphere_service.control_vm_power(vm.vm_moid, "reset", connection_id=connection_id)
            elif request.action == "power_off_all":
                result = vsphere_service.control_vm_power(vm.vm_moid, "stop", connection_id=connection_id)
            elif request.action == "power_on_all":
                result = vsphere_service.control_vm_power(vm.vm_moid, "start", connection_id=connection_id)
            else:
                raise HTTPException(status_code=400, detail=f"Unknown action: {request.action}")
            
            if result.get("success"):
                results.append(f"{vm.vm_name}: success")
            else:
                errors.append(f"{vm.vm_name}: {result.get('message', 'failed')}")
                
        except Exception as e:
            errors.append(f"{vm.vm_name}: {str(e)}")
    
    logger.info(f"Instructor {current_user.email} performed {request.action} on student {student.email}'s environment")
    
    return {
        "success": len(errors) == 0,
        "message": f"Action '{request.action}' completed",
        "results": results,
        "errors": errors if errors else None
    }


@router.get("/class/{class_id}/student/{student_id}/environment")
def get_student_environment_details(
    class_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get detailed information about a specific student's environment.
    Used when instructor "zooms in" on a student.
    """
    # Verify class
    cls = db.query(Class).filter(Class.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Check permissions
    is_admin = current_user.role in ['admin', 'super_admin', 'administrator']
    if not is_admin and cls.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get student
    student = db.query(ClassStudent).filter(
        ClassStudent.id == student_id,
        ClassStudent.class_id == class_id
    ).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found in this class")
    
    if not student.environment_id:
        return {
            "student": {
                "id": student.id,
                "email": student.email,
                "name": student.name,
                "joined_at": student.joined_at.isoformat() if student.joined_at else None,
                "last_active": student.last_active.isoformat() if student.last_active else None
            },
            "environment": None,
            "vms": []
        }
    
    # Get environment
    env = db.query(ClassEnvironment).filter(
        ClassEnvironment.id == student.environment_id
    ).first()
    
    # Get VMs with detailed info
    vms = []
    if env:
        env_vms = db.query(EnvironmentVM).filter(EnvironmentVM.env_id == env.id).all()
        # Get connection_id from template
        connection_id = cls.template.connection_id if cls.template else None
        for vm in env_vms:
            state_info = vsphere_service.get_vm_power_state(vm.vm_moid, connection_id=connection_id)
            vms.append({
                "id": vm.id,
                "name": vm.vm_name,
                "moid": vm.vm_moid,
                "status": state_info.get("state", "unknown"),
                "ip_address": vm.ip_address,
                "guest_os": vm.guest_os,
                "access_protocol": vm.access_protocol,
                "access_port": vm.access_port,
                "console_url": f"/api/classes/environments/{class_id}/vms/{vm.id}/console"
            })
    
    return {
        "student": {
            "id": student.id,
            "email": student.email,
            "name": student.name,
            "joined_at": student.joined_at.isoformat() if student.joined_at else None,
            "last_active": student.last_active.isoformat() if student.last_active else None
        },
        "environment": {
            "id": env.id if env else None,
            "name": env.name if env else None,
            "created_at": env.created_at.isoformat() if env and env.created_at else None
        },
        "vms": vms,
        "class": {
            "id": cls.id,
            "name": cls.name
        }
    }
