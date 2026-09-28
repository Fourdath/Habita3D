# CLAUDE.md

Guidance for AI coding assistants (and human contributors) working in this repository.

## What this repo is right now

Four services (`frontend`, `backend`, `python-service`, `postgres`) with a working 3D viewer,
an integrated demonstration preview through Angular, NestJS, FastAPI and PostgreSQL, basic
API authentication, and preliminary staging infrastructure. Several feature folders remain
placeholders. See [DESIGN.md](DESIGN.md), the [EP1 architecture](docs/architecture/overview.md)
and the [EP1 demo](docs/ep1-demo.md) for the current implementation and its limits.

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
- `infrastructure/terraform/` — isolated local staging plan; `scripts/ep1-smoke.sh` verifies
  a cross-service flow under Compose. Browser-driven end-to-end tests remain pending.

## Conventions

- No nested git repositories. `frontend/`, `backend/`, `python-service/` were generated with
  `--no-git` / `--skip-git` equivalents; they must stay part of the single root repo.
- Don't reintroduce `src/assets` in the frontend — the build (`angular.json`) is configured to
  read static assets from `public/`.
- `health`, `projects` and `auth` contain working backend controllers. Projects are still public;
  authentication does not yet authorize project ownership. Other modules remain placeholders.
- Global API prefix for the backend is `api` (set in `src/main.ts`), so routes are exposed as
  `/api/<module>`, matching `GET /api/health`.
- The FastAPI service exposes routes without an `/api` prefix (`GET /health`,
  `POST /recommendations/compare`). NestJS consumes the comparison via `PYTHON_SERVICE_URL`.
  Don't add a prefix without checking that contract.
- The preview and 3D budget use demo figures, not current web prices or availability. Keep
  this distinction visible in API responses and UI copy.

## Commands

```sh
# Frontend
(cd frontend && npm run lint && npm test -- --configuration=ci && npm run build)

# Backend
(cd backend && DATABASE_URL='postgresql://demo:demo@localhost:5432/demo' npx prisma generate && npm run lint && npm test && npm run build)

# Python service
(cd python-service && ruff check . && pytest)

# Whole stack
docker compose config   # validate compose file
docker compose up --build -d --wait --wait-timeout 180
bash scripts/ep1-smoke.sh
```

## What NOT to do without explicit instruction

- Keep new feature work aligned with the project requirements and the user request. The
  Terraform staging plan is part of EP1; `apply` and automatic deployment are later steps.
- Don't add Android/iOS native platforms via `ionic capacitor add` — Capacitor is configured
  but no native platform has been added yet.
- CI checks builds, tests, dependency audits, secret scanning, Compose integration and Terraform
  planning. Branch protection and required checks are managed in GitHub settings, not in this repo.
