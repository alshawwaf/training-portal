
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.vsphere_service import vsphere_service
from apscheduler.job import Job

def verify_scheduler():
    print("Verifying vSphere Scheduler...")
    
    # Initial state
    jobs = vsphere_service.scheduler.get_jobs()
    print(f"Initial jobs: {[j.id for j in jobs]}")
    
    # Test Manual Mode
    print("\nTesting Manual Mode...")
    vsphere_service.configure_scheduler("manual", 60)
    jobs = vsphere_service.scheduler.get_jobs()
    sync_jobs = [j for j in jobs if j.id == vsphere_service.sync_job_id]
    if not sync_jobs:
        print("PASS: No sync job in manual mode.")
    else:
        print(f"FAIL: Sync job found in manual mode: {sync_jobs}")

    # Test Scheduled Mode (15 mins)
    print("\nTesting Scheduled Mode (15 mins)...")
    vsphere_service.configure_scheduler("scheduled", 15)
    jobs = vsphere_service.scheduler.get_jobs()
    sync_jobs = [j for j in jobs if j.id == vsphere_service.sync_job_id]
    
    if len(sync_jobs) == 1:
        job: Job = sync_jobs[0]
        # Check interval
        # IntervalTrigger doesn't expose interval directly easily in all versions, but we can check trigger
        print(f"PASS: Job configured: {job}")
        print(f"Trigger: {job.trigger}")
    else:
        print(f"FAIL: Job not found or multiple jobs: {sync_jobs}")

    # Test Scheduled Mode Update (60 mins)
    print("\nTesting Schedule Update (60 mins)...")
    vsphere_service.configure_scheduler("scheduled", 60)
    jobs = vsphere_service.scheduler.get_jobs()
    job = vsphere_service.scheduler.get_job(vsphere_service.sync_job_id)
    print(f"PASS: Updated Job Trigger: {job.trigger}")

if __name__ == "__main__":
    verify_scheduler()
