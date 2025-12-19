from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from db.database import get_db
from db.models import ActionLog, User
from .auth import get_current_user
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import os

router = APIRouter(prefix="/logs", tags=["logs"])

# Pydantic Schemas
class ActionLogRead(BaseModel):
    id: int
    action: str
    entity_name: str
    level: str
    source: str
    details: Optional[str]
    user_id: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True

# Helper Function
def log_action(db: Session, action: str, entity_name: str, level: str = "INFO", source: str = "APP", details: str = None, user_id: int = None):
    """
    Log a system action.
    """
    try:
        new_log = ActionLog(
            action=action,
            entity_name=entity_name,
            level=level,
            source=source,
            details=details,
            user_id=user_id
        )
        db.add(new_log)
        db.commit()
    except Exception as e:
        print(f"Failed to write log: {e}") 

@router.get("/", response_model=List[ActionLogRead])
def get_logs(
    skip: int = 0, 
    limit: int = 50, 
    action: Optional[str] = None,
    level: Optional[str] = None,
    source: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch paginated system logs with filters"""
    query = db.query(ActionLog).order_by(desc(ActionLog.created_at))
    
    if action:
        query = query.filter(ActionLog.action == action)
    if level:
        query = query.filter(ActionLog.level == level)
    if source:
        query = query.filter(ActionLog.source == source)
        
    return query.offset(skip).limit(limit).all()

@router.get("/export")
def export_logs(
    format: str = Query("csv", enum=["csv", "json"]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export logs as CSV or JSON"""
    logs = db.query(ActionLog).order_by(desc(ActionLog.created_at)).all()
    
    if format == "json":
        return [ActionLogRead.from_orm(l) for l in logs]
    
    import csv
    import io
    from fastapi.responses import StreamingResponse

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Action", "Entity", "Level", "Source", "User ID", "Created At", "Details"])
    
    for l in logs:
        writer.writerow([l.id, l.action, l.entity_name, l.level, l.source, l.user_id, l.created_at, l.details])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=system_logs.csv"}
    )

@router.get("/stats")
def get_log_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get log statistics for overview cards"""
    from sqlalchemy import func
    
    stats = {
        "total": db.query(ActionLog).count(),
        "errors": db.query(ActionLog).filter(ActionLog.level == "ERROR").count(),
        "warnings": db.query(ActionLog).filter(ActionLog.level == "WARNING").count(),
        "by_source": dict(db.query(ActionLog.source, func.count(ActionLog.id)).group_by(ActionLog.source).all())
    }
    return stats

@router.get("/app-log")
def get_application_logs(lines: int = Query(500, le=2000), current_user: User = Depends(get_current_user)):
    """Read the last N lines from the application log file"""
    log_file = "logs/app.log"
    if not os.path.exists(log_file):
        return {"content": "Log file not found"}
        
    try:
        with open(log_file, "r") as f:
            content = f.readlines()
            # Get last N lines
            last_lines = content[-lines:] if len(content) > lines else content
            return {"content": "".join(last_lines)}
    except Exception as e:
        return {"error": str(e)}

@router.delete("/{log_id}")
def delete_single_log(log_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a single log entry by ID"""
    log = db.query(ActionLog).filter(ActionLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    db.delete(log)
    db.commit()
    return {"message": f"Log {log_id} deleted"}

@router.delete("/bulk/delete")
def delete_bulk_logs(
    log_ids: List[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete multiple logs by IDs"""
    deleted = db.query(ActionLog).filter(ActionLog.id.in_(log_ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Deleted {deleted} logs"}

@router.delete("/range/delete")
def delete_logs_by_date_range(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete logs within a date range. If no dates provided, deletes all logs."""
    query = db.query(ActionLog)
    
    if start_date:
        query = query.filter(ActionLog.created_at >= start_date)
    if end_date:
        query = query.filter(ActionLog.created_at <= end_date)
    
    deleted = query.delete(synchronize_session=False)
    db.commit()
    return {"message": f"Deleted {deleted} logs"}

@router.delete("/clear/all")
def clear_all_logs(confirm: bool = Query(False), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Clear ALL logs. Requires confirm=true query parameter for safety."""
    if not confirm:
        raise HTTPException(status_code=400, detail="Add ?confirm=true to confirm deletion of all logs")
    
    deleted = db.query(ActionLog).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Cleared all {deleted} logs"}
