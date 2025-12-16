#!/usr/bin/env python3
"""Debug script to compare GuacamoleService vs working test script byte-by-byte"""
import sys
sys.path.insert(0, '/app')
import json
import hmac
import hashlib
from base64 import standard_b64encode
from time import time
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

SECRET_KEY = "REDACTED_GUACAMOLE_SECRET_KEY"

# Create identical payload
payload = {
    'username': 'TestUser',
    'expires': 1765845000000,  # Fixed timestamp for comparison
    'connections': {
        'test-conn': {
            'protocol': 'rdp',
            'parameters': {
                'hostname': 'localhost',
                'port': '3389',
            }
        }
    }
}

print("=== WORKING TEST SCRIPT METHOD ===")
message = json.dumps(payload).encode()
print(f"JSON: {message.decode()}")
print(f"JSON bytes len: {len(message)}")

signature = hmac.new(bytes.fromhex(SECRET_KEY), message, hashlib.sha256).digest()
print(f"Signature: {signature.hex()}")

signed_message = signature + message
pad = 16 - (len(signed_message) % 16)
padding = bytes([pad] * pad)
padded = signed_message + padding
print(f"Padded len: {len(padded)}")

null_iv = 32 * "0"
cipher = Cipher(algorithms.AES128(bytes.fromhex(SECRET_KEY)), modes.CBC(bytes.fromhex(null_iv)), backend=default_backend())
encryptor = cipher.encryptor()
ciphertext = encryptor.update(padded) + encryptor.finalize()
print(f"Ciphertext len: {len(ciphertext)}")
print(f"Ciphertext (first 32 bytes): {ciphertext[:32].hex()}")

token = standard_b64encode(ciphertext).decode()
print(f"Token: {token[:80]}...")
print(f"Token len: {len(token)}")

print("\n=== GUACAMOLE SERVICE METHOD ===")
from services.guacamole_service import GuacamoleService
g = GuacamoleService()

# Check key
print(f"Service key: {g.secret_key}")
print(f"Service key bytes: {g.key_bytes.hex()}")

# Now generate using the exact same payload
json_str = json.dumps(payload)
json_bytes = json_str.encode('utf-8')
print(f"Service JSON: {json_str}")
print(f"Service JSON bytes len: {len(json_bytes)}")

# Sign
sig = hmac.new(g.key_bytes, json_bytes, hashlib.sha256).digest()
print(f"Service Signature: {sig.hex()}")

# Combine
signed = sig + json_bytes

# Pad (service uses inline padding now)
pad2 = 16 - (len(signed) % 16)
padding2 = bytes([pad2] * pad2)
padded2 = signed + padding2
print(f"Service Padded len: {len(padded2)}")

# Encrypt
null_iv2 = 32 * "0"
cipher2 = Cipher(algorithms.AES128(g.key_bytes), modes.CBC(bytes.fromhex(null_iv2)), backend=default_backend())
enc2 = cipher2.encryptor()
ct2 = enc2.update(padded2) + enc2.finalize()
print(f"Service Ciphertext len: {len(ct2)}")
print(f"Service Ciphertext (first 32 bytes): {ct2[:32].hex()}")

token2 = standard_b64encode(ct2).decode()
print(f"Service Token: {token2[:80]}...")
print(f"Service Token len: {len(token2)}")

print(f"\n=== COMPARISON ===")
print(f"Tokens match: {token == token2}")
print(f"Ciphertexts match: {ciphertext == ct2}")
print(f"Signatures match: {signature == sig}")
print(f"JSON bytes match: {message == json_bytes}")
