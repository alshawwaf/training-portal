from proxmoxer import ProxmoxAPI
import os
import requests
from sqlalchemy.orm import Session
from db.models import SystemSetting

# Disable SSL warnings for self-signed certs (common in Proxmox)
requests.packages.urllib3.disable_warnings()

class ProxmoxService:
    def __init__(self):
        self.host = os.getenv("PROXMOX_HOST", "192.168.1.100")
        self.user = os.getenv("PROXMOX_USER", "root@pam")
        self.password = os.getenv("PROXMOX_PASSWORD", "password")
        self.port = int(os.getenv("PROXMOX_PORT", "8006"))
        self.token_id = os.getenv("PROXMOX_TOKEN_ID")
        self.token_secret = os.getenv("PROXMOX_TOKEN_SECRET")
        self.node = os.getenv("PROXMOX_NODE", "pve")
        self.verify_ssl = os.getenv("PROXMOX_VERIFY_SSL", "false").lower() == "true"
        self.mock_mode = os.getenv("PROXMOX_MOCK", "false").lower() == "true"
        self.proxmox = None
        
        # Initial connection if env vars provided
        if not self.mock_mode:
            self._connect()
        else:
            print("Proxmox Service running in MOCK MODE.")

    def _connect(self):
        try:
            if self.token_id and self.token_secret:
                self.proxmox = ProxmoxAPI(
                    self.host, user=self.user, token_name=self.token_id, token_value=self.token_secret, 
                    verify_ssl=self.verify_ssl, port=self.port, timeout=5
                )
            else:
                self.proxmox = ProxmoxAPI(
                    self.host, user=self.user, password=self.password, 
                    verify_ssl=self.verify_ssl, port=self.port, timeout=5
                )
        except Exception as e:
            print(f"Failed to connect to Proxmox: {e}")
            self.proxmox = None

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

    def load_config(self, db: Session):
        try:
            settings = db.query(SystemSetting).filter(SystemSetting.category.in_(["general", "proxmox"])).all()
            if not settings: return
            
            conf = {s.key: s.value for s in settings}
            
            self.host = conf.get("proxmox_host", self.host)
            self.node = conf.get("proxmox_node", self.node)
            self.user = conf.get("proxmox_user", self.user)
            self.password = conf.get("proxmox_password", self.password)
            self.port = int(conf.get("proxmox_port", 8006))
            self.token_id = conf.get("proxmox_token_id")
            self.token_secret = conf.get("proxmox_token_secret")
            self.verify_ssl = conf.get("proxmox_verify_ssl", "false").lower() == "true"
            
            if not self.mock_mode:
                self._connect()
                
        except Exception as e:
            print(f"Failed to load Proxmox config: {e}")

    def get_nodes(self):
        if self.mock_mode:
            return [{'node': 'mock-node-1', 'status': 'online', 'cpu': 0.1, 'maxcpu': 16, 'mem': 1024, 'maxmem': 32768}]
        if not self.proxmox: return []
        return self.proxmox.nodes.get()

    def get_vms(self):
        if self.mock_mode:
            return [
                {'vmid': 100, 'name': 'mock-class-vm-1', 'status': 'running', 'cpus': 2, 'mem': 4096},
                {'vmid': 101, 'name': 'mock-class-vm-2', 'status': 'stopped', 'cpus': 2, 'mem': 4096},
                {'vmid': 200, 'name': 'template-base', 'status': 'stopped', 'template': 1},
            ]
        if not self.proxmox: return []
        return self.proxmox.nodes(self.node).qemu.get()
    
    def vm_action(self, vmid: int, action: str):
        if self.mock_mode:
            return {"status": "success", "message": f"Mock executed {action} on VM {vmid}"}
        
        if not self.proxmox: return {"status": "error", "message": "Proxmox not connected"}
        
        try:
            if action == "restart":
                action = "reset"
            elif action == "pause":
                action = "suspend"
            
            resp = self.proxmox.nodes(self.node).qemu(vmid).status.post(action)
            return {"status": "success", "data": resp}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def revert_vm(self, vmid: int, snapname: str):
        if self.mock_mode:
            return {"status": "success", "message": f"Mock reverted VM {vmid} to snapshot {snapname}"}

        if not self.proxmox: return {"status": "error", "message": "Proxmox not connected"}
        try:
            resp = self.proxmox.nodes(self.node).qemu(vmid).snapshot(snapname).rollback.post()
            return {"status": "success", "data": resp}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def clone_vm(self, vmid: int, newid: int, newname: str):
        if self.mock_mode:
            return {"status": "success", "message": f"Mock cloned VM {vmid} to {newid} ({newname})"}

        if not self.proxmox: return {"status": "error", "message": "Proxmox not connected"}
        try:
            resp = self.proxmox.nodes(self.node).qemu(vmid).clone.post(newid=newid, name=newname, full=1)
            return {"status": "success", "data": resp}
        except Exception as e:
            return {"status": "error", "message": str(e)}

proxmox_service = ProxmoxService()
