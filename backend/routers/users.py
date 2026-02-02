from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import User, Group, UserGroup, Permission, GroupPermission
import logging
import random
import string
import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from services.email_service import email_service
from services.notification_service import notification_service
from .auth import get_admin_user, get_password_hash

logger = logging.getLogger("training_portal.users")

router = APIRouter(prefix="/users", tags=["users"])

# --- Schemas ---
class UserRead(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool
    is_email_confirmed: bool
    must_change_password: bool
    last_login: Optional[datetime.datetime] = None
    invited_at: Optional[datetime.datetime] = None
    
    class Config:
        from_attributes = True

class UserInvite(BaseModel):
    name: str
    email: EmailStr
    role: str = "instructor"  # student, instructor, admin
    group_ids: List[int] = []
    require_password_change: bool = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    is_email_confirmed: Optional[bool] = None
    password_reset_required: Optional[bool] = None
    group_ids: Optional[List[int]] = None

class PermissionRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    class Config:
        from_attributes = True

class GroupRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    permissions: List[PermissionRead] = []
    
    class Config:
        from_attributes = True

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permission_ids: List[int] = []

# --- Routes ---

@router.get("/", response_model=List[UserRead])
def list_users(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """List all users (Admin only)"""
    return db.query(User).all()

@router.post("/invite")
async def invite_user(
    invite: UserInvite, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    admin: User = Depends(get_admin_user)
):
    """Invite a new user and send them an email (Admin only)"""
    existing = db.query(User).filter(User.email == invite.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Generate random temp password
    temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=12))
    
    import datetime
    new_user = User(
        name=invite.name,
        email=invite.email,
        hashed_password=get_password_hash(temp_password),
        is_email_confirmed=True, # Pre-confirmed since admin invited them
        password_reset_required=invite.require_password_change,
        role=invite.role,  # Use role from invite
        invited_at=datetime.datetime.utcnow()
    )
    db.add(new_user)
    db.flush()
    
    # Assign groups
    for g_id in invite.group_ids:
        db.add(UserGroup(user_id=new_user.id, group_id=g_id))
    
    db.commit()
    
    try:
        await notification_service.notify_user_invited(
            db=db,
            user_email=invite.email,
            role=invite.role.title(),
            invited_by=admin.name or admin.email,
            invite_url="/login",
            background_tasks=background_tasks
        )
        
        # Also send temp password email
        await email_service.load_config(db)
        await email_service.send_email(
            subject="Your SE Training Portal Account Credentials",
            recipients=[invite.email],
            body={
                "message": f"Hello {invite.name},<br><br>"
                           f"Your account has been created.<br><br>"
                           f"<strong>Temporary Password:</strong> {temp_password}<br><br>"
                           f"{'You will be required to change your password on first login.' if invite.require_password_change else ''}"
            }
        )
    except Exception as e:
        logger.error(f"Failed to send invitation email: {e}")
        # Still return success as user is created
    
    return {"message": "User invited successfully"}

@router.get("/permissions", response_model=List[PermissionRead])
def list_permissions(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """List all available permissions (seeds default if empty)"""
    perms = db.query(Permission).all()
    if not perms:
        # Seed default permissions
        defaults = [
            ("view_users", "View user list"),
            ("manage_users", "Create, edit, delete users"),
            ("view_classes", "View classes"),
            ("manage_classes", "Create, edit, delete classes"),
            ("view_infrastructure", "View infrastructure status"),
            ("manage_infrastructure", "Manage infrastructure settings"),
            ("access_admin_panel", "Access the admin dashboard")
        ]
        for name, desc in defaults:
            p = Permission(name=name, description=desc)
            db.add(p)
        db.commit()
        perms = db.query(Permission).all()
    return perms

@router.get("/groups", response_model=List[GroupRead])
def list_groups(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """List all groups (Admin only)"""
    return db.query(Group).all()

@router.post("/groups", response_model=GroupRead)
def create_group(group: GroupCreate, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Create a new group (Admin only)"""
    new_group = Group(name=group.name, description=group.description)
    db.add(new_group)
    db.flush()
    
    # Add permissions
    if group.permission_ids:
        for pid in group.permission_ids:
            db.add(GroupPermission(group_id=new_group.id, permission_id=pid))
            
    db.commit()
    db.refresh(new_group)
    return new_group

@router.put("/{user_id}", response_model=UserRead)
def update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Update a user (Admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_update.name is not None: user.name = user_update.name
    if user_update.email is not None: user.email = user_update.email
    if user_update.role is not None: user.role = user_update.role
    if user_update.is_active is not None: user.is_active = user_update.is_active
    if user_update.is_email_confirmed is not None: user.is_email_confirmed = user_update.is_email_confirmed
    if user_update.password_reset_required is not None: user.password_reset_required = user_update.password_reset_required
    
    # Update groups if provided
    # (Simplified: clear and re-add)
    if user_update.group_ids is not None:
        db.query(UserGroup).filter(UserGroup.user_id == user.id).delete()
        for gid in user_update.group_ids:
            db.add(UserGroup(user_id=user.id, group_id=gid))
    
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Delete a user (Admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # specific user request: allow deleting self
    # if user.id == admin.id:
    #     raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

@router.delete("/groups/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Delete a group (Admin only)"""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(group)
    db.commit()
    return {"message": "Group deleted successfully"}

@router.put("/groups/{group_id}", response_model=GroupRead)
def update_group(group_id: int, group_update: GroupCreate, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Update a group (Admin only)"""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    group.name = group_update.name
    group.description = group_update.description
    
    # Update permissions
    if group_update.permission_ids is not None:
        db.query(GroupPermission).filter(GroupPermission.group_id == group.id).delete()
        for pid in group_update.permission_ids:
            db.add(GroupPermission(group_id=group.id, permission_id=pid))

    db.commit()
    db.refresh(group)
    return group
