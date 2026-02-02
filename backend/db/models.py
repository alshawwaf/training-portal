from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Enum, Text
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.ext.hybrid import hybrid_property
from .database import Base
import datetime
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    INSTRUCTOR = "instructor"
    STUDENT = "student"

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
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    name = Column(String) # Keeping for now, but will populate from first+last
    role = Column(String, default=UserRole.STUDENT)
    hashed_password = Column(String, nullable=True) # For local auth
    # Azure AD Object ID
    oid = Column(String, unique=True, index=True, nullable=True) 
    
    # Registration & Security
    is_active = Column(Boolean, default=True)
    is_email_confirmed = Column(Boolean, default=False)
    confirmation_code = Column(String, nullable=True)
    password_reset_required = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    invited_at = Column(DateTime, nullable=True)
    @hybrid_property
    def must_change_password(self):
        return self.password_reset_required

    classes = relationship("Class", back_populates="instructor")
    preferences = relationship("UserPreference", back_populates="user", uselist=False)
    groups = relationship("Group", secondary="user_groups", back_populates="users")

class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    email_notifications = Column(Boolean, default=True)
    browser_notifications = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="preferences")

class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    
    users = relationship("User", secondary="user_groups", back_populates="groups")
    permissions = relationship("Permission", secondary="group_permissions", back_populates="groups")

class Permission(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # e.g. "manage_users", "view_all_classes"
    description = Column(String, nullable=True)
    
    groups = relationship("Group", secondary="group_permissions", back_populates="permissions")

class UserGroup(Base):
    __tablename__ = "user_groups"
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)

class GroupPermission(Base):
    __tablename__ = "group_permissions"
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)

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
    max_users = Column(Integer, default=1)
    passcode = Column(String)
    start_date = Column(DateTime, default=datetime.datetime.utcnow)
    end_date = Column(DateTime)
    status = Column(String, default=ClassStatus.DRAFT)
    description = Column(Text, nullable=True)
    join_token = Column(String, unique=True, index=True, nullable=True)  # UUID for shareable join link
    allow_multi_env = Column(Boolean, default=False) # Allow same student to have multiple environments
    target_datastore = Column(String, nullable=True)  # vSphere datastore name for cloning VMs
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


