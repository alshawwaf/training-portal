"""
Guacamole Router - Handles console access token generation and auth proxy
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import EnvironmentVM, ClassEnvironment
from services.guacamole_service import guacamole_service
import os

router = APIRouter(prefix="/console", tags=["console"])

GUACAMOLE_INTERNAL_URL = os.getenv("GUACAMOLE_URL", "http://guacamole:8080/guacamole")
GUACAMOLE_EXTERNAL_URL = os.getenv("GUACAMOLE_EXTERNAL_URL", "http://localhost:8085/guacamole")


@router.get("/ticket/{class_id}/{env_id}/{vm_id}")
def get_fresh_ticket(
    class_id: int,
    env_id: int, 
    vm_id: int,
    db: Session = Depends(get_db)
):
    """
    Generate a FRESH vSphere ticket on-demand (called by JavaScript right before connecting).
    Returns the WebSocket URL with a fresh ticket that's valid for immediate use.
    """
    import logging
    from services.vsphere_service import vsphere_service
    
    guac_log = logging.getLogger("guacamole")
    
    guac_log.info(f"=== FRESH TICKET REQUEST ===")
    guac_log.info(f"Class ID: {class_id}, Env ID: {env_id}, VM ID: {vm_id}")
    
    # Verify VM exists and belongs to the class/env
    env_vm = db.query(EnvironmentVM).filter(EnvironmentVM.id == vm_id).first()
    if not env_vm or not env_vm.vm_moid:
        guac_log.error(f"VM not found or missing MOID: vm_id={vm_id}")
        raise HTTPException(status_code=404, detail="VM not found")
    
    guac_log.info(f"Found VM: {env_vm.vm_name} (MOID: {env_vm.vm_moid})")
        
    class_env = db.query(ClassEnvironment).filter(ClassEnvironment.id == env_id).first()
    if not class_env or class_env.class_id != class_id:
        guac_log.error(f"Environment not found or class mismatch: env_id={env_id}, expected class_id={class_id}")
        raise HTTPException(status_code=404, detail="Environment not found")
        
    if env_vm.env_id != env_id:
        guac_log.error(f"VM does not belong to environment: vm.env_id={env_vm.env_id}, expected={env_id}")
        raise HTTPException(status_code=400, detail="VM does not belong to this environment")
    
    # Generate FRESH ticket
    guac_log.info(f"Calling vsphere_service.generate_html5_console_ticket('{env_vm.vm_moid}')...")
    ticket_result = vsphere_service.generate_html5_console_ticket(env_vm.vm_moid)
    
    guac_log.info(f"Ticket result: success={ticket_result.get('success')}, message={ticket_result.get('message', 'N/A')}")
    
    if not ticket_result.get("success"):
        error_msg = ticket_result.get('message', 'Unknown error')
        guac_log.error(f"Ticket generation failed: {error_msg}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate ticket: {error_msg}"
        )
    
    # Return the WebSocket URL with fresh ticket
    ws_url = ticket_result.get("ws_url")
    if not ws_url:
        host = ticket_result.get("host")
        port = ticket_result.get("port", 443)
        ticket = ticket_result.get("ticket", "")
        from urllib.parse import quote
        ws_url = f"wss://{host}:{port}/ticket/{quote(ticket, safe='')}"
    
    guac_log.info(f"Returning fresh ticket. WS URL length: {len(ws_url)}")
    
    return {"ws_url": ws_url}


@router.get("/{class_id}/{env_id}/{vm_id}")
def get_console_page(
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

    # 2. Determine protocol and port
    # Priority: 1) Query param override → 2) Stored in EnvironmentVM → 3) Guest OS fallback
    
    # Start with stored values from EnvironmentVM (copied from TemplateVM during provisioning)
    stored_protocol = env_vm.access_protocol
    stored_port = env_vm.access_port
    guest_os = (env_vm.guest_os or "").lower()
    
    # Default to VNC for console access (works without IP)
    default_protocol = "vnc"
    port = 5900
    
    # If we have a stored protocol, use that
    if stored_protocol:
        default_protocol = stored_protocol.lower()
        port = stored_port or {"rdp": 3389, "ssh": 22, "vnc": 5900}.get(default_protocol, 5900)

    # 3. Use override protocol if provided, otherwise use determined default
    # Fix: If protocol is invalid/typo (e.g. 'vn'), fallback to default instead of failing
    final_protocol = protocol.lower() if protocol else default_protocol
    target_protocols = ["rdp", "ssh", "vnc"]
    
    # Fuzzy matching or fallback for typos
    if final_protocol not in target_protocols:
        # Check for common typos
        if final_protocol == "vn": final_protocol = "vnc"
        else: final_protocol = default_protocol
    
    # Update port if protocol was overridden
    if protocol and protocol.lower() != default_protocol:
        port = {"rdp": 3389, "ssh": 22, "vnc": 5900}.get(final_protocol, 5900)

    # 4. Handle VNC console for vSphere VMs (no IP required)
    # vSphere VMs require WebMKS - Guacamole VNC cannot connect to vSphere's WebSocket protocol
    hostname = env_vm.ip_address
    
    # LOGIC FIX: If it's a vSphere VM, we almost ALWAYS want WebMKS for "Console" access
    # unless the user explicitly requested SSH/RDP and we have a USABLE IP.
    # IPv6 link-local addresses (fe80::) are NOT usable for RDP/SSH connections.
    # If no usable IP is present, we MUST fallback to VNC/WebMKS.
    
    is_vsphere = bool(env_vm.vm_moid)
    
    # Check if IP is usable for network connections (not IPv6 link-local)
    has_usable_ip = hostname and not hostname.startswith("fe80:") and not hostname.startswith("::1")
    
    # Force WebMKS for vSphere VMs when:
    # 1. VNC is explicitly requested, OR
    # 2. No usable IP address is available for RDP/SSH
    force_webmks = is_vsphere and (final_protocol == "vnc" or not has_usable_ip)
    
    if force_webmks:
        # vSphere VM - Use WebMKS via WebSocket proxy (NOT Guacamole)
        from services.vsphere_service import vsphere_service
        import logging
        import base64
        import json
        guac_log = logging.getLogger("guacamole")
        
        # For vSphere VMs, use WebSocket proxy to bypass CORS/SSL issues
        # Pass VM context to the proxy (it will generate the ticket on-demand)
        guac_log.info(f"WebMKS console page for vSphere VM {env_vm.vm_name} (MOID: {env_vm.vm_moid})")
        
        guac_log.info(f"=== WEBMKS CONSOLE PAGE REQUEST ===")
        guac_log.info(f"VM: {env_vm.vm_name}, MOID: {env_vm.vm_moid}, Class: {class_id}, Env: {env_id}")
        
        ws_config = {
            "vm_moid": env_vm.vm_moid,
            "class_id": class_id,
            "env_id": env_id,
            "vm_id": vm_id
        }
        
        ws_token = base64.urlsafe_b64encode(json.dumps(ws_config).encode()).decode()
        
        # Use the WebSocket proxy URL
        ws_base = os.getenv("BACKEND_WS_URL", "ws://localhost:8000")
        ws_url = f"{ws_base}/ws/console/{ws_token}"
        
        # Return noVNC console page using the integrated noVNC library
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{env_vm.vm_name} - Console</title>
    <style>
        html, body {{
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #000;
        }}
        body {{
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }}

        #console-container {{
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
            position: relative;
            overflow: hidden;
        }}

        #console-container:fullscreen {{
            width: 100vw;
            height: 100vh;
            background: #000;
        }}
        
        #vnc-canvas-container {{
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }}

        /* Minimal floating control bar - appears on hover */
        .control-bar {{
            position: absolute;
            bottom: 16px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: rgba(15, 23, 42, 0.9);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            opacity: 0;
            transition: opacity 0.3s;
            z-index: 100;
        }}
        
        #console-container:hover .control-bar {{
            opacity: 1;
        }}

        .control-bar button {{
            padding: 6px 12px;
            background: rgba(255, 255, 255, 0.1);
            color: #e2e8f0;
            border: none;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }}
        .control-bar button:hover {{
            background: rgba(255, 255, 255, 0.2);
        }}

        .status-dot {{
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #fbbf24;
        }}
        .status-dot.connected {{ background: #22c55e; }}
        .status-dot.error {{ background: #ef4444; }}

        .loader {{
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #e2e8f0;
            z-index: 10;
            transition: opacity 0.5s;
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
        @keyframes spin {{ to {{ transform: rotate(360deg); }} }}

        .error-box {{
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 12px;
            padding: 30px;
            max-width: 500px;
            text-align: center;
        }}
        .error-box h2 {{ color: #f87171; margin-bottom: 12px; }}
        .error-box p {{ color: #94a3b8; line-height: 1.6; margin-bottom: 20px; }}
        .btn {{
            padding: 8px 16px;
            background: #3b82f6;
            color: white;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            border: none;
            cursor: pointer;
            margin: 0 4px;
        }}
        .btn:hover {{ background: #2563eb; }}
        .btn-secondary {{ background: #475569; }}
    </style>
</head>
<body>
    <div id="console-container">
        <div class="loader" id="loader">
            <div class="spinner"></div>
            <h2>Connecting to {env_vm.vm_name}</h2>
            <p>Establishing secure console session...</p>
        </div>
        <div id="vnc-canvas-container"></div>
        
        <!-- Minimal floating control bar -->
        <div class="control-bar">
            <span class="status-dot" id="status-dot"></span>
            <button id="cad-button">Ctrl+Alt+Del</button>
            <button id="fullscreen-button">Fullscreen</button>
        </div>
    </div>


    <script type="module">
        import RFB from '/noVNC-master/core/rfb.js';

        const WS_URL = "{ws_url}";
        const loader = document.getElementById('loader');
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');


        function updateStatus(status, text) {{
            statusDot.className = 'status-dot ' + status;
            if (statusText) statusText.textContent = text;
        }}

        function showError(message) {{
            loader.style.opacity = '1';
            loader.style.display = 'block';
            loader.innerHTML = `
                <div class="error-box">
                    <h2>⚠️ Connection Failed</h2>
                    <p>${{message}}</p>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button class="btn" onclick="location.reload()">Retry</button>
                        <button class="btn btn-secondary" onclick="window.close()">Close</button>
                    </div>
                </div>
            `;
            updateStatus('error', 'Disconnected');
        }}

        function connect() {{
            const canvasContainer = document.getElementById('vnc-canvas-container');
            
            // Wait for display to be ready and have height
            if (canvasContainer.clientHeight < 10) {{
                console.log("Container not ready, waiting...");
                setTimeout(connect, 200);
                return;
            }}

            try {{
                // Use our internal proxy via WebSocket
                
                window.rfb = new RFB(canvasContainer, WS_URL, {{
                    wsProtocols: ['binary']
                }});

                window.rfb.scaleViewport = true;
                window.rfb.resizeSession = true;

                window.rfb.addEventListener("connect", () => {{
                    console.log("noVNC Connected");
                    // Hide loader immediately
                    loader.style.opacity = '0';
                    loader.style.display = 'none';
                    updateStatus('connected', 'Connected');
                    
                    // CRITICAL: Force a resize event after a short delay to ensure 
                    // noVNC correctly calculates the container dimensions.
                    // This fixes the 'black screen until fullscreen' issue.
                    setTimeout(() => {{
                        window.dispatchEvent(new Event('resize'));
                        console.log("Forced resize event triggered");
                    }}, 1000);
                }});

                window.rfb.addEventListener("disconnect", (e) => {{
                    console.log("noVNC Disconnected", e);
                    if (e.detail.clean) {{
                        updateStatus('error', 'Disconnected');
                    }} else {{
                        showError("The connection was closed unexpectedly.");
                    }}
                }});

                window.rfb.addEventListener("credentialsrequired", (e) => {{
                    // Usually not needed for vSphere as ticket is in URL
                    const password = prompt("Password required:");
                    window.rfb.sendCredentials({{ password: password }});
                }});

                window.rfb.addEventListener("desktopname", (e) => {{
                    console.log("Desktop name:", e.detail.name);
                }});

            }} catch (err) {{
                console.error("noVNC Setup Error:", err);
                showError("Failed to initialize console: " + err.message);
            }}
        }}

        document.getElementById('cad-button').onclick = () => {{
            if (window.rfb) window.rfb.sendCtrlAltDel();
        }};

        document.getElementById('fullscreen-button').onclick = () => {{
            const container = document.getElementById('console-container');
            const requestFullscreen = container.requestFullscreen || 
                                    container.mozRequestFullScreen || 
                                    container.webkitRequestFullscreen || 
                                    container.msRequestFullscreen;
            const exitFullscreen = document.exitFullscreen || 
                                 document.mozCancelFullScreen || 
                                 document.webkitExitFullscreen || 
                                 document.msExitFullscreen;

            if (!document.fullscreenElement && !document.mozFullScreenElement && 
                !document.webkitFullscreenElement && !document.msFullscreenElement) {{
                if (requestFullscreen) {{
                    requestFullscreen.call(container).catch(err => {{
                        console.error(`Error attempting to enable full-screen mode: ${{err.message}}`);
                    }});
                }}
            }} else {{
                if (exitFullscreen) {{
                    exitFullscreen.call(document);
                }}
            }}
        }};

        // Handle fullscreen change to force a resize
        const onFullscreenChange = () => {{
            console.log("Fullscreen changed, forcing resize...");
            setTimeout(() => {{
                window.dispatchEvent(new Event('resize'));
                if (window.rfb) {{
                    // Some versions of noVNC need an explicit scale update
                    window.rfb.scaleViewport = true;
                }}
            }}, 500);
        }};

        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        document.addEventListener('mozfullscreenchange', onFullscreenChange);
        document.addEventListener('MSFullscreenChange', onFullscreenChange);

        // Start connection
        connect();
    </script>
</body>
</html>
"""

        return HTMLResponse(content=html_content, headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        })

    else:
        vnc_password = None
    
    # SSH/RDP require IP address
    if final_protocol in ["ssh", "rdp"] and not env_vm.ip_address:
        raise HTTPException(
            status_code=400, 
            detail=f"{final_protocol.upper()} requires the VM to have an IP address. Use VNC console instead."
        )
    
    # Ensure we have a hostname for connection
    if not hostname:
        raise HTTPException(status_code=400, detail="No connection target available for this VM")


    # 5. Generate encrypted token
    result = guacamole_service.get_console_url_for_vm(
        vm_id=env_vm.id,
        vm_name=env_vm.vm_name,
        ip_address=hostname,  # This is now either VM IP or ESXi host
        protocol=final_protocol,
        port=port,
        password=vnc_password,  # Pass the vSphere ticket as VNC password
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

