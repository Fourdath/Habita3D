# DESIGN

## Purpose

Habita3D helps users visualize interior/architectural projects in 3D, explore materials, and
get recommendations. This document describes the current (bootstrap) architecture and the
scope intentionally deferred beyond it.

## Architecture overview

```
┌────────────┐     HTTP      ┌────────────┐     HTTP      ┌──────────────────┐
│  frontend  │ ─────────────▶│  backend   │──────────────▶│  python-service   │
│ Ionic/     │               │  NestJS    │               │  FastAPI          │
│ Angular +  │               │  (modular) │               │ (scraping, reco,  │
│ Capacitor  │               │            │               │  plan-processing) │
└────────────┘               └─────┬──────┘               └──────────────────┘
                                    │
                                    ▼
                              ┌────────────┐
                              │ PostgreSQL │
                              └────────────┘
```

- **frontend** is the Ionic/Angular client, Capacitor-ready for a future native shell.
- **backend** (NestJS) owns core domain logic and is the frontend's primary API.
- **python-service** (FastAPI) is a specialized service for tasks better suited to Python's
  ecosystem: scraping, recommendation models, and floor-plan processing.
- **postgres** is the system of record, reachable from the backend today.

## Module boundaries (backend)

`src/modules/{auth,users,projects,scenes,materials,recommendations,health}` — one Nest module
per bounded context. Only `health` has real logic today; the rest are empty module shells so
the dependency graph and folder conventions are established before feature work begins.

## Frontend feature boundaries

`src/app/features/{landing,auth,projects,viewer-3d,materials,recommendations}` mirror the
backend's bounded contexts. `core/` will hold singleton services, route guards, and HTTP
interceptors; `shared/` will hold reusable, presentation-only building blocks. Both are empty
placeholders for now.

## Deferred scope (deliberate, not oversight)

The following are out of scope for this bootstrap and are tracked as future work:

- **Visual design system** — no UI/branding has been applied; pages use framework defaults.
- **3D viewer (Three.js)** — `features/viewer-3d` and `public/assets/models/demo` are placeholders.
- **Authentication** — `features/auth` (frontend) and `modules/auth` (backend) are empty; no
  session/token strategy has been chosen yet.
- **Scraping** — `python-service/app/services/scraping` is a placeholder.
- **Recommendations** — both `modules/recommendations` (backend) and
  `app/services/recommendation` (python-service) are placeholders; no model or ranking logic exists.
- **Floor-plan processing** — `app/services/plan-processing` is a placeholder.
- **Infrastructure/Terraform** — `infrastructure/terraform` is empty; no cloud provider or
  environment topology has been decided.
- **Deployment** — CI currently only installs, lints, tests, and builds; there is no CD/release
  pipeline.
- **End-to-end tests** — `tests/e2e` is empty; will be populated once there is a UI worth
  driving end-to-end.

## Why FastAPI is a separate service rather than a NestJS module

Scraping, recommendation, and plan-processing workloads are expected to lean on Python's data/ML
ecosystem, which is a poor fit for the NestJS/TypeScript runtime. Keeping them as a separate
service avoids forcing that ecosystem into the Node process and keeps the backend's dependency
graph focused on core domain/API concerns.

## Data flow contract (current)

Today the only real contract is the health check, mirrored across both backend services so
orchestration (Docker Compose, future readiness probes) has a consistent shape:

```json
{ "status": "ok", "timestamp": "2026-09-01T00:00:00.000Z" }
```
