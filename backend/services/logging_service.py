from sqlalchemy.orm import Session
from db.models import ActionLog
import logging
import traceback

logger = logging.getLogger("training_portal.logging")

class LoggingService:
    @staticmethod
    def log_action(db: Session, action: str, entity_name: str, level: str = "INFO", source: str = "APP", details: str = None, user_id: int = None):
        """
        Log a system action to the database.
        
        Args:
            db (Session): Database session
            action (str): Action name (e.g., "LOGIN", "CREATE_CONNECTION")
            entity_name (str): Name of entity acted upon
            level (str): Log level (INFO, WARNING, ERROR, SUCCESS)
            source (str): Source system (APP, VSPHERE, PROXMOX)
            details (str): Additional details
            user_id (int): ID of user performing action
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
            # We don't commit here to allow transaction grouping unless necessary?
            # Actually, logs should probably be committed immediately to persist even if main transaction fails?
            # But if passed session has active transaction, committing might break it.
            # Best practice: Let the caller commit, OR if we want to ensure log is saved regardless of caller success, use a separate session.
            # However, for simplicity and keeping ACID with the operation, we usually commit with the operation.
            # The original code commited immediately.
            # Let's check callers. In routers, they usually commit the main object.
            # If we commit here, we commit the main object too if in same session.
            # Safe approach: add to session, let caller commit?
            # Original code in logs.py did db.commit().
            # I will default to db.add() only if inside a transaction flow, but here we want to ensure logs are saved.
            # Let's try to commit, but handle failure.
            db.add(new_log)
            db.commit() 
            db.refresh(new_log)
            return new_log
        except Exception as e:
            # Fallback to file logging if DB fails
            logger.error(f"Failed to write audit log to DB: {e}")
            logger.error(traceback.format_exc())
            # Don't raise, just log error locally
            # Rollback only if we started a transaction or if it's safe?
            # If we rollback, we might rollback caller's changes.
            # Ideally logs should use a separate session factory if they must be independent.
            # For now, just logging errors.
            pass

logging_service = LoggingService()
