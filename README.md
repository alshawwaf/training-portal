# Check Point SE Training Portal

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
</p>

A professional training platform leveraging **Proxmox VE** for backend virtualization. This portal enables instructors to create and manage training classes while providing participants with isolated, on-demand lab environments.

---

## Features

| Feature | Description |
|---------|-------------|
| **User Registration** | Self-service signup with mandatory domain validation and email verification |
| **RBAC** | Granular permission system with default roles (Admin, Instructor, Student) |
| **Class Management** | Create, configure, and manage training classes with customizable parameters |
| **Templates Management** | Define multi-provider environments (Proxmox, AWS, Azure, etc.) for labs |
| **Virtual Environments** | Automated provisioning of environments for each student (Proxmox & vSphere) |
| **My Workspace** | Dedicated student view for managing assigned environments and VMs |
| **Console Access** | Built-in HTML5 console for all VMs using **noVNC** (raw VNC support) |
| **Monitoring Dashboard** | Admin-level oversight of all active classes and environments |
| **Environment Control** | Start, stop, revert, and access VMs with one click |
| **Modern Dark UI** | Premium dark-themed interface with Check Point branding |
| **Invitation System** | Secure user invitation with mandatory first-login password changes |
| **Docker Ready** | Full Docker Compose setup for easy deployment |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Check Point SE Portal                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Frontend   │───▶│   Backend    │───▶│ Proxmox / vSphere│  │
│  │  React/Vite  │    │   FastAPI    │    │  Virtualization  │  │
│  │  Port: 8989  │    │  Port: 8000  │    │                  │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                             │                                    │
│                             ▼                                    │
│                      ┌──────────────┐                           │
│                      │  SQLite/PG   │                           │
│                      │  Port: 5432  │                           │
│                      └──────────────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS |
| **Backend** | FastAPI, SQLAlchemy, Pydantic |
| **Database** | PostgreSQL 15 (SQLite for development) |
| **Auth** | Azure AD (MSAL) + Local Superadmin |
| **Virtualization** | Proxmox VE API & VMware vSphere (pyVmomi) |
| **Containerization** | Docker & Docker Compose |

---

## Quick Start

### Prerequisites

- **Docker Desktop** (recommended) OR:
  - Node.js 20+
  - Python 3.11+
- Proxmox VE Cluster (optional, can run in Mock mode)
- Azure AD Application (optional, can use local auth)

### Option 1: Docker Compose (Recommended)

```powershell
# Clone the repository
git clone <repo-url>
cd "SE Training Portal"

# Copy environment file
copy .env.example .env

# Start all services
docker-compose up --build
```

Access the portal at **http://localhost:9999**

### Option 2: Manual Development Setup

**1. Backend Setup**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**2. Frontend Setup** (in a new terminal)
```powershell
cd frontend
npm install
npm run dev
```

Access the portal at **http://localhost:9999**

---

### User Registration System

The portal supports self-service registration constrained by email domain.
- **Verification**: 6-digit codes sent via SMTP.
- **On-boarding**: New users are assigned to the default **Student** group.

### Administration

Global administrators can manage:
- **Users**: Invite, disable, or modify user roles.
- **Groups**: Define custom clusters of permissions.
- **Activity Logs**: Dual-tab logging for operational tracking and application exceptions.

---

## Project Structure

```
SE Training Portal/
├── backend/
│   ├── db/                    # Database models & config
│   │   ├── database.py        # SQLAlchemy setup
│   │   └── models.py          # User, Class, Template models
│   ├── routers/               # API endpoints
│   ├── services/
│   │   ├── proxmox_service.py # Proxmox VE integration
│   │   └── vsphere_service.py # VMware vSphere integration
│   ├── main.py                # FastAPI application
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── Layout.tsx     # Main app layout
│   │   │   └── Modal.tsx      # Modal dialog
│   │   ├── context/           # React Context providers
│   │   ├── pages/             # Application pages
│   │   │   ├── monitoring/    # Admin monitoring views
│   │   │   │   ├── AllClasses.tsx
│   │   │   │   └── AllEnvironments.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Classes.tsx
│   │   │   ├── MyClasses.tsx
│   │   │   ├── MyEnvironments.tsx
│   │   │   ├── Templates.tsx
│   │   │   └── Settings.tsx
│   │   ├── api.ts             # Axios configuration
│   │   ├── App.tsx            # Router & providers
│   │   └── index.css          # Design system
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── docs/
│   └── DEVELOPER_GUIDE.md
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/auth/login` | Initiate SSO login |
| `GET` | `/auth/callback` | SSO callback handler |
| `POST` | `/auth/local-login` | Superadmin login |

### Classes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/classes/` | List all classes |
| `POST` | `/classes/` | Create new class |
| `GET` | `/classes/{id}` | Get class details |
| `DELETE` | `/classes/{id}` | Delete a class |

### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/templates/` | List all templates |
| `POST` | `/templates/` | Create new template |
| `GET` | `/templates/{id}` | Get template details |
| `PUT` | `/templates/{id}` | Update template |
| `DELETE` | `/templates/{id}` | Delete template |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API info + Proxmox status |
| `GET` | `/health` | Health check |

---

## Environment Variables

Create a `.env` file in the project root:

```env
# General
ENV=development
FRONTEND_URL=http://localhost:9999

# Database
DATABASE_URL=sqlite:///./sql_app.db
# For PostgreSQL:
# DATABASE_URL=postgresql://admin:password@localhost:5432/se_training_portal

# Azure AD (Optional)
AZURE_CLIENT_ID=your-client-id-here
AZURE_CLIENT_SECRET=your-client-secret-here
AZURE_TENANT_ID=your-tenant-id-here

# Superadmin
SUPERADMIN_EMAIL=admin@cpdemo.com
SUPERADMIN_PASSWORD=Cpwins!1

# Proxmox
PROXMOX_HOST=192.168.1.100
PROXMOX_USER=root@pam
PROXMOX_PASSWORD=your-proxmox-password
PROXMOX_NODE=pve
PROXMOX_MOCK=true  # Set to false for real Proxmox
```

---

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `frontend` | 8989 | React application |
| `backend` | 8000 | FastAPI server |
| `db` | 5432 | PostgreSQL database |
| `pgadmin` | 5050 | Database management (optional) |

Start with pgAdmin:
```powershell
docker-compose --profile tools up --build
```

---

## Documentation

- [Developer Guide](docs/DEVELOPER_GUIDE.md) - Detailed development instructions
- [API Documentation](http://localhost:8000/docs) - Interactive Swagger UI (when running)

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is proprietary software. All rights reserved.
