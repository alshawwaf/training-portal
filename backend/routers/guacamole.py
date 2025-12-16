"""
Guacamole Router - Handles console access token generation and auth proxy
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import EnvironmentVM, ClassEnvironment, Class, TemplateVM
from services.guacamole_service import guacamole_service
import os

router = APIRouter(prefix="/console", tags=["console"])

GUACAMOLE_INTERNAL_URL = os.getenv("GUACAMOLE_URL", "http://guacamole:8080/guacamole")
GUACAMOLE_EXTERNAL_URL = os.getenv("GUACAMOLE_EXTERNAL_URL", "http://localhost:8085/guacamole")


@router.get("/{class_id}/{env_id}/{vm_id}")
async def get_console_page(
    class_id: int, 
    env_id: int, 
    vm_id: int, 
    protocol: Optional[str] = None,  # Optional protocol override: vnc, ssh, rdp
    db: Session = Depends(get_db)
):
    """
    Generate a console access page that automatically authenticates with Guacamole.
    Returns an HTML page that POSTs the encrypted token to Guacamole's API.
    
    Query params:
        protocol: Optional override for connection protocol (vnc, ssh, rdp)
    """
    # 1. Verify ownership/existence
    env_vm = db.query(EnvironmentVM).filter(EnvironmentVM.id == vm_id).first()
    if not env_vm:
        raise HTTPException(status_code=404, detail="VM not found")
        
    class_env = db.query(ClassEnvironment).filter(ClassEnvironment.id == env_id).first()
    if not class_env or class_env.class_id != class_id:
        raise HTTPException(status_code=404, detail="Environment not found")
        
    if env_vm.env_id != env_id:
        raise HTTPException(status_code=400, detail="VM does not belong to this environment")

    # 2. Get protocol settings from template (as default)
    db_class = db.query(Class).filter(Class.id == class_id).first()
    default_protocol = "rdp"
    port = 3389
    
    if db_class and db_class.template_id:
        template_vms = db.query(TemplateVM).filter(TemplateVM.template_id == db_class.template_id).all()
        for tvm in template_vms:
            if tvm.vm_name in env_vm.vm_name:
                default_protocol = tvm.access_protocol or "rdp"
                port = tvm.access_port or {"rdp": 3389, "ssh": 22, "vnc": 5900}.get(default_protocol, 3389)
                break

    # 3. Use override protocol if provided, otherwise use template default
    final_protocol = protocol.lower() if protocol else default_protocol
    if final_protocol not in ["rdp", "ssh", "vnc"]:
        final_protocol = default_protocol
    
    # Update port if protocol was overridden
    if protocol and protocol.lower() != default_protocol:
        port = {"rdp": 3389, "ssh": 22, "vnc": 5900}.get(final_protocol, 3389)

    # 4. Generate encrypted token
    result = guacamole_service.get_console_url_for_vm(
        vm_id=env_vm.id,
        vm_name=env_vm.vm_name,
        ip_address=env_vm.ip_address,
        protocol=final_protocol,
        port=port,
        student_name=class_env.name
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to generate token"))

    # 4. Return an HTML page that handles the auth flow
    token = result.get("token", "")
    connection_id = result.get("connection_id", "")
    
    # Use our backend as a proxy to avoid CORS issues
    html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{env_vm.vm_name} - Console</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #e2e8f0;
        }}
        .loader {{
            text-align: center;
        }}
        .spinner {{
            width: 48px;
            height: 48px;
            border: 3px solid rgba(59, 130, 246, 0.3);
            border-top-color: #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }}
        @keyframes spin {{
            to {{ transform: rotate(360deg); }}
        }}
        h2 {{
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
        }}
        p {{
            color: #94a3b8;
            font-size: 14px;
        }}
        .error {{
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 12px;
            padding: 20px;
            max-width: 400px;
        }}
        .error h2 {{
            color: #f87171;
        }}
    </style>
</head>
<body>
    <div class="loader" id="loader">
        <div class="spinner"></div>
        <h2>Connecting to {env_vm.vm_name}</h2>
        <p>Establishing secure console session...</p>
    </div>
    
    <script>
        const GUACAMOLE_URL = "{GUACAMOLE_EXTERNAL_URL}";
        const ENCRYPTED_DATA = "{token}";
        const CONNECTION_ID = "{connection_id}";
        
        async function authenticate() {{
            try {{
                // Use our backend proxy to avoid CORS issues
                const response = await fetch('/api/console/auth', {{
                    method: 'POST',
                    headers: {{
                        'Content-Type': 'application/json'
                    }},
                    body: JSON.stringify({{ data: ENCRYPTED_DATA }})
                }});
                
                if (!response.ok) {{
                    const errData = await response.json().catch(() => ({{}}));
                    throw new Error(errData.detail || 'Authentication failed: ' + response.status);
                }}
                
                const data = await response.json();
                const authToken = data.authToken;
                
                if (!authToken) {{
                    throw new Error('No auth token received');
                }}
                
                // Build connection identifier (base64 encoded)
                const connectionIdentifier = btoa(CONNECTION_ID + '\\x00c\\x00json');
                
                // Redirect to the console with the token
                const consoleUrl = GUACAMOLE_URL + '/#/client/' + encodeURIComponent(connectionIdentifier) + '?token=' + authToken;
                
                window.location.href = consoleUrl;
                
            }} catch (error) {{
                console.error('Console connection error:', error);
                document.getElementById('loader').innerHTML = `
                    <div class="error">
                        <h2>Connection Failed</h2>
                        <p>${{error.message}}</p>
                        <p style="margin-top: 12px;">
                            <a href="javascript:location.reload()" style="color: #3b82f6;">Try again</a> |
                            <a href="javascript:window.close()" style="color: #94a3b8; margin-left: 8px;">Close</a>
                        </p>
                    </div>
                `;
            }}
        }}
        
        // Start authentication on page load
        authenticate();
    </script>
</body>
</html>
"""
    
    return HTMLResponse(content=html_content, headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
    })


from pydantic import BaseModel
import httpx

class GuacAuthRequest(BaseModel):
    data: str

@router.post("/auth")
async def proxy_guacamole_auth(request: GuacAuthRequest):
    """
    Proxy authentication request to Guacamole to avoid CORS issues.
    The frontend HTML page calls this endpoint, and we forward to Guacamole.
    """
    import logging
    logger = logging.getLogger("guacamole.proxy")
    
    try:
        guac_url = f"{GUACAMOLE_INTERNAL_URL}/api/tokens"
        logger.info(f"Proxying auth request to Guacamole: {guac_url}")
        logger.info(f"Token data length: {len(request.data)}")
        logger.debug(f"Token data (first 100 chars): {request.data[:100]}...")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                guac_url,
                data={"data": request.data},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10.0
            )
            
            logger.info(f"Guacamole response status: {response.status_code}")
            logger.info(f"Guacamole response body: {response.text}")
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code, 
                    detail=f"Guacamole auth failed: {response.text}"
                )
            
            return response.json()
    except httpx.RequestError as e:
        logger.error(f"Failed to connect to Guacamole: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Failed to connect to Guacamole: {str(e)}")

