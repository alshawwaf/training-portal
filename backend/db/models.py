from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Enum, Text
from sqlalchemy.orm import relationship
from .database import Base
import datetime
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    INSTRUCTOR = "instructor"

class ClassStatus(str, enum.Enum):
    DRAFT = "draft"
    UPCOMING = "upcoming"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    POSTPONED = "postponed"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    role = Column(String, default=UserRole.INSTRUCTOR)
    hashed_password = Column(String, nullable=True) # For local auth
    # Azure AD Object ID
    oid = Column(String, unique=True, index=True, nullable=True) 

    classes = relationship("Class", back_populates="instructor")
    preferences = relationship("UserPreference", back_populates="user", uselist=False)

class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    email_notifications = Column(Boolean, default=True)
    browser_notifications = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="preferences")

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String)
    category = Column(String, index=True) # e.g., 'proxmox', 'general', 'backup'
    description = Column(String, nullable=True)
    is_secret = Column(Boolean, default=False) # If true, value masked in frontend
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Class(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    instructor_id = Column(Integer, ForeignKey("users.id"))
    blueprint_id = Column(String) # Proxmox Template ID (Legacy)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=True) # vSphere Template
    max_users = Column(Integer, default=10)
    passcode = Column(String)
    start_date = Column(DateTime, default=datetime.datetime.utcnow)
    end_date = Column(DateTime)
    status = Column(String, default=ClassStatus.DRAFT)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    instructor = relationship("User", back_populates="classes")
    template = relationship("Template")
    environments = relationship("ClassEnvironment", back_populates="class_", cascade="all, delete-orphan")

    def to_dict(self):
        """Convert class to dictionary for JSON backup"""
        return {
            "id": self.id,
            "name": self.name,
            "instructor_id": self.instructor_id,
            "blueprint_id": self.blueprint_id,
            "template_id": self.template_id,
            "max_users": self.max_users,
            "passcode": self.passcode,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "status": self.status,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    icon = Column(String, default="🖥️")
    provider = Column(String, default="vSphere")  # vSphere, Proxmox
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relationships
    vms = relationship("TemplateVM", back_populates="template", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "provider": self.provider,
            "is_active": self.is_active,
            "vms": [vm.to_dict() for vm in self.vms] if self.vms else [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TemplateVM(Base):
    """VMs selected from vSphere inventory for a template"""
    __tablename__ = "template_vms"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("templates.id", ondelete="CASCADE"))
    vm_name = Column(String)            # Name from vSphere inventory
    vm_moid = Column(String)            # vSphere Managed Object ID
    guest_os = Column(String, nullable=True)
    cpu = Column(Integer, default=1)
    memory_mb = Column(Integer, default=1024)
    is_template = Column(Boolean, default=False)  # Is it a vSphere template or regular VM
    is_primary = Column(Boolean, default=False)   # Primary VM for student access
    access_protocol = Column(String, default="rdp")  # rdp, ssh, https, vnc
    access_port = Column(Integer, nullable=True)   # Port for access (3389, 22, 443, etc.)
    
    # Relationship
    template = relationship("Template", back_populates="vms")

    def to_dict(self):
        return {
            "id": self.id,
            "template_id": self.template_id,
            "vm_name": self.vm_name,
            "vm_moid": self.vm_moid,
            "guest_os": self.guest_os,
            "cpu": self.cpu,
            "memory_mb": self.memory_mb,
            "is_template": self.is_template,
            "is_primary": self.is_primary,
            "access_protocol": self.access_protocol,
            "access_port": self.access_port,
        }


class ClassEnvironment(Base):
    """Represents a single student's environment for a class"""
    __tablename__ = "class_environments"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # User who claimed environment
    name = Column(String) # e.g., "Student 1"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    class_ = relationship("Class", back_populates="environments")
    user = relationship("User")
    vms = relationship("EnvironmentVM", back_populates="environment", cascade="all, delete-orphan")


class EnvironmentVM(Base):
    """Represents a specific provisioned VM"""
    __tablename__ = "environment_vms"

    id = Column(Integer, primary_key=True, index=True)
    env_id = Column(Integer, ForeignKey("class_environments.id", ondelete="CASCADE"))
    vm_name = Column(String) # Name in vSphere
    vm_moid = Column(String) # MOID in vSphere
    ip_address = Column(String, nullable=True)
    access_url = Column(String, nullable=True) # Guacamole link etc.
    guest_os = Column(String, nullable=True)  # Guest OS type (e.g., "Windows 10", "Linux")
    
    environment = relationship("ClassEnvironment", back_populates="vms")


class ActionLog(Base):
    """Log of system actions for audit and monitoring"""
    __tablename__ = "action_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, index=True) # e.g., "PROVISION", "DELETE_CLASS", "LOGIN"
    entity_name = Column(String) # e.g., "Class: Set 1"
    status = Column(String, index=True) # "STARTED", "SUCCESS", "ERROR"
    details = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")
