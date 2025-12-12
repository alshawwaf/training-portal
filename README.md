# SE Training Portal

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
</p>

A professional training platform leveraging **Proxmox VE** for backend virtualization. This portal enables instructors to create and manage training classes while providing participants with isolated, on-demand lab environments.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Class Management** | Create, configure, and manage training classes with customizable blueprints |
| **Virtual Environments** | Automated provisioning of Proxmox VM environments for each student |
| **Environment Control** | Start, stop, revert, and access VMs with one click |
| **Modern Dark UI** | Beautiful, responsive interface with gradient accents and animations |
| **Dual Authentication** | Azure AD SSO or local Superadmin login |
| **Real-time Notifications** | Toast notifications for all user actions |
| **Docker Ready** | Full Docker Compose setup for easy deployment |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SE Training Portal                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Frontend   │───▶│   Backend    │───▶│    Proxmox VE    │  │
│  │  React/Vite  │    │   FastAPI    │    │   Virtualization │  │
│  │  Port: 9999  │    │  Port: 8000  │    │                  │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                             │                                    │
│                             ▼                                    │
│                      ┌──────────────┐                           │
│                      │  PostgreSQL  │                           │
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
| **Virtualization** | Proxmox VE API |
| **Containerization** | Docker & Docker Compose |

---

## 🚀 Quick Start

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

## 🔐 Authentication

### Local Superadmin Login (Default)

Use these credentials to log in without Azure AD:

| Field | Value |
|-------|-------|
| Email | `admin@cpdemo.com` |
| Password | `Cpwins!1` |

### Azure AD SSO

Configure in `.env`:
```env
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=your-tenant-id
```

---

## 📁 Project Structure

```
SE Training Portal/
├── backend/
│   ├── db/                    # Database models & config
│   │   ├── database.py        # SQLAlchemy setup
│   │   └── models.py          # User, Class models
│   ├── routers/               # API endpoints
│   │   ├── auth.py            # Authentication routes
│   │   └── classes.py         # Class management routes
│   ├── services/
│   │   └── proxmox_service.py # Proxmox VE integration
│   ├── main.py                # FastAPI application
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── Layout.tsx     # Main app layout
│   │   │   └── Modal.tsx      # Modal dialog
│   │   ├── context/           # React Context providers
│   │   │   ├── AuthContext.tsx
│   │   │   └── ToastContext.tsx
│   │   ├── pages/             # Application pages
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Classes.tsx
│   │   │   ├── CreateClass.tsx
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

## 🌐 API Endpoints

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

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API info + Proxmox status |
| `GET` | `/health` | Health check |

---

## ⚙️ Environment Variables

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

## 🐳 Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `frontend` | 9999 | React application |
| `backend` | 8000 | FastAPI server |
| `db` | 5432 | PostgreSQL database |
| `pgadmin` | 5050 | Database management (optional) |

Start with pgAdmin:
```powershell
docker-compose --profile tools up --build
```

---

## 📖 Documentation

- [Developer Guide](docs/DEVELOPER_GUIDE.md) - Detailed development instructions
- [API Documentation](http://localhost:8000/docs) - Interactive Swagger UI (when running)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is proprietary software. All rights reserved.
