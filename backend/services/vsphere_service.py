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
            return {
                "success": True,
                "message": f"Connected to {h}",
                "version": about.version,
                "api_type": about.apiType,
                "fullName": about.fullName
            }

        except Exception as e:
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


# Singleton instance
vsphere_service = VSphereService()
