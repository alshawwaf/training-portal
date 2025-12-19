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

# pyvmomi is required for vSphere connectivity
try:
    from pyVim.connect import SmartConnect, Disconnect
    from pyVmomi import vim
    PYVMOMI_AVAILABLE = True
except ImportError:
    PYVMOMI_AVAILABLE = False

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
        self.connections = {} # {connection_id: si}
        self.connection = None  # Legacy compatibility - default connection
        
        # Configuration attributes
        self.host = None
        self.user = None
        self.password = None
        self.port = 443
        self.verify_ssl = False
        
        # Scheduler
        self.scheduler = BackgroundScheduler()
        self.scheduler.start()
        self.sync_job_id = "vsphere_sync_inventory"

        if not PYVMOMI_AVAILABLE:
            vsphere_logger.warning("pyvmomi not installed. vSphere integration will fail.")
        else:
            vsphere_logger.info("vSphere Service initialized (DB Connections only).")
    
    def load_config(self, db: Session):
        """Load vSphere configuration from database (legacy compatibility)."""
        try:
            settings = {s.key: s.value for s in db.query(SystemSetting).filter(
                SystemSetting.category == 'vsphere'
            ).all()}
            
            self.host = settings.get('vsphere_host', '')
            self.user = settings.get('vsphere_user', '')
            self.password = settings.get('vsphere_password', '')
            self.port = int(settings.get('vsphere_port', 443))
            self.verify_ssl = settings.get('vsphere_verify_ssl', 'false').lower() == 'true'
            
            vsphere_logger.info("VSphereService: Configuration loaded from database")
        except Exception as e:
            vsphere_logger.error(f"Failed to load vSphere config: {e}")

    def connect(self, host: Optional[str] = None, user: Optional[str] = None, password: Optional[str] = None, 
                port: int = 443, verify_ssl: bool = False) -> Dict[str, Any]:
        """
        Establish connection to vCenter/ESXi.
        """
        h = host or self.host
        u = user or self.user
        p = password or self.password
        pt = port if port != 443 else self.port
        vs = verify_ssl if not verify_ssl else self.verify_ssl

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
        # Use a temporary connection for testing
        try:
             context = None
             if not verify_ssl:
                 context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                 context.check_hostname = False
                 context.verify_mode = ssl.CERT_NONE

             si = SmartConnect(
                 host=host,
                 user=user,
                 pwd=password,
                 port=port,
                 sslContext=context
             )
             about = si.content.about
             Disconnect(si)
             return {
                 "success": True,
                 "message": f"Connected to {host}",
                 "version": about.version,
                 "fullName": about.fullName
             }
        except Exception as e:
            return {"success": False, "message": str(e)}

    def get_session(self, connection_id: Optional[int] = None) -> Optional[vim.ServiceInstance]:
        """Get or create session for a specific connection_id."""
        if not connection_id:
            return self.connection # Default legacy connection
        
        # Check cache
        if connection_id in self.connections:
            try:
                 # Check if connection is still alive
                 self.connections[connection_id].CurrentTime()
                 return self.connections[connection_id]
            except:
                 del self.connections[connection_id]
        
        # Load from DB
        from db.database import SessionLocal
        from db.models import InfrastructureConnection
        db = SessionLocal()
        try:
            conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
            if not conn:
                vsphere_logger.error(f"Connection {connection_id} not found in DB")
                return None
            
            # Connect
            context = None
            if not conn.verify_ssl:
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE

            vsphere_logger.info(f"Connecting to vSphere {conn.host} (connection_id={connection_id})")
            si = SmartConnect(
                host=conn.host,
                user=conn.user,
                pwd=conn.password,
                port=conn.port,
                sslContext=context
            )
            self.connections[connection_id] = si
            return si
        except Exception as e:
            vsphere_logger.error(f"Failed to connect to vSphere {connection_id}: {e}")
            return None
        finally:
            db.close()

    def get_datacenters(self, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of datacenters."""
        si = self.get_session(connection_id)
        if not si:
            return []

        try:
            content = si.content
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

    def get_clusters(self, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of clusters."""
        si = self.get_session(connection_id)
        if not si:
            return []

        try:
            content = si.content
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

    def get_vms(self, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of VMs."""
        si = self.get_session(connection_id)
        if not si:
            return []

        try:
            content = si.content
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

    def get_networks(self, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of networks."""
        si = self.get_session(connection_id)
        if not si:
            return []

        try:
            content = si.content
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

    def get_hosts(self, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of ESXi hosts."""
        si = self.get_session(connection_id)
        if not si:
            return []

        try:
            content = si.content
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


    def sync_inventory(self, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Fetch all inventory and save to JSON cache."""
        try:
            # Ensure connection
            si = self.get_session(connection_id)
            if not si:
                return {"success": False, "message": "Failed to connect to vSphere"}

            # Fetch data
            datacenters = self.get_datacenters(connection_id)
            clusters = self.get_clusters(connection_id)
            hosts = self.get_hosts(connection_id)
            networks = self.get_networks(connection_id)
            vms = self.get_vms(connection_id)

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
            
            file_name = f"vsphere_inventory_{connection_id}.json" if connection_id else "vsphere_inventory.json"
            file_path = os.path.join(data_dir, file_name)
            with open(file_path, 'w') as f:
                json.dump(inventory, f, indent=2)

            return {"success": True, "message": "Inventory synced successfully", "timestamp": inventory["last_sync"]}

        except Exception as e:
            return {"success": False, "message": str(e)}

    def get_cached_inventory(self, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Retrieve inventory from JSON cache. If connection_id is None, aggregates all."""
        try:
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
            
            if connection_id:
                file_name = f"vsphere_inventory_{connection_id}.json"
                file_path = os.path.join(data_dir, file_name)
                if not os.path.exists(file_path):
                    return {"success": False, "message": "No cached inventory found", "data": None}
                with open(file_path, 'r') as f:
                    return {"success": True, "data": json.load(f)}
            
            # Aggregate all found inventories
            all_vms = []
            files = [f for f in os.listdir(data_dir) if f.startswith("vsphere_inventory") and f.endswith(".json")]
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

    def provision_vm(self, vm_moid: str, new_name: str, resource_pool: str = None, folder_path: List[str] = None, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Clone a VM from a template.
        """
        # Validate we are connected
        si = self.get_session(connection_id)
        if not si:
             vsphere_logger.error("provision_vm called but not connected to vSphere")
             return {"success": False, "message": "Not connected to vSphere"}

        try:
            vsphere_logger.info(f"Starting VM provisioning: template_moid={vm_moid}, new_name={new_name}")
            content = si.content
            template_vm = self._get_obj([vim.VirtualMachine], vm_moid, si)

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


    def get_vm_power_state(self, vm_moid: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Get power state of a VM."""
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}

            state = vm.runtime.powerState
            return {"success": True, "state": state} # poweredOn, poweredOff, suspended
        except Exception as e:
            return {"success": False, "message": str(e)}

    def control_vm_power(self, vm_moid: str, action: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Control VM power state.
        Action: start, stop, restart, reset
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
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

    def revert_vm(self, vm_moid: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Revert VM to the last snapshot (usually 'Initial State').
        """
        si = self.get_session(connection_id)
        if not si:
             return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
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


    def generate_vmrc_ticket(self, vm_moid: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Generate a VMRC ticket for a VM.
        Returns the ticket value and a formatted vmrc:// URI.
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}


            # Acquire Session Clone Ticket
            ticket = si.content.sessionManager.AcquireCloneTicket()
            
            # Use host and port from connection if available
            host = self.host
            port = self.port
            if connection_id:
                from db.database import SessionLocal
                from db.models import InfrastructureConnection
                db = SessionLocal()
                conn = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
                if conn:
                    host = conn.host
                    port = conn.port
                db.close()

            # Format URI
            # vmrc://clone:<ticket>@<vcenter_host>/?moid=<vm_moid>
            uri = f"vmrc://clone:{ticket}@{host}:{port}/?moid={vm_moid}"
            
            return {
                "success": True,
                "ticket": ticket,
                "uri": uri
            }
        except Exception as e:
            vsphere_logger.error(f"Failed to generate VMRC ticket for {vm_moid}: {e}")
            return {"success": False, "message": str(e)}

    def generate_html5_console_ticket(self, vm_moid: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Generate an HTML5 console ticket (WebMKS) for browser-based console access.
        This works without any client installation - opens in browser.
        VM must be powered on.
        
        Returns ticket info for WebMKS connection including:
        - host: ESXi host to connect to
        - port: Port for WebSocket connection
        - ticket: One-time authentication ticket
        - cfgFile: VM config file path
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}

            # Check if VM is powered on - webmks only works for running VMs
            if vm.runtime.powerState != "poweredOn":
                return {
                    "success": False, 
                    "message": f"VM must be powered on for HTML5 console. Current state: {vm.runtime.powerState}"
                }

            # Acquire WebMKS ticket for HTML5 console
            vsphere_logger.info(f"Acquiring WebMKS ticket for VM {vm.name} (MOID: {vm_moid})")
            vsphere_logger.info(f"VM Power State: {vm.runtime.powerState}")
            
            ticket = vm.AcquireTicket("webmks")
            
            # Diagnostic logging - inspect full ticket object
            vsphere_logger.debug(f"Ticket object type: {type(ticket)}")
            vsphere_logger.debug(f"Ticket attributes: {dir(ticket)}")
            vsphere_logger.debug(f"Ticket.ticket value: '{ticket.ticket}' (length: {len(ticket.ticket)})")
            vsphere_logger.debug(f"Ticket.host: {ticket.host}")
            vsphere_logger.debug(f"Ticket.port: {ticket.port}")
            vsphere_logger.debug(f"Ticket.cfgFile: {ticket.cfgFile if hasattr(ticket, 'cfgFile') else 'N/A'}")
            vsphere_logger.debug(f"Ticket.sslThumbprint: {ticket.sslThumbprint if hasattr(ticket, 'sslThumbprint') else 'N/A'}")
            vsphere_logger.debug(f"Ticket.url: {ticket.url if hasattr(ticket, 'url') else 'N/A'}")
            
            # Diagnostic logs for console connection
            vsphere_logger.info(f"Generated WebMKS ticket for {vm.name}. Ticket length: {len(ticket.ticket)}. URL available: {hasattr(ticket, 'url')}")

            
            # Production-ready approach: Use ticket.url if available
            # The ticket.url contains the complete WebSocket URL with the full ticket embedded
            ws_url = None
            full_ticket = None
            
            if hasattr(ticket, 'url') and ticket.url:
                # ticket.url format: wss://host:port/ticket/{full_ticket_string}
                # Extract host, port, and full ticket from URL
                import re
                url_match = re.match(r'wss://([^:]+):(\d+)/ticket/(.+)', ticket.url)
                if url_match:
                    url_host = url_match.group(1)
                    url_port = url_match.group(2)
                    full_ticket = url_match.group(3)
                    
                    # CRITICAL: ticket.url may contain localhost.localdomain or other non-routable hostnames
                    # Replace with the actual ESXi host IP from ticket.host
                    # This ensures the URL is accessible from Docker containers
                    ws_url = f"wss://{ticket.host}:{url_port}/ticket/{full_ticket}"
                    
                    vsphere_logger.info(f"Using ticket.url for WebMKS connection (ticket length: {len(full_ticket)})")
                    if url_host != ticket.host:
                        vsphere_logger.info(f"Replaced hostname {url_host} with {ticket.host} for Docker accessibility")
                else:
                    vsphere_logger.warning(f"ticket.url format unexpected: {ticket.url}")
            
            # Fallback: Manual construction (for older vSphere versions or if ticket.url is malformed)
            if not ws_url:
                vsphere_logger.warning("ticket.url not available or malformed, using fallback manual construction")
                full_ticket = ticket.ticket
                ws_url = f"wss://{ticket.host}:{ticket.port}/ticket/{ticket.ticket}"
            
            return {
                "success": True,
                "host": ticket.host,
                "port": ticket.port,
                "ticket": full_ticket,  # Full ticket string for WebSocket authentication
                "ws_url": ws_url,  # Complete WebSocket URL with corrected hostname
                "cfgFile": ticket.cfgFile,
                "sslThumbprint": ticket.sslThumbprint if hasattr(ticket, 'sslThumbprint') else None,
                "vm_name": vm.name,
                "vcenter_host": self.host if not connection_id else si.content.about.apiType # simplistic
            }
        except Exception as e:
            vsphere_logger.error(f"Failed to generate HTML5 console ticket for {vm_moid}: {e}")
            return {"success": False, "message": str(e)}

    def delete_vm(self, vm_moid: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Delete a VM from vSphere (Power off if needed, then Destroy).
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
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

    def enable_vnc(self, vm_moid: str, port: int, password: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Enable VNC on a VM by setting extraConfig.
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}

            spec = vim.vm.ConfigSpec()
            spec.extraConfig = [
                vim.option.OptionValue(key="RemoteDisplay.vnc.enabled", value="true"),
                vim.option.OptionValue(key="RemoteDisplay.vnc.port", value=str(port)),
                vim.option.OptionValue(key="RemoteDisplay.vnc.password", value=password)
            ]

            task = vm.ReconfigVM_Task(spec)
            return self._wait_for_task(task)

        except Exception as e:
            vsphere_logger.error(f"Error enabling VNC on {vm_moid}: {e}")
            return {"success": False, "message": str(e)}

    def get_vm_host_ip(self, vm_moid: str, connection_id: Optional[int] = None) -> Optional[str]:
        """
        Get the IP address of the ESXi host running the VM.
        """
        si = self.get_session(connection_id)
        if not si: return None
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if vm and vm.runtime and vm.runtime.host:
                return vm.runtime.host.name
            return None
        except:
            return None


    # Helper Methods
    def _get_obj(self, vim_type, name_or_moid, si: Optional[vim.ServiceInstance] = None):
        """
        Get a vSphere object by name or MOID.
        Attributes auto-reconnection on NotAuthenticated fault.
        """
        si = si or self.connection
        if not si:
            return None
            
        try:
            return self._get_obj_core(vim_type, name_or_moid, si)
        except vim.fault.NotAuthenticated:
            if si == self.connection:
                vsphere_logger.warning("Session NotAuthenticated in _get_obj. Reconnecting and retrying...")
                self.connect()
                try:
                    return self._get_obj_core(vim_type, name_or_moid, self.connection)
                except Exception as retry_e:
                    vsphere_logger.error(f"Retry failed in _get_obj: {retry_e}")
                    raise retry_e
            raise
    
    def _get_obj_core(self, vim_type, name_or_moid, si: vim.ServiceInstance):
        content = si.content
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


