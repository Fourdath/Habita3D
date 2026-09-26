# Habita3D

Habita3D helps clients explore a home in 3D, compare finishes and estimate a budget.
The repository contains an Ionic/Angular viewer prototype, a NestJS API backed by
PostgreSQL, a FastAPI service, and separate development and preliminary staging
infrastructure. The viewer and budget use demonstration data; web-sourced prices,
recommendations and the integrated request flow are still in development.

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
  src/app/core/       Floor-plan, material, construction and budget logic
  src/app/shared/      Reusable components/pipes/directives (future work)
  src/app/features/   Feature modules: landing, auth, projects, viewer-3d, materials, recommendations
  public/assets/      Static plans, textures and models for the 3D viewer
backend/             NestJS API
  src/modules/        auth, users, projects, scenes, materials, recommendations, health
  prisma/             Project model and initial migration
  test/               e2e tests
python-service/      FastAPI specialized service
  app/api/            HTTP routers (health implemented; others future work)
  app/services/       scraping, recommendation, plan-processing (future work)
  tests/              pytest suite
docs/                Architecture, initial data model, ADR and design notes
infrastructure/      Terraform definition of an isolated local staging environment
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

### Run the development stack with Docker Compose

This is the intended full-stack command. The current backend Dockerfile still needs Prisma
client generation and migration handling before the API container can run successfully;
frontend, Python and PostgreSQL can be started while that work is completed.

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

CI (`.github/workflows/ci.yml`) runs install/lint/test/build steps for each service and
also checks the staging Terraform format, initialization, validation and plan.

## Architecture and preliminary staging

- [Architecture, container and deployment diagrams](docs/architecture/overview.md)
- [Initial data model](docs/architecture/data-model.md)
- [Architecture decisions](docs/adr/0001-staging-local-con-terraform.md)
- [Terraform staging guide](infrastructure/terraform/README.md)

Development runs with Docker Compose. The EP1 staging configuration is independent and
plans four containers, three networks and a persistent PostgreSQL volume on a local Docker
host. The Terraform plan is verified; `terraform apply` has not been performed. Before an
application deployment, the backend image still needs Prisma client generation and
migration execution, and the frontend–NestJS–FastAPI integration must be completed.

## Health checks

- NestJS: `GET /api/health` → `{ "status": "ok", "timestamp": "<ISO-8601>" }`
- FastAPI: `GET /health` → `{ "status": "ok", "timestamp": "<ISO-8601>" }`

## Further reading

- [DESIGN.md](DESIGN.md) — architecture overview and current limits
- [CLAUDE.md](CLAUDE.md) — guidance for AI coding assistants working in this repo
