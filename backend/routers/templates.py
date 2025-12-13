from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import SessionLocal
from db.models import Template
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger("se_portal")

router = APIRouter(prefix="/templates", tags=["templates"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Pydantic Schemas
class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "🖥️"
    provider: Optional[str] = "Proxmox"
    vm_config: Optional[str] = None
    is_active: Optional[bool] = True


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    provider: Optional[str] = None
    vm_config: Optional[str] = None
    is_active: Optional[bool] = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    icon: str
    provider: Optional[str]
    vm_config: Optional[str]
    is_active: bool
    created_at: Optional[str]
    updated_at: Optional[str]

    class Config:
        from_attributes = True


# Routes
@router.get("/")
def list_templates(db: Session = Depends(get_db)):
    """List all templates"""
    templates = db.query(Template).order_by(Template.name).all()
    return [t.to_dict() for t in templates]


@router.post("/")
def create_template(template: TemplateCreate, db: Session = Depends(get_db)):
    """Create a new template"""
    new_template = Template(
        name=template.name,
        description=template.description,
        icon=template.icon,
        provider=template.provider,
        vm_config=template.vm_config,
        is_active=template.is_active
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    logger.info(f"Created template: {new_template.name}")
    return new_template.to_dict()


@router.get("/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db)):
    """Get a single template by ID"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template.to_dict()


@router.put("/{template_id}")
def update_template(template_id: int, update: TemplateUpdate, db: Session = Depends(get_db)):
    """Update an existing template"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if update.name is not None:
        template.name = update.name
    if update.description is not None:
        template.description = update.description
    if update.icon is not None:
        template.icon = update.icon
    if update.provider is not None:
        template.provider = update.provider
    if update.vm_config is not None:
        template.vm_config = update.vm_config
    if update.is_active is not None:
        template.is_active = update.is_active
    
    db.commit()
    db.refresh(template)
    logger.info(f"Updated template: {template.name}")
    return template.to_dict()


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    """Delete a template"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    db.delete(template)
    db.commit()
    logger.info(f"Deleted template: {template.name}")
    return {"message": "Template deleted successfully"}
