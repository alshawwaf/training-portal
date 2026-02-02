import logging
import re
from proxmoxer import ProxmoxAPI
import os
import requests
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from db.models import SystemSetting

# Disable SSL warnings for self-signed certs (common in Proxmox)
requests.packages.urllib3.disable_warnings()

logger = logging.getLogger(__name__)

def sanitize_vm_name(name: str) -> str:
    """
    Sanitize VM name to be a valid DNS hostname for Proxmox.
    - Replace spaces and underscores with hyphens
    - Remove any characters that aren't alphanumeric or hyphens
    - Convert to lowercase
    - Remove leading/trailing hyphens
    - Limit to 63 characters (DNS label limit)
    """
    # Replace spaces and underscores with hyphens
    sanitized = name.replace(" ", "-").replace("_", "-")
    # Remove any non-alphanumeric characters except hyphens
    sanitized = re.sub(r'[^a-zA-Z0-9-]', '', sanitized)
    # Convert to lowercase
    sanitized = sanitized.lower()
    # Remove consecutive hyphens
    sanitized = re.sub(r'-+', '-', sanitized)
    # Remove leading/trailing hyphens
    sanitized = sanitized.strip('-')
    # Limit to 63 characters
    sanitized = sanitized[:63]
    # If empty after sanitization, provide a default
    if not sanitized:
        sanitized = "vm"
    return sanitized

