# Habita3D

Monorepo bootstrap for Habita3D: an Ionic/Angular frontend, a NestJS backend, a FastAPI
specialized service, and PostgreSQL, orchestrated with Docker Compose.

This repository is currently a **bootstrap**: project skeletons, tooling, and a minimal
health-check contract between services. Feature work (visual design, 3D viewer, real auth,
scraping, recommendations, floor-plan processing, infrastructure/deployment) is intentionally
not implemented yet — see [DESIGN.md](DESIGN.md) for what is deferred and why.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Ionic + Angular (standalone) + TypeScript + Capacitor |
| Backend | NestJS (TypeScript, strict mode) |
| Specialized service | FastAPI (Python) |
| Database | PostgreSQL (via Docker Compose) |

## Repository layout

```
frontend/            Ionic + Angular standalone app (Capacitor-enabled)
  src/app/core/       Singleton services, guards, interceptors (future work)
  src/app/shared/      Reusable components/pipes/directives (future work)
  src/app/features/   Feature modules: landing, auth, projects, viewer-3d, materials, recommendations
  public/assets/      Static assets, incl. models/demo for the future 3D viewer
backend/             NestJS API
  src/modules/        auth, users, projects, scenes, materials, recommendations, health
  database/           Migrations/seeds (future work)
  test/               e2e tests
python-service/      FastAPI specialized service
  app/api/            HTTP routers (health implemented; others future work)
  app/services/       scraping, recommendation, plan-processing (future work)
  tests/              pytest suite
docs/                product, design, architecture, adr
infrastructure/      terraform (future work)
tests/e2e            cross-service end-to-end tests (future work)
.github/workflows/   CI
```

## Prerequisites

- Node.js 24.20.0 (see `.nvmrc`) and npm 11+
- Python 3.14
- Docker Desktop / Docker Compose

## Getting started

Copy the environment template:

```sh
cp .env.example .env
```

### Run everything with Docker Compose

```sh
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:3000/api/health
- Python service: http://localhost:8000/health
- PostgreSQL: localhost:5432

### Run services individually (local dev)

```sh
# Frontend
cd frontend && npm ci && npm start

# Backend
cd backend && npm ci && npm run start:dev

# Python service
cd python-service
python -m venv .venv && . .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

## Testing

```sh
cd frontend && npm run lint && npm test && npm run build
cd backend && npm run lint && npm test && npm run build
cd python-service && ruff check . && pytest
```

CI (`.github/workflows/ci.yml`) runs the same install/lint/test/build steps for each service
on every push and pull request.

## Health checks

- NestJS: `GET /api/health` → `{ "status": "ok", "timestamp": "<ISO-8601>" }`
- FastAPI: `GET /health` → `{ "status": "ok", "timestamp": "<ISO-8601>" }`

## Further reading

- [DESIGN.md](DESIGN.md) — architecture overview and deferred scope
- [CLAUDE.md](CLAUDE.md) — guidance for AI coding assistants working in this repo
