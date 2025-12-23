"""
Scalable Notification Service
Production-ready notification handling with event-specific templates and multi-recipient support.
"""
import logging
import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks

from db.models import NotificationEvent, User, Class, ClassEnvironment, ClassStudent
from services.email_service import email_service

logger = logging.getLogger("se_portal.notification_service")


class NotificationService:
    """
    Central notification service for handling all system notifications.
    Supports multi-recipient emails, event-specific templates, and async processing.
    """

    # Email templates for each event type
    TEMPLATES = {
        "class_created": {
            "subject": "New Training Class: {class_name}",
            "message": """
You have been assigned to a new training class.

<strong>Class:</strong> {class_name}<br>
<strong>Instructor:</strong> {instructor_name}<br>
<strong>Start Date:</strong> {start_date}<br>
<strong>End Date:</strong> {end_date}<br>

{description}

Please prepare for the class and ensure you have access to all required resources.
            """.strip()
        },
        "class_started": {
            "subject": "Class Started: {class_name}",
            "message": """
Your training class has officially started!

<strong>Class:</strong> {class_name}<br>
<strong>Instructor:</strong> {instructor_name}<br>

You can now access your training environment. Log in to the SE Training Portal to get started.
            """.strip()
        },
        "class_completed": {
            "subject": "Class Completed: {class_name}",
            "message": """
The training class has been completed.

<strong>Class:</strong> {class_name}<br>
<strong>Completion Date:</strong> {completion_date}<br>

Thank you for participating! Your training environments will be cleaned up within 24 hours.
            """.strip()
        },
        "student_joined": {
            "subject": "Student Joined: {student_name} - {class_name}",
            "message": """
A new student has joined your class.

<strong>Student:</strong> {student_name} ({student_email})<br>
<strong>Class:</strong> {class_name}<br>
<strong>Environment:</strong> {environment_name}<br>
<strong>Joined At:</strong> {joined_at}<br>

The student now has access to their assigned training environment.
            """.strip()
        },
        "environment_provisioned": {
            "subject": "Your Training Environment is Ready - {class_name}",
            "message": """
Great news! Your training environment has been provisioned and is ready to use.

<strong>Class:</strong> {class_name}<br>
<strong>Environment:</strong> {environment_name}<br>
<strong>VMs Provisioned:</strong> {vm_count}<br>

Log in to the SE Training Portal to access your environment and start learning!
            """.strip()
        },
        "environment_error": {
            "subject": "Environment Provisioning Failed - {class_name}",
            "message": """
There was an issue provisioning the training environment.

<strong>Class:</strong> {class_name}<br>
<strong>Environment:</strong> {environment_name}<br>
<strong>Error:</strong> {error_message}<br>

Our team has been notified and is working to resolve this issue. You will be notified when the environment is ready.
            """.strip()
        },
        "user_invited": {
            "subject": "You're Invited to SE Training Portal",
            "message": """
You have been invited to join the SE Training Portal.

<strong>Invited By:</strong> {invited_by}<br>
<strong>Role:</strong> {role}<br>

Click the button below to complete your registration and set up your account.
            """.strip()
        },
        "user_registered": {
            "subject": "Welcome to SE Training Portal - {user_name}",
            "message": """
Welcome to the SE Training Portal!

Your account has been successfully created.

<strong>Name:</strong> {user_name}<br>
<strong>Email:</strong> {user_email}<br>
<strong>Role:</strong> {role}<br>

You can now log in and access your training classes.
            """.strip()
        },
        "system_alert": {
            "subject": "[ALERT] {alert_title}",
            "message": """
A system alert has been triggered.

<strong>Alert:</strong> {alert_title}<br>
<strong>Severity:</strong> {severity}<br>
<strong>Time:</strong> {timestamp}<br>

<strong>Details:</strong><br>
{alert_details}
            """.strip()
        }
    }

    async def is_event_enabled(self, db: Session, event_type: str) -> bool:
        """Check if a notification event is enabled."""
        event = db.query(NotificationEvent).filter(
            NotificationEvent.event_type == event_type
        ).first()
        return event.email_enabled if event else False

    def get_template(self, event_type: str) -> Dict[str, str]:
        """Get email template for an event type."""
        return self.TEMPLATES.get(event_type, {
            "subject": "SE Training Portal Notification",
            "message": "You have a new notification."
        })

    def format_template(self, template: Dict[str, str], context: Dict[str, Any]) -> Dict[str, str]:
        """Format template with context variables."""
        subject = template["subject"]
        message = template["message"]
        
        for key, value in context.items():
            placeholder = "{" + key + "}"
            subject = subject.replace(placeholder, str(value) if value else "")
            message = message.replace(placeholder, str(value) if value else "")
        
        return {"subject": subject, "message": message}

    async def notify(
        self,
        db: Session,
        event_type: str,
        context: Dict[str, Any],
        recipients: List[str],
        url: Optional[str] = None,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """
        Send notification for an event.
        
        Args:
            db: Database session
            event_type: Type of notification event
            context: Variables for template formatting
            recipients: List of email addresses
            url: Optional URL for CTA button
            background_tasks: FastAPI BackgroundTasks for async processing
        """
        # Check if event is enabled
        if not await self.is_event_enabled(db, event_type):
            logger.debug(f"Notification event '{event_type}' is disabled, skipping.")
            return

        if not recipients:
            logger.warning(f"No recipients for notification event '{event_type}'")
            return

        # Get and format template
        template = self.get_template(event_type)
        formatted = self.format_template(template, context)

        # Remove duplicates and empty emails
        unique_recipients = list(set(r for r in recipients if r))

        if background_tasks:
            # Async processing
            background_tasks.add_task(
                self._send_notification,
                recipients=unique_recipients,
                subject=formatted["subject"],
                message=formatted["message"],
                url=url
            )
            logger.info(f"Queued notification '{event_type}' to {len(unique_recipients)} recipients")
        else:
            # Sync processing
            await self._send_notification(
                recipients=unique_recipients,
                subject=formatted["subject"],
                message=formatted["message"],
                url=url
            )

    async def _send_notification(
        self,
        recipients: List[str],
        subject: str,
        message: str,
        url: Optional[str] = None
    ):
        """Internal method to send the notification email."""
        try:
            await email_service.send_email(
                subject=subject,
                recipients=recipients,
                body={"message": message, "url": url}
            )
            logger.info(f"Sent notification '{subject}' to {len(recipients)} recipients")
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")

    # ==========================================
    # Event-Specific Helper Methods
    # ==========================================

    async def notify_class_created(
        self,
        db: Session,
        class_: Class,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """Notify instructor when a class is created."""
        recipients = []
        
        # Add instructor
        if class_.instructor and class_.instructor.email:
            recipients.append(class_.instructor.email)

        context = {
            "class_name": class_.name,
            "instructor_name": class_.instructor.name if class_.instructor else "TBD",
            "start_date": class_.start_date.strftime("%B %d, %Y") if class_.start_date else "TBD",
            "end_date": class_.end_date.strftime("%B %d, %Y") if class_.end_date else "TBD",
            "description": class_.description or "No description provided."
        }

        await self.notify(
            db=db,
            event_type="class_created",
            context=context,
            recipients=recipients,
            url="/classes",
            background_tasks=background_tasks
        )

    async def notify_class_started(
        self,
        db: Session,
        class_: Class,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """Notify all students when a class starts."""
        recipients = []
        
        # Add all students with environments
        for env in class_.environments:
            if env.user and env.user.email:
                recipients.append(env.user.email)
        
        # Also check ClassStudent registrations
        students = db.query(ClassStudent).filter(ClassStudent.class_id == class_.id).all()
        for student in students:
            if student.email:
                recipients.append(student.email)

        context = {
            "class_name": class_.name,
            "instructor_name": class_.instructor.name if class_.instructor else "Unknown"
        }

        await self.notify(
            db=db,
            event_type="class_started",
            context=context,
            recipients=recipients,
            url="/my-classes",
            background_tasks=background_tasks
        )

    async def notify_class_completed(
        self,
        db: Session,
        class_: Class,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """Notify instructor and students when class completes."""
        recipients = []
        
        # Add instructor
        if class_.instructor and class_.instructor.email:
            recipients.append(class_.instructor.email)
        
        # Add all students
        for env in class_.environments:
            if env.user and env.user.email:
                recipients.append(env.user.email)
        
        students = db.query(ClassStudent).filter(ClassStudent.class_id == class_.id).all()
        for student in students:
            if student.email:
                recipients.append(student.email)

        context = {
            "class_name": class_.name,
            "completion_date": datetime.datetime.now().strftime("%B %d, %Y")
        }

        await self.notify(
            db=db,
            event_type="class_completed",
            context=context,
            recipients=recipients,
            background_tasks=background_tasks
        )

    async def notify_student_joined(
        self,
        db: Session,
        class_: Class,
        student_name: str,
        student_email: str,
        environment_name: str,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """Notify instructor when a student joins."""
        recipients = []
        
        # Notify instructor
        if class_.instructor and class_.instructor.email:
            recipients.append(class_.instructor.email)

        context = {
            "student_name": student_name,
            "student_email": student_email,
            "class_name": class_.name,
            "environment_name": environment_name,
            "joined_at": datetime.datetime.now().strftime("%B %d, %Y at %I:%M %p")
        }

        await self.notify(
            db=db,
            event_type="student_joined",
            context=context,
            recipients=recipients,
            url=f"/classes/{class_.id}",
            background_tasks=background_tasks
        )

    async def notify_environment_provisioned(
        self,
        db: Session,
        class_: Class,
        environment: ClassEnvironment,
        student_email: str,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """Notify student when their environment is ready."""
        recipients = [student_email] if student_email else []

        context = {
            "class_name": class_.name,
            "environment_name": environment.name,
            "vm_count": len(environment.vms) if environment.vms else 0
        }

        await self.notify(
            db=db,
            event_type="environment_provisioned",
            context=context,
            recipients=recipients,
            url="/my-environments",
            background_tasks=background_tasks
        )

    async def notify_environment_error(
        self,
        db: Session,
        class_: Class,
        environment: ClassEnvironment,
        error_message: str,
        student_email: Optional[str] = None,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """Notify student and instructor when provisioning fails."""
        recipients = []
        
        if student_email:
            recipients.append(student_email)
        
        # Also notify instructor
        if class_.instructor and class_.instructor.email:
            recipients.append(class_.instructor.email)

        context = {
            "class_name": class_.name,
            "environment_name": environment.name if environment else "Unknown",
            "error_message": error_message
        }

        await self.notify(
            db=db,
            event_type="environment_error",
            context=context,
            recipients=recipients,
            background_tasks=background_tasks
        )

    async def notify_user_invited(
        self,
        db: Session,
        user_email: str,
        role: str,
        invited_by: str,
        invite_url: Optional[str] = None,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """Notify user when they are invited."""
        recipients = [user_email]

        context = {
            "invited_by": invited_by,
            "role": role.title()
        }

        await self.notify(
            db=db,
            event_type="user_invited",
            context=context,
            recipients=recipients,
            url=invite_url or "/register",
            background_tasks=background_tasks
        )

    async def notify_user_registered(
        self,
        db: Session,
        user: User,
        admin_emails: Optional[List[str]] = None,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """Notify user and admins when registration completes."""
        recipients = [user.email]
        
        # Also notify admins
        if admin_emails:
            recipients.extend(admin_emails)

        context = {
            "user_name": user.name or f"{user.first_name} {user.last_name}".strip(),
            "user_email": user.email,
            "role": user.role.title() if isinstance(user.role, str) else user.role.value.title()
        }

        await self.notify(
            db=db,
            event_type="user_registered",
            context=context,
            recipients=recipients,
            url="/dashboard",
            background_tasks=background_tasks
        )

    async def notify_system_alert(
        self,
        db: Session,
        alert_title: str,
        alert_details: str,
        severity: str = "INFO",
        admin_emails: Optional[List[str]] = None,
        background_tasks: Optional[BackgroundTasks] = None
    ):
        """Send system alert to admins."""
        # Get admin emails if not provided
        if not admin_emails:
            admins = db.query(User).filter(User.role == "admin").all()
            admin_emails = [a.email for a in admins if a.email]
        
        if not admin_emails and email_service.admin_email:
            admin_emails = [email_service.admin_email]

        context = {
            "alert_title": alert_title,
            "severity": severity.upper(),
            "timestamp": datetime.datetime.now().strftime("%B %d, %Y at %I:%M:%S %p"),
            "alert_details": alert_details
        }

        await self.notify(
            db=db,
            event_type="system_alert",
            context=context,
            recipients=admin_emails or [],
            background_tasks=background_tasks
        )


# Singleton instance
notification_service = NotificationService()
