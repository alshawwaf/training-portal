"""
Provisioning Service
Handles the creation of environments and VMs for classes.
Supports both bulk provisioning and on-demand provisioning.
"""
import asyncio
import logging
import json
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from db.models import Class, ClassEnvironment, EnvironmentVM, Template, TemplateVM
from services.vsphere_service import vsphere_service
from services.logging_service import logging_service

logger = logging.getLogger("provisioning_service")

class ProvisioningService:
    async def provision_environment(self, db: Session, class_id: int, student_number: int) -> Dict[str, Any]:
        """
        Provision a single environment for a class on-demand.
        """
        db_class = db.query(Class).filter(Class.id == class_id).first()
        if not db_class:
            return {"success": False, "message": "Class not found"}
        
        template = db_class.template
        if not template:
            return {"success": False, "message": "No template assigned to class"}
        
        env_name = f"Student {student_number}"
        
        # Create Environment Record
        env = ClassEnvironment(
            class_id=class_id, 
            name=env_name, 
            student_number=student_number,
            status="provisioning"
        )
        db.add(env)
        db.commit()
        db.refresh(env)
        
        logger.info(f"Starting on-demand provisioning for {db_class.name} - {env_name}")
        
        provisioned_vms = []
        errors = []
        
        for tmpl_vm in template.vms:
            vm_name = f"{db_class.name}-{env.name}-{tmpl_vm.vm_name}".replace(" ", "_")
            folder_path = ["SE_Training_Portal", db_class.name, env.name]
            
            try:
                # Provision VM
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None, 
                    lambda: vsphere_service.provision_vm(
                        vm_moid=tmpl_vm.vm_moid,
                        new_name=vm_name,
                        folder_path=folder_path,
                        connection_id=template.connection_id
                    )
                )
                
                if result["success"]:
                    env_vm = EnvironmentVM(
                        env_id=env.id,
                        vm_name=result.get("vm_name", vm_name),
                        vm_moid=result.get("vm_moid", "unknown"),
                        ip_address=result.get("ip_address"),
                        guest_os=tmpl_vm.guest_os,
                        access_protocol=tmpl_vm.access_protocol,
                        access_port=tmpl_vm.access_port,
                        role=tmpl_vm.is_primary and "Primary" or None,
                        status="poweredOn" # Service powers it on by default
                    )
                    db.add(env_vm)
                    provisioned_vms.append(env_vm)
                else:
                    errors.append(f"Failed to provision {vm_name}: {result.get('message')}")
            except Exception as e:
                errors.append(f"Exception provisioning {vm_name}: {str(e)}")
        
        if errors:
            env.status = "failed"
            db.commit()
            logging_service.log_action(db, "PROVISION_ENV", f"Env: {env_name}", "ERROR", f"Failed: {', '.join(errors)}")
            return {"success": False, "message": f"Errors occurred: {', '.join(errors)}"}
        
        env.status = "ready"
        db.commit()
        logging_service.log_action(db, "PROVISION_ENV", f"Env: {env_name}", "SUCCESS", f"Successfully provisioned environment for student {student_number}")
        
        return {"success": True, "environment_id": env.id}

provisioning_service = ProvisioningService()
