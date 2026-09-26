# CLAUDE.md

Guidance for AI coding assistants (and human contributors) working in this repository.

## What this repo is right now

Four services (`frontend`, `backend`, `python-service`, `postgres`) with a working 3D viewer,
an initial Prisma-backed project API, and preliminary staging infrastructure. Several feature
folders are placeholders. See [DESIGN.md](DESIGN.md) for the current implementation state and
the [EP1 architecture](docs/architecture/overview.md) for planned integrations.

## Repository structure

- `frontend/` — Ionic + Angular standalone + Capacitor, npm. Angular 22, Ionic Angular 9,
  Capacitor 8. Static assets live in `public/` (Angular's `public` asset convention), not
  `src/assets`.
- `backend/` — NestJS, TypeScript strict mode, one module per bounded context under
  `src/modules/`. Uses vitest (not Jest) and oxlint (not ESLint) — both are the NestJS CLI's
  current defaults.
- `python-service/` — FastAPI, routers under `app/api/`, domain services under
  `app/services/*`. Uses `requirements.txt` (runtime) / `requirements-dev.txt` (adds pytest,
  httpx, ruff) rather than a build backend, since this is an app, not a published package.
- `docs/` — architecture diagrams, initial data model, ADR and design notes.
- `infrastructure/terraform/` — isolated local staging plan; `tests/e2e/` is still pending.

## Conventions

- No nested git repositories. `frontend/`, `backend/`, `python-service/` were generated with
  `--no-git` / `--skip-git` equivalents; they must stay part of the single root repo.
- Don't reintroduce `src/assets` in the frontend — the build (`angular.json`) is configured to
  read static assets from `public/`.
- `health` and `projects` contain working backend controllers. Other modules remain placeholders.
- Global API prefix for the backend is `api` (set in `src/main.ts`), so routes are exposed as
  `/api/<module>`, matching `GET /api/health`.
- The FastAPI service exposes routes without an `/api` prefix (`GET /health`), matching how it's
  proxied/consumed today. Don't add a prefix without checking how the frontend/backend call it.

## Commands

```sh
# Frontend
cd frontend && npm run lint && npm test -- --configuration=ci && npm run build

# Backend
cd backend && npm run lint && npm test && npm run build

# Python service
cd python-service && ruff check . && pytest

# Whole stack
docker compose config   # validate compose file
docker compose up --build
```

## What NOT to do without explicit instruction

- Keep new feature work aligned with the project requirements and the user request. The
  Terraform staging plan is part of EP1; `apply` and automatic deployment are later steps.
- Don't add Android/iOS native platforms via `ionic capacitor add` — Capacitor is configured
  but no native platform has been added yet.
- CI security controls are required by the course project, although they remain incomplete.
