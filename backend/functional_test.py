import requests
import json
import sys

BASE_URL = "http://localhost:8000"
EMAIL = "admin@cpdemo.com"
PASSWORD = "Cpwins!1"

def test_api():
    print(f"Testing API at {BASE_URL}...")

    # 1. Login
    token = None
    try:
        url = f"{BASE_URL}/auth/local-login"
        payload = {"email": EMAIL, "password": PASSWORD}
        resp = requests.post(url, json=payload)
        
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("token")
            print(f"[PASS] Login (Token: {token[:10]}...)")
        else:
            print(f"[FAIL] Login: {resp.status_code} - {resp.text}")
            return
    except Exception as e:
        print(f"[FAIL] Login Exception: {e}")
        return

    auth_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # 2. Update Email Settings
    email_settings = [
        {"key": "smtp_server", "value": "203.0.113.111"},
        {"key": "smtp_port", "value": "25"},
        {"key": "smtp_username", "value": "info@americas-ses.com"}, # Still providing, but will disable auth
        {"key": "smtp_password", "value": "Cpwins!1"},
        {"key": "smtp_from", "value": "info@americas-ses.com"},
        {"key": "smtp_tls", "value": "false"},
        {"key": "smtp_ssl", "value": "false"},
        {"key": "smtp_use_auth", "value": "false"} # Validation: Disable Auth
    ]

    print("Updating Email Settings...")
    for setting in email_settings:
        try:
            url = f"{BASE_URL}/settings/{setting['key']}"
            resp = requests.put(url, headers=auth_headers, json={"value": setting['value']})
            if resp.status_code == 200:
                print(f"[PASS] Updated {setting['key']}")
            else:
                # If 404, try POST (create) if it doesn't exist? 
                # The backend implementation checks if exists, if not 404.
                # But seeding creates them. "smtp_use_auth" might NOT be seeded!
                if resp.status_code == 404:
                    print(f"[WARN] Setting {setting['key']} not found, attempting creation...")
                    create_resp = requests.post(f"{BASE_URL}/settings/", headers=auth_headers, json={
                        "key": setting['key'],
                        "value": setting['value'],
                        "category": "smtp",
                        "description": "Added via Test",
                        "is_secret": False
                    })
                    if create_resp.status_code == 200:
                        print(f"[PASS] Created {setting['key']}")
                    else:
                        print(f"[FAIL] Create {setting['key']}: {create_resp.status_code} - {create_resp.text}")
                else:
                    print(f"[FAIL] Update {setting['key']}: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"[FAIL] Update {setting['key']} Exception: {e}")

    # 3. Send Test Email
    print("Sending Test Email...")
    try:
        url = f"{BASE_URL}/email/test"
        # API expects: to: List[EmailStr], subject, message
        payload = {
            "to": ["administrator@americas-ses.com"],
            "subject": "Test Email from Functional Test Script",
            "message": "This verifies the SMTP configuration."
        }
        resp = requests.post(url, headers=auth_headers, json=payload)
        if resp.status_code == 200:
            print("[PASS] Send Test Email")
        else:
            print(f"[FAIL] Send Test Email: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"[FAIL] Send Test Email Exception: {e}")

if __name__ == "__main__":
    test_api()
