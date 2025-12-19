from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from .auth import get_current_user
from db.models import User, Template, TemplateVM
from db.database import SessionLocal
from db.models import Template, TemplateVM
from pydantic import BaseModel
from typing import Optional, List
import logging

logger = logging.getLogger("se_portal")

router = APIRouter(prefix="/templates", tags=["templates"])




# Pydantic Schemas
class TemplateVMCreate(BaseModel):
    vm_name: str
    vm_moid: str
    guest_os: Optional[str] = None
    cpu: Optional[int] = 1
    memory_mb: Optional[int] = 1024
    is_template: Optional[bool] = False
    is_primary: Optional[bool] = False
    access_protocol: Optional[str] = "rdp"
    access_port: Optional[int] = None


class TemplateVMUpdate(BaseModel):
    is_primary: Optional[bool] = None
    access_protocol: Optional[str] = None
    access_port: Optional[int] = None


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "🖥️"
    provider: Optional[str] = "vSphere"
    connection_id: Optional[int] = None
    is_active: Optional[bool] = True
    vms: Optional[List[TemplateVMCreate]] = []


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    provider: Optional[str] = None
    connection_id: Optional[int] = None
    is_active: Optional[bool] = None


# Routes
@router.get("/")
def list_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all templates with their VMs - role-based filtering"""
    # Students don't see templates (they only access their assigned VMs)
    if current_user.role not in ['admin', 'super_admin', 'administrator', 'instructor']:
        return []
    
    templates = db.query(Template).order_by(Template.name).all()
    return [t.to_dict() for t in templates]


@router.post("/")
def create_template(template: TemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create a new template with optional VMs"""
    new_template = Template(
        name=template.name,
        description=template.description,
        icon=template.icon,
        provider=template.provider,
        connection_id=template.connection_id,
        is_active=template.is_active
    )
    db.add(new_template)
    db.flush()  # Get the ID before adding VMs
    
    # Add VMs if provided
    for vm_data in template.vms:
        vm = TemplateVM(
            template_id=new_template.id,
            vm_name=vm_data.vm_name,
            vm_moid=vm_data.vm_moid,
            guest_os=vm_data.guest_os,
            cpu=vm_data.cpu,
            memory_mb=vm_data.memory_mb,
            is_template=vm_data.is_template,
            is_primary=vm_data.is_primary,
            access_protocol=vm_data.access_protocol,
            access_port=vm_data.access_port
        )
        db.add(vm)
    
    db.commit()
    db.refresh(new_template)
    logger.info(f"Created template: {new_template.name} with {len(template.vms)} VMs")
    return new_template.to_dict()


@router.get("/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get a single template by ID with all its VMs"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template.to_dict()


@router.put("/{template_id}")
def update_template(template_id: int, update: TemplateUpdate, db: Session = Depends(get_db)):
    """Update an existing template"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if update.name is not None:
        template.name = update.name
    if update.description is not None:
        template.description = update.description
    if update.icon is not None:
        template.icon = update.icon
    if update.provider is not None:
        template.provider = update.provider
    if update.connection_id is not None:
        template.connection_id = update.connection_id
    if update.is_active is not None:
        template.is_active = update.is_active
    
    db.commit()
    db.refresh(template)
    logger.info(f"Updated template: {template.name}")
    return template.to_dict()


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    """Delete a template and all its VMs"""
    from db.models import Class  # Import here to avoid circular imports
    
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check if any classes are using this template
    referencing_classes = db.query(Class).filter(Class.template_id == template_id).all()
    if referencing_classes:
        class_names = [c.name for c in referencing_classes]
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete template. It is being used by {len(class_names)} class(es): {', '.join(class_names)}. Please delete or update these classes first."
        )
    
    template_name = template.name
    db.delete(template)
    db.commit()
    logger.info(f"Deleted template: {template_name}")
    return {"message": "Template deleted successfully"}


# VM Management Endpoints
@router.post("/{template_id}/vms")
def add_vm_to_template(template_id: int, vm: TemplateVMCreate, db: Session = Depends(get_db)):
    """Add a VM from vSphere inventory to a template"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check if VM already exists in this template
    existing = db.query(TemplateVM).filter(
        TemplateVM.template_id == template_id,
        TemplateVM.vm_moid == vm.vm_moid
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="VM already added to this template")
    
    new_vm = TemplateVM(
        template_id=template_id,
        vm_name=vm.vm_name,
        vm_moid=vm.vm_moid,
        guest_os=vm.guest_os,
        cpu=vm.cpu,
        memory_mb=vm.memory_mb,
        is_template=vm.is_template,
        is_primary=vm.is_primary,
        access_protocol=vm.access_protocol,
        access_port=vm.access_port
    )
    db.add(new_vm)
    db.commit()
    db.refresh(new_vm)
    logger.info(f"Added VM {vm.vm_name} to template {template.name}")
    return new_vm.to_dict()


@router.put("/{template_id}/vms/{vm_id}")
def update_template_vm(template_id: int, vm_id: int, update: TemplateVMUpdate, db: Session = Depends(get_db)):
    """Update a VM's settings in a template"""
    vm = db.query(TemplateVM).filter(
        TemplateVM.id == vm_id,
        TemplateVM.template_id == template_id
    ).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found in template")
    
    if update.is_primary is not None:
        # If setting as primary, unset other primaries
        if update.is_primary:
            db.query(TemplateVM).filter(
                TemplateVM.template_id == template_id,
                TemplateVM.id != vm_id
            ).update({"is_primary": False})
        vm.is_primary = update.is_primary
    if update.access_protocol is not None:
        vm.access_protocol = update.access_protocol
    if update.access_port is not None:
        vm.access_port = update.access_port
    
    db.commit()
    db.refresh(vm)
    return vm.to_dict()


@router.delete("/{template_id}/vms/{vm_id}")
def remove_vm_from_template(template_id: int, vm_id: int, db: Session = Depends(get_db)):
    """Remove a VM from a template"""
    vm = db.query(TemplateVM).filter(
        TemplateVM.id == vm_id,
        TemplateVM.template_id == template_id
    ).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found in template")
    
    vm_name = vm.vm_name
    db.delete(vm)
    db.commit()
    logger.info(f"Removed VM {vm_name} from template {template_id}")
    return {"message": f"VM {vm_name} removed from template"}


@router.get("/{template_id}/vms")
def list_template_vms(template_id: int, db: Session = Depends(get_db)):
    """List all VMs in a template"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return [vm.to_dict() for vm in template.vms]
