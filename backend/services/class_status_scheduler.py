"""
Class Status Scheduler Service
Automatically updates class statuses based on start/end dates.
"""
import logging
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from db.database import SessionLocal
from db.models import Class

logger = logging.getLogger("training_portal")

class ClassStatusScheduler:
    """Background scheduler that automatically updates class statuses based on dates."""
    
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self._running = False
    
    def start(self):
        """Start the scheduler with a periodic job."""
        if self._running:
            logger.info("Class status scheduler already running")
            return
            
        # Run every 5 minutes
        self.scheduler.add_job(
            self.update_class_statuses,
            trigger=IntervalTrigger(minutes=5),
            id='class_status_updater',
            name='Update class statuses based on dates',
            replace_existing=True
        )
        
        # Also run immediately on startup
        self.scheduler.add_job(
            self.update_class_statuses,
            id='class_status_initial',
            name='Initial class status update',
            replace_existing=True
        )
        
        self.scheduler.start()
        self._running = True
        logger.info("Class status scheduler started - will update every 5 minutes")
    
    def stop(self):
        """Stop the scheduler."""
        if self._running:
            self.scheduler.shutdown(wait=False)
            self._running = False
            logger.info("Class status scheduler stopped")
    
    def update_class_statuses(self):
        """
        Update class statuses based on current time vs start/end dates.
        
        Status Logic:
        - draft: Stays draft until provisioned (manual)
        - upcoming: Class is provisioned but start_date is in the future
        - active: Current time is between start_date and end_date
        - completed: end_date has passed
        - cancelled/postponed: Manual only, never auto-changed
        """
        db: Session = SessionLocal()
        try:
            now = datetime.utcnow()
            updated_count = 0
            
            # Get all classes that aren't cancelled or postponed (those are manual-only)
            classes = db.query(Class).filter(
                Class.status.notin_(['cancelled', 'postponed'])
            ).all()
            
            for cls in classes:
                original_status = cls.status
                new_status = self._calculate_status(cls, now)
                
                if new_status and new_status != original_status:
                    cls.status = new_status
                    updated_count += 1
                    logger.info(f"Class '{cls.name}' (ID: {cls.id}) status changed: {original_status} -> {new_status}")
            
            if updated_count > 0:
                db.commit()
                logger.info(f"Updated {updated_count} class statuses")
            else:
                logger.debug("No class status updates needed")
                
        except Exception as e:
            logger.error(f"Error updating class statuses: {e}")
            db.rollback()
        finally:
            db.close()
    
    def _calculate_status(self, cls: Class, now: datetime) -> str | None:
        """
        Calculate what the status should be based on dates.
        Returns None if status should not change.
        """
        # Draft classes stay draft until manually changed or provisioned
        if cls.status == 'draft':
            return None
        
        # If no dates set, can't auto-update
        if not cls.start_date or not cls.end_date:
            return None
        
        # Completed classes stay completed (don't revert)
        if cls.status == 'completed':
            return None
        
        # Check if class has passed end date
        if now > cls.end_date:
            return 'completed'
        
        # Check if class is currently active (between start and end)
        if cls.start_date <= now <= cls.end_date:
            return 'active'
        
        # Check if class is upcoming (before start date)
        if now < cls.start_date:
            return 'upcoming'
        
        return None
    
    def force_update(self):
        """Manually trigger a status update (can be called via API)."""
        logger.info("Force updating all class statuses...")
        self.update_class_statuses()


# Global singleton instance
class_status_scheduler = ClassStatusScheduler()
