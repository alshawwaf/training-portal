import requests
import json
import time

API_URL = "http://localhost:8000"

def verify_provisioning():
    # 1. Create a Dummy Template
    print("Creating Test Template...")
    vm_data = [
        {"vm_name": "Test-VM-1", "vm_moid": "vm-mock-1", "cpu": 2, "memory_mb": 4096}
    ]
    template_data = {
        "name": "Provisioning Test Template",
        "description": "Template for verifying provisioning logic",
        "provider": "vSphere",
        "vms": vm_data
    }
    
    # We don't have a direct 'create template with VMs' endpoint public publicly documented in this context easily,
    # so we might need to rely on database seeding or the existing template creation flow if distinct.
    # Actually, let's try to create a Class with a template_id that we know exists or seed one directly via a helper in main.py?
    # Alternatively, let's list templates first.
    
    resp = requests.get(f"{API_URL}/templates/")
    templates = resp.json()
    vsphere_tmpl = next((t for t in templates if t['provider'] == 'vSphere'), None)
    
    if not vsphere_tmpl:
        print("No vSphere template found. Creating one via API not fully supported in this script without complex auth/mocking steps.")
        print("Assuming seeding created 'Base Environment' or similar.")
        # Attempt to find ANY template
        if templates:
            vsphere_tmpl = templates[0]
            print(f"Using template: {vsphere_tmpl['name']} (ID: {vsphere_tmpl['id']})")
        else:
            print("No templates found at all. Aborting.")
            return

    # 2. Create a Class linked to this template
    print("Creating Test Class...")
    class_data = {
        "name": "Provisioning Verification Class",
        "blueprint_id": "legacy-id", # Required field currently
        "template_id": vsphere_tmpl['id'],
        "max_users": 2, # Small number for testing
        "passcode": "123456",
        "start_date": "2025-01-01T09:00:00",
        "end_date": "2025-01-05T17:00:00",
        "status": "draft"
    }
    
    resp = requests.post(f"{API_URL}/classes/", json=class_data)
    if resp.status_code != 200:
        print(f"Failed to create class: {resp.text}")
        return
    
    class_id = resp.json()['id']
    print(f"Class created with ID: {class_id}")
    
    # 3. Trigger Provisioning
    print("Triggering Provisioning...")
    # Add mock parameter to ensure vsphere service treats it as mock
    # (The service itself reads env vars, so it should be in mock mode by default or based on .env)
    
    resp = requests.post(f"{API_URL}/classes/{class_id}/provision")
    
    if resp.status_code == 200:
        result = resp.json()
        print("Provisioning Successful!")
        print(json.dumps(result, indent=2))
        
        if result['success'] and result['message'].startswith("Provisioned 2"):
            print("VERIFICATION PASSED: Environments provisioned.")
        else:
             print("VERIFICATION FAILED: Unexpected response message.")
    else:
        print(f"Provisioning Failed: {resp.status_code} - {resp.text}")

if __name__ == "__main__":
    # Wait for backend to reload
    print("Waiting for backend to ensure readiness...")
    time.sleep(5) 
    try:
        verify_provisioning()
    except Exception as e:
        print(f"Error: {e}")
