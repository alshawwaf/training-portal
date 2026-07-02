# Developer Guide

This document provides comprehensive information for developers working on the Training Portal.

---

## Table of Contents

1. [Project Architecture](#project-architecture)
2. [Backend Development](#backend-development)
3. [Frontend Development](#frontend-development)
4. [Database](#database)
5. [Authentication](#authentication)
6. [Proxmox Integration](#proxmox-integration)
7. [vSphere Integration](#vsphere-integration)
8. [Docker Development](#docker-development)
9. [Testing](#testing)
10. [Deployment](#deployment)

---

## Project Architecture

### Directory Structure

```
training-portal/
├── backend/                   # FastAPI Backend
│   ├── db/                    # Database layer
│   │   ├── __init__.py
│   │   ├── database.py        # SQLAlchemy engine & session
│   │   └── models.py          # ORM models (User, Class)
│   ├── routers/               # API route handlers
│   │   ├── __init__.py
│   │   ├── auth.py            # Authentication endpoints
│   │   └── classes.py         # Class management endpoints
│   ├── services/              # Business logic & external services
│   │   ├── proxmox_service.py # Proxmox VE API wrapper
│   │   └── vsphere_service.py # VMware vSphere API wrapper
│   ├── main.py                # FastAPI app initialization
│   ├── requirements.txt       # Python dependencies
│   └── Dockerfile             # Backend container definition
│
├── frontend/                  # React Frontend
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── Layout.tsx     # Main app layout with sidebar
│   │   │   └── Modal.tsx      # Reusable modal dialog
│   │   ├── context/           # React Context providers
│   │   │   ├── AuthContext.tsx    # User authentication state
│   │   │   └── ToastContext.tsx   # Notification system
│   │   ├── pages/             # Page components
│   │   │   ├── auth/          # Registration & Verification
│   │   │   │   ├── Register.tsx
│   │   │   │   └── VerifyEmail.tsx
│   │   │   ├── admin/         # Administrative views
│   │   │   │   └── Users.tsx
│   │   │   ├── monitoring/    # Admin monitoring views
│   │   │   │   ├── AllClasses.tsx
│   │   │   │   ├── AllEnvironments.tsx
│   │   │   │   └── Logs.tsx
│   │   │   ├── classes/       # Redesigned Student View
│   │   │   │   ├── ClassView.tsx
│   │   │   │   └── GuestJoin.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── TrainingClasses.tsx
│   │   │   ├── MyClasses.tsx
│   │   │   ├── MyEnvironments.tsx
│   │   │   ├── Templates.tsx
│   │   │   └── Settings.tsx
│   │   ├── api.ts             # Axios instance & interceptors
│   │   ├── App.tsx            # Router & provider setup
│   │   └── index.css          # Tailwind + design system
│   ├── package.json
│   ├── vite.config.ts         # Vite configuration
│   ├── tailwind.config.cjs    # Tailwind configuration
│   └── Dockerfile             # Frontend container definition
│
├── docs/                      # Documentation
│   └── DEVELOPER_GUIDE.md     # This file
│
├── docker-compose.yml         # Multi-container orchestration
├── .env                       # Environment variables (not in git)
├── .env.example               # Example environment file
└── README.md                  # Project overview
```

### Request Flow

```
User Browser
     │
     ▼
┌─────────────────┐
│    Frontend     │  Port 9090
│   (Vite/React)  │
└────────┬────────┘
         │ /api/* & /auth/* proxied
         ▼
┌─────────────────┐
│    Backend      │  Port 8000
│   (FastAPI)     │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐  ┌──────────────┐
│  DB   │  │   Providers  │
│(Postgre│  │ (Proxmox /   │
│  SQL)  │  │  vSphere)    │
└───────┘  └──────────────┘
```

---

## Backend Development

### Tech Stack
- **Framework**: FastAPI
- **ORM**: SQLAlchemy
- **Validation**: Pydantic
- **Auth**: MSAL (Azure AD) + Local

### Running Locally

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API docs available at: http://localhost:8000/docs

### Adding a New Endpoint

1. Create or edit a router in `routers/`:

```python
# routers/my_feature.py
from fastapi import APIRouter

router = APIRouter(prefix="/my-feature", tags=["my-feature"])

@router.get("/")
async def list_items():
    return {"items": []}
```

2. Register in `main.py`:

```python
from routers import my_feature
app.include_router(my_feature.router)
```

### Environment Loading

Environment variables are loaded from the project root `.env` file:

```python
# db/database.py
from pathlib import Path
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)
```

---

## Frontend Development

### Tech Stack
- **Framework**: React 19
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **HTTP Client**: Axios

### Running Locally

```powershell
cd frontend
npm install
npm run dev
```

App available at: http://localhost:9090

### Design System

The design system is defined in `src/index.css`:

#### Component Classes
| Class | Description |
|-------|-------------|
| `.card` | Basic card with blur backdrop |
| `.card-elevated` | Solid card with stronger shadow |
| `.btn-primary` | Gradient blue button |
| `.btn-secondary` | Gray outlined button |
| `.btn-ghost` | Text-only button |
| `.input` | Styled form input |
| `.input-label` | Form label |
| `.badge` | Small pill label |
| `.badge-success` | Green badge |
| `.badge-error` | Red badge |
| `.badge-info` | Blue badge |
| `.badge-warning` | Amber badge |

#### Animation Classes
| Class | Description |
|-------|-------------|
| `.animate-fade-in` | Fade in animation |
| `.animate-slide-in` | Slide in from right |
| `.animate-pulse-soft` | Subtle pulsing |

### Adding a New Page

1. Create page component in `src/pages/`:

```tsx
// src/pages/MyPage.tsx
import React from 'react';

const MyPage: React.FC = () => {
    return (
        <div>
            <h1 className="text-3xl font-bold text-white">My Page</h1>
        </div>
    );
};

export default MyPage;
```

2. Add route in `src/App.tsx`:

```tsx
import MyPage from './pages/MyPage';

// Inside Routes:
<Route path="/my-page" element={
    <ProtectedRoute>
        <MyPage />
    </ProtectedRoute>
} />
```

3. Add navigation in `src/components/Layout.tsx`:

```tsx
const navItems = [
    // ...existing items
    { label: 'My Page', path: '/my-page', icon: SomeIcon },
];
```

### Using Toast Notifications

```tsx
import { useToast } from '../context/ToastContext';

const MyComponent = () => {
    const { showToast } = useToast();
    
    const handleSuccess = () => {
        showToast('Operation successful!', 'success');
    };
    
    const handleError = () => {
        showToast('Something went wrong', 'error');
    };
    
    return <button onClick={handleSuccess}>Click me</button>;
};
```

---

## Database

### Models

**User**
```python
class User(Base):
    id: int
    email: str
    name: str
    is_active: bool
    is_verified: bool
    group_id: int     # FK to Group
    last_login: datetime

class Group(Base):
    id: int
    name: str         # Admin | Instructor | Student
    permissions: List[str]
```

**Class**
```python
class Class(Base):
    id: int
    name: str
    blueprint_id: str
    max_users: int
    passcode: str
    start_date: datetime
    end_date: datetime
    instructor_id: int  # FK to User

**Template**
```python
class Template(Base):
    id: int
    name: str
    description: str
    icon: str
    provider: str     # Proxmox | AWS | Azure | ...
    vm_config: str    # JSON configuration
    is_active: bool
```
```

### Database URL

The database is PostgreSQL in every environment. The URL is read from the
`DATABASE_URL` environment variable (`db/database.py`); if unset, it falls back to
`postgresql://admin:password@localhost:5432/training_portal`.

- **Docker Compose**: `postgresql://admin:password@db:5432/training_portal`
- **Local dev**: `postgresql://admin:password@localhost:5433/training_portal` (the
  `db` container publishes Postgres on host port `5433`)

> The engine still special-cases a `sqlite://` URL, so SQLite works for quick
> throwaway experiments, but it is not a supported configuration and the schema is
> only validated against PostgreSQL.

---

## Authentication

### Flow Options

1. **Azure AD SSO** (Production)
   - User clicks "Sign in with Microsoft"
   - Redirects to Azure login
   - Callback exchanges code for token
   - User synced to database

2. **Local Superadmin** (Development)
   - User clicks "Admin Login"
   - Enters email/password
   - Backend validates against env vars
   - Returns mock token

### Configuration

```env
# Azure AD
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_TENANT_ID=...

# Local Admin
SUPERADMIN_EMAIL=admin@cpdemo.com
SUPERADMIN_PASSWORD=Cpwins!1
```

---

## Proxmox Integration

### Configuration

Proxmox connections are **stored in the database**, not in environment variables.
`services/proxmox_service.py` reads credentials from `InfrastructureConnection` rows
(created via **Settings → Private Cloud** in the UI, or the
`/infrastructure-connections/` API). There is no mock mode — a connection must be
configured for any Proxmox operation to succeed.

Fields captured per connection: host, user (`root@pam`), password/token, and node.
The `proxmoxer` library is used under the hood.

### Available Operations

| Method | Description |
|--------|-------------|
| `get_nodes()` | List cluster nodes |
| `get_vms()` | List all VMs |
| `start_vm(vmid)` | Start a VM |
| `stop_vm(vmid)` | Stop a VM |
| `revert_vm(vmid)` | Revert to snapshot |
| `clone_vm(...)` | Clone a source VM to a new VM |
| `create_pool(poolid)` | Create a new resource pool |
| `delete_pool(poolid)` | Delete a resource pool (recursively) |
| `add_vm_to_pool(...)` | Assign a VM to a pool |

---

## vSphere Integration

### Tech Stack
- **Library**: `pyvmomi`
- **Protocol**: Raw VNC over WebSockets
- **Client Library**: `noVNC`

### Console Proxy Architecture

The vSphere console uses a custom WebSocket proxy to bridge browser clients with ESXi hosts:

1.  **Ticket Acquisition**: Backend requests a `WebMKS` ticket via `vsphere_service.py`.
2.  **noVNC Initialization**: The frontend (`guacamole.py`) serves an HTML5 page with noVNC.
3.  **Relay Service**: Our backend `console_ws.py` handles the bi-directional binary stream, enabling direct console access without SSL/CORS blockers.

---

## Docker Development

### Building Images

```powershell
docker-compose build
```

### Running All Services

```powershell
docker compose up
```

This brings up every service, including **pgAdmin** for visual database management at
[http://localhost:5050](http://localhost:5050) (default `admin@cpdemo.com` / `Cpwins!1`,
configurable via `PGADMIN_EMAIL` / `PGADMIN_PASSWORD`).

### Rebuilding After Changes

```powershell
docker-compose up --build
```

### Viewing Logs

```powershell
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Accessing Database

```powershell
docker-compose exec db psql -U admin -d training_portal
```

---

## Testing

> There is **no automated test suite** yet — the project ships no `pytest` tests and
> the frontend has no `test` script. Static checks and manual verification are the
> current workflow.

### Linting

```powershell
cd frontend
npm run lint
```

### Manual Testing

1. Start the application
2. Login with superadmin credentials
3. Create a test class
4. Verify it appears in the dashboard
5. Test logout/login flow

---

## Deployment

The portal is deployed on a **bare-metal Ubuntu host running [Dokploy](https://dokploy.com/)**
(Traefik ingress + Let's Encrypt TLS). Dokploy builds and runs the `docker-compose.yml`
stack; TLS termination and the public `training.<domain>` hostname are handled by
Traefik, so there is no separate production compose override. The `backend` and
`frontend` services attach to the external `dokploy-network` so Traefik can route to
them. (There is no Azure VM or Terraform in this stack.)

### Production Checklist

- [ ] Set strong `SUPERADMIN_PASSWORD` (and a non-default `SUPERADMIN_EMAIL`)
- [ ] Generate a fresh `GUACAMOLE_SECRET_KEY` (`python -c "import secrets; print(secrets.token_hex(16))"`)
- [ ] Configure real Azure AD credentials (optional — local auth works without them)
- [ ] Configure vSphere/Proxmox connections via **Settings → Private Cloud** in the UI
- [ ] Set `FRONTEND_URL` to the public HTTPS URL (used in emails and OAuth redirects)
- [ ] Restrict `ALLOWED_DOMAINS` to the domains that may self-register
- [ ] Ensure the external `dokploy-network` exists on the host

### Deploy with Docker Compose / Dokploy

```bash
docker compose up -d --build
```

### Environment Variables

All sensitive values should be set via the `.env` file (or Dokploy's environment UI)
and never committed to the repository.
