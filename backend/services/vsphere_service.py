"""
VMware vSphere Service
Handles connections to vCenter/ESXi and provides VM management capabilities.
"""
import ssl
import atexit
from typing import Optional, List, Dict, Any
import os
import json
from datetime import datetime

# Try to import pyvmomi, but provide mock mode if not available
try:
    from pyVim.connect import SmartConnect, Disconnect
    from pyVmomi import vim
    PYVMOMI_AVAILABLE = True
except ImportError:
    PYVMOMI_AVAILABLE = False
    print("pyvmomi not installed. vSphere service will run in mock mode.")

from sqlalchemy.orm import Session
from db.models import SystemSetting

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

import logging
from pathlib import Path

# Setup vSphere-specific file logger
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

vsphere_logger = logging.getLogger("vsphere_service")
vsphere_logger.setLevel(logging.DEBUG)
# File handler
vsphere_fh = logging.FileHandler(LOG_DIR / "vsphere.log")
vsphere_fh.setLevel(logging.DEBUG)
vsphere_fh.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
if not vsphere_logger.handlers:
    vsphere_logger.addHandler(vsphere_fh)
# Also log to console
vsphere_ch = logging.StreamHandler()
vsphere_ch.setLevel(logging.INFO)
vsphere_ch.setFormatter(logging.Formatter('%(asctime)s - vsphere - %(levelname)s - %(message)s'))
if len(vsphere_logger.handlers) < 2:
    vsphere_logger.addHandler(vsphere_ch)

# ... existing code ...

