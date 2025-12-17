"""
WebSocket Proxy for vSphere Console (WebMKS)
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
logger = logging.getLogger("se_portal.console_ws")

@router.get("/test")
def test_ws_router():
    return {"status": "ok", "message": "WS Router is mounted"}

@router.websocket("/console/{token}")
async def console_websocket_endpoint(websocket: WebSocket, token: str):
    # Check for binary subprotocol - WMKS requires it
    req_subprotocols = websocket.headers.get("sec-websocket-protocol", "")
    subprotocol = None
    if "binary" in req_subprotocols:
        subprotocol = "binary"
    
    await websocket.accept(subprotocol=subprotocol)
    logger.info(f"Client WebSocket accepted with subprotocol: {subprotocol}")
    
    vsphere_ws = None
    
    try:
        # 1. Decode token to get VM context
        try:
            decoded_bytes = base64.urlsafe_b64decode(token)
            decoded_str = decoded_bytes.decode('utf-8')
            config = json.loads(decoded_str)
            vm_moid = config.get("vm_moid")
            
            if not vm_moid:
                logger.error("Invalid token: missing vm_moid")
                await websocket.close(code=1008)
                return
            
            logger.info(f"Connecting to console for VM: {vm_moid}")
        except Exception as e:
            logger.error(f"Token decode failed: {e}")
            await websocket.close(code=1008)
            return

        # 2. Generate FRESH vSphere ticket
        from services.vsphere_service import vsphere_service
        ticket_result = vsphere_service.generate_html5_console_ticket(vm_moid)
        
        if not ticket_result.get("success"):
            error_msg = ticket_result.get('message', 'Failed to generate ticket')
            logger.error(f"vSphere ticket error: {error_msg}")
            await websocket.close(code=1011)
            return
        
        # 3. Connect to vSphere
        host = ticket_result.get("host")
        port = ticket_result.get("port", 443)
        ws_url = ticket_result.get("ws_url")
        
        if not ws_url:
            ticket = ticket_result.get("ticket", "")
            from urllib.parse import quote
            ws_url = f"wss://{host}:{port}/ticket/{quote(ticket, safe='')}"
        
        logger.info(f"Proxying to vSphere: {ws_url}")

        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        try:
            # We must offer BOTH binary and base64 to vSphere
            vsphere_ws = await websockets.connect(
                ws_url, 
                ssl=ssl_context,
                subprotocols=["binary", "base64"],
                additional_headers={"Origin": f"https://{host}:{port}"},
                ping_interval=None,
                close_timeout=5
            )
            logger.info(f"vSphere connected. Protocol: {vsphere_ws.subprotocol}")
        except Exception as e:
            logger.error(f"vSphere connection failed: {e}")
            await websocket.close(code=1011)
            return
        
        # 4. Data Pipe Logic
        async def relay_client_to_vsphere():
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
                        logger.info(f"Relay client->vsphere: Received non-data frame: {data.get('type', 'unknown')}")
                        break
                    
                    if msg_count == 0:
                        logger.info(f"First message FROM client: {message[:20]!r} (len={len(message)})")
                    msg_count += 1
                    
                    await vsphere_ws.send(message)
                logger.info(f"Relay client->vsphere finished normally after {msg_count} messages")
            except WebSocketDisconnect:
                logger.info("Relay client->vsphere: Client disconnected (WebSocketDisconnect)")
            except Exception as e:
                logger.error(f"Relay client->vsphere error: {type(e).__name__}: {e}")

        async def relay_vsphere_to_client():
            try:
                msg_count = 0
                async for message in vsphere_ws:
                    if msg_count == 0:
                        content_debug = message[:20] if isinstance(message, bytes) else message[:20].encode()
                        logger.info(f"First message FROM vSphere: {content_debug!r} (len={len(message)})")
                    msg_count += 1
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        await websocket.send_text(message)
                
                # Check why the iterator finished
                close_reason = "unknown"
                if hasattr(vsphere_ws, 'close_reason'):
                    close_reason = vsphere_ws.close_reason
                logger.info(f"Relay vsphere->client finished. vSphere closed the connection. Count: {msg_count}, Reason: {close_reason}")
            except Exception as e:
                logger.error(f"Relay vsphere->client error: {type(e).__name__}: {e}")

        # Run both until one terminates
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(relay_client_to_vsphere()),
                asyncio.create_task(relay_vsphere_to_client())
            ],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Check if any task raised an exception
        for task in done:
            try:
                task.result()
            except Exception as e:
                logger.error(f"Relay task failed with exception: {e}")
                
        # Cancel pending
        for task in pending:
            task.cancel()
            
    except WebSocketDisconnect:
        logger.info("WebSocket tunnel disconnected by user")
    except Exception as e:
        logger.error(f"Proxy crash: {type(e).__name__}: {e}")
        logger.error(traceback.format_exc())
    finally:
        if vsphere_ws:
            await vsphere_ws.close()
        logger.info("Console proxy session closed")

