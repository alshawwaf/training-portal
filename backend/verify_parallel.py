import requests
import json
import sys
import time

BASE_URL = "http://localhost:8000"

def get_first_template():
    try:
        r = requests.get(f"{BASE_URL}/templates/")
        r.raise_for_status()
        templates = r.json()
        if templates:
            return templates[0]['id']
    except Exception as e:
        print(f"Failed to fetch templates: {e}")
    return None

def create_class(template_id):
    url = f"{BASE_URL}/classes/"
    payload = {
        "name": "Parallel Test Class",
        "template_id": template_id,
        "max_users": 2, # Small number, but enough to see parallelism if template has VMs
        "passcode": "verification123",
        "start_date": "2025-12-20T12:00:00",
        "end_date": "2025-12-25T12:00:00"
    }
    try:
        print(f"Creating class with payload: {payload}")
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        print("Class created successfully.")
        return response.json()
    except Exception as e:
        print(f"Failed to create class: {e}")
        if hasattr(e, 'response') and e.response:
             print(f"Response: {e.response.text}")
        return None

def test_provisioning(class_id):
    url = f"{BASE_URL}/classes/{class_id}/provision"
    print(f"Testing streaming provisioning for class {class_id}...")
    start_time = time.time()
    try:
        with requests.post(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            print("Provision request initiated. Reading stream...")
            for line in r.iter_lines():
                if line:
                    decoded = line.decode('utf-8')
                    print(f"RECEIVED: {decoded}")
                    try:
                        data = json.loads(decoded)
                        if data.get("status") == "completed":
                            print("Provisioning completed successfully.")
                    except json.JSONDecodeError:
                        pass
    except Exception as e:
        print(f"Streaming provision failed: {e}")
    
    end_time = time.time()
    print(f"Total Provisioning Time: {end_time - start_time:.2f} seconds")

if __name__ == "__main__":
    tid = get_first_template()
    if not tid:
        print("No templates found, trying fallback 9...")
        tid = 9
        
    new_class = create_class(tid)
    if new_class:
        print(f"Class created: ID={new_class['id']}")
        test_provisioning(new_class['id'])
    else:
        print("Skipping test due to creation failure.")
