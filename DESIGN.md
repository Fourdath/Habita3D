# DESIGN

## Purpose

Habita3D helps users visualize interior/architectural projects in 3D, explore materials, and
get recommendations. The current design, deployment zones, data model and ADR are documented
in [docs/architecture/overview.md](docs/architecture/overview.md).

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
per bounded context. `health` and `projects` have controllers and services; `projects` persists
to PostgreSQL through Prisma. Authentication and the remaining domains are placeholders.

## Frontend feature boundaries

`src/app/features/{landing,auth,projects,viewer-3d,materials,recommendations}` mirror the
backend's bounded contexts. `landing` and `viewer-3d` are navigable; `core/` contains the
floor-plan, construction, material and budget logic. API services, guards and the other
feature pages remain pending.

## Deferred scope (deliberate, not oversight)

The following areas are still pending in the current implementation:

- **Visual design system** — no UI/branding has been applied; pages use framework defaults.
- **Full mobile 3D walkthrough** — the overview works on touch devices; first-person movement still uses keyboard and mouse.
- **Authentication** — `features/auth` (frontend) and `modules/auth` (backend) are empty; no
  session/token strategy has been chosen yet.
- **Scraping** — `python-service/app/services/scraping` is a placeholder.
- **Recommendations** — both `modules/recommendations` (backend) and
  `app/services/recommendation` (python-service) are placeholders; no model or ranking logic exists.
- **Floor-plan processing in Python** — `app/services/plan-processing` is a placeholder; the Angular viewer already parses SVG plans locally.
- **Deployment** — [Terraform](infrastructure/terraform/README.md) defines a local EP1 staging plan and CI validates it. No `apply`, remote provider or CD/release pipeline exists yet.
- **End-to-end tests** — `tests/e2e` is empty; will be populated once there is a UI worth
  driving end-to-end.

## Why FastAPI is a separate service rather than a NestJS module

Scraping, recommendation, and plan-processing workloads are expected to lean on Python's data/ML
ecosystem, which is a poor fit for the NestJS/TypeScript runtime. Keeping them as a separate
service avoids forcing that ecosystem into the Node process and keeps the backend's dependency
graph focused on core domain/API concerns.

## Data flow contract (current)

Both backend services expose a health endpoint with this response shape:

```json
{ "status": "ok", "timestamp": "2026-09-01T00:00:00.000Z" }
```
