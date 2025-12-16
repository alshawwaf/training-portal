#!/usr/bin/env python3
"""
Test script to verify Guacamole JSON auth - based on working example from:
https://github.com/manics/jupyterhub-guacamole-handler
"""
import hashlib
import hmac
import json
import os
from base64 import standard_b64encode
from time import time
from urllib.parse import quote

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

# Get key from environment or .env file
SECRET_KEY = os.getenv("GUACAMOLE_SECRET_KEY", "REDACTED_GUACAMOLE_SECRET_KEY")
GUACAMOLE_URL = os.getenv("GUACAMOLE_URL", "http://guacamole:8080/guacamole")


def sign(key, message):
    """Sign message with HMAC-SHA256"""
    signature = hmac.new(bytes.fromhex(key), message, hashlib.sha256).digest()
    return signature


def encrypt(key, message):
    """Encrypt with AES-128-CBC and NULL IV (per working example)"""
    null_iv = 32 * "0"  # "00000000000000000000000000000000" - 32 hex chars

    # pkcs7 padding
    pad = 16 - (len(message) % 16)
    padding = bytes([pad] * pad)

    cipher = Cipher(
        algorithms.AES128(bytes.fromhex(key)), modes.CBC(bytes.fromhex(null_iv))
    )
    encryptor = cipher.encryptor()
    ct = encryptor.update(message + padding) + encryptor.finalize()
    return ct


def create_token(username, hostname, protocol="rdp", port="3389"):
    """Create encrypted token for Guacamole"""
    expiry_ms = int(time() * 1000) + 60000  # 1 minute from now
    
    connection_id = f"test-{username}-{protocol}"
    
    data = {
        "username": username,
        "expires": expiry_ms,
        "connections": {
            connection_id: {
                "protocol": protocol,
                "parameters": {
                    "hostname": hostname,
                    "port": port,
                    "ignore-cert": "true",
                },
            }
        },
    }

    # Serialize to JSON (default format with spaces - per working example)
    message = json.dumps(data).encode()
    
    print(f"JSON payload: {message.decode()}")
    print(f"JSON bytes length: {len(message)}")
    
    # Sign
    signature = sign(SECRET_KEY, message)
    print(f"Signature: {signature.hex()}")
    print(f"Signature length: {len(signature)}")
    
    # Encrypt signature + message
    ciphertext = encrypt(SECRET_KEY, signature + message)
    print(f"Ciphertext length: {len(ciphertext)}")
    
    # Base64 encode
    token = standard_b64encode(ciphertext).decode()
    print(f"Token: {token}")
    print(f"Token length: {len(token)}")
    
    return token


def test_guacamole_auth(token):
    """Test the token against Guacamole API"""
    import requests
    
    url = f"{GUACAMOLE_URL}/api/tokens"
    body = f"data={quote(token)}"
    
    print(f"\nTesting against: {url}")
    print(f"Body length: {len(body)}")
    
    try:
        response = requests.post(
            url,
            data={"data": token},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10
        )
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")
        return response
    except Exception as e:
        print(f"Error: {e}")
        return None


if __name__ == "__main__":
    print("=" * 60)
    print("Guacamole JSON Auth Test")
    print("=" * 60)
    print(f"Secret Key: {SECRET_KEY}")
    print(f"Key length: {len(bytes.fromhex(SECRET_KEY))} bytes")
    print()
    
    token = create_token("TestUser", "10.1.1.100")
    print()
    
    # Optionally test against Guacamole
    try:
        test_guacamole_auth(token)
    except ImportError:
        print("requests module not available, skipping HTTP test")
