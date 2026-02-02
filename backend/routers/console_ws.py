"""
WebSocket Proxy for VM Console (vSphere WebMKS and Proxmox noVNC)
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import websockets
import json
import base64
import asyncio
import ssl
import logging
import traceback

router = APIRouter(prefix="/ws", tags=["websocket"])
logger = logging.getLogger("training_portal.console_ws")

@router.get("/test")
def test_ws_router():
    return {"status": "ok", "message": "WS Router is mounted"}

@router.websocket("/console/{token}")
async def console_websocket_endpoint(websocket: WebSocket, token: str):
    # Check for binary subprotocol - required for VNC/WMKS
    req_subprotocols = websocket.headers.get("sec-websocket-protocol", "")
    subprotocol = None
    if "binary" in req_subprotocols:
        subprotocol = "binary"
    
    await websocket.accept(subprotocol=subprotocol)
    logger.info(f"Client WebSocket accepted with subprotocol: {subprotocol}")
    
    remote_ws = None
    
    try:
        # 1. Decode token to get VM context
        logger.info(f"=== CONSOLE SESSION START ===")
        logger.info(f"Received token (length: {len(token)}): {token[:50]}...")
        try:
            decoded_bytes = base64.urlsafe_b64decode(token)
            decoded_str = decoded_bytes.decode('utf-8')
            config = json.loads(decoded_str)
            
            # Detect provider from token (default to vSphere for backwards compatibility)
            provider = config.get("provider", "vsphere").lower()
            
            logger.info(f"Token decoded successfully. Provider: {provider}")
            logger.debug(f"Full token config: {config}")
        except Exception as e:
            logger.error(f"Token decode failed: {e}")
            logger.error(traceback.format_exc())
            await websocket.close(code=1008)
            return

        # 2. Handle Proxmox VNC
        if provider == "proxmox":
            vmid = config.get("vmid")
            connection_id = config.get("connection_id")
            
            if not vmid:
                logger.error("Invalid Proxmox token: missing vmid")
                await websocket.close(code=1008)
                return
            
            logger.info(f"Proxmox console for VMID: {vmid}, Connection: {connection_id}")
            
            # Generate VNC ticket through Proxmox API
            from services.proxmox_service import proxmox_service
            ticket_result = proxmox_service.generate_console_ticket(int(vmid), connection_id=connection_id)
            
            if not ticket_result.get("success"):
                error_msg = ticket_result.get('message', 'Failed to generate ticket')
                logger.error(f"Proxmox ticket error: {error_msg}")
                await websocket.close(code=1011)
                return
            
            # Build Proxmox VNC WebSocket URL
            pve_host = ticket_result.get("host", "localhost")
            pve_port = ticket_result.get("pve_port", 8006)
            vnc_port = ticket_result.get("port", 5900)
            ticket = ticket_result.get("ticket", "")
            
            # Proxmox noVNC WebSocket URL format: wss://host:port/api2/json/nodes/NODE/qemu/VMID/vncwebsocket?port=PORT&vncticket=TICKET
            # However, the vncproxy endpoint returns a direct VNC port, so we connect directly
            ws_url = f"wss://{pve_host}:{pve_port}/api2/json/nodes/pve/qemu/{vmid}/vncwebsocket?port={vnc_port}&vncticket={ticket}"
            
            logger.info(f"Proxying to Proxmox VNC: {pve_host}:{vnc_port}")
            
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            try:
                remote_ws = await websockets.connect(
                    ws_url,
                    ssl=ssl_context,
                    subprotocols=["binary"],
                    ping_interval=None,
                    close_timeout=5
                )
                logger.info(f"Proxmox VNC WebSocket connected")
            except Exception as e:
                logger.error(f"Proxmox VNC connection failed: {type(e).__name__}: {e}")
                logger.error(traceback.format_exc())
                await websocket.close(code=1011)
                return
        
        # 3. Handle vSphere WebMKS (default)
        else:
            vm_moid = config.get("vm_moid")
            
            if not vm_moid:
                logger.error("Invalid vSphere token: missing vm_moid")
                await websocket.close(code=1008)
                return
            
            logger.info(f"vSphere console for MOID: {vm_moid}")
            
            # Find vSphere connection
            from db.database import SessionLocal
            from db.models import InfrastructureConnection
            
            db = SessionLocal()
            try:
                vsphere_conn = db.query(InfrastructureConnection).filter(
                    InfrastructureConnection.provider.ilike("%vsphere%"),
                    InfrastructureConnection.is_active == True
                ).first()
                
                if not vsphere_conn:
                    vsphere_conn = db.query(InfrastructureConnection).filter(
                        InfrastructureConnection.provider.ilike("%vsphere%")
                    ).first()
                
                connection_id = vsphere_conn.id if vsphere_conn else None
                logger.info(f"Using vSphere connection ID: {connection_id}")
            finally:
                db.close()
            
            from services.vsphere_service import vsphere_service
            ticket_result = vsphere_service.generate_html5_console_ticket(vm_moid, connection_id=connection_id)
            
            if not ticket_result.get("success"):
                error_msg = ticket_result.get('message', 'Failed to generate ticket')
                logger.error(f"vSphere ticket error: {error_msg}")
                await websocket.close(code=1011)
                return
            
            host = ticket_result.get("host")
            port = ticket_result.get("port", 443)
            ws_url = ticket_result.get("ws_url")
            
            if not ws_url:
                ticket = ticket_result.get("ticket", "")
                from urllib.parse import quote
                ws_url = f"wss://{host}:{port}/ticket/{quote(ticket, safe='')}"
            
            logger.info(f"Proxying to vSphere WebSocket: {ws_url[:80]}...")
            
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            try:
                remote_ws = await websockets.connect(
                    ws_url, 
                    ssl=ssl_context,
                    subprotocols=["binary", "base64"],
                    additional_headers={"Origin": f"https://{host}:{port}"},
                    ping_interval=None,
                    close_timeout=5
                )
                logger.info(f"vSphere WebSocket connected. Protocol: {remote_ws.subprotocol}")
            except Exception as e:
                logger.error(f"vSphere WebSocket connection failed: {type(e).__name__}: {e}")
                logger.error(traceback.format_exc())
                await websocket.close(code=1011)
                return
        
        # 4. Bidirectional Relay
        logger.info(f"Starting bidirectional relay for {provider}...")
        
        async def relay_client_to_remote():
            try:
                msg_count = 0
                while True:
                    data = await websocket.receive()
                    if "bytes" in data:
                        message = data["bytes"]
                    elif "text" in data:
                        message = data["text"]
                        if isinstance(message, str):
                            message = message.encode()
                    else:
                        logger.info(f"Relay client->remote: Received non-data frame: {data.get('type', 'unknown')}")
                        break
                    
                    if msg_count == 0:
                        logger.info(f"First message FROM client: {message[:20]!r} (len={len(message)})")
                    msg_count += 1
                    
                    await remote_ws.send(message)
                logger.info(f"Relay client->remote finished after {msg_count} messages")
            except WebSocketDisconnect:
                logger.info("Relay client->remote: Client disconnected")
            except Exception as e:
                logger.error(f"Relay client->remote error: {type(e).__name__}: {e}")

        async def relay_remote_to_client():
            try:
                msg_count = 0
                async for message in remote_ws:
                    if msg_count == 0:
                        content_debug = message[:20] if isinstance(message, bytes) else message[:20].encode()
                        logger.info(f"First message FROM remote: {content_debug!r} (len={len(message)})")
                    msg_count += 1
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        await websocket.send_text(message)
                
                logger.info(f"Relay remote->client finished after {msg_count} messages")
            except Exception as e:
                logger.error(f"Relay remote->client error: {type(e).__name__}: {e}")

        # Run both until one terminates
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(relay_client_to_remote()),
                asyncio.create_task(relay_remote_to_client())
            ],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        for task in done:
            try:
                task.result()
            except Exception as e:
                logger.error(f"Relay task failed: {e}")
                
        for task in pending:
            task.cancel()
            
    except WebSocketDisconnect:
        logger.info("WebSocket tunnel disconnected by user")
    except Exception as e:
        logger.error(f"Proxy crash: {type(e).__name__}: {e}")
        logger.error(traceback.format_exc())
    finally:
        if remote_ws:
            await remote_ws.close()
        logger.info("=== CONSOLE SESSION END ===")