class ProxmoxService:
    def __init__(self):
        self.connections = {}  # {connection_id: ProxmoxAPI}
        self.connection_nodes = {} # {connection_id: node_name}
        self.proxmox = None  # Legacy compatibility
        
    def load_config(self, db: Session):
        """Load Proxmox configuration from database (legacy compatibility stub)."""
        # This method exists for compatibility with main.py startup
        # Actual connections are loaded on-demand via get_api()
        logger.info("ProxmoxService: Configuration loaded (on-demand connection mode)")
        
    def test_connection(self, host: str, user: str, password: str = None, token_id: str = None, token_secret: str = None, port: int = 8006, verify_ssl: bool = False):
        """Test connection with provided credentials without saving them."""
        try:
            # Create a temporary connection
            # Check if using token or password
            if token_id and token_secret:
                px = ProxmoxAPI(host, user=user, token_name=token_id, token_value=token_secret, verify_ssl=verify_ssl, port=port, timeout=5)
            else:
                px = ProxmoxAPI(host, user=user, password=password, verify_ssl=verify_ssl, port=port, timeout=5)
            
            # Try to fetch version to verify auth
            version = px.version.get()
            return {
                "success": True, 
                "message": f"Successfully connected to Proxmox {version['release']}",
                "version": version['release']
            }
        except Exception as e:
            return {"success": False, "message": f"Connection failed: {str(e)}"}

    def get_api(self, connection_id: Optional[int] = None) -> (Optional[ProxmoxAPI], Optional[str]):
        """Get API instance and default node for a connection."""
        if not connection_id:
            return None, None
        
        if connection_id in self.connections:
            return self.connections[connection_id], self.connection_nodes.get(connection_id, "pve")
            
        # Load from DB
        from db.database import SessionLocal
        from db.models import InfrastructureConnection
        db = SessionLocal()
        try:
            conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
            if not conn:
                return None, None
            
            if conn.token_id and conn.token_secret:
                px = ProxmoxAPI(
                    conn.host, user=conn.user, token_name=conn.token_id, token_value=conn.token_secret, 
                    verify_ssl=conn.verify_ssl, port=conn.port, timeout=5
                )
            else:
                px = ProxmoxAPI(
                    conn.host, user=conn.user, password=conn.password, 
                    verify_ssl=conn.verify_ssl, port=conn.port, timeout=5
                )
            
            self.connections[connection_id] = px
            self.connection_nodes[connection_id] = conn.node or "pve"
            return px, self.connection_nodes[connection_id]
        except Exception as e:
            logger.error(f"Failed to connect to Proxmox connection {connection_id}: {e}")
            return None, None
        finally:
            db.close()

    def get_nodes(self, connection_id: Optional[int] = None):
        px, _ = self.get_api(connection_id)
        if not px: return []
        return px.nodes.get()

    def find_vm_node(self, px, vmid: int) -> Optional[str]:
        """Find which node a VM is on by querying all nodes."""
        try:
            nodes = px.nodes.get()
            for node_info in nodes:
                node_name = node_info.get('node')
                try:
                    vms = px.nodes(node_name).qemu.get()
                    for vm in vms:
                        if str(vm.get('vmid')) == str(vmid):
                            return node_name
                except:
                    continue
        except Exception as e:
            logger.error(f"Error finding node for VM {vmid}: {e}")
        return None

    def get_vms(self, connection_id: Optional[int] = None):
        """Get all QEMU VMs from all nodes in the cluster."""
        px, default_node = self.get_api(connection_id)
        logger.info(f"get_vms called for connection_id={connection_id}")
        if not px: 
            logger.warning(f"get_vms: API is None")
            return []
        
        all_vms = []
        try:
            # Get all nodes in the cluster
            nodes = px.nodes.get()
            logger.info(f"get_vms: Found {len(nodes)} nodes: {[n.get('node') for n in nodes]}")
            
            # Query VMs from each node
            for node_info in nodes:
                node_name = node_info.get('node')
                try:
                    vms = px.nodes(node_name).qemu.get()
                    # Add node info to each VM
                    for vm in vms:
                        vm['node'] = node_name
                    all_vms.extend(vms)
                    logger.info(f"get_vms: Found {len(vms)} VMs on node '{node_name}'")
                except Exception as e:
                    logger.error(f"get_vms error for node {node_name}: {e}")
            
            logger.info(f"get_vms: Total {len(all_vms)} VMs across all nodes")
            return all_vms
        except Exception as e:
            logger.error(f"get_vms error: {e}")
            return []
    
    def vm_action(self, vmid: int, action: str, connection_id: Optional[int] = None):
        px, node = self.get_api(connection_id)
        if not px or not node: return {"status": "error", "message": "Proxmox not connected"}
        
        try:
            if action == "restart":
                action = "reset"
            elif action == "pause":
                action = "suspend"
            
            resp = px.nodes(node).qemu(vmid).status.post(action)
            return {"status": "success", "data": resp}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def revert_vm(self, vmid: int, snapname: str, connection_id: Optional[int] = None):
        px, node = self.get_api(connection_id)
        if not px or not node: return {"status": "error", "message": "Proxmox not connected"}
        try:
            resp = px.nodes(node).qemu(vmid).snapshot(snapname).rollback.post()
            return {"status": "success", "data": resp}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def clone_vm(self, vmid: int, newid: int, newname: str, connection_id: Optional[int] = None):
        px, node = self.get_api(connection_id)
        if not px or not node: return {"status": "error", "message": "Proxmox not connected"}
        try:
            # Sanitize VM name for Proxmox DNS hostname requirement
            safe_name = sanitize_vm_name(newname)
            resp = px.nodes(node).qemu(vmid).clone.post(newid=newid, name=safe_name, full=1)
            return {"status": "success", "data": resp}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def rename_vm(self, vmid: int, new_name: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Rename a VM in Proxmox."""
        px, node = self.get_api(connection_id)
        if not px or not node:
            return {"success": False, "message": "Proxmox not connected"}
        try:
            # Sanitize VM name for Proxmox DNS hostname requirement
            safe_name = sanitize_vm_name(new_name)
            px.nodes(node).qemu(vmid).config.put(name=safe_name)
            logger.info(f"VM {vmid} renamed to {safe_name}")
            return {"success": True, "message": f"VM renamed to {safe_name}", "new_name": safe_name}
        except Exception as e:
            logger.error(f"Failed to rename VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def sync_inventory(self, connection_id: Optional[int] = None):

        """Fetch all inventory (VMs and containers) from all nodes and save to JSON cache."""
        try:
            px, _ = self.get_api(connection_id)
            if not px:
                return {"success": False, "message": "Proxmox not connected"}
            
            all_resources = []
            nodes = px.nodes.get()
            logger.info(f"sync_inventory: Found {len(nodes)} nodes")
            
            for node_info in nodes:
                node_name = node_info.get('node')
                
                # Get QEMU VMs
                try:
                    qemu_vms = px.nodes(node_name).qemu.get()
                    for vm in qemu_vms:
                        all_resources.append({
                            "name": vm.get('name'),
                            "moid": str(vm.get('vmid')),
                            "guest": "qemu",
                            "num_cpu": vm.get('cpus', 1),
                            "memory_mb": int(vm.get('maxmem', 1024*1024*1024)/1024/1024),
                            "is_template": vm.get('template', 0) == 1,
                            "power_state": vm.get('status', 'unknown'),
                            "node": node_name,
                            "type": "qemu"
                        })
                    logger.info(f"sync_inventory: Found {len(qemu_vms)} QEMU VMs on node '{node_name}'")
                except Exception as e:
                    logger.error(f"Error getting QEMU VMs from {node_name}: {e}")
                
                # Get LXC containers
                try:
                    lxc_containers = px.nodes(node_name).lxc.get()
                    for ct in lxc_containers:
                        all_resources.append({
                            "name": ct.get('name'),
                            "moid": str(ct.get('vmid')),
                            "guest": "lxc",
                            "num_cpu": ct.get('cpus', 1),
                            "memory_mb": int(ct.get('maxmem', 512*1024*1024)/1024/1024),
                            "is_template": ct.get('template', 0) == 1,
                            "power_state": ct.get('status', 'unknown'),
                            "node": node_name,
                            "type": "lxc"
                        })
                    logger.info(f"sync_inventory: Found {len(lxc_containers)} LXC containers on node '{node_name}'")
                except Exception as e:
                    logger.error(f"Error getting LXC containers from {node_name}: {e}")
            
            data = {
                "vms": all_resources,
                "last_sync": datetime.utcnow().isoformat(),
                "vm_count": len(all_resources)
            }
            
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
            os.makedirs(data_dir, exist_ok=True)
            file_name = f"proxmox_inventory_{connection_id}.json" if connection_id else "proxmox_inventory.json"
            file_path = os.path.join(data_dir, file_name)
            
            with open(file_path, 'w') as f:
                json.dump(data, f)
            
            logger.info(f"sync_inventory: Saved {len(all_resources)} resources to {file_path}")
            return {"success": True, "message": f"Synced {len(all_resources)} resources", "data": data, "vm_count": len(all_resources)}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def get_cached_inventory(self, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Retrieve inventory from JSON cache. If connection_id is None, aggregates all."""
        try:
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
            
            if connection_id:
                file_name = f"proxmox_inventory_{connection_id}.json"
                file_path = os.path.join(data_dir, file_name)
                if not os.path.exists(file_path):
                    return {"success": False, "message": "No cached inventory found", "data": None}
                with open(file_path, 'r') as f:
                    return {"success": True, "data": json.load(f)}
            
            # Aggregate all found inventories
            all_vms = []
            files = [f for f in os.listdir(data_dir) if f.startswith("proxmox_inventory") and f.endswith(".json")]
            for f_name in files:
                try:
                    with open(os.path.join(data_dir, f_name), 'r') as f:
                        inv = json.load(f)
                        if inv and 'vms' in inv:
                            all_vms.extend(inv['vms'])
                except:
                    continue
            
            return {"success": True, "data": {"vms": all_vms, "last_sync": datetime.utcnow().isoformat()}}

        except Exception as e:
            return {"success": False, "message": str(e), "data": None}

    def get_storages(self, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of storages with available space."""
        px, node = self.get_api(connection_id)
        if not px or not node:
            return []
        try:
            storages = px.nodes(node).storage.get()
            return [{
                "name": s.get("storage"),
                "type": s.get("type"),
                "content": s.get("content", ""),
                "total_bytes": s.get("total", 0),
                "used_bytes": s.get("used", 0),
                "free_bytes": s.get("avail", 0),
                "enabled": s.get("enabled", 1) == 1
            } for s in storages if s.get("enabled", 1) == 1]
        except Exception as e:
            logger.error(f"Failed to get storages: {e}")
            return []

    def get_network_bridges(self, connection_id: Optional[int] = None) -> List[str]:
        """Get list of network bridges available on the Proxmox cluster."""
        px, node = self.get_api(connection_id)
        if not px or not node:
            return []
        try:
            # Get network config from node
            networks = px.nodes(node).network.get()
            bridges = []
            for net in networks:
                if net.get("type") == "bridge":
                    bridges.append(net.get("iface", ""))
            return bridges
        except Exception as e:
            logger.error(f"Failed to get network bridges: {e}")
            return []

    def get_vm_info(self, vmid: int, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Get detailed VM information including IP address."""
        px, node = self.get_api(connection_id)
        if not px or not node:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            # Get VM status and config
            status = px.nodes(node).qemu(vmid).status.current.get()
            config = px.nodes(node).qemu(vmid).config.get()
            
            # Try to get IP from QEMU agent
            ip_address = None
            try:
                agent_info = px.nodes(node).qemu(vmid).agent.get("network-get-interfaces")
                for iface in agent_info.get("result", []):
                    if iface.get("name") != "lo":
                        for ip_info in iface.get("ip-addresses", []):
                            if ip_info.get("ip-address-type") == "ipv4":
                                ip_address = ip_info.get("ip-address")
                                break
                    if ip_address:
                        break
            except:
                pass  # QEMU agent not available
            
            return {
                "success": True,
                "vmid": vmid,
                "name": status.get("name", f"VM-{vmid}"),
                "status": status.get("status", "unknown"),
                "cpu_cores": config.get("cores", 1) * config.get("sockets", 1),
                "memory_mb": int(config.get("memory", 1024)),
                "disk_gb": None,  # Requires parsing disk config
                "ip_address": ip_address,
                "os_type": config.get("ostype", "other"),
                "uptime": status.get("uptime", 0)
            }
        except Exception as e:
            logger.error(f"Failed to get VM info for {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def get_vm_power_state(self, vmid: int, connection_id: Optional[int] = None) -> str:
        """Get power state of a VM (poweredOn, poweredOff, suspended)."""
        px, node = self.get_api(connection_id)
        if not px or not node:
            return "unknown"
        
        try:
            status = px.nodes(node).qemu(vmid).status.current.get()
            pve_status = status.get("status", "unknown")
            # Map Proxmox states to normalized states
            state_map = {
                "running": "poweredOn",
                "stopped": "poweredOff",
                "paused": "suspended"
            }
            return state_map.get(pve_status, pve_status)
        except Exception as e:
            logger.error(f"Failed to get power state for VM {vmid}: {e}")
            return "unknown"

    def control_vm_power(self, vmid: int, action: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Control VM power state. Actions: start, stop, restart, suspend."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            action_map = {
                "start": "start",
                "stop": "stop",
                "restart": "reset",
                "reset": "reset",
                "suspend": "suspend",
                "resume": "resume"
            }
            pve_action = action_map.get(action, action)
            
            resp = px.nodes(vm_node).qemu(vmid).status.post(pve_action)
            logger.info(f"VM {vmid} on node '{vm_node}' power action '{action}' initiated: {resp}")
            return {"success": True, "message": f"VM {action} initiated", "task": resp}
        except Exception as e:
            logger.error(f"Failed to {action} VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def provision_vm(self, template_vmid: int, new_name: str, new_vmid: Optional[int] = None, 
                     target_storage: Optional[str] = None, pool: Optional[str] = None,
                     connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Clone a VM from a template.
        
        Args:
            template_vmid: VMID of the template to clone
            new_name: Name for the new VM
            new_vmid: Optional specific VMID (auto-assigns if None)
            target_storage: Target storage for the clone
            pool: Resource pool to add the VM to (like vSphere folders)
            connection_id: Proxmox connection to use
        """
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            # Find the node where the template is located
            template_node = self.find_vm_node(px, template_vmid)
            if not template_node:
                return {"success": False, "message": f"Template {template_vmid} not found on any node"}
            
            # Get next available VMID if not provided
            if not new_vmid:
                new_vmid = px.cluster.nextid.get()
            
            logger.info(f"Cloning VM {template_vmid} -> {new_vmid} ({new_name}) on node {template_node}")
            
            # Sanitize VM name for Proxmox DNS hostname requirement
            safe_name = sanitize_vm_name(new_name)
            
            # Build clone parameters
            clone_params = {
                "newid": new_vmid,
                "name": safe_name,
                "full": 1  # Full clone (not linked)
            }
            
            if target_storage:
                clone_params["storage"] = target_storage
            
            # Add pool if specified (will be added after clone)
            if pool:
                clone_params["pool"] = pool
            
            # Execute clone
            task = px.nodes(template_node).qemu(template_vmid).clone.post(**clone_params)
            logger.info(f"Clone task started: {task}")
            
            # Wait for clone task to complete (with timeout)
            import time
            max_wait = 300  # 5 minutes
            waited = 0
            while waited < max_wait:
                task_status = px.nodes(template_node).tasks(task).status.get()
                if task_status.get("status") == "stopped":
                    if task_status.get("exitstatus") == "OK":
                        logger.info(f"Clone completed: VMID {new_vmid}")
                        return {
                            "success": True,
                            "message": f"VM cloned successfully",
                            "vmid": new_vmid,
                            "moid": str(new_vmid),
                            "name": new_name
                        }
                    else:
                        error = task_status.get("exitstatus", "Unknown error")
                        return {"success": False, "message": f"Clone failed: {error}"}
                
                time.sleep(2)
                waited += 2
            
            return {"success": False, "message": "Clone timed out after 5 minutes"}
            
        except Exception as e:
            logger.error(f"Failed to provision VM from {template_vmid}: {e}")
            return {"success": False, "message": str(e)}

    def delete_vm(self, vmid: int, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Delete a VM (must be stopped first)."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Check if VM is running
            status = self.get_vm_power_state(vmid, connection_id)
            if status == "poweredOn":
                # Stop it first
                logger.info(f"Stopping VM {vmid} before deletion")
                self.control_vm_power(vmid, "stop", connection_id)
                import time
                time.sleep(5)  # Wait for stop
            
            # Delete the VM
            task = px.nodes(vm_node).qemu(vmid).delete()
            logger.info(f"VM {vmid} deletion initiated: {task}")
            return {"success": True, "message": f"VM {vmid} deleted", "task": task}
            
        except Exception as e:
            logger.error(f"Failed to delete VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def revert_to_snapshot(self, vmid: int, snapname: str = None, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Revert VM to a snapshot. If snapname is None, uses the first available snapshot."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # If no snapshot specified, find the first one
            if not snapname:
                snapshots = px.nodes(vm_node).qemu(vmid).snapshot.get()
                # Filter out 'current' which is not a real snapshot
                real_snaps = [s for s in snapshots if s.get("name") != "current"]
                if not real_snaps:
                    return {"success": False, "message": "No snapshots available"}
                snapname = real_snaps[0].get("name")
            
            task = px.nodes(vm_node).qemu(vmid).snapshot(snapname).rollback.post()
            logger.info(f"VM {vmid} reverted to snapshot {snapname}: {task}")
            return {"success": True, "message": f"Reverted to {snapname}", "task": task}
            
        except Exception as e:
            logger.error(f"Failed to revert VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def clone_vm(self, vmid: int, new_name: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Clone a VM to a new VM with the given name."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            new_vmid = px.cluster.nextid.get()
            
            # Sanitize VM name for Proxmox DNS hostname requirement
            safe_name = sanitize_vm_name(new_name)
            
            clone_params = {
                "newid": new_vmid,
                "name": safe_name,
                "full": 1
            }
            
            task = px.nodes(vm_node).qemu(vmid).clone.post(**clone_params)
            logger.info(f"VM {vmid} clone initiated -> {new_vmid} ({safe_name}): {task}")
            return {"success": True, "message": f"Clone initiated: {safe_name}", "vmid": new_vmid, "task": task}
            
        except Exception as e:
            logger.error(f"Failed to clone VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def convert_to_template(self, vmid: int, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Convert a VM to a template."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Make sure VM is stopped first
            status = self.get_vm_power_state(vmid, connection_id)
            if status == "poweredOn":
                self.control_vm_power(vmid, "stop", connection_id)
                import time
                time.sleep(5)
            
            # Convert to template
            px.nodes(vm_node).qemu(vmid).template.post()
            logger.info(f"VM {vmid} converted to template")
            return {"success": True, "message": f"VM {vmid} converted to template"}
            
        except Exception as e:
            logger.error(f"Failed to convert VM {vmid} to template: {e}")
            return {"success": False, "message": str(e)}

    def assign_vm_to_network(self, vmid: int, nic_name: str, 
                             vlan_tag: Optional[int] = None, 
                             bridge: str = "vmbr0", 
                             model: str = "virtio",
                             firewall: bool = False,
                             mtu: Optional[int] = None,
                             mac: Optional[str] = None,
                             rate_limit: Optional[float] = None,
                             multiqueue: Optional[int] = None,
                             disconnect: bool = False,
                             connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Assign a VM or Container NIC to a specific VLAN on a bridge with extended settings."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Determine if it's a VM or Container
            res_type = "qemu"
            try:
                px.nodes(vm_node).qemu(vmid).config.get()
            except:
                try:
                    px.nodes(vm_node).lxc(vmid).config.get()
                    res_type = "lxc"
                except:
                    return {"success": False, "message": f"Could not find VM or Container {vmid}"}

            # Get current config
            api_res = px.nodes(vm_node).qemu(vmid) if res_type == "qemu" else px.nodes(vm_node).lxc(vmid)
            config = api_res.config.get()
            
            # Start strict construction of new config string
            params = []
            
            # 1. Model & MAC (only for QEMU)
            # If QEMU, format is usually "model=mac" or just "model"
            # If LXC, format is usually "name=eth0"
            
            current_mac = ""
            existing_config = config.get(nic_name, "")
            
            if res_type == "qemu":
                # Try to preserve existing MAC if not specified
                if not mac and existing_config:
                    parts = existing_config.split(",")
                    if "=" in parts[0]:
                        k, v = parts[0].split("=", 1)
                        if k == model:
                            current_mac = v
                        elif k in ("virtio", "e1000", "rtl8139", "e1000e", "vmxnet3"):
                            # Model changed, but maybe we want to keep MAC?
                            # Usually better to let Proxmox gen new one if model changes, 
                            # unless we explicitly extracted it.
                            # Let's extract MAC from existing config if possible
                            current_mac = v
                    elif len(parts[0]) == 17 and ":" in parts[0]: 
                         # Sometimes it's just MAC if model is default? No, usually key=value
                         pass
                
                final_mac = mac if mac else current_mac
                
                if final_mac:
                    params.append(f"{model}={final_mac}")
                else:
                    params.append(f"{model}")
            else:
                # LXC
                params.append("name=eth0") # Hardcode for now as usually eth0 inside container
            
            # 2. Bridge
            params.append(f"bridge={bridge}")
            
            # 3. VLAN
            if vlan_tag is not None:
                params.append(f"tag={vlan_tag}")
            
            # 4. Firewall
            if firewall:
                params.append("firewall=1")
            
            # 5. MTU
            if mtu:
                params.append(f"mtu={mtu}")
            
            # 6. Rate Limit
            if rate_limit:
                params.append(f"rate={rate_limit}")
            
            # 7. Multiqueue (QEMU only)
            if res_type == "qemu" and multiqueue:
                params.append(f"queues={multiqueue}")
            
            # 8. Link Down
            if disconnect:
                params.append("link_down=1")
            
            new_config_str = ",".join(params)
            
            api_res.config.post(**{nic_name: new_config_str})
            
            logger.info(f"{res_type.upper()} {vmid} NIC {nic_name} updated: {new_config_str}")
            return {"success": True, "message": f"Updated {nic_name} settings"}
            
        except Exception as e:
            logger.error(f"Failed to assign {vmid} to network: {e}")
            return {"success": False, "message": str(e)}

    def generate_console_ticket(self, vmid: int, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Generate a VNC/Spice console ticket for browser-based access.
        Returns ticket info for Guacamole VNC connection.
        """
        px, node = self.get_api(connection_id)
        if not px or not node:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            # Get VM config to check display type
            config = px.nodes(node).qemu(vmid).config.get()
            vga = config.get("vga", "std")
            
            # Request VNC proxy (works for all display types)
            ticket_data = px.nodes(node).qemu(vmid).vncproxy.post()
            
            # Get connection info
            from db.database import SessionLocal
            from db.models import InfrastructureConnection
            db = SessionLocal()
            try:
                conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
                host = conn.host if conn else "localhost"
                port = conn.port if conn else 8006
            finally:
                db.close()
            
            return {
                "success": True,
                "type": "vnc",
                "host": host,
                "port": ticket_data.get("port", 5900),
                "ticket": ticket_data.get("ticket", ""),
                "user": ticket_data.get("user", ""),
                "vmid": vmid,
                "pve_port": port
            }
            
        except Exception as e:
            logger.error(f"Failed to generate console ticket for VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def get_snapshots(self, vmid: int, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of snapshots for a VM."""
        px, node = self.get_api(connection_id)
        if not px or not node:
            return []
        
        try:
            snapshots = px.nodes(node).qemu(vmid).snapshot.get()
            return [{
                "name": s.get("name"),
                "description": s.get("description", ""),
                "created": s.get("snaptime", 0),
                "parent": s.get("parent", None)
            } for s in snapshots if s.get("name") != "current"]
        except Exception as e:
            logger.error(f"Failed to get snapshots for VM {vmid}: {e}")
            return []

    def get_vm_hardware(self, vmid: int, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get detailed hardware configuration for a VM.
        Returns format compatible with vSphere get_vm_hardware for frontend consistency.
        """
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            # Find the node where VM is located
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Get VM configuration
            config = px.nodes(vm_node).qemu(vmid).config.get()
            status = px.nodes(vm_node).qemu(vmid).status.current.get()
            
            # Parse CPU configuration
            sockets = config.get("sockets", 1)
            cores = config.get("cores", 1)
            num_cpus = sockets * cores
            cpu_type = config.get("cpu", "kvm64")
            
            # Parse memory
            memory_mb = int(config.get("memory", 1024))
            
            # Parse disks
            disks = []
            for key, value in config.items():
                if key.startswith(("scsi", "sata", "ide", "virtio")) and not key.endswith("0"):
                    # Skip non-disk entries
                    if not isinstance(value, str):
                        continue
                    # Parse disk string like "local-lvm:vm-100-disk-0,size=32G"  
                    parts = value.split(",")
                    storage_path = parts[0] if parts else ""
                    size_gb = 0
                    for part in parts:
                        if part.startswith("size="):
                            size_str = part.replace("size=", "").upper()
                            if "G" in size_str:
                                size_gb = int(size_str.replace("G", ""))
                            elif "T" in size_str:
                                size_gb = int(size_str.replace("T", "")) * 1024
                            elif "M" in size_str:
                                size_gb = int(size_str.replace("M", "")) // 1024
                    
                    disks.append({
                        "key": key,
                        "label": key.upper(),
                        "size_gb": size_gb,
                        "datastore": storage_path.split(":")[0] if ":" in storage_path else storage_path,
                        "file_path": storage_path,
                        "thin_provisioned": True,  # Proxmox uses thin by default
                        "controller_type": key.rstrip("0123456789")
                    })
            
            # Also check disk0 entries
            for key, value in config.items():
                if (key.startswith(("scsi", "sata", "ide", "virtio")) and 
                    any(key.endswith(str(i)) for i in range(10))):
                    if not isinstance(value, str) or "media=cdrom" in value:
                        continue  # Skip CD-ROM
                    
                    parts = value.split(",")
                    storage_path = parts[0] if parts else ""
                    size_gb = 0
                    for part in parts:
                        if part.startswith("size="):
                            size_str = part.replace("size=", "").upper()
                            if "G" in size_str:
                                size_gb = int(size_str.replace("G", ""))
                            elif "T" in size_str:
                                size_gb = int(size_str.replace("T", "")) * 1024
                    
                    # Avoid duplicates
                    if not any(d["key"] == key for d in disks):
                        disks.append({
                            "key": key,
                            "label": key.upper(),
                            "size_gb": size_gb,
                            "datastore": storage_path.split(":")[0] if ":" in storage_path else storage_path,
                            "file_path": storage_path,
                            "thin_provisioned": True,
                            "controller_type": key.rstrip("0123456789")
                        })
            
            # Parse NICs
            nics = []
            for key, value in config.items():
                if key.startswith("net") and isinstance(value, str):
                    # Parse NIC string like "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0,tag=100"
                    parts = value.split(",")
                    mac = ""
                    bridge = ""
                    vlan = None
                    model = "virtio"
                    
                    for part in parts:
                        if "=" in part:
                            k, v = part.split("=", 1)
                            if k in ("virtio", "e1000", "rtl8139"):
                                model = k
                                mac = v
                            elif k == "bridge":
                                bridge = v
                            elif k == "tag":
                                vlan = int(v)
                        elif part in ("virtio", "e1000", "rtl8139"):
                            model = part
                    
                    nics.append({
                        "key": key,
                        "label": key.upper(),
                        "mac_address": mac,
                        "network": bridge,
                        "adapter_type": model,
                        "connected": True,
                        "vlan": vlan
                    })
            
            # Get boot order
            boot_order = config.get("boot", "cdn")
            
            # Firmware
            bios = config.get("bios", "seabios")
            firmware = "efi" if bios == "ovmf" else "bios"
            
            return {
                "success": True,
                "name": status.get("name", f"VM-{vmid}"),
                "vmid": vmid,
                "power_state": "poweredOn" if status.get("status") == "running" else "poweredOff",
                "compute": {
                    "num_cpus": num_cpus,
                    "sockets": sockets,
                    "cores_per_socket": cores,
                    "cpu_type": cpu_type,
                    "memory_mb": memory_mb,
                    "nested_hv_enabled": config.get("nested", False),
                    "cpu_hot_add_enabled": config.get("hotplug", "") and "cpu" in str(config.get("hotplug", "")),
                    "memory_hot_add_enabled": config.get("hotplug", "") and "memory" in str(config.get("hotplug", ""))
                },
                "firmware": {
                    "type": firmware,
                    "secure_boot_enabled": False  # Proxmox doesn't expose this directly
                },
                "disks": disks,
                "nics": nics,
                "boot_order": boot_order,
                "os_type": config.get("ostype", "other"),
                "node": vm_node
            }
            
        except Exception as e:
            logger.error(f"Failed to get VM hardware for {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def reconfigure_vm(self, vmid: int, config_updates: Dict[str, Any], connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Reconfigure VM compute settings."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            pve_config = {}
            
            # Map frontend config to Proxmox config
            if "num_cpus" in config_updates:
                pve_config["cores"] = config_updates["num_cpus"]
            if "cores_per_socket" in config_updates:
                pve_config["cores"] = config_updates["cores_per_socket"]
            if "memory_mb" in config_updates:
                pve_config["memory"] = config_updates["memory_mb"]
            if "name" in config_updates:
                pve_config["name"] = sanitize_vm_name(config_updates["name"])
            
            if pve_config:
                px.nodes(vm_node).qemu(vmid).config.put(**pve_config)
                logger.info(f"VM {vmid} reconfigured: {pve_config}")
            
            return {"success": True, "message": "VM reconfigured successfully"}
            
        except Exception as e:
            logger.error(f"Failed to reconfigure VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def add_nic_to_vm(self, vmid: int, network: str, model: str = "virtio", 
                      vlan: Optional[int] = None, firewall: bool = False, 
                      mtu: Optional[int] = None, mac: Optional[str] = None,
                      rate_limit: Optional[float] = None, multiqueue: Optional[int] = None,
                      disconnect: bool = False, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Add a new NIC to a VM.
        Supports advanced settings: model, vlan, firewall, mtu, mac, rate, queues, link_down.
        """
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Get current config to find next available net index
            config = px.nodes(vm_node).qemu(vmid).config.get()
            next_idx = 0
            for i in range(32): # Check up to 32 NICs
                if f"net{i}" not in config:
                    next_idx = i
                    break
            
            # Build config string
            # Format: model=mac,bridge=bridge,tag=vlan,firewall=1...
            params = []
            
            # Model and MAC
            # If MAC is provided, usage is model=mac. If not, just model (Proxmox generates MAC)
            if mac:
                params.append(f"{model}={mac}")
            else:
                params.append(f"{model}") # This might need to be "virtio" or "virtio=" depending on API version, but "virtio" usually works for auto
            
            params.append(f"bridge={network}")
            
            if vlan is not None:
                params.append(f"tag={vlan}")
            
            if firewall:
                params.append("firewall=1")
                
            if mtu:
                params.append(f"mtu={mtu}")
                
            if rate_limit:
                params.append(f"rate={rate_limit}")
                
            if multiqueue:
                params.append(f"queues={multiqueue}")
                
            if disconnect:
                params.append("link_down=1")
                
            nic_config = ",".join(params)
            
            # If just "virtio" without value, ensure it's treated correctly or try standard format
            # Actually, standard for auto-mac is often just key present. 
            # If specific issues arise, we might need to change this.
            
            px.nodes(vm_node).qemu(vmid).config.put(**{f"net{next_idx}": nic_config})
            
            logger.info(f"Added NIC net{next_idx} to VM {vmid} on bridge {network} (VLAN: {vlan}, FW: {firewall})")
            return {"success": True, "message": f"Added NIC net{next_idx}", "nic_key": f"net{next_idx}"}
            
        except Exception as e:
            logger.error(f"Failed to add NIC to VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def remove_nic_from_vm(self, vmid: int, nic_key: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Remove a NIC from a VM."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Delete the NIC by setting it to empty with delete flag
            px.nodes(vm_node).qemu(vmid).config.put(delete=nic_key)
            
            logger.info(f"Removed NIC {nic_key} from VM {vmid}")
            return {"success": True, "message": f"Removed NIC {nic_key}"}
            
        except Exception as e:
            logger.error(f"Failed to remove NIC from VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def get_vm_nics(self, vmid: int, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Get list of NICs on a VM."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected", "nics": []}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node", "nics": []}
            
            config = px.nodes(vm_node).qemu(vmid).config.get()
            
            nics = []
            for key, value in config.items():
                if key.startswith("net") and isinstance(value, str):
                    # Parse NIC string like "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0,tag=100"
                    parts = value.split(",")
                    mac = ""
                    bridge = ""
                    vlan = None
                    model = "virtio"
                    
                    for part in parts:
                        if "=" in part:
                            k, v = part.split("=", 1)
                            if k in ("virtio", "e1000", "rtl8139"):
                                model = k
                                mac = v
                            elif k == "bridge":
                                bridge = v
                            elif k == "tag":
                                try:
                                    vlan = int(v)
                                except:
                                    pass
                        elif part in ("virtio", "e1000", "rtl8139"):
                            model = part
                    
                    nics.append({
                        "name": key,
                        "key": key,
                        "label": key.upper(),
                        "mac_address": mac,
                        "network": bridge,
                        "network_type": "bridge",
                        "adapter_type": model,
                        "connected": True,
                        "vlan": vlan
                    })
            
            return {"success": True, "nics": nics}
            
        except Exception as e:
            logger.error(f"Failed to get NICs for VM {vmid}: {e}")
            return {"success": False, "message": str(e), "nics": []}

    # ==================== DISK MANAGEMENT ====================

    def add_disk_to_vm(self, vmid: int, size_gb: int, storage: str,
                       thin_provisioned: bool = True, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Add a new disk to a VM."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Get current config to find next available disk slot
            config = px.nodes(vm_node).qemu(vmid).config.get()
            
            # Find next available SCSI disk slot
            next_idx = 0
            for i in range(16):
                if f"scsi{i}" not in config:
                    next_idx = i
                    break
            
            # Create disk config string
            disk_format = "qcow2" if thin_provisioned else "raw"
            disk_config = f"{storage}:{size_gb},format={disk_format}"
            
            px.nodes(vm_node).qemu(vmid).config.put(**{f"scsi{next_idx}": disk_config})
            
            logger.info(f"Added disk scsi{next_idx} ({size_gb}GB) to VM {vmid}")
            return {
                "success": True, 
                "message": f"Added {size_gb}GB disk", 
                "disk_key": f"scsi{next_idx}"
            }
            
        except Exception as e:
            logger.error(f"Failed to add disk to VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def resize_disk(self, vmid: int, disk_key: str, new_size_gb: int,
                    connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Resize an existing disk (can only grow, not shrink)."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Proxmox resize expects the new total size
            px.nodes(vm_node).qemu(vmid).resize.put(disk=disk_key, size=f"{new_size_gb}G")
            
            logger.info(f"Resized disk {disk_key} to {new_size_gb}GB on VM {vmid}")
            return {"success": True, "message": f"Disk resized to {new_size_gb}GB"}
            
        except Exception as e:
            logger.error(f"Failed to resize disk on VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def remove_disk(self, vmid: int, disk_key: str, delete_files: bool = True,
                    connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Remove a disk from a VM."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Delete the disk configuration
            px.nodes(vm_node).qemu(vmid).config.put(delete=disk_key)
            
            # If delete_files, also remove unused disks from storage
            if delete_files:
                try:
                    # Get VM config and find unused disks
                    config = px.nodes(vm_node).qemu(vmid).config.get()
                    for key, value in config.items():
                        if key.startswith("unused") and disk_key in str(value):
                            px.nodes(vm_node).qemu(vmid).config.put(delete=key)
                except:
                    pass  # Cleanup is best-effort
            
            logger.info(f"Removed disk {disk_key} from VM {vmid}")
            return {"success": True, "message": f"Removed disk {disk_key}"}
            
        except Exception as e:
            logger.error(f"Failed to remove disk from VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    # ==================== SNAPSHOT MANAGEMENT ====================

    def get_vm_snapshots(self, vmid: int, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Get list of snapshots for a VM (API-consistent name)."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected", "snapshots": []}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found", "snapshots": []}
            
            snapshots = px.nodes(vm_node).qemu(vmid).snapshot.get()
            
            result = []
            for snap in snapshots:
                if snap.get("name") != "current":
                    result.append({
                        "name": snap.get("name"),
                        "moid": snap.get("name"),  # For API consistency with vSphere
                        "description": snap.get("description", ""),
                        "created": snap.get("snaptime", 0),
                        "parent": snap.get("parent"),
                        "has_memory": snap.get("vmstate", False)
                    })
            
            return {"success": True, "snapshots": result}
            
        except Exception as e:
            logger.error(f"Failed to get snapshots for VM {vmid}: {e}")
            return {"success": False, "message": str(e), "snapshots": []}

    def create_snapshot(self, vmid: int, name: str, description: str = "",
                        memory: bool = False, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Create a snapshot of a VM."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Sanitize snapshot name (alphanumeric + underscores only)
            safe_name = re.sub(r'[^a-zA-Z0-9_]', '_', name)[:40]
            
            params = {
                "snapname": safe_name,
                "description": description
            }
            if memory:
                params["vmstate"] = 1
            
            task = px.nodes(vm_node).qemu(vmid).snapshot.post(**params)
            
            logger.info(f"Created snapshot '{safe_name}' for VM {vmid}: {task}")
            return {"success": True, "message": f"Snapshot '{safe_name}' created", "snapshot_name": safe_name}
            
        except Exception as e:
            logger.error(f"Failed to create snapshot for VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def delete_snapshot(self, vmid: int, snapname: str, 
                        connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Delete a snapshot."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            task = px.nodes(vm_node).qemu(vmid).snapshot(snapname).delete()
            
            logger.info(f"Deleted snapshot '{snapname}' from VM {vmid}: {task}")
            return {"success": True, "message": f"Snapshot '{snapname}' deleted"}
            
        except Exception as e:
            logger.error(f"Failed to delete snapshot from VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    # ==================== ISO MANAGEMENT ====================

    def get_isos(self, storage: Optional[str] = None, 
                 connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Get list of ISO files from storage."""
        px, node = self.get_api(connection_id)
        if not px or not node:
            return {"success": False, "message": "Proxmox not connected", "isos": []}
        
        try:
            isos = []
            
            # Get list of storages if not specified
            if storage:
                storages = [{"storage": storage}]
            else:
                storages = px.nodes(node).storage.get()
            
            for st in storages:
                st_name = st.get("storage")
                try:
                    # Check if storage supports ISO content
                    content = px.nodes(node).storage(st_name).content.get()
                    for item in content:
                        if item.get("content") == "iso":
                            isos.append({
                                "name": item.get("volid", "").split("/")[-1],
                                "path": item.get("volid"),
                                "size_bytes": item.get("size", 0),
                                "storage": st_name
                            })
                except:
                    continue  # Storage might not support listing
            
            return {"success": True, "isos": isos}
            
        except Exception as e:
            logger.error(f"Failed to get ISOs: {e}")
            return {"success": False, "message": str(e), "isos": []}

    def mount_iso(self, vmid: int, iso_path: str,
                  connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Mount an ISO to a VM's CD-ROM drive."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Mount ISO to ide2 (standard CD-ROM location)
            cdrom_config = f"{iso_path},media=cdrom"
            px.nodes(vm_node).qemu(vmid).config.put(ide2=cdrom_config)
            
            logger.info(f"Mounted ISO {iso_path} to VM {vmid}")
            return {"success": True, "message": f"ISO mounted successfully"}
            
        except Exception as e:
            logger.error(f"Failed to mount ISO to VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    def eject_iso(self, vmid: int, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Eject/disconnect CD-ROM from VM."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            vm_node = self.find_vm_node(px, vmid)
            if not vm_node:
                return {"success": False, "message": f"VM {vmid} not found on any node"}
            
            # Set CD-ROM to empty
            px.nodes(vm_node).qemu(vmid).config.put(ide2="none,media=cdrom")
            
            logger.info(f"Ejected ISO from VM {vmid}")
            return {"success": True, "message": "ISO ejected successfully"}
            
        except Exception as e:
            logger.error(f"Failed to eject ISO from VM {vmid}: {e}")
            return {"success": False, "message": str(e)}

    # ==================== NETWORK MANAGEMENT ====================

    def get_networks(self, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of network bridges and VLANs."""
        px, node = self.get_api(connection_id)
        if not px or not node:
            return []
        
        try:
            networks = px.nodes(node).network.get()
            result = []
            
            for net in networks:
                net_type = net.get("type", "")
                if net_type in ("bridge", "bond", "vlan"):
                    result.append({
                        "name": net.get("iface", ""),
                        "type": net_type,
                        "address": net.get("address", ""),
                        "gateway": net.get("gateway", ""),
                        "bridge_ports": net.get("bridge_ports", ""),
                        "vlan_id": net.get("vlan-id"),
                        "active": net.get("active", False)
                    })
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to get networks: {e}")
            return []

    # ==================== POOL MANAGEMENT (like vSphere folders) ====================

    def get_pools(self, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Get list of resource pools (similar to vSphere folders)."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected", "pools": []}
        
        try:
            pools = px.pools.get()
            result = []
            
            for pool in pools:
                pool_id = pool.get("poolid", "")
                # Get pool details including members
                try:
                    details = px.pools(pool_id).get()
                    result.append({
                        "id": pool_id,
                        "name": pool_id,
                        "comment": details.get("comment", ""),
                        "members": len(details.get("members", []))
                    })
                except:
                    result.append({
                        "id": pool_id,
                        "name": pool_id,
                        "comment": "",
                        "members": 0
                    })
            
            return {"success": True, "pools": result}
            
        except Exception as e:
            logger.error(f"Failed to get pools: {e}")
            return {"success": False, "message": str(e), "pools": []}

    def create_pool(self, pool_id: str, comment: str = "",
                    connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Create a new resource pool."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            # Sanitize pool ID (alphanumeric, hyphen, underscore only)
            safe_id = re.sub(r'[^a-zA-Z0-9\-_]', '_', pool_id)[:64]
            
            px.pools.post(poolid=safe_id, comment=comment)
            
            logger.info(f"Created pool: {safe_id}")
            return {"success": True, "message": f"Pool '{safe_id}' created", "pool_id": safe_id}
            
        except Exception as e:
            error_msg = str(e)
            if "already exists" in error_msg.lower():
                return {"success": True, "message": f"Pool '{pool_id}' already exists", "pool_id": pool_id}
            logger.error(f"Failed to create pool: {e}")
            return {"success": False, "message": str(e)}

    def add_vm_to_pool(self, vmid: int, pool_id: str,
                       connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Add a VM to a resource pool."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            px.pools(pool_id).put(vms=str(vmid))
            
            logger.info(f"Added VM {vmid} to pool {pool_id}")
            return {"success": True, "message": f"VM added to pool '{pool_id}'"}
            
        except Exception as e:
            logger.error(f"Failed to add VM to pool: {e}")
            return {"success": False, "message": str(e)}

    def delete_pool(self, pool_id: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Delete a resource pool (must be empty)."""
        px, _ = self.get_api(connection_id)
        if not px:
            return {"success": False, "message": "Proxmox not connected"}
        
        try:
            # Proxmox won't delete a pool if it has members
            # We assume members are already cleaned up or handled
            px.pools(pool_id).delete()
            logger.info(f"Deleted pool: {pool_id}")
            return {"success": True, "message": f"Pool '{pool_id}' deleted"}
        except Exception as e:
            error_msg = str(e)
            if "not found" in error_msg.lower():
                return {"success": True, "message": "Pool already deleted"}
            logger.error(f"Failed to delete pool {pool_id}: {e}")
            return {"success": False, "message": f"Failed to delete pool: {str(e)}"}


proxmox_service = ProxmoxService()



