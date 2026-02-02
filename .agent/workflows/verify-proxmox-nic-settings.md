---
description: Verify Proxmox NIC settings functionality
---
1. Open the [Network Designer](http://localhost:5173/templates).
2. Select a Proxmox-based template.
3. Locate a VM node and its NIC list.
4. Click the "Gear" icon next to a NIC.
5. In the modal, change settings:
    - Model: e1000
    - Firewall: Checked
    - MTU: 9000
    - MAC Address: auto
6. Click "Save Changes".
7. Connect the NIC to a network if not connected (required for saving).
8. Click "Save Topology" in the toolbar.
9. Reload the page and verify the settings persist (click Gear icon again).
10. If possible, trigger "Sync Environments" and verify in Proxmox (or check logs).