class VSphereService:
    def __init__(self):
        self.host = os.getenv("VSPHERE_HOST", "")
        self.user = os.getenv("VSPHERE_USER", "administrator@vsphere.local")
        self.password = os.getenv("VSPHERE_PASSWORD", "")
        self.port = int(os.getenv("VSPHERE_PORT", "443"))
        self.verify_ssl = os.getenv("VSPHERE_VERIFY_SSL", "false").lower() == "true"
        self.mock_mode = os.getenv("VSPHERE_MOCK", "true").lower() == "true" or not PYVMOMI_AVAILABLE
        self.connection = None
        
        # Scheduler
        self.scheduler = BackgroundScheduler()
        self.scheduler.start()
        self.sync_job_id = "vsphere_sync_inventory"

        if self.mock_mode:
            print("vSphere Service running in MOCK MODE.")

    def load_config(self, db: Session):
        """Load vSphere configuration from database settings."""
        try:
            settings = db.query(SystemSetting).filter(
                SystemSetting.category == "vsphere"
            ).all()
            if not settings:
                return

            conf = {s.key: s.value for s in settings}

            self.host = conf.get("vsphere_host", self.host)
            self.user = conf.get("vsphere_user", self.user)
            self.password = conf.get("vsphere_password", self.password)
            self.port = int(conf.get("vsphere_port", str(self.port)))
            self.verify_ssl = conf.get("vsphere_verify_ssl", "false").lower() == "true"
            
            print(f"DEBUG: vSphere Config Loaded from DB - Host: {self.host}, User: {self.user}, SSL: {self.verify_ssl}, Port: {self.port}")
            # Ensure mock mode is OFF if pyvmomi is available
            if PYVMOMI_AVAILABLE:
                 self.mock_mode = False
                 print("DEBUG: Force disabling MOCK mode because config loaded and pyVmomi available.")

            # Sync Scheduler Configuration
            sync_mode = conf.get("vsphere_sync_mode", "manual") # manual, scheduled
            sync_interval = int(conf.get("vsphere_sync_interval", "60")) # minutes
            
            self.configure_scheduler(sync_mode, sync_interval)

        except Exception as e:
            print(f"Failed to load vSphere config: {e}")

    def configure_scheduler(self, mode: str, interval_minutes: int):
        """Configure the sync scheduler job."""
        try:
            # Remove existing job if present
            if self.scheduler.get_job(self.sync_job_id):
                self.scheduler.remove_job(self.sync_job_id)
            
            if mode == "scheduled" and interval_minutes > 0:
                print(f"Scheduling vSphere sync every {interval_minutes} minutes.")
                self.scheduler.add_job(
                    self.sync_inventory,
                    trigger=IntervalTrigger(minutes=interval_minutes),
                    id=self.sync_job_id,
                    replace_existing=True
                )
            else:
                print("vSphere sync set to MANUAL mode.")
                
        except Exception as e:
            print(f"Error configuring scheduler: {e}")

    def connect(self, host: str = None, user: str = None, password: str = None, 
                port: int = None, verify_ssl: bool = None) -> Dict[str, Any]:
        """
        Establish connection to vCenter/ESXi.
        If parameters are provided, use them instead of stored config.
        """
        h = host or self.host
        u = user or self.user
        p = password or self.password
        pt = port or self.port
        vs = verify_ssl if verify_ssl is not None else self.verify_ssl

        if self.mock_mode:
            if not h:
                return {"success": False, "message": "Host is required"}
            return {
                "success": True,
                "message": f"Mock connection to {h} successful",
                "version": "7.0.3 (Mock)",
                "api_type": "VirtualCenter (Mock)"
            }

        if not h or not u or not p:
            return {"success": False, "message": "Host, user, and password are required"}

        try:
            # Disconnect existing connection
            if self.connection:
                try:
                    Disconnect(self.connection)
                except:
                    pass

            vsphere_logger.info(f"Attempting to connect to vSphere: {h}:{pt} as {u}, SSL verify: {vs}")

            # SSL context
            context = None
            if not vs:
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE

            self.connection = SmartConnect(
                host=h,
                user=u,
                pwd=p,
                port=pt,
                sslContext=context
            )

            # Register disconnect on exit
            atexit.register(Disconnect, self.connection)

            about = self.connection.content.about
            vsphere_logger.info(f"Successfully connected to vSphere: {about.fullName}")
            return {
                "success": True,
                "message": f"Connected to {h}",
                "version": about.version,
                "api_type": about.apiType,
                "fullName": about.fullName
            }

        except Exception as e:
            vsphere_logger.error(f"Failed to connect to vSphere {h}: {e}", exc_info=True)
            return {"success": False, "message": str(e)}

    def test_connection(self, host: str, user: str, password: str, 
                        port: int = 443, verify_ssl: bool = False) -> Dict[str, Any]:
        """Test connection without storing credentials."""
        return self.connect(host, user, password, port, verify_ssl)

    def get_datacenters(self) -> List[Dict[str, Any]]:
        """Get list of datacenters."""
        if self.mock_mode:
            return [
                {"name": "DC-Mock-1", "status": "green"},
                {"name": "DC-Mock-2", "status": "green"}
            ]

        if not self.connection:
            return []

        try:
            content = self.connection.content
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.Datacenter], True
            )
            datacenters = []
            for dc in container.view:
                datacenters.append({
                    "name": dc.name,
                    "status": str(dc.overallStatus)
                })
            container.Destroy()
            return datacenters
        except Exception as e:
            print(f"Error getting datacenters: {e}")
            return []

    def get_clusters(self) -> List[Dict[str, Any]]:
        """Get list of clusters."""
        if self.mock_mode:
            return [
                {"name": "Cluster-Mock-1", "hosts": 3, "vms": 25},
                {"name": "Cluster-Mock-2", "hosts": 2, "vms": 15}
            ]

        if not self.connection:
            return []

        try:
            content = self.connection.content
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.ClusterComputeResource], True
            )
            clusters = []
            for cluster in container.view:
                clusters.append({
                    "name": cluster.name,
                    "hosts": len(cluster.host) if cluster.host else 0,
                    "status": str(cluster.overallStatus)
                })
            container.Destroy()
            return clusters
        except Exception as e:
            print(f"Error getting clusters: {e}")
            return []

    def get_vms(self) -> List[Dict[str, Any]]:
        """Get list of VMs."""
        if self.mock_mode:
            return [
                {"name": "mock-vm-1", "moid": "vm-1001", "power_state": "poweredOn", "guest_os": "Ubuntu 22.04", "cpu": 4, "memory_mb": 8192, "is_template": False},
                {"name": "mock-vm-2", "moid": "vm-1002", "power_state": "poweredOff", "guest_os": "Windows Server 2022", "cpu": 2, "memory_mb": 4096, "is_template": False},
                {"name": "mock-template", "moid": "vm-1003", "power_state": "poweredOff", "guest_os": "CentOS 8", "cpu": 2, "memory_mb": 2048, "is_template": True}
            ]

        if not self.connection:
            return []

        try:
            content = self.connection.content
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.VirtualMachine], True
            )
            vms = []
            for vm in container.view:
                vms.append({
                    "name": vm.name,
                    "moid": vm._moId,
                    "power_state": str(vm.runtime.powerState),
                    "guest_os": vm.config.guestFullName if vm.config else "Unknown",
                    "cpu": vm.config.hardware.numCPU if vm.config else 0,
                    "memory_mb": vm.config.hardware.memoryMB if vm.config else 0,
                    "is_template": vm.config.template if vm.config else False
                })
            container.Destroy()
            return vms
        except Exception as e:
            print(f"Error getting VMs: {e}")
            return []

    def get_networks(self) -> List[Dict[str, Any]]:
        """Get list of networks."""
        if self.mock_mode:
            return [
                {"name": "VM Network", "type": "Network"},
                {"name": "DPortGroup-1", "type": "DistributedVirtualPortgroup"}
            ]

        if not self.connection:
            return []

        try:
            content = self.connection.content
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.Network], True
            )
            networks = []
            for net in container.view:
                networks.append({
                    "name": net.name,
                    "type": type(net).__name__
                })
            container.Destroy()
            return networks
        except Exception as e:
            print(f"Error getting networks: {e}")
            return []

    def get_hosts(self) -> List[Dict[str, Any]]:
        """Get list of ESXi hosts."""
        if self.mock_mode:
            return [
                {"name": "esxi-mock-1.local", "state": "connected", "cpu_usage": 45, "memory_usage": 62},
                {"name": "esxi-mock-2.local", "state": "connected", "cpu_usage": 32, "memory_usage": 48}
            ]

        if not self.connection:
            return []

        try:
            content = self.connection.content
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.HostSystem], True
            )
            hosts = []
            for host in container.view:
                hosts.append({
                    "name": host.name,
                    "state": str(host.runtime.connectionState),
                    "status": str(host.overallStatus)
                })
            container.Destroy()
            return hosts
        except Exception as e:
            print(f"Error getting hosts: {e}")
            return []


    def sync_inventory(self) -> Dict[str, Any]:
        """Fetch all inventory and save to JSON cache."""
        try:
            # Ensure connection
            if not self.connection and not self.mock_mode:
                res = self.connect()
                if not res["success"]:
                    return {"success": False, "message": res["message"]}

            # Fetch data
            datacenters = self.get_datacenters()
            clusters = self.get_clusters()
            hosts = self.get_hosts()
            networks = self.get_networks()
            vms = self.get_vms()

            inventory = {
                "last_sync": datetime.now().isoformat(),
                "datacenters": datacenters,
                "clusters": clusters,
                "hosts": hosts,
                "networks": networks,
                "vms": vms
            }

            # Ensure data directory exists
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
            os.makedirs(data_dir, exist_ok=True)
            
            file_path = os.path.join(data_dir, "vsphere_inventory.json")
            with open(file_path, 'w') as f:
                json.dump(inventory, f, indent=2)

            return {"success": True, "message": "Inventory synced successfully", "timestamp": inventory["last_sync"]}

        except Exception as e:
            return {"success": False, "message": str(e)}

    def get_cached_inventory(self) -> Dict[str, Any]:
        """Retrieve inventory from JSON cache."""
        try:
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
            file_path = os.path.join(data_dir, "vsphere_inventory.json")

            if not os.path.exists(file_path):
                return {"success": False, "message": "No cached inventory found. Please sync first.", "data": None}

            with open(file_path, 'r') as f:
                data = json.load(f)
            
            return {"success": True, "data": data}

        except Exception as e:
            return {"success": False, "message": str(e), "data": None}

    def provision_vm(self, vm_moid: str, new_name: str, resource_pool: str = None) -> Dict[str, Any]:
        """
        Clone a VM from a template.
        """
        if self.mock_mode:
            print(f"MOCK: Provisioning VM '{new_name}' from Template '{vm_moid}'")
            return {
                "success": True,
                "message": "VM Provisioned (Mock)",
                "vm_name": new_name,
                "vm_moid": f"vm-mock-{datetime.now().timestamp()}",
                "ip_address": "192.168.1.150"
            }

        if not self.connection:
             vsphere_logger.error("provision_vm called but not connected to vSphere")
             return {"success": False, "message": "Not connected to vSphere"}

        try:
            vsphere_logger.info(f"Starting VM provisioning: template_moid={vm_moid}, new_name={new_name}")
            content = self.connection.content
            template_vm = self._get_obj([vim.VirtualMachine], vm_moid)

            if not template_vm:
                 vsphere_logger.error(f"Template VM not found: {vm_moid}")
                 return {"success": False, "message": f"Template VM {vm_moid} not found"}

            vsphere_logger.info(f"Found template VM: {template_vm.name}")

            # Find resource pool - required for cloning
            resource_pool = None
            try:
                # Method 1: Get from template's resourcePool property (if it's a running VM)
                if hasattr(template_vm, 'resourcePool') and template_vm.resourcePool:
                    resource_pool = template_vm.resourcePool
                    vsphere_logger.info(f"Using template's resource pool: {resource_pool.name}")
                else:
                    # Method 2: Find first available resource pool in the datacenter
                    dc = template_vm.parent
                    while dc and not isinstance(dc, vim.Datacenter):
                        dc = dc.parent
                    
                    if dc:
                        # Get hostFolder and find first cluster/host with resource pool
                        for child in dc.hostFolder.childEntity:
                            if isinstance(child, vim.ComputeResource) or isinstance(child, vim.ClusterComputeResource):
                                resource_pool = child.resourcePool
                                vsphere_logger.info(f"Using datacenter compute resource pool: {resource_pool.name}")
                                break
            except Exception as pool_err:
                vsphere_logger.warning(f"Could not find resource pool: {pool_err}")

            if not resource_pool:
                vsphere_logger.error("No resource pool found - cannot clone VM")
                return {"success": False, "message": "No resource pool available for cloning"}

            # Basic Clone Spec
            relospec = vim.vm.RelocateSpec()
            relospec.pool = resource_pool  # REQUIRED for cloning 

            clonespec = vim.vm.CloneSpec()
            clonespec.location = relospec
            clonespec.powerOn = True # Power on after clone
            clonespec.template = False 
            
            # Target Folder Strategy:
            # 1. Try to find/create "{TemplateName}_Labs" folder in the same datacenter as the template.
            # 2. If fails, fallback to template's parent.
            
            target_folder = None
            try:
                # Assuming template is in a datacenter, we can traverse up to find it.
                # Simplified: Get the datacenter's vmFolder.
                dc = template_vm.parent
                while dc and not isinstance(dc, vim.Datacenter):
                    dc = dc.parent
                
                if dc:
                    vm_folder = dc.vmFolder
                    folder_name = f"{template_vm.name}_Labs"
                    vsphere_logger.info(f"Creating/finding folder: {folder_name} in datacenter {dc.name}")
                    target_folder = self._get_or_create_folder(vm_folder, folder_name)
            except Exception as folder_err:
                vsphere_logger.warning(f"Could not setup target folder: {folder_err}. Falling back to template parent.")
            
            if not target_folder:
                target_folder = template_vm.parent

            vsphere_logger.info(f"Cloning {template_vm.name} to {new_name} in folder {target_folder.name}...")
            task = template_vm.Clone(folder=target_folder, name=new_name, spec=clonespec)
            
            # Wait for task to complete
            result = self._wait_for_task(task)

            if result["success"]:
                new_vm = result["result"]
                # Try to get IP (might take time, so we might return None initially)
                ip = None
                # Wait a bit for tools to run? Naah, just return simple for now.
                # Real IP fetching usually needs a loop waiting for guest tools.
                if new_vm.guest:
                    ip = new_vm.guest.ipAddress
                
                vsphere_logger.info(f"VM provisioned successfully: {new_vm.name}, MOID: {new_vm._moId}, IP: {ip}")
                return {
                    "success": True, 
                    "message": "VM Provisioned Successfully",
                    "vm_name": new_vm.name,
                    "vm_moid": new_vm._moId,
                    "ip_address": ip
                }
            else:
                 vsphere_logger.error(f"Clone task failed: {result['message']}")
                 return {"success": False, "message": result["message"]}

        except Exception as e:
            vsphere_logger.error(f"Exception during VM provisioning: {e}", exc_info=True)
            return {"success": False, "message": str(e)}


    def get_vm_power_state(self, vm_moid: str) -> Dict[str, Any]:
        """Get power state of a VM."""
        if self.mock_mode:
            return {"success": True, "state": "poweredOn"}
            
        if not self.connection:
             return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid)
            if not vm:
                return {"success": False, "message": "VM not found"}

            state = vm.runtime.powerState
            return {"success": True, "state": state} # poweredOn, poweredOff, suspended
        except Exception as e:
            return {"success": False, "message": str(e)}

    def control_vm_power(self, vm_moid: str, action: str) -> Dict[str, Any]:
        """
        Control VM power state.
        Action: start, stop, restart, reset
        """
        if self.mock_mode:
            print(f"MOCK: {action.upper()} VM '{vm_moid}'")
            return {"success": True, "message": f"VM {action} command sent (Mock)", "new_state": "poweredOn" if action in ["start", "restart"] else "poweredOff"}

        if not self.connection:
             return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid)
            if not vm:
                 return {"success": False, "message": "VM not found"}

            task = None
            if action == "start":
                if vm.runtime.powerState == "poweredOn":
                     return {"success": True, "message": "VM already powered on"}
                task = vm.PowerOn()
            elif action == "stop":
                 if vm.runtime.powerState == "poweredOff":
                     return {"success": True, "message": "VM already powered off"}
                 task = vm.PowerOff()
            elif action == "reset":
                 task = vm.Reset()
            elif action == "restart":
                 task = vm.RebootGuest() # Try graceful reboot first? Or Reset? Let's use Reset for simplicity/guarantee or RebootGuest if tools.
                 # Actually, "restart" usually implies RebootGuest if tools, else Reset. 
                 # For safety in training labs, let's use Reset (Hard Reset) if Reboot fails or just Reset.
                 # Let's try Reset for now as it's cleaner for lab envs.
                 task = vm.Reset()
            else:
                 return {"success": False, "message": f"Unknown action: {action}"}

            if task:
                res = self._wait_for_task(task)
                if not res["success"]:
                    return {"success": False, "message": res["message"]}

            return {"success": True, "message": f"VM {action} successful"}

        except Exception as e:
            return {"success": False, "message": str(e)}

    # Helper Methods
    def _get_obj(self, vim_type, name_or_moid):
        """
        Get a vSphere object by name or MOID.
        """
        content = self.connection.content
        container = content.viewManager.CreateContainerView(content.rootFolder, vim_type, True)
        
        # Try to find by MOID first (more precise)
        # Note: ContainerView doesn't support direct MOID lookup easily without iteration or SearchIndex.
        # Let's use SearchIndex for MOID, and iteration for name if MOID fails?
        # Actually, iterating view is standard for small/medium envs.
        
        # Searching by MOID using SearchIndex is faster
        search_index = content.searchIndex
        # Note: generic find by MOID?
        # search_index.FindByInventoryPath is for paths.
        # There isn't a direct "FindByMoid" on SearchIndex exposed simply.
        # But we can iterate.
        
        obj = None
        for c in container.view:
            if c._moId == name_or_moid or c.name == name_or_moid:
                obj = c
                break
        
        container.Destroy()
        return obj

    def _get_or_create_folder(self, parent_folder, folder_name):
        """
        Finds or creates a folder named `folder_name` inside `parent_folder`.
        """
        if hasattr(parent_folder, 'childEntity'):
             for child in parent_folder.childEntity:
                 if isinstance(child, vim.Folder) and child.name == folder_name:
                     return child
        
        # Create it
        print(f"Creating folder '{folder_name}' in {parent_folder.name}...")
        return parent_folder.CreateFolder(folder_name)

    def _wait_for_task(self, task):
        """Wait for a vSphere task to finish."""
        while task.info.state == vim.TaskInfo.State.running:
            import time
            time.sleep(1) # Simple blocking wait
        
        if task.info.state == vim.TaskInfo.State.success:
            return {"success": True, "result": task.info.result}
        else:
            return {"success": False, "message": str(task.info.error.msg)}



# Singleton instance
vsphere_service = VSphereService()
