# Training Portal

A hands-on lab portal that provisions isolated, multi-VM student environments on VMware vSphere and Proxmox VE, with zero-install browser console access through Apache Guacamole.

<p align="left">
  <img src="https://img.shields.io/badge/FastAPI-005571?style=flat&logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/React_19-20232A?style=flat&logo=react&logoColor=61DAFB" alt="React 19"/>
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Guacamole-529433?style=flat&logo=apache&logoColor=white" alt="Apache Guacamole"/>
  <img src="https://img.shields.io/badge/Docker-2CA5E0?style=flat&logo=docker&logoColor=white" alt="Docker"/>
</p>

Part of the [Dev Hub](https://github.com/alshawwaf/dev-hub) ecosystem — deploy the whole suite with [ubuntu-dokploy-ai](https://github.com/alshawwaf/ubuntu-dokploy-ai).

---

## Overview

Training Portal lets an instructor define a lab as a reusable **template** (a set of VMs with a network topology) and then spin up a per-student copy of that lab for a scheduled **class**. Each student gets an isolated environment they can reach entirely from the browser — no VPN, RDP client, or VNC viewer to install.

The backend talks to the hypervisor directly (pyVmomi for vSphere, proxmoxer for Proxmox), clones the source VMs, wires up isolated networks (VLAN-backed port groups on vSphere, Linux bridges on Proxmox), and hands out console sessions through Apache Guacamole. A scheduler advances classes through their lifecycle (Draft → Upcoming → Active → Completed) and provisions or tears down environments on time.

Provider credentials, SMTP, and Azure AD are configured from the **Settings** UI and stored in the database, so the stack runs without editing environment files after the first boot.

## Features

- **Multi-hypervisor provisioning** — VMware vSphere (linked or full clones) and Proxmox VE (full clones) from the same template model.
- **Visual network designer** — drag-and-drop topology editor (React Flow) that creates isolated networks: VLAN-backed distributed port groups on vSphere, VLAN bridges on Proxmox.
- **Per-NIC control** — adapter type (VMXNET3 / VirtIO / E1000), MAC, MTU, rate limit, queues, link state, and firewall flags per virtual NIC.
- **Class lifecycle automation** — scheduled classes auto-advance through Draft → Upcoming → Active → Completed; parallel or sequential provisioning, spare environments, and per-class datastore selection.
- **Browser console access** — HTML5 RDP / SSH / VNC through Apache Guacamole (JSON auth), plus a WebMKS/noVNC WebSocket relay for the native vSphere console.
- **Authentication & RBAC** — Azure AD SSO (MSAL) or local accounts, self-registration with email verification and domain allow-listing, role/permission groups (Admin / Instructor / Student), and guest join via class passcode.
- **Student workspace** — self-service power on/off, one-click console, and downloadable RDP/SSH connection files.
- **Admin tooling** — user management, infrastructure explorer, action + application logs, notification events, and a Settings UI for every provider and SMTP.

## Screenshots

_Screenshots to be added._

## Quick start

Requires Docker and Docker Compose.

```bash
git clone https://github.com/alshawwaf/training-portal.git
cd training-portal

cp .env.example .env
# Edit .env — at minimum set GUACAMOLE_SECRET_KEY, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD
# Generate a secret: python -c "import secrets; print(secrets.token_hex(16))"

docker compose up --build -d
```

| Service | URL | Notes |
|:--------|:----|:------|
| Portal UI | http://localhost:9090 | Log in with `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (default `admin@cpdemo.com` / `Cpwins!1`) |
| Backend API + Swagger | http://localhost:8000/docs | FastAPI OpenAPI docs |
| Apache Guacamole | http://localhost:8085/guacamole | Console broker (JSON auth) |
| pgAdmin | http://localhost:5050 | DB admin (`PGADMIN_EMAIL` / `PGADMIN_PASSWORD`) |
| PostgreSQL | localhost:5433 | Published from the `db` container |

> The `backend` and `frontend` services attach to the external `dokploy-network`. If you are running the stack outside Dokploy, create it once with `docker network create dokploy-network`.

### Development mode

Run the services directly for hot reload (point `DATABASE_URL` at a local Postgres, or start just the `db` container with `docker compose up -d db`):

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload            # http://localhost:8000/docs

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                          # http://localhost:9090 (proxies /api and /auth to the backend)
```

## Deployment

Training Portal deploys automatically as part of the Dev Hub suite via [ubuntu-dokploy-ai](https://github.com/alshawwaf/ubuntu-dokploy-ai) and is served at **training.\<your-domain\>**. Dokploy builds and runs `docker-compose.yml`; Traefik handles ingress and Let's Encrypt TLS, and the `backend` / `frontend` services join the external `dokploy-network` so Traefik can route to them. There is no separate production compose override.

Before going live: set a strong `SUPERADMIN_PASSWORD`, generate a fresh `GUACAMOLE_SECRET_KEY`, set `FRONTEND_URL` to the public HTTPS URL, and restrict `ALLOWED_DOMAINS`. See [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) for the full production checklist.

## Configuration

Values are read from `.env` (see [`.env.example`](.env.example)). Most infrastructure and SMTP settings can instead be managed from **Settings** in the UI and are persisted in the database.

| Variable | Required | Default | Description |
|:---------|:--------:|:--------|:------------|
| `DATABASE_URL` | yes | `postgresql://admin:password@db:5432/training_portal` | PostgreSQL connection string |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | — | `admin` / `password` / `training_portal` | Compose-level Postgres credentials |
| `SUPERADMIN_EMAIL` | yes | `admin@cpdemo.com` | Seed admin account (created on first boot) |
| `SUPERADMIN_PASSWORD` | yes | `Cpwins!1` | Seed admin password — **change in production** |
| `FRONTEND_URL` | yes | `http://localhost:9090` | Base URL used in emails and OAuth redirects |
| `GUACAMOLE_SECRET_KEY` | yes | — | Guacamole JSON-auth secret; must match the `guacamole` service |
| `GUACAMOLE_URL` | no | `http://guacamole:8080/guacamole` | Internal Guacamole URL (backend → broker) |
| `GUACAMOLE_EXTERNAL_URL` | no | `http://localhost:8085/guacamole` | Browser-facing Guacamole URL |
| `ALLOWED_DOMAINS` | no | `example.com` | Comma-separated email domains allowed to self-register |
| `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` | no | — | Azure AD SSO (leave empty for local auth only) |
| `VSPHERE_HOST` / `VSPHERE_USER` / `VSPHERE_PASSWORD` / `VSPHERE_PORT` / `VSPHERE_VERIFY_SSL` | no | — / `administrator@vsphere.local` / — / `443` / `false` | vSphere fallback (prefer the UI) |
| `PROXMOX_HOST` / `PROXMOX_USER` / `PROXMOX_PASSWORD` / `PROXMOX_NODE` | no | — / `root@pam` / — / — | Proxmox fallback (prefer the UI) |
| `LOG_LEVEL` | no | `INFO` | Backend log level |
| `PROVISIONING_MODE` | no | `parallel` | `parallel` or `sequential` VM provisioning |
| `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` | no | `admin@cpdemo.com` / `Cpwins!1` | pgAdmin login |

> SMTP/email and Proxmox/vSphere connections are best configured from **Settings** in the UI rather than via environment variables.

## Architecture

```
Browser ──► Frontend (React 19 / Vite, :9090)
                │  proxies /api and /auth
                ▼
            Backend (FastAPI, :8000) ──► PostgreSQL (:5432)
                │            │
                │            ├─ APScheduler  (class lifecycle)
                │            ├─ pyVmomi      ──► VMware vSphere
                │            └─ proxmoxer    ──► Proxmox VE
                │
                └─► Guacamole (:8080) ──► guacd ──► RDP / SSH / VNC to student VMs
```

Compose services: `db` (postgres:15-alpine), `pgadmin`, `backend`, `frontend`, `guacd`, and `guacamole`. The database schema is created on first boot (`Base.metadata.create_all`) with additive, idempotent column migrations run at startup; there is no Alembic pipeline.

## Tech stack

| Layer | Technologies |
|:------|:-------------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 3, React Router 7, React Flow (`@xyflow/react`), Axios, Lucide icons |
| Backend | FastAPI, SQLAlchemy, Pydantic, APScheduler, bcrypt / python-jose, MSAL (Azure AD), fastapi-mail |
| Infrastructure | pyVmomi (vSphere), proxmoxer (Proxmox VE), Apache Guacamole (guacd + JSON auth), WebMKS/noVNC |
| Data | PostgreSQL 15, pgAdmin |
| Runtime | Docker Compose, Dokploy + Traefik (production) |

## Development

```bash
cd frontend && npm run lint      # ESLint
cd frontend && npm run build     # type-check (tsc -b) + production build
```

There is no automated test suite yet; validation is manual. Backend logs are written to `backend/logs/` (`app.log`, rotating). For architecture details, adding routers/pages, and the production checklist, see [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md).
