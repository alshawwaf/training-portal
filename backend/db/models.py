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
    blueprint_id = Column(String) # Proxmox Template ID
    max_users = Column(Integer, default=10)
    passcode = Column(String)
    start_date = Column(DateTime, default=datetime.datetime.utcnow)
    end_date = Column(DateTime)
    status = Column(String, default=ClassStatus.DRAFT)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    instructor = relationship("User", back_populates="classes")

    def to_dict(self):
        """Convert class to dictionary for JSON backup"""
        return {
            "id": self.id,
            "name": self.name,
            "instructor_id": self.instructor_id,
            "blueprint_id": self.blueprint_id,
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
    provider = Column(String, default="Proxmox")
    vm_config = Column(Text, nullable=True)  # JSON string for VM configuration
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "provider": self.provider,
            "vm_config": self.vm_config,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

