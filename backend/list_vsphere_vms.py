
import sys
import os
from pyVim.connect import SmartConnect, Disconnect
from pyVmomi import vim
import ssl
from dotenv import load_dotenv

load_dotenv()

host = os.getenv("VSPHERE_HOST")
user = os.getenv("VSPHERE_USER")
password = os.getenv("VSPHERE_PASSWORD")
port = 443
ssl_verify = False

print(f"Connecting to {host} as {user}...")

context = ssl._create_unverified_context()
si = SmartConnect(host=host, user=user, pwd=password, port=port, sslContext=context)

if not si:
    print("Could not connect")
    sys.exit(1)

content = si.content
container = content.viewManager.CreateContainerView(
    content.rootFolder, [vim.VirtualMachine], True
)

vms = container.view
print(f"Found {len(vms)} VMs:")
for vm in vms:
    print(f"  Name: {vm.name}, MOID: {vm._moId}, Template: {vm.config.template}")

Disconnect(si)
