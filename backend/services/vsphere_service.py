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
    vsphere_logger.warning("pyvmomi not installed. vSphere service cannot function correctly.")

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
        
        self.connection = None
        
        # Scheduler
        self.scheduler = BackgroundScheduler()
        self.scheduler.start()
        self.sync_job_id = "vsphere_sync_inventory"

        if not PYVMOMI_AVAILABLE:
            vsphere_logger.warning("pyvmomi not installed. vSphere integration will fail.")
        else:
             if self.host:
                 vsphere_logger.info(f"vSphere Service configured (Host: {self.host})")
             else:
                 vsphere_logger.info("vSphere Service waiting for configuration.")

    def load_config(self, db: Session):
        """Load vSphere configuration from database settings."""
        try:
            settings = db.query(SystemSetting).filter(
                SystemSetting.category == "vsphere"
            ).all()
            
            # If settings exist, load them. Else rely on Env Vars.
            if settings:
                conf = {s.key: s.value for s in settings}

                self.host = conf.get("vsphere_host", self.host)
                self.user = conf.get("vsphere_user", self.user)
                self.password = conf.get("vsphere_password", self.password)
                self.port = int(conf.get("vsphere_port", str(self.port)))
                self.verify_ssl = conf.get("vsphere_verify_ssl", "false").lower() == "true"
                
                vsphere_logger.info(f"vSphere Config Loaded from DB - Host: {self.host}")
            else:
                vsphere_logger.info("No vSphere settings in DB, using Environment Variables.")

            # Re-evaluate Mock Mode based on final config
            if PYVMOMI_AVAILABLE:
                 # Check explicit Env Var override again
                 env_mock = os.getenv("VSPHERE_MOCK", "").lower()
                 if env_mock == "true":
                     self.mock_mode = True
                 elif env_mock == "false":
                     self.mock_mode = False
                 else:
                     # No explicit override, decide based on Host presence
                     self.mock_mode = not bool(self.host)
                 
                 if not self.mock_mode:
                     vsphere_logger.info("Using Real vSphere Connection.")
                 else:
                     vsphere_logger.warning("Mock mode detected (unexpected for production).")
            else:
                 self.mock_mode = True

            # Sync Scheduler Configuration (Defaults if not in DB)
            sync_mode = "manual"
            sync_interval = 60
            
            if settings:
                 conf = {s.key: s.value for s in settings}
                 sync_mode = conf.get("vsphere_sync_mode", "manual")
                 sync_interval = int(conf.get("vsphere_sync_interval", "60"))
            
            self.configure_scheduler(sync_mode, sync_interval)

        except Exception as e:
            vsphere_logger.error(f"Failed to load vSphere config: {e}")

    def configure_scheduler(self, mode: str, interval_minutes: int):
        """Configure the sync scheduler job."""
        try:
            # Remove existing job if present
            if self.scheduler.get_job(self.sync_job_id):
                self.scheduler.remove_job(self.sync_job_id)
            
            if mode == "scheduled" and interval_minutes > 0:
                vsphere_logger.info(f"Scheduling vSphere sync every {interval_minutes} minutes.")
                self.scheduler.add_job(
                    self.sync_inventory,
                    trigger=IntervalTrigger(minutes=interval_minutes),
                    id=self.sync_job_id,
                    replace_existing=True
                )
            else:
                vsphere_logger.info("vSphere sync set to MANUAL mode.")
                
        except Exception as e:
            vsphere_logger.error(f"Error configuring scheduler: {e}")

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
        if not self.connection:
            return []

        try:
            content = self.connection.content
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.Datacenter], True
            )
            datacenters = []
            view_list = list(container.view)
            vsphere_logger.debug(f"RootFolder: {content.rootFolder.name}")
            vsphere_logger.debug(f"Datacenters found: {len(view_list)}")
            for dc in view_list:
                datacenters.append({
                    "name": dc.name,
                    "status": str(dc.overallStatus)
                })
            container.Destroy()
            return datacenters
        except Exception as e:
            vsphere_logger.error(f"Error getting datacenters: {e}", exc_info=True)
            return []

    def get_clusters(self) -> List[Dict[str, Any]]:
        """Get list of clusters."""
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
            vsphere_logger.error(f"Error getting clusters: {e}", exc_info=True)
            return []

    def get_vms(self) -> List[Dict[str, Any]]:
        """Get list of VMs."""
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
            vsphere_logger.error(f"Error getting VMs: {e}", exc_info=True)
            return []

    def get_networks(self) -> List[Dict[str, Any]]:
        """Get list of networks."""
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
            vsphere_logger.error(f"Error getting networks: {e}")
            return []

    def get_hosts(self) -> List[Dict[str, Any]]:
        """Get list of ESXi hosts."""
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
            vsphere_logger.error(f"Error getting hosts: {e}")
            return []


    def sync_inventory(self) -> Dict[str, Any]:
        """Fetch all inventory and save to JSON cache."""
        try:
            # Ensure connection
            if not self.connection:
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

    def ensure_folder(self, parent_folder, name) -> vim.Folder:
        for child in parent_folder.childEntity:
            if isinstance(child, vim.Folder) and child.name == name:
                return child
        try:
            return parent_folder.CreateFolder(name)
        except vim.fault.DuplicateName:
            for child in parent_folder.childEntity:
                if isinstance(child, vim.Folder) and child.name == name:
                    return child
            raise

    def ensure_path(self, datacenter, path: List[str]) -> vim.Folder:
        current = datacenter.vmFolder
        for name in path:
            current = self.ensure_folder(current, name)
        return current

    def provision_vm(self, vm_moid: str, new_name: str, resource_pool: str = None, folder_path: List[str] = None) -> Dict[str, Any]:
        """
        Clone a VM from a template.
        """
        # Validate we are connected
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
            target_folder = None

            if folder_path:
                try:
                    dc = template_vm.parent
                    while dc and not isinstance(dc, vim.Datacenter):
                        dc = dc.parent
                    
                    if dc:
                        target_folder = self.ensure_path(dc, folder_path)
                        vsphere_logger.info(f"Target folder ensured: {'/'.join(folder_path)}")
                except Exception as e:
                    vsphere_logger.error(f"Failed to ensure folder path: {e}")

            if not target_folder:
                # Fallback to default strategy
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


                # Create Initial Snapshot
                try:
                    vsphere_logger.info(f"Creating initial snapshot for {new_vm.name}")
                    snapshot_task = new_vm.CreateSnapshot_Task(
                        name="Initial State",
                        description="Created by SE Training Portal after provisioning",
                        memory=False,
                        quiesce=False
                    )
                    self._wait_for_task(snapshot_task)
                except Exception as snap_e:
                     vsphere_logger.warning(f"Failed to create initial snapshot: {snap_e}")

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
                 # Try graceful reboot first? Or Reset? Let's use Reset for simplicity/guarantee or RebootGuest if tools.
                 # For safety in training labs, let's use Reset (Hard Reset) if Reboot fails or just Reset.
                 # Let's try Reset for now as it's cleaner for lab envs.
                 task = vm.Reset()
            elif action == "suspend":
                 if vm.runtime.powerState == "suspended":
                     return {"success": True, "message": "VM already suspended"}
                 task = vm.Suspend()
            elif action == "revert":
                 return self.revert_vm(vm_moid)
            else:
                 return {"success": False, "message": f"Unknown action: {action}"}

            if task:
                res = self._wait_for_task(task)
                if not res["success"]:
                    return {"success": False, "message": res["message"]}

            return {"success": True, "message": f"VM {action} successful"}


        
        except Exception as e:
            return {"success": False, "message": str(e)}

    def revert_vm(self, vm_moid: str) -> Dict[str, Any]:
        """
        Revert VM to the last snapshot (usually 'Initial State').
        """
        if not self.connection:
             return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid)
            if not vm:
                 return {"success": False, "message": "VM not found"}

            if not vm.snapshot:
                 return {"success": False, "message": "VM has no snapshots"}

            # Revert to current snapshot (or root? Usually we want the last one OR specific one)
            # For this simple implementation, let's revert to current snapshot if exists, 
            # OR finding the last one. 
            if vm.snapshot.currentSnapshot:
                 task = vm.RevertToCurrentSnapshot_Task(suppressPowerOn=False)
            else:
                 # If no current snapshot, try to find root?
                 if vm.snapshot.rootSnapshotList:
                      snap = vm.snapshot.rootSnapshotList[0].snapshot
                      task = snap.RevertToSnapshot_Task(suppressPowerOn=False)
                 else:
                      return {"success": False, "message": "Snapshot found but no current or root snapshot?"}

            res = self._wait_for_task(task)
            return res

        except Exception as e:
            return {"success": False, "message": str(e)}

    def delete_vm(self, vm_moid: str) -> Dict[str, Any]:
        """
        Delete a VM from vSphere (Power off if needed, then Destroy).
        """
        if not self.connection:
             return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid)
            if not vm:
                 return {"success": False, "message": "VM not found"}

            # Ensure powered off
            if vm.runtime.powerState == "poweredOn":
                 vsphere_logger.info(f"Powering off VM {vm.name} before deletion...")
                 task = vm.PowerOff()
                 self._wait_for_task(task) # Wait for power off

            vsphere_logger.info(f"Destroying VM {vm.name}...")
            task = vm.Destroy_Task()
            res = self._wait_for_task(task)
            
            return res

        except Exception as e:
            vsphere_logger.error(f"Error deleting VM: {e}")
            return {"success": False, "message": str(e)}

    # Helper Methods
    def _get_obj(self, vim_type, name_or_moid):
        """
        Get a vSphere object by name or MOID.
        Attributes auto-reconnection on NotAuthenticated fault.
        """
        try:
            return self._get_obj_core(vim_type, name_or_moid)
        except vim.fault.NotAuthenticated:
            vsphere_logger.warning("Session NotAuthenticated in _get_obj. Reconnecting and retrying...")
            self.connect()
            try:
                return self._get_obj_core(vim_type, name_or_moid)
            except Exception as retry_e:
                vsphere_logger.error(f"Retry failed in _get_obj: {retry_e}")
                raise retry_e

    def _get_obj_core(self, vim_type, name_or_moid):
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
        vsphere_logger.info(f"Creating folder '{folder_name}' in {parent_folder.name}...")
        return parent_folder.CreateFolder(folder_name)

    def delete_folder(self, folder_name: str) -> Dict[str, Any]:
        """
        Delete a specific folder (and its contents) from the SE_Training_Portal root
        within any derived Datacenter.
        """
        if not self.connection:
             return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            content = self.connection.content
            root_folder_name = "SE_Training_Portal"
            target_folder = None
            
            # Iterate through all datacenters to find SE_Training_Portal
            # content.rootFolder.childEntity contains Datacenters (usually)
            
            # Use a helper list in case childEntity is not iterable directly (it is, but efficient to be safe)
            children = content.rootFolder.childEntity
            
            for child in children:
                if isinstance(child, vim.Datacenter):
                    dc = child
                    # Check vmFolder of this datacenter
                    if hasattr(dc, 'vmFolder'):
                        # Look for SE_Training_Portal
                        se_folder = None
                        for folder_child in dc.vmFolder.childEntity:
                             if getattr(folder_child, 'name', '') == root_folder_name:
                                 se_folder = folder_child
                                 break
                        
                        if se_folder:
                            # Now check inside SE_Training_Portal for our target folder
                            for sub in se_folder.childEntity:
                                if getattr(sub, 'name', '') == folder_name:
                                    target_folder = sub
                                    break
                
                if target_folder:
                    break
            
            if target_folder:
                vsphere_logger.info(f"Deleting folder: {target_folder.name}")
                task = target_folder.Destroy_Task()
                return self._wait_for_task(task)
            else:
                return {"success": False, "message": "Folder not found"}

        except Exception as e:
            vsphere_logger.error(f"Error deleting folder {folder_name}: {e}")
            return {"success": False, "message": str(e)}

    def _wait_for_task(self, task):
        """Wait for a vSphere task to finish."""
        try:
            while task.info.state in [vim.TaskInfo.State.running, vim.TaskInfo.State.queued]:
                import time
                time.sleep(1) # Simple blocking wait
            
            if task.info.state == vim.TaskInfo.State.success:
                return {"success": True, "result": task.info.result}
            else:
                return {"success": False, "message": str(task.info.error.msg)}
        except Exception as e:
            return {"success": False, "message": f"Task wait exception: {e}"}



# Singleton instance
vsphere_service = VSphereService()
