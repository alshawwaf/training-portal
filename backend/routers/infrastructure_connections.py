from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import datetime

from db.database import get_db
from db.models import InfrastructureConnection, User, Template
from .auth import get_admin_user
from services.proxmox_service import ProxmoxService
from services.vsphere_service import VSphereService
from services.logging_service import logging_service

router = APIRouter(prefix="/infrastructure-connections", tags=["infrastructure-connections"])

class ConnectionCreate(BaseModel):
    name: str
    provider: str
    host: str
    port: int
    user: str
    password: Optional[str] = None
    token_id: Optional[str] = None
    token_secret: Optional[str] = None
    node: Optional[str] = None
    verify_ssl: bool = False
    is_active: bool = True

class ConnectionUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    password: Optional[str] = None
    token_id: Optional[str] = None
    token_secret: Optional[str] = None
    node: Optional[str] = None
    verify_ssl: Optional[bool] = None
    is_active: Optional[bool] = None

@router.get("/", response_model=List[Dict[str, Any]])
async def get_connections(db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    connections = db.query(InfrastructureConnection).all()
    return [c.to_dict() for c in connections]

@router.get("/{connection_id}", response_model=Dict[str, Any])
async def get_connection(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    return connection.to_dict()

@router.post("/", response_model=Dict[str, Any])
async def create_connection(request: ConnectionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    try:
        new_connection = InfrastructureConnection(
            name=request.name,
            provider=request.provider,
            host=request.host,
            port=request.port,
            user=request.user,
            password=request.password,
            token_id=request.token_id,
            token_secret=request.token_secret,
            node=request.node,
            verify_ssl=request.verify_ssl,
            is_active=request.is_active
        )
        db.add(new_connection)
        db.commit()
        db.refresh(new_connection)
        
        logging_service.log_action(
            db, 
            action="CREATE_CONNECTION", 
            entity_name=new_connection.name, 
            source="INFRA", 
            level="SUCCESS", 
            details=f"Created {new_connection.provider} connection to {new_connection.host}",
            user_id=current_user.id
        )
        
        return new_connection.to_dict()
    except Exception as e:
        logging_service.log_action(
            db,
            action="CREATE_CONNECTION",
            entity_name=request.name,
            source="INFRA",
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{connection_id}", response_model=Dict[str, Any])
async def update_connection(connection_id: int, request: ConnectionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    update_data = request.dict(exclude_unset=True)
    for key, value in update_data.items():
        if key in ["password", "token_secret"] and value == "********":
            continue
        setattr(connection, key, value)
    
    connection.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(connection)
    
    logging_service.log_action(
        db, 
        action="UPDATE_CONNECTION", 
        entity_name=connection.name, 
        source="INFRA", 
        level="SUCCESS", 
        details=f"Updated connection details",
        user_id=current_user.id
    )
    
    return connection.to_dict()

@router.delete("/{connection_id}")
async def delete_connection(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    # Check if templates use this connection
    templates = db.query(Template).filter(Template.connection_id == connection_id).first()
    if templates:
        raise HTTPException(status_code=400, detail="Cannot delete connection used by templates")
    
    name = connection.name
    db.delete(connection)
    db.commit()
    
    logging_service.log_action(
        db, 
        action="DELETE_CONNECTION", 
        entity_name=name, 
        source="INFRA", 
        level="SUCCESS", 
        details=f"Deleted connection",
        user_id=current_user.id
    )
    
    return {"success": True, "message": "Connection deleted"}

@router.post("/{connection_id}/test")
async def test_connection(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        logging_service.log_action(
            db, 
            action="TEST_CONNECTION", 
            entity_name=connection.name, 
            source="INFRA", 
            level="INFO", 
            details=f"Testing connection to {connection.host}",
            user_id=current_user.id
        )

        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            result = svc.test_connection(
                host=connection.host,
                user=connection.user,
                password=connection.password,
                port=connection.port,
                verify_ssl=connection.verify_ssl
            )
            
            level = "SUCCESS" if result.get("success") else "ERROR"
            logging_service.log_action(
                db, 
                action="TEST_CONNECTION_RESULT", 
                entity_name=connection.name, 
                source="VSPHERE", 
                level=level, 
                details=result.get("message", "Result unknown"),
                user_id=current_user.id
            )
            return result
        elif connection.provider.lower() == "proxmox":
            svc = ProxmoxService()
            result = svc.test_connection(
                host=connection.host,
                user=connection.user,
                password=connection.password,
                token_id=connection.token_id,
                token_secret=connection.token_secret,
                port=connection.port,
                verify_ssl=connection.verify_ssl
            )
            
            level = "SUCCESS" if result.get("success") else "ERROR"
            logging_service.log_action(
                db, 
                action="TEST_CONNECTION_RESULT", 
                entity_name=connection.name, 
                source="PROXMOX", 
                level=level, 
                details=result.get("message", "Result unknown"),
                user_id=current_user.id
            )
            return result
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {connection.provider}")
    except Exception as e:
        logging_service.log_action(
            db, 
            action="TEST_CONNECTION", 
            entity_name=connection.name, 
            source="INFRA", 
            level="ERROR", 
            details=str(e),
            user_id=current_user.id
        )
        return {"success": False, "message": str(e)}

@router.post("/{connection_id}/sync")
async def sync_inventory(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        logging_service.log_action(
            db, 
            action="SYNC_INVENTORY", 
            entity_name=connection.name, 
            source="INFRA", 
            level="INFO", 
            details="Starting inventory sync",
            user_id=current_user.id
        )
        
        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            svc.host = connection.host
            svc.user = connection.user
            svc.password = connection.password
            svc.port = connection.port
            svc.verify_ssl = connection.verify_ssl
            
            result = svc.sync_inventory(connection_id=connection_id)
            
            logging_service.log_action(
                db, 
                action="SYNC_INVENTORY_RESULT", 
                entity_name=connection.name, 
                source="VSPHERE", 
                level="SUCCESS" if result.get("success") else "ERROR", 
                details=f"Found {result.get('vm_count', 0)} VMs",
                user_id=current_user.id
            )
            
            return result
        elif connection.provider.lower() == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.sync_inventory(connection_id=connection_id)
            
            logging_service.log_action(
                db, 
                action="SYNC_INVENTORY_RESULT", 
                entity_name=connection.name, 
                source="PROXMOX", 
                level="SUCCESS" if result.get("success") else "ERROR", 
                details=f"Found {result.get('vm_count', 0)} VMs",
                user_id=current_user.id
            )
            return result
        else:
             return {"success": False, "message": f"Inventory sync not supported for {connection.provider}"}
    except Exception as e:
        logging_service.log_action(
            db, 
            action="SYNC_INVENTORY", 
            entity_name=connection.name, 
            source="INFRA", 
            level="ERROR", 
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{connection_id}/inventory")
async def get_inventory(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            result = svc.get_cached_inventory(connection_id=connection_id)
            return result
        elif connection.provider.lower() == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.get_cached_inventory(connection_id=connection_id)
            return result
        else:
             return {"success": False, "message": f"Inventory not supported for {connection.provider}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{connection_id}/datastores")
async def get_datastores(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Get list of datastores/storages with capacity and free space for a connection."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        if connection.provider.lower() == "vsphere":
            from services.vsphere_service import vsphere_service
            datastores = vsphere_service.get_datastores(connection_id=connection_id)
            return {"success": True, "datastores": datastores}
        elif connection.provider.lower() == "proxmox":
            from services.proxmox_service import proxmox_service
            storages = proxmox_service.get_storages(connection_id=connection_id)
            # Map Proxmox storage format to match vSphere datastore format for frontend compatibility
            datastores = [{
                "name": s.get("name"),
                "type": s.get("type"),
                "capacity_bytes": s.get("total_bytes", 0),
                "free_bytes": s.get("free_bytes", 0),
                "free_percent": round((s.get("free_bytes", 0) / s.get("total_bytes", 1)) * 100, 1) if s.get("total_bytes", 0) > 0 else 0
            } for s in storages]
            return {"success": True, "datastores": datastores}
        else:
            raise HTTPException(status_code=400, detail=f"Datastores not supported for {connection.provider}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== VM Actions ==============

class VMPowerRequest(BaseModel):
    action: str  # start, stop, suspend, reset

class VMCloneRequest(BaseModel):
    new_name: str

@router.post("/{connection_id}/vms/{vm_moid}/power")
async def vm_power_action(
    connection_id: int, 
    vm_moid: str, 
    request: VMPowerRequest,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_admin_user)
):
    """Control VM power state (start, stop, suspend, reset)."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            svc.host = connection.host
            svc.user = connection.user
            svc.password = connection.password
            svc.port = connection.port
            svc.verify_ssl = connection.verify_ssl
            
            result = svc.control_vm_power(vm_moid, request.action)
            source = "VSPHERE"
        elif connection.provider.lower() == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.control_vm_power(int(vm_moid), request.action, connection_id=connection_id)
            source = "PROXMOX"
        else:
            raise HTTPException(status_code=400, detail=f"VM power control not supported for {connection.provider}")
        
        logging_service.log_action(
            db,
            action=f"VM_{request.action.upper()}",
            entity_name=vm_moid,
            source=source,
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logging_service.log_action(
            db,
            action=f"VM_{request.action.upper()}",
            entity_name=vm_moid,
            source="INFRA",
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{connection_id}/vms/{vm_moid}/clone")
async def vm_clone(
    connection_id: int, 
    vm_moid: str, 
    request: VMCloneRequest,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_admin_user)
):
    """Clone a VM."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            svc.host = connection.host
            svc.user = connection.user
            svc.password = connection.password
            svc.port = connection.port
            svc.verify_ssl = connection.verify_ssl
            
            result = svc.clone_vm(vm_moid, request.new_name)
            source = "VSPHERE"
        elif connection.provider.lower() == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.clone_vm(int(vm_moid), request.new_name, connection_id=connection_id)
            source = "PROXMOX"
        else:
            raise HTTPException(status_code=400, detail=f"VM cloning not supported for {connection.provider}")
        
        logging_service.log_action(
            db,
            action="VM_CLONE",
            entity_name=f"{vm_moid} -> {request.new_name}",
            source=source,
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_CLONE",
            entity_name=vm_moid,
            source="INFRA",
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{connection_id}/vms/{vm_moid}/convert-to-template")
async def vm_convert_to_template(
    connection_id: int, 
    vm_moid: str,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_admin_user)
):
    """Convert a VM to a template."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            svc.host = connection.host
            svc.user = connection.user
            svc.password = connection.password
            svc.port = connection.port
            svc.verify_ssl = connection.verify_ssl
            
            result = svc.convert_to_template(vm_moid)
            source = "VSPHERE"
        elif connection.provider.lower() == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.convert_to_template(int(vm_moid), connection_id=connection_id)
            source = "PROXMOX"
        else:
            raise HTTPException(status_code=400, detail=f"Converting to template not supported for {connection.provider}")
        
        logging_service.log_action(
            db,
            action="VM_CONVERT_TO_TEMPLATE",
            entity_name=vm_moid,
            source=source,
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_CONVERT_TO_TEMPLATE",
            entity_name=vm_moid,
            source="INFRA",
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{connection_id}/vms/{vm_moid}")
async def vm_delete(
    connection_id: int, 
    vm_moid: str,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_admin_user)
):
    """Delete a VM."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            svc.host = connection.host
            svc.user = connection.user
            svc.password = connection.password
            svc.port = connection.port
            svc.verify_ssl = connection.verify_ssl
            
            result = svc.delete_vm(vm_moid)
            source = "VSPHERE"
        elif connection.provider.lower() == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.delete_vm(int(vm_moid), connection_id=connection_id)
            source = "PROXMOX"
        else:
            raise HTTPException(status_code=400, detail=f"VM deletion not supported for {connection.provider}")
        
        logging_service.log_action(
            db,
            action="VM_DELETE",
            entity_name=vm_moid,
            source=source,
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_DELETE",
            entity_name=vm_moid,
            source="INFRA",
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))


# ============== VM Hardware Management ==============

class VMReconfigureRequest(BaseModel):
    name: Optional[str] = None  # Rename VM
    num_cpus: Optional[int] = None
    cores_per_socket: Optional[int] = None
    memory_mb: Optional[int] = None
    nested_hv_enabled: Optional[bool] = None
    cpu_hot_add_enabled: Optional[bool] = None
    memory_hot_add_enabled: Optional[bool] = None
    firmware: Optional[str] = None  # "bios" or "efi"
    secure_boot_enabled: Optional[bool] = None

class AddDiskRequest(BaseModel):
    size_gb: int
    datastore_name: str
    thin_provisioned: bool = True

class ResizeDiskRequest(BaseModel):
    disk_key: int
    new_size_gb: int

class RemoveDiskRequest(BaseModel):
    disk_key: int
    delete_files: bool = True

class CreateSnapshotRequest(BaseModel):
    name: str
    description: str = ""
    memory: bool = False
    quiesce: bool = True

class SnapshotActionRequest(BaseModel):
    snapshot_moid: str
    remove_children: bool = False  # Only for delete

@router.get("/{connection_id}/vms/{vm_moid}/hardware")
async def get_vm_hardware(
    connection_id: int,
    vm_moid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Get detailed hardware configuration for a VM."""
    # Validate vm_moid
    if not vm_moid or vm_moid in ('None', 'null', 'undefined', ''):
        raise HTTPException(status_code=400, detail="Invalid VM identifier")
    
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        provider = connection.provider.lower()
        
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.get_vm_hardware(vm_moid, connection_id=connection_id)
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.get_vm_hardware(int(vm_moid), connection_id=connection_id)
        else:
            raise HTTPException(status_code=400, detail=f"Hardware details not supported for provider: {provider}")
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid VM ID format: {vm_moid}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{connection_id}/vms/{vm_moid}/reconfigure")
async def reconfigure_vm(
    connection_id: int,
    vm_moid: str,
    request: VMReconfigureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Reconfigure VM compute and firmware settings."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        config_updates = request.dict(exclude_unset=True)
        
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.reconfigure_vm(vm_moid, config_updates, connection_id=connection_id)
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.reconfigure_vm(int(vm_moid), config_updates, connection_id=connection_id)
        else:
            raise HTTPException(status_code=400, detail=f"Reconfigure not supported for provider: {provider}")
        
        logging_service.log_action(
            db,
            action="VM_RECONFIGURE",
            entity_name=vm_moid,
            source=provider.upper(),
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_RECONFIGURE",
            entity_name=vm_moid,
            source=provider.upper(),
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{connection_id}/vms/{vm_moid}/disks")
async def add_disk_to_vm(
    connection_id: int,
    vm_moid: str,
    request: AddDiskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Add a new disk to a VM."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.add_disk_to_vm(
                vm_moid, 
                request.size_gb, 
                request.datastore_name,
                request.thin_provisioned,
                connection_id=connection_id
            )
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.add_disk_to_vm(
                int(vm_moid),
                request.size_gb,
                request.datastore_name,  # Used as storage name in Proxmox
                request.thin_provisioned,
                connection_id=connection_id
            )
        else:
            raise HTTPException(status_code=400, detail=f"Disk management not supported for provider: {provider}")
        
        logging_service.log_action(
            db,
            action="VM_ADD_DISK",
            entity_name=vm_moid,
            source=provider.upper(),
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_ADD_DISK",
            entity_name=vm_moid,
            source=provider.upper(),
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{connection_id}/vms/{vm_moid}/disks/resize")
async def resize_disk(
    connection_id: int,
    vm_moid: str,
    request: ResizeDiskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Resize an existing disk (can only grow)."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.resize_disk(
                vm_moid,
                request.disk_key,
                request.new_size_gb,
                connection_id=connection_id
            )
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            # For Proxmox, disk_key is the disk name like "scsi0"
            result = proxmox_service.resize_disk(
                int(vm_moid),
                str(request.disk_key),  # Convert to string for Proxmox
                request.new_size_gb,
                connection_id=connection_id
            )
        else:
            raise HTTPException(status_code=400, detail=f"Disk management not supported for provider: {provider}")
        
        logging_service.log_action(
            db,
            action="VM_RESIZE_DISK",
            entity_name=vm_moid,
            source=provider.upper(),
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_RESIZE_DISK",
            entity_name=vm_moid,
            source=provider.upper(),
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{connection_id}/vms/{vm_moid}/disks/{disk_key}")
async def remove_disk(
    connection_id: int,
    vm_moid: str,
    disk_key: str,  # Changed to str to support Proxmox disk names like "scsi0"
    delete_files: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Remove a disk from a VM."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.remove_disk(
                vm_moid,
                int(disk_key),  # vSphere uses int keys
                delete_files,
                connection_id=connection_id
            )
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.remove_disk(
                int(vm_moid),
                disk_key,  # Proxmox uses string keys like "scsi0"
                delete_files,
                connection_id=connection_id
            )
        else:
            raise HTTPException(status_code=400, detail=f"Disk management not supported for provider: {provider}")
        
        logging_service.log_action(
            db,
            action="VM_REMOVE_DISK",
            entity_name=vm_moid,
            source=provider.upper(),
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_REMOVE_DISK",
            entity_name=vm_moid,
            source=provider.upper(),
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

# ============== Snapshots ==============

@router.get("/{connection_id}/vms/{vm_moid}/snapshots")
async def get_vm_snapshots(
    connection_id: int,
    vm_moid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Get list of snapshots for a VM."""
    # Validate vm_moid
    if not vm_moid or vm_moid in ('None', 'null', 'undefined', ''):
        raise HTTPException(status_code=400, detail="Invalid VM identifier")
    
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.get_vm_snapshots(vm_moid, connection_id=connection_id)
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.get_vm_snapshots(int(vm_moid), connection_id=connection_id)
        else:
            raise HTTPException(status_code=400, detail=f"Snapshots not supported for provider: {provider}")
        
        return result
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid VM ID format: {vm_moid}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{connection_id}/vms/{vm_moid}/snapshots")
async def create_snapshot(
    connection_id: int,
    vm_moid: str,
    request: CreateSnapshotRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Create a snapshot of a VM."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.create_snapshot(
                vm_moid,
                request.name,
                request.description,
                request.memory,
                request.quiesce,
                connection_id=connection_id
            )
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.create_snapshot(
                int(vm_moid),
                request.name,
                request.description,
                request.memory,
                connection_id=connection_id
            )
        else:
            raise HTTPException(status_code=400, detail=f"Snapshots not supported for provider: {provider}")
        
        logging_service.log_action(
            db,
            action="VM_CREATE_SNAPSHOT",
            entity_name=f"{vm_moid}: {request.name}",
            source=provider.upper(),
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_CREATE_SNAPSHOT",
            entity_name=vm_moid,
            source=provider.upper(),
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{connection_id}/vms/{vm_moid}/snapshots/{snapshot_moid}/revert")
async def revert_to_snapshot(
    connection_id: int,
    vm_moid: str,
    snapshot_moid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Revert VM to a specific snapshot."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.revert_to_snapshot(vm_moid, snapshot_moid, connection_id=connection_id)
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.revert_to_snapshot(int(vm_moid), snapshot_moid, connection_id=connection_id)
        else:
            raise HTTPException(status_code=400, detail=f"Snapshots not supported for provider: {provider}")
        
        logging_service.log_action(
            db,
            action="VM_REVERT_SNAPSHOT",
            entity_name=f"{vm_moid}: {snapshot_moid}",
            source=provider.upper(),
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_REVERT_SNAPSHOT",
            entity_name=vm_moid,
            source=provider.upper(),
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{connection_id}/vms/{vm_moid}/snapshots/{snapshot_moid}")
async def delete_snapshot(
    connection_id: int,
    vm_moid: str,
    snapshot_moid: str,
    remove_children: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Delete a snapshot."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.delete_snapshot(vm_moid, snapshot_moid, remove_children, connection_id=connection_id)
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.delete_snapshot(int(vm_moid), snapshot_moid, connection_id=connection_id)
        else:
            raise HTTPException(status_code=400, detail=f"Snapshots not supported for provider: {provider}")
        
        logging_service.log_action(
            db,
            action="VM_DELETE_SNAPSHOT",
            entity_name=f"{vm_moid}: {snapshot_moid}",
            source=provider.upper(),
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        logging_service.log_action(
            db,
            action="VM_DELETE_SNAPSHOT",
            entity_name=vm_moid,
            source=provider.upper(),
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))


# ============== ISO Management ==============

class MountISORequest(BaseModel):
    iso_path: str

@router.get("/{connection_id}/isos")
async def get_available_isos(
    connection_id: int,
    datastore: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Get available ISO files from datastores."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.get_isos(datastore, connection_id=connection_id)
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.get_isos(datastore, connection_id=connection_id)
        else:
            raise HTTPException(status_code=400, detail=f"ISO management not supported for provider: {provider}")
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{connection_id}/vms/{vm_moid}/mount-iso")
async def mount_iso(
    connection_id: int,
    vm_moid: str,
    request: MountISORequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Mount an ISO to a VM's CD/DVD drive."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.mount_iso(vm_moid, request.iso_path, connection_id=connection_id)
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.mount_iso(int(vm_moid), request.iso_path, connection_id=connection_id)
        else:
            raise HTTPException(status_code=400, detail=f"ISO management not supported for provider: {provider}")
        
        logging_service.log_action(
            db,
            action="VM_MOUNT_ISO",
            entity_name=f"{vm_moid}: {request.iso_path}",
            source=provider.upper(),
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{connection_id}/vms/{vm_moid}/eject-iso")
async def eject_iso(
    connection_id: int,
    vm_moid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Eject ISO from a VM's CD/DVD drive."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    provider = connection.provider.lower()
    
    try:
        if provider == "vsphere":
            from services.vsphere_service import vsphere_service
            result = vsphere_service.eject_iso(vm_moid, connection_id=connection_id)
        elif provider == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.eject_iso(int(vm_moid), connection_id=connection_id)
        else:
            raise HTTPException(status_code=400, detail=f"ISO management not supported for provider: {provider}")
        
        logging_service.log_action(
            db,
            action="VM_EJECT_ISO",
            entity_name=vm_moid,
            source=provider.upper(),
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============== Template Console Access ==============

@router.get("/{connection_id}/vms/{vm_moid}/console")
async def get_template_console(
    connection_id: int,
    vm_moid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """
    Get console access for a template VM (admin only).
    Returns WebSocket URL for direct console access.
    """
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    if connection.provider.lower() != "vsphere":
        raise HTTPException(status_code=400, detail="Console only supported for vSphere")
    
    try:
        from services.vsphere_service import vsphere_service
        import base64
        import json
        import os
        
        # Generate fresh ticket
        ticket_result = vsphere_service.generate_html5_console_ticket(vm_moid, connection_id=connection_id)
        
        if not ticket_result.get("success"):
            raise HTTPException(status_code=500, detail=ticket_result.get("message", "Failed to generate console ticket"))
        
        # Build WebSocket config for the proxy
        ws_config = {
            "vm_moid": vm_moid,
            "connection_id": connection_id,
            "admin": True
        }
        
        ws_token = base64.urlsafe_b64encode(json.dumps(ws_config).encode()).decode()
        ws_base = os.getenv("BACKEND_WS_URL", "ws://localhost:8000")
        
        return {
            "success": True,
            "console_url": f"/api/console/template/{connection_id}/{vm_moid}",
            "ws_url": f"{ws_base}/ws/console/{ws_token}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Pool Management (Proxmox folders) ==============

@router.get("/{connection_id}/pools")
async def get_pools(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Get list of resource pools (Proxmox only, like vSphere folders)."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    if connection.provider.lower() != "proxmox":
        raise HTTPException(status_code=400, detail="Pools only supported for Proxmox")
    
    try:
        from services.proxmox_service import proxmox_service
        result = proxmox_service.get_pools(connection_id=connection_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class CreatePoolRequest(BaseModel):
    pool_id: str
    comment: Optional[str] = ""


@router.post("/{connection_id}/pools")
async def create_pool(
    connection_id: int,
    request: CreatePoolRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Create a new resource pool (Proxmox only)."""
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    if connection.provider.lower() != "proxmox":
        raise HTTPException(status_code=400, detail="Pools only supported for Proxmox")
    
    try:
        from services.proxmox_service import proxmox_service
        result = proxmox_service.create_pool(request.pool_id, request.comment, connection_id=connection_id)
        
        logging_service.log_action(
            db,
            action="POOL_CREATE",
            entity_name=request.pool_id,
            source="PROXMOX",
            level="SUCCESS" if result.get("success") else "ERROR",
            details=result.get("message", ""),
            user_id=current_user.id
        )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