class InfrastructureConnection(Base):
    __tablename__ = "infrastructure_connections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    provider = Column(String)  # vSphere, Proxmox
    host = Column(String)
    port = Column(Integer)
    user = Column(String)
    password = Column(String)
    token_id = Column(String, nullable=True) # For Proxmox
    token_secret = Column(String, nullable=True) # For Proxmox
    node = Column(String, nullable=True) # For Proxmox
    verify_ssl = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    templates = relationship("Template", back_populates="connection")

    def to_dict(self, mask_password=True):
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider,
            "host": self.host,
            "port": self.port,
            "user": self.user,
            "password": "********" if mask_password and self.password else self.password,
            "token_id": self.token_id,
            "token_secret": "********" if mask_password and self.token_secret else self.token_secret,
            "node": self.node,
            "verify_ssl": self.verify_ssl,
            "is_active": self.is_active,
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
    connection_id = Column(Integer, ForeignKey("infrastructure_connections.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    status = Column(String, default="source_only") # source_only, preparing, ready, configured
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relationships
    vms = relationship("TemplateVM", back_populates="template", cascade="all, delete-orphan")
    connection = relationship("InfrastructureConnection", back_populates="templates")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "provider": self.provider,
            "connection_id": self.connection_id,
            "is_active": self.is_active,
            "status": self.status,
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
    vm_moid = Column(String)            # current vSphere Managed Object ID
    source_moid = Column(String, nullable=True) # original source vSphere MOID
    guest_os = Column(String, nullable=True)
    cpu = Column(Integer, default=1)
    memory_mb = Column(Integer, default=1024)
    is_template = Column(Boolean, default=False)  # Is it a vSphere template or regular VM
    is_primary = Column(Boolean, default=False)   # Primary VM for student access
    access_protocol = Column(String, default="rdp")  # rdp, ssh, https, vnc
    access_port = Column(Integer, nullable=True)   # Port for access (3389, 22, 443, etc.)
    
    # Relationship
    template = relationship("Template", back_populates="vms")
    networks = relationship("TemplateVMNetwork", back_populates="vm", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "template_id": self.template_id,
            "vm_name": self.vm_name,
            "vm_moid": self.vm_moid,
            "source_moid": self.source_moid,
            "guest_os": self.guest_os,
            "cpu": self.cpu,
            "memory_mb": self.memory_mb,
            "is_template": self.is_template,
            "is_primary": self.is_primary,
            "access_protocol": self.access_protocol,
            "access_port": self.access_port,
            "networks": [n.to_dict() for n in self.networks] if self.networks else []
        }

class TemplateVMNetwork(Base):
    """Mapping of VM NICs to defined networks"""
    __tablename__ = "template_vm_networks"
    id = Column(Integer, primary_key=True, index=True)
    vm_id = Column(Integer, ForeignKey("template_vms.id", ondelete="CASCADE"))
    network_id = Column(Integer, ForeignKey("networks.id"), nullable=True)
    nic_name = Column(String) # e.g. "Network adapter 1", "eth0", "net0"
    
    # Advanced NIC Settings
    adapter_type = Column(String, default="virtio")
    firewall = Column(Boolean, default=False)
    mtu = Column(Integer, nullable=True)
    mac_address = Column(String, nullable=True) # "auto" or specific MAC
    rate_limit = Column(Integer, nullable=True) # MB/s
    queues = Column(Integer, nullable=True)
    link_down = Column(Boolean, default=False)
    
    vm = relationship("TemplateVM", back_populates="networks")
    network = relationship("Network")

    def to_dict(self):
        return {
            "id": self.id,
            "network_id": self.network_id,
            "network_name": self.network.name if self.network else "Default",
            "nic_name": self.nic_name,
            "adapter_type": self.adapter_type,
            "firewall": self.firewall,
            "mtu": self.mtu,
            "mac_address": self.mac_address,
            "rate_limit": self.rate_limit,
            "queues": self.queues,
            "link_down": self.link_down
        }

class Network(Base):
    """Network definition for lab environments"""
    __tablename__ = "networks"
    id = Column(Integer, primary_key=True, index=True)
    connection_id = Column(Integer, ForeignKey("infrastructure_connections.id"))
    name = Column(String, index=True) # e.g. "Internal", "External/Internet"
    description = Column(Text, nullable=True)
    # Isolation modes: 'isolated' (unique VLAN per student), 'shared' (same port group), 'tagged' (specific VLAN)
    isolation_mode = Column(String, nullable=True, default="isolated")
    is_isolated = Column(Boolean, default=True) # Legacy - kept for backwards compatibility
    static_vlan = Column(Integer, nullable=True) # For 'tagged' mode - specific VLAN
    network_identifier = Column(String, nullable=True) # vSphere Port Group name for 'shared' mode
    color = Column(String, nullable=True) # Hex code or CSS color name
    
    connection = relationship("InfrastructureConnection")

    def to_dict(self):
        # Safely get isolation_mode - handle case where column might not exist yet
        try:
            mode = self.isolation_mode
        except Exception:
            mode = None
        
        return {
            "id": self.id,
            "connection_id": self.connection_id,
            "name": self.name,
            "description": self.description,
            "isolation_mode": mode or ("isolated" if self.is_isolated else "shared"),
            "is_isolated": self.is_isolated,  # Legacy
            "static_vlan": self.static_vlan,
            "network_identifier": self.network_identifier,
            "color": self.color
        }

class ClassNetwork(Base):
    """Actual VLAN allocation for a student's network in a class"""
    __tablename__ = "class_networks"
    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"))
    environment_id = Column(Integer, ForeignKey("class_environments.id", ondelete="CASCADE"))
    network_id = Column(Integer, ForeignKey("networks.id", ondelete="CASCADE"))
    vlan_id = Column(Integer) # The uniquely assigned VLAN ID for this student
    
    network = relationship("Network")



class ClassEnvironment(Base):
    """Represents a single student's environment for a class"""
    __tablename__ = "class_environments"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # User who claimed environment
    name = Column(String) # e.g., "Student 1" or "jsmith@company.com"
    student_number = Column(Integer) # Environment index/number
    status = Column(String, default="ready") # ready, claimed, provisioning
    is_spare = Column(Boolean, default=False) # True if this is a buffer/spare environment
    claimed_at = Column(DateTime, nullable=True) # When environment was claimed by a student
    claimed_by_email = Column(String, nullable=True) # Email of student who claimed this environment
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
    template_vm_id = Column(Integer, ForeignKey("template_vms.id"), nullable=True) # Link back to template VM
    vm_name = Column(String) # Name in vSphere
    vm_moid = Column(String) # MOID in vSphere
    ip_address = Column(String, nullable=True)
    access_url = Column(String, nullable=True) # Guacamole link etc.
    guest_os = Column(String, nullable=True)  # Guest OS type (e.g., "Windows 10", "Linux")
    access_protocol = Column(String, nullable=True)  # ssh, rdp (from template)
    access_port = Column(Integer, nullable=True)  # 22, 3389 (from template)
    role = Column(String, nullable=True) # e.g. "Primary", "Database"
    os_type = Column(String, nullable=True) # e.g. "windows", "linux"
    status = Column(String, default="poweredOff") # poweredOn, poweredOff
    
    # VM Hardware Specs
    cpu_cores = Column(Integer, nullable=True)  # Number of vCPUs
    ram_mb = Column(Integer, nullable=True)     # RAM in MB
    disk_gb = Column(Integer, nullable=True)    # Total disk in GB
    
    environment = relationship("ClassEnvironment", back_populates="vms")



class ActionLog(Base):
    """Log of system actions for audit and monitoring"""
    __tablename__ = "action_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, index=True) # e.g., "PROVISION", "DELETE_CLASS", "LOGIN"
    entity_name = Column(String) # e.g., "Class: Set 1"
    level = Column(String, index=True, default="INFO") # INFO, WARNING, ERROR, SUCCESS
    source = Column(String, index=True, default="APP") # APP, VSPHERE, PROXMOX, SYSTEM
    details = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")


class ClassStudent(Base):
    """Students who join classes (no real account required)"""
    __tablename__ = "class_students"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True)
    name = Column(String, nullable=True)  # Optional display name
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    environment_id = Column(Integer, ForeignKey("class_environments.id", ondelete="CASCADE"), nullable=True)
    session_token = Column(String, unique=True, index=True)  # For authentication
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_active = Column(DateTime, default=datetime.datetime.utcnow)
    
    class_ = relationship("Class")
    environment = relationship("ClassEnvironment")


class NotificationEvent(Base):
    """Configurable notification events that can trigger emails"""
    __tablename__ = "notification_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, unique=True, index=True)  # e.g., "class_created", "student_joined"
    name = Column(String)  # Human-readable name
    description = Column(String, nullable=True)
    email_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "event_type": self.event_type,
            "name": self.name,
            "description": self.description,
            "email_enabled": self.email_enabled,
        }
