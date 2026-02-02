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
            friendly_message = self._get_friendly_error_message(str(e))
            return {"success": False, "message": friendly_message}

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
            # Parse common vSphere errors into user-friendly messages
            error_str = str(e)
            friendly_message = self._get_friendly_error_message(error_str)
            return {"success": False, "message": friendly_message}
    
    def _get_friendly_error_message(self, error: str) -> str:
        """Convert technical vSphere errors to user-friendly messages."""
        error_lower = error.lower()
        
        # Authentication errors
        if "invalidlogin" in error_lower or "incorrect user name or password" in error_lower:
            return "Invalid username or password. Please check your credentials."
        
        # Connection errors
        if "connection refused" in error_lower:
            return "Connection refused. Please verify the host address and port are correct."
        if "timed out" in error_lower or "timeout" in error_lower:
            return "Connection timed out. The server may be unreachable or behind a firewall."
        if "name resolution" in error_lower or "getaddrinfo" in error_lower or "nodename nor servname" in error_lower:
            return "Cannot resolve hostname. Please check the server address."
        if "ssl" in error_lower and ("certificate" in error_lower or "handshake" in error_lower):
            return "SSL/TLS error. Try enabling 'Verify SSL' or check the server's certificate."
        if "connection reset" in error_lower:
            return "Connection was reset by the server. The server may not be running or is rejecting connections."
        if "no route to host" in error_lower:
            return "No route to host. The server is not reachable from this network."
        
        # Permission errors
        if "permission" in error_lower or "not authorized" in error_lower:
            return "Permission denied. The user may not have sufficient privileges."
        
        # Generic fallback - extract the most useful part
        # Try to find the 'msg' field in vmodl errors
        import re
        msg_match = re.search(r"msg\s*=\s*'([^']+)'", error)
        if msg_match:
            return msg_match.group(1)
        
        # If error is very long, truncate it
        if len(error) > 150:
            # Try to get just the first line or up to first bracket
            first_line = error.split('\n')[0].split('{')[0].strip()
            if first_line:
                return first_line
            return error[:150] + "..."
        
        return error

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
        """Get list of networks (Standard and Distributed)."""
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
                    "moid": net._moId,
                    "type": "Distributed" if isinstance(net, vim.dvs.DistributedVirtualPortgroup) else "Standard"
                })
            container.Destroy()
            return networks
        except Exception as e:
            vsphere_logger.error(f"Error getting networks: {e}")
            return []

    def create_port_group(self, name: str, dvs_name: str, vlan_id: int = 0, 
                          promiscuous_mode: bool = False, mac_changes: bool = False,
                          forged_transmits: bool = False, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Create a new dvPortgroup on a Distributed vSwitch.
        
        Args:
            name: Name for the new port group
            dvs_name: Name of the Distributed vSwitch to create on
            vlan_id: VLAN ID (0 = no VLAN/trunk)
            promiscuous_mode: Allow promiscuous mode
            mac_changes: Allow MAC address changes
            forged_transmits: Allow forged transmits
            connection_id: vSphere connection to use
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            content = si.content
            
            # Find the Distributed vSwitch
            dvs = None
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.DistributedVirtualSwitch], True
            )
            for switch in container.view:
                if switch.name == dvs_name:
                    dvs = switch
                    break
            container.Destroy()
            
            if not dvs:
                return {"success": False, "message": f"Distributed vSwitch '{dvs_name}' not found"}
            
            # Check if port group already exists
            for pg in dvs.portgroup:
                if pg.name == name:
                    return {"success": False, "message": f"Port group '{name}' already exists"}
            
            # Create port group spec
            pg_spec = vim.dvs.DistributedVirtualPortgroup.ConfigSpec()
            pg_spec.name = name
            pg_spec.type = vim.dvs.DistributedVirtualPortgroup.PortgroupType.earlyBinding
            pg_spec.numPorts = 128  # Default number of ports
            
            # Default port config
            default_config = vim.dvs.VmwareDistributedVirtualSwitch.VmwarePortConfigPolicy()
            
            # VLAN settings
            if vlan_id > 0:
                vlan_spec = vim.dvs.VmwareDistributedVirtualSwitch.VlanIdSpec()
                vlan_spec.vlanId = vlan_id
                vlan_spec.inherited = False
                default_config.vlan = vlan_spec
            
            # Security policy settings
            security_policy = vim.dvs.VmwareDistributedVirtualSwitch.SecurityPolicy()
            security_policy.allowPromiscuous = vim.BoolPolicy(value=promiscuous_mode)
            security_policy.macChanges = vim.BoolPolicy(value=mac_changes)
            security_policy.forgedTransmits = vim.BoolPolicy(value=forged_transmits)
            default_config.securityPolicy = security_policy
            
            pg_spec.defaultPortConfig = default_config
            
            # Create the port group
            task = dvs.CreateDVPortgroup_Task(spec=pg_spec)
            self._wait_for_task(task)
            
            vsphere_logger.info(f"Created port group '{name}' on DVS '{dvs_name}' with VLAN {vlan_id}")
            return {
                "success": True, 
                "message": f"Port group '{name}' created successfully",
                "name": name,
                "vlan_id": vlan_id,
                "dvs_name": dvs_name
            }
            
        except Exception as e:
            vsphere_logger.error(f"Error creating port group: {e}")
            return {"success": False, "message": str(e)}

    def delete_port_group(self, pg_name: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Delete a port group (works for both dvSwitch and standard vSwitch).
        
        Args:
            pg_name: Name of the port group to delete
            connection_id: vSphere connection to use
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            content = si.content
            
            # First try Distributed Port Groups
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.dvs.DistributedVirtualPortgroup], True
            )
            for pg in container.view:
                if pg.name == pg_name:
                    vsphere_logger.info(f"Deleting distributed port group: {pg_name}")
                    task = pg.Destroy_Task()
                    self._wait_for_task(task)
                    container.Destroy()
                    return {"success": True, "message": f"Deleted port group '{pg_name}'"}
            container.Destroy()
            
            # Try standard vSwitch port groups on each host
            host_container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.HostSystem], True
            )
            for host in host_container.view:
                try:
                    ns = host.configManager.networkSystem
                    for pg in ns.networkInfo.portgroup:
                        if pg.spec.name == pg_name:
                            vsphere_logger.info(f"Deleting standard port group: {pg_name} on host {host.name}")
                            ns.RemovePortGroup(pg_name)
                            host_container.Destroy()
                            return {"success": True, "message": f"Deleted port group '{pg_name}'"}
                except Exception as host_err:
                    vsphere_logger.warning(f"Error checking host {host.name}: {host_err}")
            host_container.Destroy()
            
            return {"success": False, "message": f"Port group '{pg_name}' not found"}
            
        except Exception as e:
            vsphere_logger.error(f"Error deleting port group {pg_name}: {e}")
            return {"success": False, "message": str(e)}

    def create_standard_port_group(self, name: str, vswitch_name: str, vlan_id: int = 0,
                                    host_name: Optional[str] = None,
                                    connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Create a port group on a Standard vSwitch.
        
        Args:
            name: Name for the new port group
            vswitch_name: Name of the standard vSwitch (e.g., vSwitch0)
            vlan_id: VLAN ID (0 = no VLAN)
            host_name: Specific host to create on (if None, creates on all hosts with that vSwitch)
            connection_id: vSphere connection to use
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            content = si.content
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.HostSystem], True
            )
            
            created_on = []
            for host in container.view:
                if host_name and host.name != host_name:
                    continue
                    
                try:
                    ns = host.configManager.networkSystem
                    
                    # Check if vSwitch exists on this host
                    vswitch_exists = any(vs.name == vswitch_name for vs in ns.networkInfo.vswitch)
                    if not vswitch_exists:
                        continue
                    
                    # Check if port group already exists
                    pg_exists = any(pg.spec.name == name for pg in ns.networkInfo.portgroup)
                    if pg_exists:
                        created_on.append(host.name)
                        continue
                    
                    # Create port group spec
                    pg_spec = vim.host.PortGroup.Specification()
                    pg_spec.name = name
                    pg_spec.vlanId = vlan_id
                    pg_spec.vswitchName = vswitch_name
                    pg_spec.policy = vim.host.NetworkPolicy()
                    
                    ns.AddPortGroup(pg_spec)
                    created_on.append(host.name)
                    vsphere_logger.info(f"Created standard port group '{name}' on host {host.name}")
                    
                except Exception as host_err:
                    vsphere_logger.warning(f"Failed to create port group on host {host.name}: {host_err}")
            
            container.Destroy()
            
            if created_on:
                return {
                    "success": True,
                    "message": f"Created port group '{name}' on {len(created_on)} host(s)",
                    "name": name,
                    "vlan_id": vlan_id,
                    "hosts": created_on
                }
            else:
                return {"success": False, "message": f"vSwitch '{vswitch_name}' not found on any host"}
                
        except Exception as e:
            vsphere_logger.error(f"Error creating standard port group: {e}")
            return {"success": False, "message": str(e)}

    def get_distributed_switches(self, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of Distributed vSwitches."""
        si = self.get_session(connection_id)
        if not si:
            return []
        
        try:
            content = si.content
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.DistributedVirtualSwitch], True
            )
            switches = []
            for dvs in container.view:
                switches.append({
                    "name": dvs.name,
                    "uuid": dvs.uuid,
                    "num_ports": dvs.config.numPorts if hasattr(dvs.config, 'numPorts') else 0,
                    "num_hosts": len(dvs.config.host) if hasattr(dvs.config, 'host') else 0
                })
            container.Destroy()
            return switches
        except Exception as e:
            vsphere_logger.error(f"Error getting distributed switches: {e}")
            return []

    def assign_vm_to_network(self, vm_moid: str, nic_name: str, network_name: str, 
                             adapter_type: Optional[str] = None, mac_address: Optional[str] = None, 
                             wake_on_lan: bool = False, connected: bool = True,
                             connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Assign a VM NIC to a specific network with advanced settings.
        
        Args:
            vm_moid: VM Managed Object ID
            nic_name: Name of the NIC (e.g. "Network adapter 1")
            network_name: Name of the network (Port Group) to connect to
            adapter_type: e1000, e1000e, vmxnet3, etc.
            mac_address: Specific MAC address to set
            wake_on_lan: Enable Wake-on-LAN
            connected: Link state (Connected)
            connection_id: vSphere connection ID
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        was_template = False
        resource_pool = None
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Check if this is a template - templates need to be converted to VMs first
            if vm.config.template:
                vsphere_logger.info(f"VM {vm.name} is a template - converting to VM for network assignment")
                was_template = True
                
                # Find a resource pool for the conversion
                try:
                    dc = vm.parent
                    while dc and not isinstance(dc, vim.Datacenter):
                        dc = dc.parent
                    
                    if dc:
                        for child in dc.hostFolder.childEntity:
                            if isinstance(child, (vim.ComputeResource, vim.ClusterComputeResource)):
                                resource_pool = child.resourcePool
                                break
                    
                    if not resource_pool:
                        return {"success": False, "message": "Could not find resource pool for template conversion"}
                    
                    vm.MarkAsVirtualMachine(pool=resource_pool)
                    vsphere_logger.info(f"Temporarily converted template {vm.name} to VM")
                    
                except Exception as convert_err:
                    vsphere_logger.error(f"Failed to convert template to VM: {convert_err}")
                    return {"success": False, "message": f"Cannot modify template: {convert_err}"}

            # Find the network object
            network = self._get_obj_by_name([vim.Network, vim.dvs.DistributedVirtualPortgroup], network_name, si)
            if not network:
                if was_template:
                    self._revert_to_template(vm, was_template)
                return {"success": False, "message": f"Network '{network_name}' not found"}
            
            # Find the NIC device
            nic_device = None
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualEthernetCard):
                    if not nic_name or device.deviceInfo.label == nic_name:
                        nic_device = device
                        break
            
            if not nic_device:
                if was_template:
                    self._revert_to_template(vm, was_template)
                return {"success": False, "message": f"NIC '{nic_name}' not found on VM"}

            # Determine Target Device Type Class
            target_device_class = None
            if adapter_type:
                adapter_map = {
                    "e1000": vim.vm.device.VirtualE1000,
                    "e1000e": vim.vm.device.VirtualE1000e,
                    "vmxnet3": vim.vm.device.VirtualVmxnet3,
                    "pcnet32": vim.vm.device.VirtualPCNet32,
                    "virtio": vim.vm.device.VirtualVmxnet3 # Fallback for Proxmox compat
                }
                target_device_class = adapter_map.get(adapter_type.lower())

            # Check if we need to replace the NIC (Model Change)
            needs_replacement = False
            if target_device_class and not isinstance(nic_device, target_device_class):
                needs_replacement = True
                vsphere_logger.info(f"NIC Model Change detected: {type(nic_device)} -> {target_device_class}")

            spec = vim.vm.ConfigSpec()
            
            if needs_replacement:
                # --- STRATEGY: REMOVE OLD & ADD NEW ---
                # 1. Remove Old
                remove_spec = vim.vm.device.VirtualDeviceSpec()
                remove_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.remove
                remove_spec.device = nic_device
                
                # 2. Add New
                add_spec = vim.vm.device.VirtualDeviceSpec()
                add_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.add
                
                # Create new device instance
                new_nic = target_device_class()
                
                # Copy properties or set defaults
                new_nic.key = -1
                
                # Backing
                if isinstance(network, vim.dvs.DistributedVirtualPortgroup):
                    dvs_port_connection = vim.dvs.PortConnection()
                    dvs_port_connection.portgroupKey = network.key
                    dvs_port_connection.switchUuid = network.config.distributedVirtualSwitch.uuid
                    new_nic.backing = vim.vm.device.VirtualEthernetCard.DistributedVirtualPortBackingInfo()
                    new_nic.backing.port = dvs_port_connection
                else:
                    new_nic.backing = vim.vm.device.VirtualEthernetCard.NetworkBackingInfo()
                    new_nic.backing.deviceName = network_name
                
                # Connect Info
                new_nic.connectable = vim.vm.device.VirtualDevice.ConnectInfo()
                new_nic.connectable.startConnected = connected
                new_nic.connectable.allowGuestControl = True
                new_nic.connectable.connected = connected
                
                # Wake On Lan
                new_nic.wakeOnLanEnabled = wake_on_lan
                new_nic.addressType = 'assigned' if mac_address else 'generated'
                if mac_address:
                    new_nic.macAddress = mac_address
                
                add_spec.device = new_nic
                
                spec.deviceChange = [remove_spec, add_spec]
                
            else:
                # --- STRATEGY: UPDATE EXISTING ---
                nic_spec = vim.vm.device.VirtualDeviceSpec()
                nic_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.edit
                nic_spec.device = nic_device
                
                # Update Backing (Network)
                if isinstance(network, vim.dvs.DistributedVirtualPortgroup):
                    dvs_port_connection = vim.dvs.PortConnection()
                    dvs_port_connection.portgroupKey = network.key
                    dvs_port_connection.switchUuid = network.config.distributedVirtualSwitch.uuid
                    nic_spec.device.backing = vim.vm.device.VirtualEthernetCard.DistributedVirtualPortBackingInfo()
                    nic_spec.device.backing.port = dvs_port_connection
                else:
                    # Check if we are switching FROM DVS TO Standard
                    if isinstance(nic_device.backing, vim.vm.device.VirtualEthernetCard.DistributedVirtualPortBackingInfo):
                         nic_spec.device.backing = vim.vm.device.VirtualEthernetCard.NetworkBackingInfo()
                    
                    nic_spec.device.backing.deviceName = network_name
                
                # Update Connect Info
                if nic_spec.device.connectable is None:
                    nic_spec.device.connectable = vim.vm.device.VirtualDevice.ConnectInfo()
                
                nic_spec.device.connectable.connected = connected
                nic_spec.device.connectable.startConnected = connected
                
                # Update MAC
                if mac_address and nic_device.macAddress != mac_address:
                    nic_spec.device.macAddress = mac_address
                    nic_spec.device.addressType = 'assigned'
                
                # Update Wake On LAN
                nic_spec.device.wakeOnLanEnabled = wake_on_lan
                
                spec.deviceChange = [nic_spec]
            
            # Apply Changes
            task = vm.ReconfigVM_Task(spec=spec)
            self._wait_for_task(task)
            
            vsphere_logger.info(f"VM {vm.name} NIC {nic_name} updated (Network: {network_name}, Model: {adapter_type or 'Unchanged'}, MAC: {mac_address or 'Unchanged'})")
            
            # Convert back to template if it was originally a template
            if was_template:
                self._revert_to_template(vm, was_template)
            
            return {"success": True, "message": f"Assigned to {network_name}"}
            
        except Exception as e:
            if was_template:
                self._revert_to_template(vm, was_template)
            vsphere_logger.error(f"Failed to assign VM {vm_moid} to network: {e}")
            return {"success": False, "message": str(e)}

    def _revert_to_template(self, vm, was_template):
        """Helper to revert a VM to template if needed."""
        if was_template:
            try:
                vm.MarkAsTemplate()
                vsphere_logger.info(f"Converted {vm.name} back to template")
            except Exception as revert_err:
                vsphere_logger.error(f"Failed to convert back to template: {revert_err}")

    def assign_vm_to_network_with_vlan(self, vm_moid: str, nic_name: str, network_name: str, 
                                        vlan_id: int, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Assign a VM NIC to a network with a specific VLAN ID for isolation.
        
        For Distributed vSwitch: This modifies the port to use VLAN override.
        For Standard vSwitch: This falls back to regular assignment (VLAN must be 
        configured on the physical switch trunk).
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Find the NIC device
            nic_device = None
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualEthernetCard):
                    if not nic_name or device.deviceInfo.label == nic_name:
                        nic_device = device
                        break
            
            if not nic_device:
                return {"success": False, "message": f"NIC '{nic_name}' not found on VM"}
            
            # Check if this is a Distributed Virtual Switch port
            if isinstance(nic_device.backing, vim.vm.device.VirtualEthernetCard.DistributedVirtualPortBackingInfo):
                # For dvSwitch - we can set VLAN override on the port
                try:
                    port_connection = nic_device.backing.port
                    if port_connection and hasattr(port_connection, 'portKey') and port_connection.portKey:
                        # Get the DVS
                        dvs = self._get_obj_by_uuid(vim.DistributedVirtualSwitch, 
                                                     port_connection.switchUuid, si)
                        if dvs:
                            # Create port config with VLAN override
                            port_spec = vim.dvs.DistributedVirtualPort.ConfigSpec()
                            port_spec.key = port_connection.portKey
                            port_spec.operation = "edit"
                            
                            # Set VLAN policy - MUST set inherited=False for VLAN to apply
                            vlan_spec = vim.dvs.VmwareDistributedVirtualSwitch.VlanIdSpec()
                            vlan_spec.vlanId = vlan_id
                            vlan_spec.inherited = False  # Required for VLAN to take effect
                            
                            port_settings = vim.dvs.VmwareDistributedVirtualSwitch.VmwarePortConfigPolicy()
                            port_settings.vlan = vlan_spec
                            port_spec.setting = port_settings
                            
                            vsphere_logger.info(f"Applying VLAN {vlan_id} to dvSwitch port for {vm.name}")
                            
                            # Apply the configuration
                            # Note: This requires appropriate permissions
                            task = dvs.ReconfigureDVPort_Task(port=[port_spec])
                            self._wait_for_task(task)
                            
                            return {"success": True, "message": f"Assigned VLAN {vlan_id} via dvSwitch"}
                except Exception as dvs_err:
                    vsphere_logger.warning(f"dvSwitch VLAN override failed, trying alternative: {dvs_err}")
            
            # For standard vSwitch or if dvSwitch override failed:
            # Just assign to the network - VLAN isolation must be handled at physical layer
            if network_name:
                result = self.assign_vm_to_network(vm_moid, nic_name, network_name, connection_id)
                if result.get("success"):
                    vsphere_logger.info(f"Assigned {vm.name} to {network_name} (VLAN {vlan_id} should be configured at switch level)")
                    return {"success": True, "message": f"Assigned to {network_name} (VLAN {vlan_id} - physical config required)"}
                return result
            
            return {"success": True, "message": f"VM NIC configured for VLAN {vlan_id}"}
            
        except Exception as e:
            vsphere_logger.error(f"Failed to assign VM {vm_moid} with VLAN {vlan_id}: {e}")
            return {"success": False, "message": str(e)}


    def get_vm_nics(self, vm_moid: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Get list of NICs on a VM with their current network assignments."""
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere", "nics": []}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found", "nics": []}
            
            nics = []
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualEthernetCard):
                    # Detect adapter type from the class
                    adapter_type = "e1000"  # Default fallback
                    device_class = type(device).__name__
                    if "Vmxnet3" in device_class:
                        adapter_type = "vmxnet3"
                    elif "Vmxnet2" in device_class:
                        adapter_type = "vmxnet2"
                    elif "Vmxnet" in device_class:
                        adapter_type = "vmxnet"
                    elif "E1000e" in device_class or "E1000E" in device_class:
                        adapter_type = "e1000e"
                    elif "E1000" in device_class:
                        adapter_type = "e1000"
                    elif "Pcnet32" in device_class:
                        adapter_type = "pcnet32"
                    elif "Sriov" in device_class:
                        adapter_type = "sriov"
                    
                    nic_info = {
                        "name": device.deviceInfo.label,
                        "key": device.key,
                        "mac_address": device.macAddress,
                        "connected": device.connectable.connected if device.connectable else False,
                        "network": None,
                        "network_type": None,
                        "adapter_type": adapter_type
                    }
                    
                    # Get backing network info
                    if hasattr(device, 'backing'):
                        if isinstance(device.backing, vim.vm.device.VirtualEthernetCard.DistributedVirtualPortBackingInfo):
                            nic_info["network"] = device.backing.port.portgroupKey if device.backing.port else None
                            nic_info["network_type"] = "distributed"
                        elif isinstance(device.backing, vim.vm.device.VirtualEthernetCard.NetworkBackingInfo):
                            nic_info["network"] = device.backing.deviceName if hasattr(device.backing, 'deviceName') else None
                            nic_info["network_type"] = "standard"
                    
                    nics.append(nic_info)
            
            vsphere_logger.info(f"Found {len(nics)} NICs on VM {vm.name}")
            return {"success": True, "nics": nics, "vm_name": vm.name}
            
        except Exception as e:
            vsphere_logger.error(f"Failed to get NICs for VM {vm_moid}: {e}")
            return {"success": False, "message": str(e), "nics": []}

    def add_nic_to_vm(self, vm_moid: str, network_name: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Add a new NIC to a VM and optionally connect it to a network.
        
        Note: If the target is a template, it will be temporarily converted to a VM,
        modified, and converted back to a template.
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        was_template = False
        resource_pool = None
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Check if this is a template - templates need to be converted to VMs first
            if vm.config.template:
                vsphere_logger.info(f"VM {vm.name} is a template - converting to VM for modification")
                was_template = True
                
                # Find a resource pool for the conversion
                try:
                    # Get the datacenter containing this template
                    dc = vm.parent
                    while dc and not isinstance(dc, vim.Datacenter):
                        dc = dc.parent
                    
                    if dc:
                        # Find first available resource pool
                        for child in dc.hostFolder.childEntity:
                            if isinstance(child, (vim.ComputeResource, vim.ClusterComputeResource)):
                                resource_pool = child.resourcePool
                                break
                    
                    if not resource_pool:
                        return {"success": False, "message": "Could not find resource pool for template conversion"}
                    
                    # Convert template to VM
                    vm.MarkAsVirtualMachine(pool=resource_pool)
                    vsphere_logger.info(f"Temporarily converted template {vm.name} to VM")
                    
                except Exception as convert_err:
                    vsphere_logger.error(f"Failed to convert template to VM: {convert_err}")
                    return {"success": False, "message": f"Cannot modify template: {convert_err}"}
            
            # Find the network - vSphere REQUIRES a backing when adding a NIC
            network = None
            actual_network_name = network_name
            
            if network_name:
                network = self._get_obj_by_name([vim.Network, vim.dvs.DistributedVirtualPortgroup], network_name, si)
            
            # If no network found, try to find ANY available network
            if not network:
                vsphere_logger.info(f"Network '{network_name}' not found - searching for any available network")
                content = si.content
                
                # Try distributed port groups first
                container = content.viewManager.CreateContainerView(content.rootFolder, [vim.dvs.DistributedVirtualPortgroup], True)
                for pg in container.view:
                    # Skip uplink port groups
                    if 'uplink' not in pg.name.lower():
                        network = pg
                        actual_network_name = pg.name
                        vsphere_logger.info(f"Found distributed port group: {actual_network_name}")
                        break
                container.Destroy()
                
                # If still no network, try standard networks
                if not network:
                    container = content.viewManager.CreateContainerView(content.rootFolder, [vim.Network], True)
                    for net in container.view:
                        if not isinstance(net, vim.dvs.DistributedVirtualPortgroup):
                            network = net
                            actual_network_name = net.name
                            vsphere_logger.info(f"Found standard network: {actual_network_name}")
                            break
                    container.Destroy()
            
            if not network:
                if was_template:
                    try:
                        vm.MarkAsTemplate()
                    except:
                        pass
                return {"success": False, "message": "No networks found in vSphere - cannot add NIC without a network"}
            
            # Create new NIC spec
            nic_spec = vim.vm.device.VirtualDeviceSpec()
            nic_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.add
            
            # Use VMXNET3 adapter
            nic_spec.device = vim.vm.device.VirtualVmxnet3()
            nic_spec.device.addressType = 'generated'
            
            # Set up backing based on network type
            if isinstance(network, vim.dvs.DistributedVirtualPortgroup):
                # Distributed Port Group
                dvs_port_connection = vim.dvs.PortConnection()
                dvs_port_connection.portgroupKey = network.key
                dvs_port_connection.switchUuid = network.config.distributedVirtualSwitch.uuid
                
                nic_spec.device.backing = vim.vm.device.VirtualEthernetCard.DistributedVirtualPortBackingInfo()
                nic_spec.device.backing.port = dvs_port_connection
            else:
                # Standard Port Group
                nic_spec.device.backing = vim.vm.device.VirtualEthernetCard.NetworkBackingInfo()
                nic_spec.device.backing.deviceName = actual_network_name
                nic_spec.device.backing.network = network
            
            # Set connectable properties
            nic_spec.device.connectable = vim.vm.device.VirtualDevice.ConnectInfo()
            nic_spec.device.connectable.startConnected = True
            nic_spec.device.connectable.allowGuestControl = True
            nic_spec.device.connectable.connected = True
            
            # Apply config
            spec = vim.vm.ConfigSpec()
            spec.deviceChange = [nic_spec]
            task = vm.ReconfigVM_Task(spec=spec)
            self._wait_for_task(task)
            
            msg = f"Added NIC connected to {actual_network_name}"
            vsphere_logger.info(f"Added NIC to VM {vm.name}: {msg}")
            
            # Convert back to template if it was originally a template
            if was_template:
                try:
                    vm.MarkAsTemplate()
                    vsphere_logger.info(f"Converted {vm.name} back to template")
                except Exception as revert_err:
                    vsphere_logger.error(f"Failed to convert back to template: {revert_err}")
                    msg += " (WARNING: Failed to convert back to template)"
            
            return {"success": True, "message": msg}
            
        except Exception as e:
            # Try to convert back to template if we were in the middle of modification
            if was_template:
                try:
                    vm.MarkAsTemplate()
                except:
                    pass  # Best effort
            vsphere_logger.error(f"Failed to add NIC to VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}

    def remove_nic_from_vm(self, vm_moid: str, nic_name: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Remove a NIC from a VM.
        
        Note: If the target is a template, it will be temporarily converted to a VM,
        modified, and converted back to a template.
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        was_template = False
        resource_pool = None
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Check if this is a template - templates need to be converted to VMs first
            if vm.config.template:
                vsphere_logger.info(f"VM {vm.name} is a template - converting to VM for NIC removal")
                was_template = True
                
                # Find a resource pool for the conversion
                try:
                    dc = vm.parent
                    while dc and not isinstance(dc, vim.Datacenter):
                        dc = dc.parent
                    
                    if dc:
                        for child in dc.hostFolder.childEntity:
                            if isinstance(child, (vim.ComputeResource, vim.ClusterComputeResource)):
                                resource_pool = child.resourcePool
                                break
                    
                    if not resource_pool:
                        return {"success": False, "message": "Could not find resource pool for template conversion"}
                    
                    vm.MarkAsVirtualMachine(pool=resource_pool)
                    vsphere_logger.info(f"Temporarily converted template {vm.name} to VM")
                    
                except Exception as convert_err:
                    vsphere_logger.error(f"Failed to convert template to VM: {convert_err}")
                    return {"success": False, "message": f"Cannot modify template: {convert_err}"}
            
            # Find the NIC device
            nic_device = None
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualEthernetCard):
                    if device.deviceInfo.label == nic_name:
                        nic_device = device
                        break
            
            if not nic_device:
                if was_template:
                    try:
                        vm.MarkAsTemplate()
                    except:
                        pass
                return {"success": False, "message": f"NIC '{nic_name}' not found on VM"}
            
            # Remove NIC spec
            nic_spec = vim.vm.device.VirtualDeviceSpec()
            nic_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.remove
            nic_spec.device = nic_device
            
            spec = vim.vm.ConfigSpec()
            spec.deviceChange = [nic_spec]
            task = vm.ReconfigVM_Task(spec=spec)
            self._wait_for_task(task)
            
            msg = f"Removed {nic_name}"
            vsphere_logger.info(f"Removed NIC {nic_name} from VM {vm.name}")
            
            # Convert back to template if it was originally a template
            if was_template:
                try:
                    vm.MarkAsTemplate()
                    vsphere_logger.info(f"Converted {vm.name} back to template")
                except Exception as revert_err:
                    vsphere_logger.error(f"Failed to convert back to template: {revert_err}")
                    msg += " (WARNING: Failed to convert back to template)"
            
            return {"success": True, "message": msg}
            
        except Exception as e:
            # Try to convert back to template if we were in the middle of modification
            if was_template:
                try:
                    vm.MarkAsTemplate()
                except:
                    pass
            vsphere_logger.error(f"Failed to remove NIC from VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}

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

    def get_datastores(self, connection_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get list of datastores with capacity and free space."""
        si = self.get_session(connection_id)
        if not si:
            return []

        try:
            content = si.content
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.Datastore], True
            )
            datastores = []
            for ds in container.view:
                try:
                    summary = ds.summary
                    capacity_gb = round(summary.capacity / (1024**3), 1) if summary.capacity else 0
                    free_gb = round(summary.freeSpace / (1024**3), 1) if summary.freeSpace else 0
                    used_gb = capacity_gb - free_gb
                    used_percent = round((used_gb / capacity_gb) * 100, 1) if capacity_gb > 0 else 0
                    
                    datastores.append({
                        "name": ds.name,
                        "moid": ds._moId,
                        "type": summary.type,  # VMFS, NFS, vsan, etc.
                        "capacity_gb": capacity_gb,
                        "free_gb": free_gb,
                        "used_gb": used_gb,
                        "used_percent": used_percent,
                        "accessible": summary.accessible,
                        "maintenance_mode": summary.maintenanceMode if hasattr(summary, 'maintenanceMode') else None
                    })
                except Exception as ds_err:
                    vsphere_logger.warning(f"Error reading datastore {ds.name}: {ds_err}")
                    datastores.append({
                        "name": ds.name,
                        "moid": ds._moId,
                        "type": "unknown",
                        "capacity_gb": 0,
                        "free_gb": 0,
                        "accessible": False
                    })
            container.Destroy()
            return datastores
        except Exception as e:
            vsphere_logger.error(f"Error getting datastores: {e}")
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

    def provision_vm(self, vm_moid: str, new_name: str, resource_pool: str = None, folder_path: List[str] = None, datastore_name: Optional[str] = None, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Clone a VM from a template.
        
        Args:
            vm_moid: MOID of the template/source VM
            new_name: Name for the cloned VM
            resource_pool: (unused, auto-detected)
            folder_path: Optional folder path for the VM
            datastore_name: Optional datastore name for cloning (uses template's if not specified)
            connection_id: vSphere connection to use
        """
        # Validate we are connected
        si = self.get_session(connection_id)
        if not si:
             vsphere_logger.error("provision_vm called but not connected to vSphere")
             return {"success": False, "message": "Not connected to vSphere"}

        try:
            vsphere_logger.info(f"Starting VM provisioning: template_moid={vm_moid}, new_name={new_name}, datastore={datastore_name}")
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
            
            # Set target datastore if specified
            if datastore_name:
                try:
                    datastore = self._get_obj_by_name([vim.Datastore], datastore_name, si)
                    if datastore:
                        relospec.datastore = datastore
                        vsphere_logger.info(f"Using target datastore: {datastore_name}")
                    else:
                        vsphere_logger.warning(f"Datastore '{datastore_name}' not found, using template's datastore")
                except Exception as ds_err:
                    vsphere_logger.warning(f"Error finding datastore: {ds_err}")

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
            
            # Wait for task to complete - raises exception on failure
            new_vm = self._wait_for_task(task)

            if new_vm:
                # Try to get IP (might take time, so we might return None initially)
                ip = None
                # Wait a bit for tools to run? Naah, just return simple for now.
                # Real IP fetching usually needs a loop waiting for guest tools.
                if new_vm.guest:
                    ip = new_vm.guest.ipAddress
                
                # Extract hardware specs
                cpu_cores = None
                ram_mb = None
                disk_gb = None
                
                if new_vm.config and new_vm.config.hardware:
                    cpu_cores = new_vm.config.hardware.numCPU
                    ram_mb = new_vm.config.hardware.memoryMB
                    
                    # Calculate total disk from all virtual disks
                    total_disk_kb = 0
                    for device in new_vm.config.hardware.device:
                        if isinstance(device, vim.vm.device.VirtualDisk):
                            total_disk_kb += device.capacityInKB
                    disk_gb = int(total_disk_kb / 1024 / 1024) if total_disk_kb > 0 else None
                
                vsphere_logger.info(f"VM provisioned successfully: {new_vm.name}, MOID: {new_vm._moId}, IP: {ip}, CPU: {cpu_cores}, RAM: {ram_mb}MB, Disk: {disk_gb}GB")


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
                    "result": new_vm,  # Include the VM object for callers that need it
                    "vm_name": new_vm.name,
                    "vm_moid": new_vm._moId,
                    "ip_address": ip,
                    "cpu_cores": cpu_cores,
                    "ram_mb": ram_mb,
                    "disk_gb": disk_gb
                }

            else:
                 vsphere_logger.error("Clone task returned no VM object")
                 return {"success": False, "message": "Clone task returned no VM"}



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

    def rename_vm(self, vm_moid: str, new_name: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Rename a VM.
        
        Args:
            vm_moid: MOID of the VM to rename
            new_name: New name for the VM
            connection_id: vSphere connection to use
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}

        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Create config spec with new name
            spec = vim.vm.ConfigSpec()
            spec.name = new_name
            
            task = vm.ReconfigVM_Task(spec=spec)
            result = self._wait_for_task(task)
            
            if result.get("success"):
                vsphere_logger.info(f"VM {vm_moid} renamed to {new_name}")
                return {"success": True, "message": f"VM renamed to {new_name}", "new_name": new_name}
            else:
                return {"success": False, "message": result.get("message", "Rename failed")}
                
        except Exception as e:
            vsphere_logger.error(f"Failed to rename VM {vm_moid}: {e}")
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
            self._wait_for_task(task)
            
            return {"success": True, "message": f"VM {vm.name} deleted successfully"}

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
            self._wait_for_task(task)
            return {"success": True, "message": "VNC enabled"}

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

    def _get_obj_by_name(self, vim_type_list, name: str, si: vim.ServiceInstance):
        """Find a vSphere object by name."""
        try:
            content = si.content
            for vim_type in vim_type_list:
                container = content.viewManager.CreateContainerView(content.rootFolder, [vim_type], True)
                for obj in container.view:
                    if obj.name == name:
                        container.Destroy()
                        return obj
                container.Destroy()
            return None
        except Exception as e:
            vsphere_logger.error(f"Error finding object by name '{name}': {e}")
            return None

    def _get_obj_by_uuid(self, vim_type, uuid: str, si: vim.ServiceInstance):
        """Find a DVS or other object by UUID."""
        try:
            content = si.content
            container = content.viewManager.CreateContainerView(content.rootFolder, [vim_type], True)
            for obj in container.view:
                if hasattr(obj, 'uuid') and obj.uuid == uuid:
                    container.Destroy()
                    return obj
            container.Destroy()
            return None
        except Exception as e:
            vsphere_logger.error(f"Error finding object by UUID '{uuid}': {e}")
            return None

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

    def delete_folder(self, folder_name: str, connection_id: Optional[int] = None, parent_folder_name: str = "SE_Training_Portal") -> Dict[str, Any]:
        """
        Delete a specific folder (and its contents) from a root folder (default SE_Training_Portal).
        The Destroy_Task will automatically delete all VMs and subfolders inside.
        
        Args:
            folder_name: Name of the folder to delete (e.g. class name)
            connection_id: Optional connection ID to use specific vSphere connection
            parent_folder_name: Name of the root folder to look in (e.g. "Templates" or "SE_Training_Portal")
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            content = si.content
            root_folder_name = parent_folder_name
            target_folder = None
            
            # Search all datacenters for the folder
            for child in content.rootFolder.childEntity:
                if isinstance(child, vim.Datacenter):
                    dc = child
                    if hasattr(dc, 'vmFolder'):
                        # Look for SE_Training_Portal root
                        se_folder = None
                        for folder_child in dc.vmFolder.childEntity:
                            if getattr(folder_child, 'name', '') == root_folder_name:
                                se_folder = folder_child
                                break
                        
                        if se_folder:
                            # Look for target folder inside SE_Training_Portal
                            for sub in se_folder.childEntity:
                                if getattr(sub, 'name', '') == folder_name:
                                    target_folder = sub
                                    break
                
                if target_folder:
                    break
            
            if target_folder:
                vsphere_logger.info(f"Deleting folder '{folder_name}' and all contents...")
                
                # Destroy_Task recursively deletes VMs and subfolders
                task = target_folder.Destroy_Task()
                self._wait_for_task(task)
                
                vsphere_logger.info(f"Successfully deleted folder: {folder_name}")
                return {"success": True, "message": f"Folder '{folder_name}' deleted successfully"}
            else:
                vsphere_logger.warning(f"Folder not found: {folder_name}")
                return {"success": False, "message": f"Folder '{folder_name}' not found in SE_Training_Portal"}

        except Exception as e:
            vsphere_logger.error(f"Error deleting folder {folder_name}: {e}")
            return {"success": False, "message": str(e)}

    def _wait_for_task(self, task):
        """Wait for a vSphere task to finish. Raises exception on failure."""
        try:
            while task.info.state in [vim.TaskInfo.State.running, vim.TaskInfo.State.queued]:
                import time
                time.sleep(0.5) # Simple blocking wait
            
            if task.info.state == vim.TaskInfo.State.success:
                return task.info.result
            else:
                # Task failed - raise exception so caller knows
                error_msg = str(task.info.error.msg) if task.info.error else "Unknown task error"
                vsphere_logger.error(f"vSphere task failed: {error_msg}")
                raise Exception(error_msg)
        except Exception as e:
            if "task" in str(type(e).__name__).lower():
                raise  # Re-raise our own exceptions
            vsphere_logger.error(f"Task wait exception: {e}")


    # ==================== VM HARDWARE MANAGEMENT ====================
    
    def get_vm_hardware(self, vm_moid: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get detailed hardware configuration for a VM.
        Returns CPU, memory, firmware, disks, NICs, and other settings.
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            config = vm.config
            hardware = config.hardware
            
            # Get disks
            disks = []
            for device in hardware.device:
                if isinstance(device, vim.vm.device.VirtualDisk):
                    backing = device.backing
                    datastore_name = None
                    thin_provisioned = False
                    
                    if hasattr(backing, 'datastore') and backing.datastore:
                        datastore_name = backing.datastore.name
                    if hasattr(backing, 'thinProvisioned'):
                        thin_provisioned = backing.thinProvisioned
                    
                    disks.append({
                        "key": device.key,
                        "label": device.deviceInfo.label,
                        "capacity_gb": round(device.capacityInKB / (1024 * 1024), 2),
                        "datastore": datastore_name,
                        "thin_provisioned": thin_provisioned,
                        "controller_key": device.controllerKey,
                        "unit_number": device.unitNumber
                    })
            
            # Get CD/DVD drives
            cdroms = []
            for device in hardware.device:
                if isinstance(device, vim.vm.device.VirtualCdrom):
                    iso_path = None
                    connected = False
                    if hasattr(device.backing, 'fileName'):
                        iso_path = device.backing.fileName
                    if device.connectable:
                        connected = device.connectable.connected
                    
                    cdroms.append({
                        "key": device.key,
                        "label": device.deviceInfo.label,
                        "iso_path": iso_path,
                        "connected": connected
                    })
            
            # Get NICs
            nics = []
            for device in hardware.device:
                if isinstance(device, vim.vm.device.VirtualEthernetCard):
                    nic_type = type(device).__name__.replace("Virtual", "")
                    network_name = None
                    if hasattr(device.backing, 'network') and device.backing.network:
                        network_name = device.backing.network.name
                    elif hasattr(device.backing, 'port'):
                        # dvSwitch
                        network_name = device.deviceInfo.summary
                    
                    nics.append({
                        "key": device.key,
                        "label": device.deviceInfo.label,
                        "mac_address": device.macAddress,
                        "type": nic_type,
                        "network": network_name,
                        "connected": device.connectable.connected if device.connectable else False
                    })
            
            # Check for TPM
            has_tpm = any(isinstance(d, vim.vm.device.VirtualTPM) for d in hardware.device)
            
            return {
                "success": True,
                "vm_name": vm.name,
                "power_state": str(vm.runtime.powerState).replace("powered", "").capitalize(),
                "compute": {
                    "num_cpus": hardware.numCPU,
                    "cores_per_socket": config.hardware.numCoresPerSocket if hasattr(config.hardware, 'numCoresPerSocket') else 1,
                    "memory_mb": hardware.memoryMB,
                    "memory_gb": round(hardware.memoryMB / 1024, 1),
                    "nested_hv_enabled": config.nestedHVEnabled if hasattr(config, 'nestedHVEnabled') else False,
                    "cpu_hot_add_enabled": config.cpuHotAddEnabled if hasattr(config, 'cpuHotAddEnabled') else False,
                    "memory_hot_add_enabled": config.memoryHotAddEnabled if hasattr(config, 'memoryHotAddEnabled') else False
                },
                "firmware": {
                    "type": config.firmware if hasattr(config, 'firmware') else "bios",
                    "secure_boot_enabled": config.bootOptions.efiSecureBootEnabled if hasattr(config, 'bootOptions') and hasattr(config.bootOptions, 'efiSecureBootEnabled') else False,
                    "has_tpm": has_tpm
                },
                "disks": disks,
                "cdroms": cdroms,
                "nics": nics,
                "guest_os": config.guestFullName,
                "guest_id": config.guestId,
                "version": config.version,
                "uuid": config.uuid
            }
            
        except Exception as e:
            vsphere_logger.error(f"Error getting VM hardware for {vm_moid}: {e}")
            return {"success": False, "message": str(e)}
    
    def reconfigure_vm(self, vm_moid: str, config_updates: Dict[str, Any], 
                       connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Reconfigure VM compute and firmware settings.
        
        config_updates can include:
            - num_cpus: int
            - cores_per_socket: int
            - memory_mb: int
            - nested_hv_enabled: bool
            - cpu_hot_add_enabled: bool
            - memory_hot_add_enabled: bool
            - firmware: str ("bios" or "efi")
            - secure_boot_enabled: bool
        
        Note: Some changes require the VM to be powered off.
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Check if VM is a template
            is_template = vm.config.template
            if is_template:
                # Convert to VM temporarily
                vm.MarkAsVirtualMachine(pool=vm.resourcePool, host=None)
            
            config_spec = vim.vm.ConfigSpec()
            changes_made = []
            
            # VM Name (rename)
            if 'name' in config_updates and config_updates['name']:
                config_spec.name = str(config_updates['name'])
                changes_made.append(f"Name: {config_updates['name']}")
            
            # CPU settings
            if 'num_cpus' in config_updates:
                config_spec.numCPUs = int(config_updates['num_cpus'])
                changes_made.append(f"CPUs: {config_updates['num_cpus']}")
            
            if 'cores_per_socket' in config_updates:
                config_spec.numCoresPerSocket = int(config_updates['cores_per_socket'])
                changes_made.append(f"Cores/Socket: {config_updates['cores_per_socket']}")
            
            if 'nested_hv_enabled' in config_updates:
                config_spec.nestedHVEnabled = bool(config_updates['nested_hv_enabled'])
                changes_made.append(f"Nested VT: {config_updates['nested_hv_enabled']}")
            
            if 'cpu_hot_add_enabled' in config_updates:
                config_spec.cpuHotAddEnabled = bool(config_updates['cpu_hot_add_enabled'])
                changes_made.append(f"CPU Hot-Add: {config_updates['cpu_hot_add_enabled']}")
            
            # Memory settings
            if 'memory_mb' in config_updates:
                config_spec.memoryMB = int(config_updates['memory_mb'])
                changes_made.append(f"Memory: {config_updates['memory_mb']} MB")
            
            if 'memory_hot_add_enabled' in config_updates:
                config_spec.memoryHotAddEnabled = bool(config_updates['memory_hot_add_enabled'])
                changes_made.append(f"Memory Hot-Add: {config_updates['memory_hot_add_enabled']}")
            
            # Firmware settings (require powered off VM)
            if 'firmware' in config_updates:
                firmware_val = config_updates['firmware'].lower()
                if firmware_val in ['bios', 'efi']:
                    config_spec.firmware = firmware_val
                    changes_made.append(f"Firmware: {firmware_val.upper()}")
            
            if 'secure_boot_enabled' in config_updates:
                if not hasattr(config_spec, 'bootOptions') or config_spec.bootOptions is None:
                    config_spec.bootOptions = vim.vm.BootOptions()
                config_spec.bootOptions.efiSecureBootEnabled = bool(config_updates['secure_boot_enabled'])
                changes_made.append(f"Secure Boot: {config_updates['secure_boot_enabled']}")
            
            if not changes_made:
                return {"success": True, "message": "No changes specified"}
            
            # Apply configuration
            task = vm.ReconfigVM_Task(spec=config_spec)
            self._wait_for_task(task)
            
            # Convert back to template if it was one
            if is_template:
                vm.MarkAsTemplate()
            
            vsphere_logger.info(f"Reconfigured VM {vm.name}: {', '.join(changes_made)}")
            return {
                "success": True, 
                "message": f"Applied changes: {', '.join(changes_made)}",
                "changes": changes_made
            }
            
        except Exception as e:
            vsphere_logger.error(f"Error reconfiguring VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}
    
    def add_disk_to_vm(self, vm_moid: str, size_gb: int, datastore_name: str,
                       thin_provisioned: bool = True, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Add a new disk to a VM."""
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Check if template
            is_template = vm.config.template
            if is_template:
                vm.MarkAsVirtualMachine(pool=vm.resourcePool, host=None)
            
            # Find datastore
            datastore = None
            content = si.content
            container = content.viewManager.CreateContainerView(content.rootFolder, [vim.Datastore], True)
            for ds in container.view:
                if ds.name == datastore_name:
                    datastore = ds
                    break
            container.Destroy()
            
            if not datastore:
                return {"success": False, "message": f"Datastore '{datastore_name}' not found"}
            
            # Find SCSI controller
            scsi_controller = None
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualSCSIController):
                    scsi_controller = device
                    break
            
            if not scsi_controller:
                return {"success": False, "message": "No SCSI controller found on VM"}
            
            # Find next available unit number
            used_units = set()
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualDisk):
                    if device.controllerKey == scsi_controller.key:
                        used_units.add(device.unitNumber)
            
            unit_number = 0
            while unit_number in used_units or unit_number == 7:  # Unit 7 is reserved for SCSI controller
                unit_number += 1
            
            # Create disk backing
            disk_backing = vim.vm.device.VirtualDisk.FlatVer2BackingInfo()
            disk_backing.datastore = datastore
            disk_backing.diskMode = 'persistent'
            disk_backing.thinProvisioned = thin_provisioned
            disk_backing.fileName = f"[{datastore_name}]"
            
            # Create disk spec
            disk = vim.vm.device.VirtualDisk()
            disk.backing = disk_backing
            disk.controllerKey = scsi_controller.key
            disk.unitNumber = unit_number
            disk.capacityInKB = size_gb * 1024 * 1024
            
            device_spec = vim.vm.device.VirtualDeviceSpec()
            device_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.add
            device_spec.fileOperation = vim.vm.device.VirtualDeviceSpec.FileOperation.create
            device_spec.device = disk
            
            config_spec = vim.vm.ConfigSpec()
            config_spec.deviceChange = [device_spec]
            
            task = vm.ReconfigVM_Task(spec=config_spec)
            self._wait_for_task(task)
            
            if is_template:
                vm.MarkAsTemplate()
            
            vsphere_logger.info(f"Added {size_gb}GB disk to {vm.name} on {datastore_name}")
            return {
                "success": True, 
                "message": f"Added {size_gb}GB disk on {datastore_name}",
                "unit_number": unit_number
            }
            
        except Exception as e:
            vsphere_logger.error(f"Error adding disk to VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}
    
    def resize_disk(self, vm_moid: str, disk_key: int, new_size_gb: int,
                    connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Resize an existing disk (can only grow, not shrink)."""
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Find the disk
            disk = None
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualDisk) and device.key == disk_key:
                    disk = device
                    break
            
            if not disk:
                return {"success": False, "message": f"Disk with key {disk_key} not found"}
            
            current_size_gb = disk.capacityInKB / (1024 * 1024)
            if new_size_gb <= current_size_gb:
                return {"success": False, "message": f"New size ({new_size_gb}GB) must be larger than current ({current_size_gb:.1f}GB)"}
            
            # Resize
            disk.capacityInKB = new_size_gb * 1024 * 1024
            
            device_spec = vim.vm.device.VirtualDeviceSpec()
            device_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.edit
            device_spec.device = disk
            
            config_spec = vim.vm.ConfigSpec()
            config_spec.deviceChange = [device_spec]
            
            task = vm.ReconfigVM_Task(spec=config_spec)
            self._wait_for_task(task)
            
            vsphere_logger.info(f"Resized disk on {vm.name} from {current_size_gb:.1f}GB to {new_size_gb}GB")
            return {
                "success": True, 
                "message": f"Resized disk from {current_size_gb:.1f}GB to {new_size_gb}GB"
            }
            
        except Exception as e:
            vsphere_logger.error(f"Error resizing disk on VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}
    
    def remove_disk(self, vm_moid: str, disk_key: int, delete_files: bool = True,
                    connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Remove a disk from a VM."""
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            is_template = vm.config.template
            if is_template:
                vm.MarkAsVirtualMachine(pool=vm.resourcePool, host=None)
            
            # Find the disk
            disk = None
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualDisk) and device.key == disk_key:
                    disk = device
                    break
            
            if not disk:
                return {"success": False, "message": f"Disk with key {disk_key} not found"}
            
            device_spec = vim.vm.device.VirtualDeviceSpec()
            device_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.remove
            if delete_files:
                device_spec.fileOperation = vim.vm.device.VirtualDeviceSpec.FileOperation.destroy
            device_spec.device = disk
            
            config_spec = vim.vm.ConfigSpec()
            config_spec.deviceChange = [device_spec]
            
            task = vm.ReconfigVM_Task(spec=config_spec)
            self._wait_for_task(task)
            
            if is_template:
                vm.MarkAsTemplate()
            
            vsphere_logger.info(f"Removed disk {disk.deviceInfo.label} from {vm.name}")
            return {"success": True, "message": f"Removed {disk.deviceInfo.label}"}
            
        except Exception as e:
            vsphere_logger.error(f"Error removing disk from VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}
    
    def get_vm_snapshots(self, vm_moid: str, connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Get list of snapshots for a VM."""
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere", "snapshots": []}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found", "snapshots": []}
            
            snapshots = []
            
            def process_snapshot_tree(snapshot_list, parent_name=""):
                for snap in snapshot_list:
                    snapshots.append({
                        "id": snap.snapshot._moId,
                        "name": snap.name,
                        "description": snap.description,
                        "created": snap.createTime.isoformat() if snap.createTime else None,
                        "state": str(snap.state),
                        "parent": parent_name
                    })
                    if snap.childSnapshotList:
                        process_snapshot_tree(snap.childSnapshotList, snap.name)
            
            if vm.snapshot and vm.snapshot.rootSnapshotList:
                process_snapshot_tree(vm.snapshot.rootSnapshotList)
            
            return {
                "success": True,
                "vm_name": vm.name,
                "current_snapshot": vm.snapshot.currentSnapshot._moId if vm.snapshot and vm.snapshot.currentSnapshot else None,
                "snapshots": snapshots
            }
            
        except Exception as e:
            vsphere_logger.error(f"Error getting snapshots for VM {vm_moid}: {e}")
            return {"success": False, "message": str(e), "snapshots": []}
    
    def create_snapshot(self, vm_moid: str, name: str, description: str = "",
                        memory: bool = False, quiesce: bool = True,
                        connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Create a snapshot of a VM."""
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            task = vm.CreateSnapshot_Task(
                name=name,
                description=description,
                memory=memory,
                quiesce=quiesce
            )
            self._wait_for_task(task)
            
            vsphere_logger.info(f"Created snapshot '{name}' on {vm.name}")
            return {"success": True, "message": f"Created snapshot '{name}'"}
            
        except Exception as e:
            vsphere_logger.error(f"Error creating snapshot on VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}
    
    def revert_to_snapshot(self, vm_moid: str, snapshot_moid: str,
                           connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Revert VM to a specific snapshot."""
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Find snapshot by moId
            snapshot = None
            
            def find_snapshot(snap_list):
                for snap in snap_list:
                    if snap.snapshot._moId == snapshot_moid:
                        return snap.snapshot
                    if snap.childSnapshotList:
                        result = find_snapshot(snap.childSnapshotList)
                        if result:
                            return result
                return None
            
            if vm.snapshot and vm.snapshot.rootSnapshotList:
                snapshot = find_snapshot(vm.snapshot.rootSnapshotList)
            
            if not snapshot:
                return {"success": False, "message": "Snapshot not found"}
            
            task = snapshot.RevertToSnapshot_Task()
            self._wait_for_task(task)
            
            vsphere_logger.info(f"Reverted {vm.name} to snapshot {snapshot_moid}")
            return {"success": True, "message": "Reverted to snapshot"}
            
        except Exception as e:
            vsphere_logger.error(f"Error reverting to snapshot on VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}
    
    def delete_snapshot(self, vm_moid: str, snapshot_moid: str, remove_children: bool = False,
                        connection_id: Optional[int] = None) -> Dict[str, Any]:
        """Delete a snapshot."""
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Find snapshot
            snapshot = None
            
            def find_snapshot(snap_list):
                for snap in snap_list:
                    if snap.snapshot._moId == snapshot_moid:
                        return snap.snapshot
                    if snap.childSnapshotList:
                        result = find_snapshot(snap.childSnapshotList)
                        if result:
                            return result
                return None
            
            if vm.snapshot and vm.snapshot.rootSnapshotList:
                snapshot = find_snapshot(vm.snapshot.rootSnapshotList)
            
            if not snapshot:
                return {"success": False, "message": "Snapshot not found"}
            
            task = snapshot.RemoveSnapshot_Task(removeChildren=remove_children)
            self._wait_for_task(task)
            
            vsphere_logger.info(f"Deleted snapshot {snapshot_moid} from {vm.name}")
            return {"success": True, "message": "Snapshot deleted"}
            
        except Exception as e:
            vsphere_logger.error(f"Error deleting snapshot on VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}
    
    # ============== ISO/CD-ROM Management ==============
    
    def get_isos(self, datastore_name: Optional[str] = None, 
                 connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Get available ISO files from datastores.
        If datastore_name is provided, only search that datastore.
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            content = si.RetrieveContent()
            isos = []
            
            # Get datastores
            container = content.viewManager.CreateContainerView(
                content.rootFolder, [vim.Datastore], True
            )
            datastores = container.view
            container.Destroy()
            
            for ds in datastores:
                if datastore_name and ds.name != datastore_name:
                    continue
                    
                try:
                    # Search for ISO files
                    browser = ds.browser
                    search_spec = vim.host.DatastoreBrowser.SearchSpec()
                    search_spec.matchPattern = ["*.iso"]
                    search_spec.details = vim.host.DatastoreBrowser.FileInfo.Details()
                    search_spec.details.fileSize = True
                    search_spec.details.modification = True
                    
                    # Search in common ISO folders
                    search_paths = [f"[{ds.name}]", f"[{ds.name}] ISO", f"[{ds.name}] ISOs"]
                    
                    for search_path in search_paths:
                        try:
                            task = browser.SearchDatastoreSubFolders_Task(search_path, search_spec)
                            self._wait_for_task(task)
                            
                            if task.info.result:
                                for folder_result in task.info.result:
                                    if folder_result.file:
                                        for f in folder_result.file:
                                            iso_path = f"{folder_result.folderPath}{f.path}"
                                            isos.append({
                                                "name": f.path,
                                                "path": iso_path,
                                                "datastore": ds.name,
                                                "size_mb": round(f.fileSize / (1024 * 1024), 1) if f.fileSize else 0
                                            })
                        except vim.fault.FileNotFound:
                            continue
                        except Exception as e:
                            vsphere_logger.debug(f"Error searching {search_path}: {e}")
                            continue
                            
                except Exception as e:
                    vsphere_logger.debug(f"Error browsing datastore {ds.name}: {e}")
                    continue
            
            return {"success": True, "isos": isos}
            
        except Exception as e:
            vsphere_logger.error(f"Error getting ISOs: {e}")
            return {"success": False, "message": str(e)}
    
    def mount_iso(self, vm_moid: str, iso_path: str, 
                  connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Mount an ISO to a VM's CD/DVD drive.
        If no CD/DVD drive exists, one will be added.
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Check if VM is a template
            is_template = vm.config.template
            if is_template:
                vm.MarkAsVirtualMachine(pool=vm.resourcePool, host=None)
            
            # Find existing CD/DVD drive
            cdrom = None
            ide_controller = None
            
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualCdrom):
                    cdrom = device
                    break
                if isinstance(device, vim.vm.device.VirtualIDEController):
                    ide_controller = device
            
            config_spec = vim.vm.ConfigSpec()
            
            if cdrom:
                # Modify existing CD/DVD to use ISO
                cdrom_backing = vim.vm.device.VirtualCdrom.IsoBackingInfo()
                cdrom_backing.fileName = iso_path
                cdrom.backing = cdrom_backing
                cdrom.connectable = vim.vm.device.VirtualDevice.ConnectInfo()
                cdrom.connectable.startConnected = True
                cdrom.connectable.connected = True
                cdrom.connectable.allowGuestControl = True
                
                device_spec = vim.vm.device.VirtualDeviceSpec()
                device_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.edit
                device_spec.device = cdrom
                config_spec.deviceChange = [device_spec]
            else:
                # Need to add a CD/DVD drive
                if not ide_controller:
                    return {"success": False, "message": "No IDE controller found to attach CD/DVD"}
                
                cdrom = vim.vm.device.VirtualCdrom()
                cdrom.controllerKey = ide_controller.key
                cdrom.unitNumber = 0
                cdrom.key = -1
                
                cdrom_backing = vim.vm.device.VirtualCdrom.IsoBackingInfo()
                cdrom_backing.fileName = iso_path
                cdrom.backing = cdrom_backing
                
                cdrom.connectable = vim.vm.device.VirtualDevice.ConnectInfo()
                cdrom.connectable.startConnected = True
                cdrom.connectable.connected = True
                cdrom.connectable.allowGuestControl = True
                
                device_spec = vim.vm.device.VirtualDeviceSpec()
                device_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.add
                device_spec.device = cdrom
                config_spec.deviceChange = [device_spec]
            
            task = vm.ReconfigVM_Task(spec=config_spec)
            self._wait_for_task(task)
            
            if is_template:
                vm.MarkAsTemplate()
            
            vsphere_logger.info(f"Mounted ISO {iso_path} to {vm.name}")
            return {"success": True, "message": f"ISO mounted: {iso_path}"}
            
        except Exception as e:
            vsphere_logger.error(f"Error mounting ISO to VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}
    
    def eject_iso(self, vm_moid: str, 
                  connection_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Eject/disconnect ISO from VM's CD/DVD drive.
        """
        si = self.get_session(connection_id)
        if not si:
            return {"success": False, "message": "Not connected to vSphere"}
        
        try:
            vm = self._get_obj([vim.VirtualMachine], vm_moid, si)
            if not vm:
                return {"success": False, "message": "VM not found"}
            
            # Check if VM is a template
            is_template = vm.config.template
            if is_template:
                vm.MarkAsVirtualMachine(pool=vm.resourcePool, host=None)
            
            # Find CD/DVD drive
            cdrom = None
            for device in vm.config.hardware.device:
                if isinstance(device, vim.vm.device.VirtualCdrom):
                    cdrom = device
                    break
            
            if not cdrom:
                if is_template:
                    vm.MarkAsTemplate()
                return {"success": False, "message": "No CD/DVD drive found"}
            
            # Change to client device (empty)
            cdrom_backing = vim.vm.device.VirtualCdrom.RemotePassthroughBackingInfo()
            cdrom_backing.deviceName = ""
            cdrom.backing = cdrom_backing
            cdrom.connectable = vim.vm.device.VirtualDevice.ConnectInfo()
            cdrom.connectable.startConnected = False
            cdrom.connectable.connected = False
            cdrom.connectable.allowGuestControl = True
            
            device_spec = vim.vm.device.VirtualDeviceSpec()
            device_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.edit
            device_spec.device = cdrom
            
            config_spec = vim.vm.ConfigSpec()
            config_spec.deviceChange = [device_spec]
            
            task = vm.ReconfigVM_Task(spec=config_spec)
            self._wait_for_task(task)
            
            if is_template:
                vm.MarkAsTemplate()
            
            vsphere_logger.info(f"Ejected ISO from {vm.name}")
            return {"success": True, "message": "ISO ejected"}
            
        except Exception as e:
            vsphere_logger.error(f"Error ejecting ISO from VM {vm_moid}: {e}")
            return {"success": False, "message": str(e)}


# Singleton instance
vsphere_service = VSphereService()


