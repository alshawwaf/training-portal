"""
VLAN Pool Service
Manages VLAN ID allocation for student environment isolation.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, Tuple
import logging

logger = logging.getLogger("vlan_service")

# Default VLAN pool range (can be configured via system settings)
DEFAULT_VLAN_START = 100
DEFAULT_VLAN_END = 3999


class VLANPoolService:
    """
    Manages VLAN ID allocation from a configurable pool.
    Each isolated network in a student environment gets a unique VLAN.
    """
    
    def __init__(self):
        self.vlan_start = DEFAULT_VLAN_START
        self.vlan_end = DEFAULT_VLAN_END
    
    def load_config(self, db: Session):
        """Load VLAN pool configuration from database."""
        from db.models import SystemSetting
        try:
            settings = {s.key: s.value for s in db.query(SystemSetting).filter(
                SystemSetting.category == 'network'
            ).all()}
            
            self.vlan_start = int(settings.get('vlan_pool_start', DEFAULT_VLAN_START))
            self.vlan_end = int(settings.get('vlan_pool_end', DEFAULT_VLAN_END))
            logger.info(f"VLAN pool configured: {self.vlan_start}-{self.vlan_end}")
        except Exception as e:
            logger.warning(f"Failed to load VLAN config, using defaults: {e}")
    
    def allocate_vlan(self, db: Session, network_id: int, environment_id: int) -> Optional[int]:
        """
        Allocate the next available VLAN from the pool for a given network/environment.
        
        Args:
            db: Database session
            network_id: The template network ID
            environment_id: The student environment ID
            
        Returns:
            Allocated VLAN ID, or None if pool exhausted
        """
        from db.models import ClassNetwork
        
        # Check if already allocated
        existing = db.query(ClassNetwork).filter(
            ClassNetwork.environment_id == environment_id,
            ClassNetwork.network_id == network_id
        ).first()
        
        if existing:
            logger.debug(f"VLAN already allocated for env {environment_id}, network {network_id}: {existing.vlan_id}")
            return existing.vlan_id
        
        # Find next available VLAN (not used by any active ClassNetwork)
        used_vlans = db.query(ClassNetwork.vlan_id).distinct().all()
        used_set = {v[0] for v in used_vlans if v[0] is not None}
        
        # Find first available in range
        allocated_vlan = None
        for vlan_id in range(self.vlan_start, self.vlan_end + 1):
            if vlan_id not in used_set:
                allocated_vlan = vlan_id
                break
        
        if allocated_vlan is None:
            logger.error(f"VLAN pool exhausted! Range: {self.vlan_start}-{self.vlan_end}")
            return None
        
        # Store allocation
        allocation = ClassNetwork(
            environment_id=environment_id,
            network_id=network_id,
            vlan_id=allocated_vlan
        )
        db.add(allocation)
        db.commit()
        
        logger.info(f"Allocated VLAN {allocated_vlan} for env {environment_id}, network {network_id}")
        return allocated_vlan
    
    def get_environment_vlans(self, db: Session, environment_id: int) -> dict:
        """
        Get all VLAN allocations for an environment.
        
        Returns:
            Dict mapping network_id to vlan_id
        """
        from db.models import ClassNetwork
        
        allocations = db.query(ClassNetwork).filter(
            ClassNetwork.environment_id == environment_id
        ).all()
        
        return {a.network_id: a.vlan_id for a in allocations}
    
    def release_environment_vlans(self, db: Session, environment_id: int) -> int:
        """
        Release all VLANs for an environment back to the pool.
        Called when environment is deleted.
        
        Returns:
            Number of VLANs released
        """
        from db.models import ClassNetwork
        
        count = db.query(ClassNetwork).filter(
            ClassNetwork.environment_id == environment_id
        ).delete(synchronize_session=False)
        
        db.commit()
        logger.info(f"Released {count} VLANs for environment {environment_id}")
        return count
    
    def get_pool_stats(self, db: Session) -> dict:
        """Get statistics about VLAN pool usage."""
        from db.models import ClassNetwork
        
        total_pool = self.vlan_end - self.vlan_start + 1
        used_count = db.query(func.count(ClassNetwork.vlan_id.distinct())).scalar() or 0
        
        return {
            "pool_start": self.vlan_start,
            "pool_end": self.vlan_end,
            "total_available": total_pool,
            "used": used_count,
            "free": total_pool - used_count,
            "utilization_percent": round((used_count / total_pool) * 100, 1) if total_pool > 0 else 0
        }


# Singleton instance
vlan_service = VLANPoolService()
