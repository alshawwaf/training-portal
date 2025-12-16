#!/usr/bin/env python3
"""Test GuacamoleService directly against Guacamole API"""
import sys
sys.path.insert(0, '/app')
from services.guacamole_service import GuacamoleService
import requests

g = GuacamoleService()
result = g.generate_connection_token('TestUser', 'test-conn', 'rdp', 'localhost', 3389)
token = result.get('token')
print(f"Token result: {result.get('success')}")
print(f"Token length: {len(token) if token else 0}")

if token:
    r = requests.post('http://guacamole:8080/guacamole/api/tokens', data={'data': token}, timeout=10)
    print(f"Status: {r.status_code}")
    print(f"Body: {r.text}")
else:
    print(f"Error: {result.get('message')}")
