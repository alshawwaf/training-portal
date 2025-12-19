from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import datetime

from db.database import get_db
from db.models import InfrastructureConnection, User, Template
from .auth import get_current_user
from services.proxmox_service import ProxmoxService
from services.vsphere_service import VSphereService
from services.logging_service import logging_service

router = APIRouter(prefix="/infrastructure-connections", tags=["infrastructure-connections"])

class ConnectionCreate(BaseModel):
    name: str
    provider: str
    host: str
    port: int
    user: str
    password: Optional[str] = None
    token_id: Optional[str] = None
    token_secret: Optional[str] = None
    node: Optional[str] = None
    verify_ssl: bool = False
    is_active: bool = True

class ConnectionUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    password: Optional[str] = None
    token_id: Optional[str] = None
    token_secret: Optional[str] = None
    node: Optional[str] = None
    verify_ssl: Optional[bool] = None
    is_active: Optional[bool] = None

@router.get("/", response_model=List[Dict[str, Any]])
async def get_connections(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    connections = db.query(InfrastructureConnection).all()
    return [c.to_dict() for c in connections]

@router.get("/{connection_id}", response_model=Dict[str, Any])
async def get_connection(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    return connection.to_dict()

@router.post("/", response_model=Dict[str, Any])
async def create_connection(request: ConnectionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        new_connection = InfrastructureConnection(
            name=request.name,
            provider=request.provider,
            host=request.host,
            port=request.port,
            user=request.user,
            password=request.password,
            token_id=request.token_id,
            token_secret=request.token_secret,
            node=request.node,
            verify_ssl=request.verify_ssl,
            is_active=request.is_active
        )
        db.add(new_connection)
        db.commit()
        db.refresh(new_connection)
        
        logging_service.log_action(
            db, 
            action="CREATE_CONNECTION", 
            entity_name=new_connection.name, 
            source="INFRA", 
            level="SUCCESS", 
            details=f"Created {new_connection.provider} connection to {new_connection.host}",
            user_id=current_user.id
        )
        
        return new_connection.to_dict()
    except Exception as e:
        logging_service.log_action(
            db,
            action="CREATE_CONNECTION",
            entity_name=request.name,
            source="INFRA",
            level="ERROR",
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{connection_id}", response_model=Dict[str, Any])
async def update_connection(connection_id: int, request: ConnectionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    update_data = request.dict(exclude_unset=True)
    for key, value in update_data.items():
        if key in ["password", "token_secret"] and value == "********":
            continue
        setattr(connection, key, value)
    
    connection.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(connection)
    
    logging_service.log_action(
        db, 
        action="UPDATE_CONNECTION", 
        entity_name=connection.name, 
        source="INFRA", 
        level="SUCCESS", 
        details=f"Updated connection details",
        user_id=current_user.id
    )
    
    return connection.to_dict()

@router.delete("/{connection_id}")
async def delete_connection(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    # Check if templates use this connection
    templates = db.query(Template).filter(Template.connection_id == connection_id).first()
    if templates:
        raise HTTPException(status_code=400, detail="Cannot delete connection used by templates")
    
    name = connection.name
    db.delete(connection)
    db.commit()
    
    logging_service.log_action(
        db, 
        action="DELETE_CONNECTION", 
        entity_name=name, 
        source="INFRA", 
        level="SUCCESS", 
        details=f"Deleted connection",
        user_id=current_user.id
    )
    
    return {"success": True, "message": "Connection deleted"}

@router.post("/{connection_id}/test")
async def test_connection(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        logging_service.log_action(
            db, 
            action="TEST_CONNECTION", 
            entity_name=connection.name, 
            source="INFRA", 
            level="INFO", 
            details=f"Testing connection to {connection.host}",
            user_id=current_user.id
        )

        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            result = svc.test_connection(
                host=connection.host,
                user=connection.user,
                password=connection.password,
                port=connection.port,
                verify_ssl=connection.verify_ssl
            )
            
            level = "SUCCESS" if result.get("success") else "ERROR"
            logging_service.log_action(
                db, 
                action="TEST_CONNECTION_RESULT", 
                entity_name=connection.name, 
                source="VSPHERE", 
                level=level, 
                details=result.get("message", "Result unknown"),
                user_id=current_user.id
            )
            return result
        elif connection.provider.lower() == "proxmox":
            svc = ProxmoxService()
            result = svc.test_connection(
                host=connection.host,
                user=connection.user,
                password=connection.password,
                token_id=connection.token_id,
                token_secret=connection.token_secret,
                port=connection.port,
                verify_ssl=connection.verify_ssl
            )
            
            level = "SUCCESS" if result.get("success") else "ERROR"
            logging_service.log_action(
                db, 
                action="TEST_CONNECTION_RESULT", 
                entity_name=connection.name, 
                source="PROXMOX", 
                level=level, 
                details=result.get("message", "Result unknown"),
                user_id=current_user.id
            )
            return result
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {connection.provider}")
    except Exception as e:
        logging_service.log_action(
            db, 
            action="TEST_CONNECTION", 
            entity_name=connection.name, 
            source="INFRA", 
            level="ERROR", 
            details=str(e),
            user_id=current_user.id
        )
        return {"success": False, "message": str(e)}

@router.post("/{connection_id}/sync")
async def sync_inventory(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        logging_service.log_action(
            db, 
            action="SYNC_INVENTORY", 
            entity_name=connection.name, 
            source="INFRA", 
            level="INFO", 
            details="Starting inventory sync",
            user_id=current_user.id
        )
        
        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            svc.host = connection.host
            svc.user = connection.user
            svc.password = connection.password
            svc.port = connection.port
            svc.verify_ssl = connection.verify_ssl
            
            result = svc.sync_inventory(connection_id=connection_id)
            
            logging_service.log_action(
                db, 
                action="SYNC_INVENTORY_RESULT", 
                entity_name=connection.name, 
                source="VSPHERE", 
                level="SUCCESS" if result.get("success") else "ERROR", 
                details=f"Found {result.get('vm_count', 0)} VMs",
                user_id=current_user.id
            )
            
            return result
        elif connection.provider.lower() == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.sync_inventory(connection_id=connection_id)
            
            logging_service.log_action(
                db, 
                action="SYNC_INVENTORY_RESULT", 
                entity_name=connection.name, 
                source="PROXMOX", 
                level="SUCCESS" if result.get("success") else "ERROR", 
                details=f"Found {result.get('vm_count', 0)} VMs",
                user_id=current_user.id
            )
            return result
        else:
             return {"success": False, "message": f"Inventory sync not supported for {connection.provider}"}
    except Exception as e:
        logging_service.log_action(
            db, 
            action="SYNC_INVENTORY", 
            entity_name=connection.name, 
            source="INFRA", 
            level="ERROR", 
            details=str(e),
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{connection_id}/inventory")
async def get_inventory(connection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    connection = db.query(InfrastructureConnection).filter(InfrastructureConnection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        if connection.provider.lower() == "vsphere":
            svc = VSphereService()
            result = svc.get_cached_inventory(connection_id=connection_id)
            return result
        elif connection.provider.lower() == "proxmox":
            from services.proxmox_service import proxmox_service
            result = proxmox_service.get_cached_inventory(connection_id=connection_id)
            return result
        else:
             return {"success": False, "message": f"Inventory not supported for {connection.provider}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
