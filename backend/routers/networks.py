from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import datetime

from db.database import get_db
from db.models import Network, InfrastructureConnection, User
import logging
logger = logging.getLogger("training_portal")

from .auth import get_admin_user
from services.logging_service import logging_service
from services.vsphere_service import vsphere_service
from services.proxmox_service import proxmox_service

router = APIRouter(prefix="/networks", tags=["networks"])

class NetworkCreate(BaseModel):
    connection_id: int
    name: str
    description: Optional[str] = None
    isolation_mode: Optional[str] = "isolated"  # isolated, shared, tagged
    is_isolated: bool = True  # Legacy - kept for backwards compatibility
    static_vlan: Optional[int] = None  # For 'tagged' mode - specific VLAN
    network_identifier: Optional[str] = None  # vSphere Port Group for 'shared' mode
    color: Optional[str] = None

class NetworkUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    isolation_mode: Optional[str] = None  # isolated, shared, tagged  
    is_isolated: Optional[bool] = None  # Legacy
    static_vlan: Optional[int] = None
    network_identifier: Optional[str] = None
    color: Optional[str] = None

@router.get("/available", response_model=List[Dict[str, Any]])
async def get_available_networks(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Fetch live networks from vSphere or Proxmox bridges."""
    conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Infrastructure connection not found")
    
    provider = conn.provider.lower() if conn.provider else "vsphere"
    
    if provider == "proxmox":
        # Get Proxmox bridges/VLANs
        bridges = proxmox_service.get_network_bridges(connection_id=connection_id)
        return [{"name": b, "type": "bridge", "identifier": b} for b in bridges]
    else:
        # Get vSphere networks (Port Groups)
        networks = vsphere_service.get_networks(connection_id=connection_id)
        return [{"name": n["name"], "type": n.get("type", "Standard"), "identifier": n["name"]} for n in networks]


@router.get("/switches")
async def get_switches(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Get list of Distributed vSwitches from vSphere."""
    conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Infrastructure connection not found")
    
    if conn.provider and conn.provider.lower() == "proxmox":
        return []  # Proxmox doesn't have DVS concept
    
    switches = vsphere_service.get_distributed_switches(connection_id=connection_id)
    return switches


class CreatePortGroupRequest(BaseModel):
    connection_id: int
    name: str
    dvs_name: str
    vlan_id: int = 0
    promiscuous_mode: bool = False
    mac_changes: bool = False
    forged_transmits: bool = False


@router.post("/port-group")
async def create_vsphere_port_group(request: CreatePortGroupRequest, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Create a new port group in vSphere and optionally add it to the database."""
    conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == request.connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Infrastructure connection not found")
    
    if conn.provider and conn.provider.lower() == "proxmox":
        raise HTTPException(status_code=400, detail="Port group creation not supported for Proxmox")
    
    result = vsphere_service.create_port_group(
        name=request.name,
        dvs_name=request.dvs_name,
        vlan_id=request.vlan_id,
        promiscuous_mode=request.promiscuous_mode,
        mac_changes=request.mac_changes,
        forged_transmits=request.forged_transmits,
        connection_id=request.connection_id
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to create port group"))
    
    logging_service.log_action(
        db,
        action="CREATE_PORT_GROUP",
        entity_name=request.name,
        source="NETWORK",
        level="SUCCESS",
        details=f"Created port group '{request.name}' on DVS '{request.dvs_name}' with VLAN {request.vlan_id}",
        user_id=current_user.id
    )
    
    return result


@router.get("/", response_model=List[Dict[str, Any]])
async def get_networks(connection_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    query = db.query(Network)
    if connection_id:
        query = query.filter(Network.connection_id == connection_id)
    networks = query.all()
    return [n.to_dict() for n in networks]

@router.get("/{network_id}", response_model=Dict[str, Any])
async def get_network(network_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    network = db.query(Network).filter(Network.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    return network.to_dict()

@router.post("/", response_model=Dict[str, Any])
async def create_network(request: NetworkCreate, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    # Verify connection exists
    conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == request.connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Infrastructure connection not found")
    
    try:
        new_network = Network(
            connection_id=request.connection_id,
            name=request.name,
            description=request.description,
            isolation_mode=request.isolation_mode or ("isolated" if request.is_isolated else "shared"),
            is_isolated=request.is_isolated,
            static_vlan=request.static_vlan,
            network_identifier=request.network_identifier,
            color=request.color
        )
        db.add(new_network)
        db.commit()
        db.refresh(new_network)
        
        logging_service.log_action(
            db, 
            action="CREATE_NETWORK", 
            entity_name=new_network.name, 
            source="INFRA", 
            level="SUCCESS", 
            details=f"Created network definition for {conn.name}",
            user_id=current_user.id
        )
        
        return new_network.to_dict()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{network_id}", response_model=Dict[str, Any])
async def update_network(network_id: int, request: NetworkUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    network = db.query(Network).filter(Network.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    
    update_data = request.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(network, key, value)
    
    db.commit()
    db.refresh(network)
    
    logging_service.log_action(
        db, 
        action="UPDATE_NETWORK", 
        entity_name=network.name, 
        source="INFRA", 
        level="SUCCESS", 
        details=f"Updated network definition",
        user_id=current_user.id
    )
    
    return network.to_dict()

@router.delete("/{network_id}")
async def delete_network(network_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    network = db.query(Network).filter(Network.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    
    name = network.name
    
    # Delete related template VM network mappings first (foreign key constraint)
    from db.models import TemplateVMNetwork
    db.query(TemplateVMNetwork).filter(TemplateVMNetwork.network_id == network_id).delete(synchronize_session=False)
    
    db.delete(network)
    db.commit()
    
    logging_service.log_action(
        db, 
        action="DELETE_NETWORK", 
        entity_name=name, 
        source="INFRA", 
        level="SUCCESS", 
        details=f"Deleted network definition",
        user_id=current_user.id
    )
    
    return {"success": True, "message": "Network deleted"}


# === Template VM Network Mapping Endpoints ===

from db.models import Template, TemplateVM, TemplateVMNetwork

class NICMapping(BaseModel):
    vm_id: int
    nic_name: str
    network_id: Optional[int] = None
    # Advanced Settings
    adapter_type: str = "virtio"
    firewall: bool = False
    mtu: Optional[int] = None
    mac_address: Optional[str] = None
    rate_limit: Optional[float] = None
    queues: Optional[int] = None
    link_down: bool = False

class TemplateMappingsRequest(BaseModel):
    mappings: List[NICMapping]


@router.get("/templates/{template_id}/vm-networks")
async def get_template_vm_networks(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Get all VM NIC to network mappings for a template."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Get all VMs and their network mappings
    vms = db.query(TemplateVM).filter(TemplateVM.template_id == template_id).all()
    
    result = []
    for vm in vms:
        vm_data = vm.to_dict()
        # Get mapped networks for this VM
        mappings = db.query(TemplateVMNetwork).filter(TemplateVMNetwork.vm_id == vm.id).all()
        # Manually convert mappings to dict to include new fields if to_dict doesn't
        mappings_data = []
        for m in mappings:
            mapping_dict = m.to_dict()
            # Add extended fields
            mapping_dict.update({
                "adapter_type": m.adapter_type,
                "firewall": m.firewall,
                "mtu": m.mtu,
                "mac_address": m.mac_address,
                "rate_limit": m.rate_limit,
                "queues": m.queues,
                "link_down": m.link_down
            })
            mappings_data.append(mapping_dict)
            
        vm_data["network_mappings"] = mappings_data
        result.append(vm_data)
    
    return {
        "template_id": template_id,
        "template_name": template.name,
        "vms": result
    }


@router.post("/templates/{template_id}/vm-networks")
async def save_template_vm_networks(template_id: int, request: TemplateMappingsRequest, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Save VM NIC to network mappings for a template."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Clear existing mappings for the VMs in this template
    vm_ids = [m.vm_id for m in request.mappings]
    db.query(TemplateVMNetwork).filter(TemplateVMNetwork.vm_id.in_(vm_ids)).delete(synchronize_session=False)
    
    # Create new mappings
    for mapping in request.mappings:
        if mapping.network_id:  # Only create mapping if network is selected
            new_mapping = TemplateVMNetwork(
                vm_id=mapping.vm_id,
                nic_name=mapping.nic_name,
                network_id=mapping.network_id,
                adapter_type=mapping.adapter_type,
                firewall=mapping.firewall,
                mtu=mapping.mtu,
                mac_address=mapping.mac_address,
                rate_limit=mapping.rate_limit,
                queues=mapping.queues,
                link_down=mapping.link_down
            )
            db.add(new_mapping)
            
            # IMMEDIATELY sync to vSphere/Proxmox if template is ready
            if template.status in ["ready", "configured"]:
                try:
                    # Get the VM and Network info
                    vm = db.query(TemplateVM).filter(TemplateVM.id == mapping.vm_id).first()
                    net = db.query(Network).filter(Network.id == mapping.network_id).first()
                    
                    if vm and net:
                        if template.provider == "Proxmox":
                            # Proxmox Sync
                            if vm.vm_moid:
                                try:
                                    network_name = net.network_identifier or "vmbr0"
                                    vlan_tag = net.static_vlan if net.isolation_mode == "tagged" else None
                                    
                                    proxmox_service.assign_vm_to_network(
                                        vmid=int(vm.vm_moid),
                                        nic_name=mapping.nic_name,
                                        vlan_tag=vlan_tag,
                                        bridge=network_name,
                                        model=mapping.adapter_type,
                                        firewall=mapping.firewall,
                                        mtu=mapping.mtu,
                                        mac=mapping.mac_address,
                                        rate_limit=mapping.rate_limit,
                                        multiqueue=mapping.queues,
                                        disconnect=mapping.link_down,
                                        connection_id=template.connection_id
                                    )
                                except Exception as px_err:
                                     logger.warning(f"Failed to sync Proxmox network for {vm.vm_name}: {px_err}")
                        elif template.provider == "vSphere":
                            # vSphere Sync
                            network_name = net.network_identifier or net.name
                            vsphere_service.assign_vm_to_network(
                                vm_moid=vm.vm_moid,
                                nic_name=mapping.nic_name,
                                network_name=network_name,
                                adapter_type=mapping.adapter_type,
                                mac_address=mapping.mac_address,
                                connected=not mapping.link_down,
                                connection_id=template.connection_id
                            )
                except Exception as sync_err:
                    logger.warning(f"Failed to sync network mapping for VM {mapping.vm_id}: {sync_err}")

    
    db.commit()
    
    logging_service.log_action(
        db,
        action="UPDATE_TEMPLATE_NETWORKS",
        entity_name=template.name,
        source="NETWORK",
        level="SUCCESS",
        details=f"Updated {len(request.mappings)} NIC mappings",
        user_id=current_user.id
    )
    
    return {"success": True, "message": f"Saved {len(request.mappings)} network mappings"}


@router.get("/templates/{template_id}/detect-nics")
async def detect_template_nics(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Detect NICs from template VMs by querying the infrastructure."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Get the infrastructure connection for this template
    conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == template.connection_id).first()
    if not conn:
        raise HTTPException(status_code=400, detail="Template has no associated infrastructure connection")
    
    vms = db.query(TemplateVM).filter(TemplateVM.template_id == template_id).all()
    
    results = []
    for vm in vms:
        vm_info = {
            "id": vm.id,
            "vm_name": vm.vm_name,
            "vm_moid": vm.vm_moid,
            "nics": []
        }
        
        # Query infrastructure for VM's NICs
        try:
            if conn.provider and conn.provider.lower() == "proxmox":
                # Proxmox - get real network interfaces
                if vm.vm_moid:
                    try:
                        nic_result = proxmox_service.get_vm_nics(int(vm.vm_moid), connection_id=conn.id)
                        if nic_result.get("success") and nic_result.get("nics"):
                            for nic in nic_result["nics"]:
                                vm_info["nics"].append({
                                    "name": nic["name"],
                                    "label": nic["name"].upper(),
                                    "key": nic.get("key"),
                                    "mac_address": nic.get("mac_address"),
                                    "current_network": nic.get("network"),
                                    "network_type": "bridge"
                                })
                        else:
                            vm_info["nics"] = [{"name": "net0", "label": "Primary NIC"}]
                    except:
                        vm_info["nics"] = [{"name": "net0", "label": "Primary NIC"}]
                else:
                    vm_info["nics"] = [{"name": "net0", "label": "Primary NIC"}]
            else:
                # vSphere - get NICs using new method
                nic_result = vsphere_service.get_vm_nics(vm.vm_moid, connection_id=conn.id)
                if nic_result.get("success") and nic_result.get("nics"):
                    for nic in nic_result["nics"]:
                        vm_info["nics"].append({
                            "name": nic["name"],
                            "label": nic["name"],
                            "key": nic.get("key"),
                            "mac_address": nic.get("mac_address"),
                            "current_network": nic.get("network"),
                            "network_type": nic.get("network_type")
                        })
                else:
                    # Default NICs if unable to detect
                    vm_info["nics"] = [{"name": "Network adapter 1", "label": "Primary NIC"}]
        except Exception as e:
            # Fallback to default NICs
            vm_info["nics"] = [{"name": "Network adapter 1", "label": f"Primary NIC (detection failed: {str(e)[:30]})"}]
        
        results.append(vm_info)
    
    return {
        "template_id": template_id,
        "provider": conn.provider,
        "vms": results
    }


# === NIC Management Endpoints ===

class AddNICRequest(BaseModel):
    network_name: Optional[str] = None  # Default to None; provider-specific default applied in endpoint
    template_id: Optional[int] = None

class RemoveNICRequest(BaseModel):
    nic_name: str


@router.post("/vms/{vm_moid}/nics")
async def add_nic_to_vm(vm_moid: str, request: AddNICRequest, connection_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Add a new NIC to a VM and connect it to a network."""
    logger.info(f"Adding NIC: vm_moid={vm_moid}, template_id={request.template_id}, conn_id={connection_id}")
    final_conn_id = connection_id
    
    if not final_conn_id and request.template_id:
        template = db.query(Template).filter(Template.id == request.template_id).first()
        if template:
            final_conn_id = template.connection_id
            logger.info(f"Resolved connection_id={final_conn_id} from template={template.name}")

    if not final_conn_id:
        logger.error(f"Failed to resolve connection_id for {vm_moid}")
        raise HTTPException(status_code=400, detail="Infrastructure connection could not be determined. Please save topology first or provide template_id.")

    conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == final_conn_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Infrastructure connection not found")
    
    if conn.provider and conn.provider.lower() == "proxmox":
        # Proxmox NIC management
        try:
            result = proxmox_service.add_nic_to_vm(
                vmid=int(vm_moid),
                network=request.network_name or "vmbr0",
                connection_id=final_conn_id
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        result = vsphere_service.add_nic_to_vm(vm_moid, request.network_name, connection_id=final_conn_id)
    
    if result.get("success"):
        logging_service.log_action(
            db,
            action="ADD_NIC",
            entity_name=vm_moid,
            source="NETWORK",
            level="SUCCESS",
            details=f"Added NIC connected to {request.network_name}",
            user_id=current_user.id
        )
        return result
    else:
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to add NIC"))


@router.delete("/vms/{vm_moid}/nics/{nic_name}")
async def remove_nic_from_vm(vm_moid: str, nic_name: str, connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Remove a NIC from a VM."""
    conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Infrastructure connection not found")
    
    if conn.provider and conn.provider.lower() == "proxmox":
        result = proxmox_service.remove_nic_from_vm(int(vm_moid), nic_name, connection_id=connection_id)
    else:
        result = vsphere_service.remove_nic_from_vm(vm_moid, nic_name, connection_id=connection_id)
    
    if result.get("success"):
        logging_service.log_action(
            db,
            action="REMOVE_NIC",
            entity_name=vm_moid,
            source="NETWORK",
            level="SUCCESS",
            details=f"Removed NIC {nic_name}",
            user_id=current_user.id
        )
        return result
    else:
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to remove NIC"))


@router.get("/vms/{vm_moid}/nics")
async def get_vm_nics(vm_moid: str, connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    """Get list of NICs on a VM."""
    conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Infrastructure connection not found")
    
    if conn.provider and conn.provider.lower() == "proxmox":
        result = proxmox_service.get_vm_nics(int(vm_moid), connection_id=connection_id)
        return result
    
    result = vsphere_service.get_vm_nics(vm_moid, connection_id=connection_id)
    return result
