from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from .auth import get_instructor_user, get_admin_user
from db.models import User, Template, TemplateVM, TemplateVMNetwork, Class, ClassEnvironment, EnvironmentVM, Network
from pydantic import BaseModel
from typing import Optional, List
import logging
from services.vsphere_service import vsphere_service
from services.proxmox_service import proxmox_service
from services.logging_service import logging_service

logger = logging.getLogger("training_portal")

router = APIRouter(prefix="/templates", tags=["templates"])

# Pydantic Schemas
class TemplateVMNetworkCreate(BaseModel):
    network_id: Optional[int] = None
    nic_name: str

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
def list_templates(db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
    """List all templates with their VMs - role-based filtering"""
    templates = db.query(Template).order_by(Template.name).all()
    return [t.to_dict() for t in templates]

@router.post("/")
def create_template(template: TemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
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
def get_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
    """Get a single template by ID with all its VMs"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template.to_dict()

@router.put("/{template_id}")
def update_template(template_id: int, update: TemplateUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
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
def delete_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
    """Delete a template and all its VMs (including from vSphere if prepared)"""
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
    
    # Clean up infrastructure VMs if template has any prepared VMs
    # (Regardless of status - we should always try to clean up)
    if template.vms and template.provider and template.connection_id:
        provider = template.provider.lower()
        logger.info(f"Cleaning up {provider} resources for template: {template_name}")
        
        try:
            # Delete each VM that was created during preparation
            for vm in template.vms:
                if vm.vm_moid and vm.source_moid and vm.vm_moid != vm.source_moid:
                    # This VM was cloned (vm_moid differs from source_moid)
                    logger.info(f"Deleting prepared VM: {vm.vm_name} ({vm.vm_moid})")
                    
                    if provider == "vsphere":
                        result = vsphere_service.delete_vm(vm.vm_moid, connection_id=template.connection_id)
                    elif provider == "proxmox":
                        try:
                            vmid = int(vm.vm_moid)
                            result = proxmox_service.delete_vm(vmid, connection_id=template.connection_id)
                        except ValueError:
                            logger.warning(f"Invalid Proxmox VMID for {vm.vm_name}: {vm.vm_moid}")
                            result = {"success": False, "message": "Invalid VMID"}
                    else:
                        result = {"success": False, "message": f"Unknown provider: {provider}"}
                    
                    if not result.get("success"):
                        logger.warning(f"Failed to delete VM {vm.vm_name}: {result.get('message')}")
            
            # Try to delete the template folder/pool
            if provider == "vsphere":
                folder_name = template.name
                logger.info(f"Attempting to delete template folder: Templates/{folder_name}")
                vsphere_service.delete_folder(folder_name, connection_id=template.connection_id, parent_folder_name="Templates")
            elif provider == "proxmox":
                pool_name = f"Templates_{template.name}".replace(" ", "_")
                logger.info(f"Attempting to delete Proxmox pool: {pool_name}")
                proxmox_service.delete_pool(pool_name, connection_id=template.connection_id)
                
        except Exception as e:
            logger.error(f"Error during {provider} cleanup for template {template_name}: {e}")
            # Continue with database deletion even if infrastructure cleanup fails
    
    db.delete(template)
    db.commit()
    logger.info(f"Deleted template: {template_name}")
    return {"message": "Template deleted successfully"}

# VM Management Endpoints
@router.post("/{template_id}/vms")
def add_vm_to_template(template_id: int, vm: TemplateVMCreate, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
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
        raise HTTPException(status_code=404, detail="VM already added to this template")
    
    # If CPU/memory are default values (1/1024), fetch from cached inventory
    cpu = vm.cpu
    memory_mb = vm.memory_mb
    
    if (cpu == 1 or memory_mb == 1024) and template.connection_id:
        try:
            import os
            import json
            cache_path = f"backend/data/vsphere_inventory_{template.connection_id}.json"
            if os.path.exists(cache_path):
                with open(cache_path, 'r') as f:
                    inventory = json.load(f)
                    # Find the VM in inventory by moid
                    for inv_vm in inventory.get('vms', []):
                        if inv_vm.get('moid') == vm.vm_moid:
                            if cpu == 1 and 'cpu' in inv_vm:
                                cpu = inv_vm['cpu']
                            if memory_mb == 1024 and 'memory_mb' in inv_vm:
                                memory_mb = inv_vm['memory_mb']
                            logger.info(f"Fetched CPU={cpu}, Memory={memory_mb} from inventory for VM {vm.vm_name}")
                            break
        except Exception as e:
            logger.warning(f"Could not fetch VM specs from inventory: {e}")
    
    new_vm = TemplateVM(
        template_id=template_id,
        vm_name=vm.vm_name,
        vm_moid=vm.vm_moid,
        guest_os=vm.guest_os,
        cpu=cpu,
        memory_mb=memory_mb,
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
def update_template_vm(template_id: int, vm_id: int, update: TemplateVMUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
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
def remove_vm_from_template(template_id: int, vm_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
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
def list_template_vms(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
    """List all VMs in a template"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return [vm.to_dict() for vm in template.vms]

@router.post("/{template_id}/vms/{vm_id}/networks")
def add_network_to_vm(template_id: int, vm_id: int, mapping: TemplateVMNetworkCreate, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
    """Map a VM NIC to a defined lab network"""
    vm = db.query(TemplateVM).filter(TemplateVM.id == vm_id, TemplateVM.template_id == template_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found in template")
    
    new_mapping = TemplateVMNetwork(
        vm_id=vm_id,
        network_id=mapping.network_id,
        nic_name=mapping.nic_name
    )
    db.add(new_mapping)
    db.commit()
    db.refresh(new_mapping)
    return new_mapping.to_dict()

@router.delete("/{template_id}/vms/{vm_id}/networks/{mapping_id}")
def remove_network_from_vm(template_id: int, vm_id: int, mapping_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
    """Remove a network mapping from a VM NIC"""
    mapping = db.query(TemplateVMNetwork).filter(TemplateVMNetwork.id == mapping_id, TemplateVMNetwork.vm_id == vm_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    db.delete(mapping)
    db.commit()
    return {"message": "Mapping removed"}
@router.post("/{template_id}/prepare")
async def prepare_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """
    Clone source VMs to create working template VMs.
    This protects original VMs from modification.
    """
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if template.status == "preparing":
        raise HTTPException(status_code=400, detail="Template is already being prepared")

    template.status = "preparing"
    db.commit()

    try:
        provider = template.provider.lower() if template.provider else "vsphere"
        
        # Create folder/pool for this template
        if provider == "vsphere":
            folder_path = ["Templates", template.name]
        elif provider == "proxmox":
            # Create a pool for Proxmox (like a folder)
            pool_name = f"Templates_{template.name}".replace(" ", "_")
            pool_result = proxmox_service.create_pool(
                pool_name, 
                f"Template VMs for {template.name}",
                connection_id=template.connection_id
            )
            if pool_result.get("success"):
                logger.info(f"Created/verified pool: {pool_name}")
            else:
                logger.warning(f"Could not create pool {pool_name}: {pool_result.get('message')}")
        
        total_vms = len(template.vms)
        for i, vm in enumerate(template.vms):
            # Update status with progress
            template.status = f"Preparing: Cloning VM {i+1}/{total_vms}"
            db.commit()
            
            # If we don't have a source_moid, set it now (first time)
            if not vm.source_moid:
                vm.source_moid = vm.vm_moid
            
            new_name = f"Tmpl_{template.name}_{vm.vm_name}"
            
            # For reprovisioning: if vm_moid differs from source_moid, delete the old clone first
            if vm.vm_moid and vm.vm_moid != vm.source_moid:
                try:
                    if provider == "vsphere":
                        delete_result = vsphere_service.delete_vm(vm.vm_moid, connection_id=template.connection_id)
                        if delete_result.get("success"):
                            logger.info(f"Deleted old clone {vm.vm_moid} for reprovisioning")
                        else:
                            logger.warning(f"Could not delete old clone {vm.vm_moid}: {delete_result.get('message')}")
                    elif provider == "proxmox":
                        # Stop VM first if running
                        try:
                            proxmox_service.control_vm_power(int(vm.vm_moid), "stop", connection_id=template.connection_id)
                            import time
                            time.sleep(3)  # Wait for VM to stop
                        except:
                            pass
                        delete_result = proxmox_service.delete_vm(int(vm.vm_moid), connection_id=template.connection_id)
                        if delete_result.get("success"):
                            logger.info(f"Deleted old Proxmox clone {vm.vm_moid} for reprovisioning")
                        else:
                            logger.warning(f"Could not delete old Proxmox clone {vm.vm_moid}: {delete_result.get('message')}")
                except Exception as del_err:
                    logger.warning(f"Could not delete old clone {vm.vm_moid}: {del_err}")
            
            # Clone VM
            if provider == "vsphere":
                result = vsphere_service.provision_vm(
                    vm_moid=vm.source_moid,
                    new_name=new_name,
                    folder_path=folder_path,
                    connection_id=template.connection_id
                )
                
                if result.get("success"):
                    # Update vm_moid to the new clone
                    new_vm = result.get("result")
                    vm.vm_moid = new_vm._moId
                    
                    # APPLY NETWORK TOPOLOGY to the new clone
                    try:
                        for mapping in vm.networks:
                            if mapping.network:
                                network_name = mapping.network.network_identifier or mapping.network.name
                                vsphere_service.assign_vm_to_network(
                                    vm_moid=vm.vm_moid,
                                    nic_name=mapping.nic_name,
                                    network_name=network_name,
                                    connection_id=template.connection_id
                                )
                    except Exception as net_err:
                        logger.warning(f"Failed to apply networking to clone {vm.vm_name}: {net_err}")

                    # Power off the template VM if it was powered on
                    vsphere_service.control_vm_power(vm.vm_moid, "stop", connection_id=template.connection_id)
                else:
                    raise Exception(f"Failed to clone VM {vm.vm_name}: {result.get('message')}")
            
            elif provider == "proxmox":
                # Proxmox implementation with pool support
                result = proxmox_service.provision_vm(
                    template_vmid=int(vm.source_moid),
                    new_name=new_name,
                    pool=pool_name if 'pool_name' in dir() else None,
                    connection_id=template.connection_id
                )
                if result.get("success"):
                    vm.vm_moid = str(result.get("vmid") or result.get("moid"))
                    logger.info(f"Cloned Proxmox VM: {vm.source_moid} -> {vm.vm_moid}")
                    
                    # Apply networking for Proxmox if needed (future implementation)
                    
                    # Power off the cloned template
                    try:
                        proxmox_service.control_vm_power(int(vm.vm_moid), "stop", connection_id=template.connection_id)
                    except:
                        pass
                else:
                    raise Exception(f"Failed to clone Proxmox VM {vm.vm_name}: {result.get('message')}")

        template.status = "ready"
        db.commit()
        
        logging_service.log_action(
            db,
            action="PREPARE_TEMPLATE",
            entity_name=template.name,
            source="TEMPLATES",
            level="SUCCESS",
            details=f"Template {template.name} prepared successfully with cloned VMs",
            user_id=current_user.id
        )
        
        return {"success": True, "message": "Template prepared successfully", "template_id": template.id}

    except Exception as e:
        template.status = "source_only" # Reset on failure
        db.commit()
        logger.error(f"Failed to prepare template {template.name}: {e}")
        return {"success": False, "message": str(e)}
@router.post("/{template_id}/sync-environments")
async def sync_template_environments(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_instructor_user)):
    """
    Sync network topology changes from a template to all active student environments.
    """
    from fastapi.responses import StreamingResponse
    import json
    import asyncio

    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    async def generate_sync_updates():
        from db.database import SessionLocal
        session = SessionLocal()
        try:
            # 1. Find all classes using this template
            classes = session.query(Class).filter(Class.template_id == template_id).all()
            if not classes:
                yield json.dumps({"status": "info", "message": "No classes are currently using this template."}) + "\n"
                return

            yield json.dumps({"status": "info", "message": f"Found {len(classes)} classes using this template. Starting sync..."}) + "\n"
            
            # 2. Collect all environments for these classes
            env_ids = [e.id for c in classes for e in session.query(ClassEnvironment).filter(ClassEnvironment.class_id == c.id).all()]
            if not env_ids:
                yield json.dumps({"status": "info", "message": "No environments found to sync."}) + "\n"
                return

            vms_to_sync = session.query(EnvironmentVM).filter(EnvironmentVM.env_id.in_(env_ids)).all()
            total_vms = len(vms_to_sync)
            completed_vms = 0

            yield json.dumps({"status": "info", "message": f"Syncing {total_vms} VMs across {len(env_ids)} environments..."}) + "\n"

            for student_vm in vms_to_sync:
                # 3. Match student VM to TemplateVM
                tmpl_vm = None
                if student_vm.template_vm_id:
                    tmpl_vm = session.query(TemplateVM).filter(TemplateVM.id == student_vm.template_vm_id).first()
                else:
                    # Fallback: match by role/name if template_vm_id is missing (for older environments)
                    # This is a best-effort match
                    tmpl_vm = session.query(TemplateVM).filter(
                        TemplateVM.template_id == template_id,
                        TemplateVM.vm_name == student_vm.role # Assuming role was set during provision
                    ).first()

                if not tmpl_vm:
                    logger.warning(f"Could not find matching TemplateVM for student VM {student_vm.vm_name}")
                    continue

                yield json.dumps({"status": "progress", "message": f"Updating {student_vm.vm_name}...", "percent": int((completed_vms/total_vms)*100)}) + "\n"

                # 4. Apply Network Sync
                # 4. Apply Network Sync
                if template.provider == "vSphere":
                    try:
                        # Get current NICs on student VM
                        nic_res = vsphere_service.get_vm_nics(student_vm.vm_moid, connection_id=template.connection_id)
                        current_nics = {n["name"]: n for n in nic_res.get("nics", [])} if nic_res.get("success") else {}

                        # Get desired mappings from template
                        desired_mappings = session.query(TemplateVMNetwork).filter(TemplateVMNetwork.vm_id == tmpl_vm.id).all()
                        
                        for mapping in desired_mappings:
                            if not mapping.network: continue
                            
                            network_name = mapping.network.network_identifier or mapping.network.name
                            
                            # Determine correct network/VLAN based on isolation mode
                            if mapping.network.isolation_mode == "isolated" or (mapping.network.is_isolated and not mapping.network.isolation_mode):
                                # Logic for isolated network would go here (vSphere usually handles via port group creation)
                                # For now, we assume standard sync logic applies or vSphere creates port groups elsewhere
                                pass

                            if mapping.nic_name in current_nics:
                                # NIC exists, re-assign if needed
                                curr_net = current_nics[mapping.nic_name].get("network")
                                if curr_net != network_name:
                                    logger.info(f"Re-assigning {student_vm.vm_name} NIC {mapping.nic_name} to {network_name}")
                                    vsphere_service.assign_vm_to_network(
                                        vm_moid=student_vm.vm_moid,
                                        nic_name=mapping.nic_name,
                                        network_name=network_name,
                                        connection_id=template.connection_id
                                    )
                            else:
                                # NIC missing, add it
                                logger.info(f"Adding missing NIC {mapping.nic_name} to {student_vm.vm_name} on {network_name}")
                                vsphere_service.add_nic_to_vm(
                                    vm_moid=student_vm.vm_moid,
                                    network_name=network_name,
                                    connection_id=template.connection_id
                                )
                    except Exception as e:
                        logger.error(f"Error syncing {student_vm.vm_name}: {e}")
                        yield json.dumps({"status": "error", "message": f"Failed to sync {student_vm.vm_name}: {str(e)}"}) + "\n"

                elif template.provider == "Proxmox":
                    try:
                        # Proxmox Network Sync
                        desired_mappings = session.query(TemplateVMNetwork).filter(TemplateVMNetwork.vm_id == tmpl_vm.id).all()
                        
                        for mapping in desired_mappings:
                            if not mapping.network: continue
                            
                            bridge_name = mapping.network.network_identifier or "vmbr0"
                            vlan_id = None
                            
                            # Determine VLAN based on isolation mode
                            if mapping.network.isolation_mode == "isolated" or (mapping.network.is_isolated and not mapping.network.isolation_mode):
                                # Get specific VLAN for this student environment
                                from services.vlan_service import vlan_service
                                vlan_id = vlan_service.allocate_vlan(session, mapping.network_id, env.id)
                            elif mapping.network.isolation_mode == "tagged":
                                vlan_id = mapping.network.static_vlan
                            
                            # Apply to VM
                            if student_vm.vm_moid:
                                try:
                                    proxmox_service.assign_vm_to_network(
                                        vmid=int(student_vm.vm_moid),
                                        nic_name=mapping.nic_name,
                                        vlan_tag=vlan_id,
                                        bridge=bridge_name,
                                        connection_id=template.connection_id
                                    )
                                    logger.info(f"Synced {student_vm.vm_name} NIC {mapping.nic_name} to VLAN {vlan_id} on {bridge_name}")
                                except Exception as px_err:
                                    logger.warning(f"Failed to sync NIC {mapping.nic_name} for {student_vm.vm_name}: {px_err}")

                    except Exception as e:
                        logger.error(f"Error syncing Proxmox VM {student_vm.vm_name}: {e}")
                        yield json.dumps({"status": "error", "message": f"Failed to sync {student_vm.vm_name}: {str(e)}"}) + "\n"

                completed_vms += 1

            yield json.dumps({"status": "success", "message": "Template synchronization complete.", "percent": 100}) + "\n"
            
            logging_service.log_action(
                session, 
                action="SYNC_TEMPLATE_ENV", 
                entity_name=template.name, 
                source="TEMPLATE", 
                level="SUCCESS", 
                details=f"Synced changes to {total_vms} VMs"
            )

        except Exception as e:
            logger.error(f"Sync failed: {e}")
            yield json.dumps({"status": "error", "message": f"Global sync failure: {str(e)}"}) + "\n"
        finally:
            session.close()

    return StreamingResponse(generate_sync_updates(), media_type="text/event-stream")
