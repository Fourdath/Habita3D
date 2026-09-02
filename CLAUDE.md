# CLAUDE.md

Guidance for AI coding assistants (and human contributors) working in this repository.

## What this repo is right now

A **bootstrap**. Four services (`frontend`, `backend`, `python-service`, `postgres`) with
official-generator scaffolding, a shared health-check contract, and CI. Most feature folders
are intentionally empty (`.gitkeep` only). Before adding logic to any placeholder folder, check
[DESIGN.md](DESIGN.md)'s "Deferred scope" section — if it's listed there, confirm with the user
before implementing rather than assuming it's expected.

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
- `docs/` — `product/`, `design/`, `architecture/`, `adr/` — currently empty, for future
  documentation.
- `infrastructure/terraform/`, `tests/e2e/` — empty, future work.

## Conventions

- No nested git repositories. `frontend/`, `backend/`, `python-service/` were generated with
  `--no-git` / `--skip-git` equivalents; they must stay part of the single root repo.
- Don't reintroduce `src/assets` in the frontend — the build (`angular.json`) is configured to
  read static assets from `public/`.
- Backend modules other than `health` are empty on purpose. Don't add speculative providers/
  controllers to them without a concrete feature request.
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

- Don't implement the visual design system, Three.js viewer, real authentication, scraping,
  recommendation models, floor-plan processing, Terraform resources, or a CD/deployment
  pipeline — all deliberately deferred (see DESIGN.md).
- Don't add Android/iOS native platforms via `ionic capacitor add` — Capacitor is configured
  but no native platform has been added yet.
- Don't add security-scanning steps to CI — that was explicitly excluded from this bootstrap.
