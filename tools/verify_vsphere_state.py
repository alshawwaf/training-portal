
import sys
import os
import ssl
from pyVim.connect import SmartConnect, Disconnect
from pyVmomi import vim
from dotenv import load_dotenv

# Load environment variables from backend/.env
# Assuming we are running from the root or a folder relative to backend
backend_env_path = os.path.join(os.getcwd(), 'backend', '.env')
if os.path.exists(backend_env_path):
    load_dotenv(backend_env_path)
else:
    # Try finding it relative to the script if running from tools/
    backend_env_path = os.path.join(os.getcwd(), '..', 'backend', '.env')
    if os.path.exists(backend_env_path):
        load_dotenv(backend_env_path)

VSPHERE_HOST = os.getenv("VSPHERE_HOST")
VSPHERE_USER = os.getenv("VSPHERE_USER")
VSPHERE_PASSWORD = os.getenv("VSPHERE_PASSWORD")

def get_vms(content):
    obj_view = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.VirtualMachine], True
    )
    vms = obj_view.view
    obj_view.Destroy()
    return vms

def main():
    if not all([VSPHERE_HOST, VSPHERE_USER, VSPHERE_PASSWORD]):
        print("Error: Missing vSphere environment variables.")
        return

    # Disable SSL certificate verification
    context = ssl._create_unverified_context()

    try:
        si = SmartConnect(
            host=VSPHERE_HOST,
            user=VSPHERE_USER,
            pwd=VSPHERE_PASSWORD,
            sslContext=context
        )
    except Exception as e:
        print(f"Failed to connect to vSphere: {e}")
        return

    try:
        content = si.RetrieveContent()
        vms = get_vms(content)
        
        print(f"Found {len(vms)} VMs in vSphere:")
        for vm in vms:
            # Print minimal info to avoid clutter, focus on name and power state
            try:
                name = vm.name
                power_state = vm.runtime.powerState
                print(f" - {name} [{power_state}]")
            except Exception:
                pass
                
    except Exception as e:
        print(f"Error retrieving VMs: {e}")
    finally:
        Disconnect(si)

if __name__ == "__main__":
    main()
