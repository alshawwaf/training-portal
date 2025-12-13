"""
Infrastructure Router
Handles API endpoints for on-premise infrastructure (Proxmox, vSphere).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from db.database import get_db
from db.models import SystemSetting
from services.proxmox_service import proxmox_service
from services.vsphere_service import vsphere_service

router = APIRouter(prefix="/infrastructure", tags=["infrastructure"])


class ProxmoxTestRequest(BaseModel):
    host: str
    port: int = 8006
    user: str
    password: Optional[str] = None
    token_id: Optional[str] = None
    token_secret: Optional[str] = None
    node: str = "pve"
    verify_ssl: bool = False


class VSphereTestRequest(BaseModel):
    host: str
    port: int = 443
    user: str
    password: Optional[str] = None  # Optional - will use stored password if not provided or masked
    verify_ssl: bool = False


class SaveSettingsRequest(BaseModel):
    settings: Dict[str, str]
    category: str


# ============== Proxmox Endpoints ==============

@router.post("/proxmox/test")
async def test_proxmox_connection(request: ProxmoxTestRequest, db: Session = Depends(get_db)):
    """Test Proxmox connection with provided credentials."""
    try:
        password = request.password
        # Handle masked or empty password by falling back to stored password
        if not password or password == "********":
            password = proxmox_service.password
            # If using token, we might not need password, but let's assume password auth for now primarily
            
        result = proxmox_service.test_connection(
            host=request.host,
            user=request.user,
            password=password,
            token_id=request.token_id,
            token_secret=request.token_secret,
            port=request.port,
            verify_ssl=request.verify_ssl
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/proxmox/save")
async def save_proxmox_settings(request: SaveSettingsRequest, db: Session = Depends(get_db)):
    """Save Proxmox settings to database."""
    try:
        for key, value in request.settings.items():
            setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if setting:
                # Do not overwrite with mask if unchanged
                if setting.is_secret and value == "********":
                    continue
                setting.value = value
            else:
                # Create new setting
                new_setting = SystemSetting(
                    key=key,
                    value=value,
                    category=request.category,
                    description=key.replace("_", " ").title(),
                    is_secret="_password" in key or "_secret" in key
                )
                db.add(new_setting)
        db.commit()
        
        # Reload proxmox config
        proxmox_service.load_config(db)
        
        return {"success": True, "message": "Proxmox settings saved successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/proxmox/status")
async def get_proxmox_status(db: Session = Depends(get_db)):
    """Get current Proxmox connection status."""
    try:
        nodes = proxmox_service.get_nodes()
        vms = proxmox_service.get_vms()
        return {
            "connected": len(nodes) > 0,
            "nodes": nodes,
            "vm_count": len(vms),
            "mock_mode": proxmox_service.mock_mode
        }
    except Exception as e:
        return {"connected": False, "error": str(e)}


# ============== vSphere Endpoints ==============

@router.post("/vsphere/test")
async def test_vsphere_connection(request: VSphereTestRequest, db: Session = Depends(get_db)):
    """Test vSphere connection with provided credentials."""
    try:
        # Get the actual password to use
        # If password is not provided, empty, or masked (********), use stored password
        password = request.password
        if not password or password == "********":
            # Use the password from vsphere_service (loaded from .env/database)
            password = vsphere_service.password
            if not password:
                return {"success": False, "message": "No password configured. Please enter a password."}
        
        result = vsphere_service.test_connection(
            host=request.host,
            user=request.user,
            password=password,
            port=request.port,
            verify_ssl=request.verify_ssl
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/vsphere/save")
async def save_vsphere_settings(request: SaveSettingsRequest, db: Session = Depends(get_db)):
    """Save vSphere settings to database."""
    try:
        for key, value in request.settings.items():
            setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if setting:
                # Do not overwrite with mask if unchanged
                if setting.is_secret and value == "********":
                    continue
                setting.value = value
            else:
                # Create new setting
                new_setting = SystemSetting(
                    key=key,
                    value=value,
                    category=request.category,
                    description=key.replace("_", " ").title(),
                    is_secret="_password" in key or "_secret" in key
                )
                db.add(new_setting)
        db.commit()
        
        # Reload vsphere config
        vsphere_service.load_config(db)
        
        return {"success": True, "message": "vSphere settings saved successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vsphere/status")
async def get_vsphere_status(db: Session = Depends(get_db)):
    """Get current vSphere connection status and data."""
    try:
        datacenters = vsphere_service.get_datacenters()
        clusters = vsphere_service.get_clusters()
        hosts = vsphere_service.get_hosts()
        vms = vsphere_service.get_vms()
        
        return {
            "connected": len(datacenters) > 0 or vsphere_service.mock_mode,
            "mock_mode": vsphere_service.mock_mode,
            "datacenters": datacenters,
            "clusters": clusters,
            "hosts": hosts,
            "vms": vms
        }
    except Exception as e:
        return {"connected": False, "error": str(e)}


@router.get("/vsphere/vms")
async def get_vsphere_vms(db: Session = Depends(get_db)):
    """Get list of vSphere VMs."""
    try:
        vms = vsphere_service.get_vms()
        return {"vms": vms}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vsphere/hosts")
async def get_vsphere_hosts(db: Session = Depends(get_db)):
    """Get list of ESXi hosts."""
    try:
        hosts = vsphere_service.get_hosts()
        return {"hosts": hosts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vsphere/networks")
async def get_vsphere_networks(db: Session = Depends(get_db)):
    """Get list of vSphere networks."""
    try:
        networks = vsphere_service.get_networks()
        return {"networks": networks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/vsphere/sync")
async def sync_vsphere_inventory(db: Session = Depends(get_db)):
    """Trigger inventory sync from vSphere to cache."""
    try:
        result = vsphere_service.sync_inventory()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vsphere/inventory")
async def get_vsphere_inventory(db: Session = Depends(get_db)):
    """Get cached vSphere inventory."""
    try:
        result = vsphere_service.get_cached_inventory()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
