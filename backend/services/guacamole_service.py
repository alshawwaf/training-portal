"""
Guacamole Service - HTML5 Console Access via Apache Guacamole
Uses JSON Authentication for ephemeral connections (no database required).
"""

import os
import json
import time
import hmac
import hashlib
import base64
import logging
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from typing import Optional, Dict, Any

# Setup logger
guac_logger = logging.getLogger("guacamole")
guac_logger.setLevel(logging.DEBUG)

# Console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(console_format)
guac_logger.addHandler(console_handler)


class GuacamoleService:
    """
    Service for generating encrypted Guacamole JSON auth tokens.
    
    Guacamole JSON Auth Flow:
    1. Build JSON payload with username + connection config
    2. Sign with HMAC-SHA256
    3. Encrypt with AES-128-CBC
    4. Base64 encode for URL transmission
    5. POST to /api/tokens to get auth token
    6. Redirect user to /guacamole/#/client/{connection}?token={token}
    """

    def __init__(self):
        # Secret key MUST be set via environment variable - no hardcoded defaults
        self.secret_key = os.getenv("GUACAMOLE_SECRET_KEY")
        if not self.secret_key:
            guac_logger.error("GUACAMOLE_SECRET_KEY environment variable is not set!")
            raise ValueError("GUACAMOLE_SECRET_KEY environment variable is required")
        
        self.external_url = os.getenv("GUACAMOLE_EXTERNAL_URL", "http://localhost:8085/guacamole")
        
        # Guacamole expects hex-encoded secret key
        # 32 hex chars = 16 bytes = 128-bit key for AES-128
        try:
            self.key_bytes = bytes.fromhex(self.secret_key)
        except ValueError:
            guac_logger.error(f"Invalid hex key format: {self.secret_key}")
            raise ValueError("GUACAMOLE_SECRET_KEY must be a valid hex string")
        
        if len(self.key_bytes) != 16:
            guac_logger.warning(f"Key should be 32 hex chars (16 bytes) for AES-128. Got {len(self.key_bytes)} bytes.")
        
        guac_logger.info(f"GuacamoleService initialized. Key: {self.key_bytes.hex()}, External URL: {self.external_url}")

    def _pad(self, data: bytes) -> bytes:
        """PKCS7 padding for AES encryption."""
        block_size = 16
        padding_len = block_size - (len(data) % block_size)
        return data + bytes([padding_len] * padding_len)

    def _encrypt_payload(self, payload: dict) -> str:
        """
        Encrypt JSON payload for Guacamole JSON auth.
        
        Process (per Guacamole source code):
        1. Convert to JSON string
        2. Sign with HMAC-SHA256 (32 bytes)
        3. Prepend signature to message
        4. Pad with PKCS7
        5. Encrypt with AES-128-CBC using NULL IV (all zeros)
        6. Base64 encode (NO IV prepended - Guacamole uses NULL IV)
        """
        # Serialize to JSON (default format with spaces - matches working examples)
        # The signature is calculated on these bytes, so format matters!
        json_str = json.dumps(payload)
        json_bytes = json_str.encode('utf-8')
        
        guac_logger.info(f"Payload JSON: {json_str}")
        
        # Create HMAC-SHA256 signature
        signature = hmac.new(self.key_bytes, json_bytes, hashlib.sha256).digest()
        guac_logger.info(f"Signature: {signature.hex()}")
        
        # Combine signature + message
        signed_message = signature + json_bytes
        
        # Pad for AES (PKCS7) - exactly as per working example
        pad = 16 - (len(signed_message) % 16)
        padding = bytes([pad] * pad)
        padded = signed_message + padding
        
        # Guacamole uses NULL IV (all zeros) - use hex string method from working example
        null_iv = 32 * "0"  # "00000000000000000000000000000000" - 32 hex chars = 16 bytes
        
        # Encrypt with AES128-CBC using NULL IV - EXACTLY as per working example
        cipher = Cipher(
            algorithms.AES128(self.key_bytes), 
            modes.CBC(bytes.fromhex(null_iv)),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(padded) + encryptor.finalize()
        
        # Base64 encode using standard_b64encode like working example
        from base64 import standard_b64encode
        token = standard_b64encode(ciphertext).decode('utf-8')
        guac_logger.info(f"Generated Token length: {len(token)}")
        
        return token

    def generate_connection_token(
        self,
        username: str,
        connection_id: str,
        protocol: str,
        hostname: str,
        port: int = None,
        vm_username: str = None,
        vm_password: str = None,
        expires_minutes: int = 60,
        **extra_params
    ) -> Dict[str, Any]:
        """
        Generate an encrypted JSON auth token for a Guacamole connection.
        
        Args:
            username: Display name for the user
            connection_id: Unique identifier for this connection
            protocol: Connection protocol (rdp, ssh, vnc)
            hostname: Target VM hostname or IP
            port: Target port (defaults: RDP=3389, SSH=22, VNC=5900)
            vm_username: Credentials for the VM (optional)
            vm_password: Password for the VM (optional)
            expires_minutes: Token validity in minutes
            **extra_params: Additional protocol-specific parameters
            
        Returns:
            dict with 'success', 'token', 'console_url'
        """
        try:
            # Set default ports
            if port is None:
                port = {"rdp": 3389, "ssh": 22, "vnc": 5900}.get(protocol, 22)
            
            # Calculate expiration timestamp (milliseconds)
            expires = int((time.time() + (expires_minutes * 60)) * 1000)
            
            # (The timestamp variable was previously used incorrectly - now we use expires directly)
            
            # Build connection parameters based on protocol
            parameters = {
                "hostname": hostname,
                "port": str(port),
            }
            
            # Add credentials if provided
            if vm_username:
                parameters["username"] = vm_username
            if vm_password:
                parameters["password"] = vm_password
            
            # Protocol-specific defaults
            if protocol == "rdp":
                parameters.setdefault("security", "any")
                parameters.setdefault("ignore-cert", "true")
                parameters.setdefault("enable-wallpaper", "false")
                parameters.setdefault("enable-font-smoothing", "true")
                parameters.setdefault("resize-method", "display-update")
            elif protocol == "ssh":
                parameters.setdefault("color-scheme", "green-black")
                parameters.setdefault("font-size", "12")
            elif protocol == "vnc":
                parameters.setdefault("autoretry", "5")
            
            # Add any extra parameters
            parameters.update(extra_params)
            
            # Build JSON auth payload
            # Guacamole expects: username, expires, connections (map of connection_id -> config)
            # See: UserData.java in guacamole-auth-json
            payload = {
                "username": username,
                "expires": expires,  # Use the calculated future expiration time!
                "connections": {
                    connection_id: {
                        "protocol": protocol,
                        "parameters": parameters
                    }
                }
            }
            
            guac_logger.debug(f"Generating token for connection: {connection_id} ({protocol}://{hostname}:{port})")
            
            # Encrypt the payload
            encrypted_token = self._encrypt_payload(payload)
            
            # Build the console URL
            # The connection identifier format: connectionID + NULL + type + provider
            # For JSON auth, it's: connection_name + \x00 + c + \x00 + json
            connection_identifier = base64.b64encode(
                f"{connection_id}\x00c\x00json".encode('utf-8')
            ).decode('utf-8')
            
            console_url = f"{self.external_url}/#/client/{connection_identifier}?data={encrypted_token}"
            
            guac_logger.info(f"Generated console URL for {connection_id}")
            
            return {
                "success": True,
                "token": encrypted_token,
                "console_url": console_url,
                "connection_id": connection_id,
                "protocol": protocol,
                "expires_at": expires
            }
            
        except Exception as e:
            guac_logger.error(f"Failed to generate connection token: {e}")
            return {
                "success": False,
                "message": str(e)
            }

    def get_console_url_for_vm(
        self,
        vm_id: int,
        vm_name: str,
        ip_address: str,
        protocol: str = "rdp",
        port: int = None,
        username: str = None,
        password: str = None,
        student_name: str = "Student"
    ) -> Dict[str, Any]:
        """
        Convenience method to generate a console URL for a provisioned VM.
        
        Args:
            vm_id: Database ID of the VM
            vm_name: Display name of the VM
            ip_address: IP address of the VM
            protocol: Connection protocol (rdp, ssh, vnc)
            port: Port number (optional, uses protocol defaults)
            username: VM login username (optional)
            password: VM login password (optional)
            student_name: Name of the student for display
            
        Returns:
            dict with console URL and metadata
        """
        # Use IP address if available, otherwise fall back to VM name as hostname
        hostname = ip_address
        warning = None
        
        if not ip_address:
            # Use VM name as hostname fallback (for DNS resolution or placeholder)
            hostname = vm_name.replace(" ", "-").lower()
            warning = "No IP address available - using VM name as hostname. Connection may fail if DNS is not configured."
            guac_logger.warning(f"VM {vm_id} has no IP, using hostname fallback: {hostname}")
        
        # Generate unique connection ID
        connection_id = f"vm-{vm_id}-{vm_name.replace(' ', '_')}"
        
        result = self.generate_connection_token(
            username=student_name,
            connection_id=connection_id,
            protocol=protocol,
            hostname=hostname,
            port=port,
            vm_username=username,
            vm_password=password
        )
        
        # Add warning if hostname fallback was used
        if warning and result.get("success"):
            result["warning"] = warning
            
        return result


# Singleton instance
guacamole_service = GuacamoleService()
