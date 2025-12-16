import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def get_vm_for_console():
    # 1. List Classes
    try:
        r = requests.get(f"{BASE_URL}/classes/")
        r.raise_for_status()
        classes = r.json()
        if not classes:
            print("No classes found.")
            return None, None, None
            
        # Look for a class with environments
        for cls in classes:
            cid = cls['id']
            # Get environments
            r_env = requests.get(f"{BASE_URL}/classes/{cid}/environments")
            if r_env.status_code == 200:
                envs = r_env.json()
                for env in envs:
                    eid = env['id']
                    # Get VMs (usually nested or separate? Dashboard fetch logic says nested in env usually, or we can fetch)
                    # The API endpoint for environment details might be different, let's assume we can get VMs from env
                    # Actually, Dashboard fetches `/classes/{id}/environments` which returns list of Env with VMs.
                    if env.get('vms'):
                         vm = env['vms'][0]
                         return cid, eid, vm['id']
        
        print("No VMs found in any class.")
        return None, None, None

    except Exception as e:
        print(f"Error finding VM: {e}")
        return None, None, None

def test_console_access(cid, eid, vid):
    url = f"{BASE_URL}/classes/{cid}/environments/{eid}/vms/{vid}/console"
    print(f"Testing Console Endpoint: {url}")
    try:
        r = requests.get(url)
        print(f"Status Code: {r.status_code}")
        print(f"Response: {r.text}")
        if r.status_code == 200:
            data = r.json()
            if data.get('success'):
                print("SUCCESS: Console ticket retrieved.")
                print(f"URI: {data.get('uri')}")
            else:
                print("FAILURE: Success flag is false.")
        else:
            print("FAILURE: HTTP Error.")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    cid, eid, vid = get_vm_for_console()
    if cid and eid and vid:
        test_console_access(cid, eid, vid)
    else:
        print("Could not run test: No suitable VM found.")
