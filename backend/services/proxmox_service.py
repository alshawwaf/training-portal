import logging
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

    def get_vms(self, connection_id: Optional[int] = None):
        px, node = self.get_api(connection_id)
        if not px or not node: return []
        return px.nodes(node).qemu.get()
    
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
            resp = px.nodes(node).qemu(vmid).clone.post(newid=newid, name=newname, full=1)
            return {"status": "success", "data": resp}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def sync_inventory(self, connection_id: Optional[int] = None):
        """Fetch all inventory and save to JSON cache."""
        try:
            vms = self.get_vms(connection_id)
            data = {
                "vms": [{
                    "name": vm.get('name'),
                    "moid": str(vm.get('vmid')),
                    "guest": vm.get('type', 'qemu'),
                    "num_cpu": vm.get('cpus', 1),
                    "memory_mb": int(vm.get('maxmem', 1024*1024*1024)/1024/1024),
                    "is_template": vm.get('template', 0) == 1,
                    "power_state": vm.get('status', 'unknown')
                } for vm in vms],
                "last_sync": datetime.utcnow().isoformat()
            }
            
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
            os.makedirs(data_dir, exist_ok=True)
            file_name = f"proxmox_inventory_{connection_id}.json" if connection_id else "proxmox_inventory.json"
            file_path = os.path.join(data_dir, file_name)
            
            with open(file_path, 'w') as f:
                json.dump(data, f)
            
            return {"success": True, "message": f"Synced {len(vms)} VMs", "data": data}
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

proxmox_service = ProxmoxService()
