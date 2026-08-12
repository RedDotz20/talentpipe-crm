# TalentPipe — Multi-Company ATS

Schema-per-company applicant tracking system. Each company gets an isolated PostgreSQL schema for job postings, candidate pipelines, interviews, recruiter collaboration, resume parsing, skill-matching, and rate-limited public application intake.

**Status:** M15 — List Search/Filter/Sort (implemented on top of M14 Job Post Metadata). CI: lint → typecheck → unit → e2e release gates → build.

---

## Features

**Multi-tenancy**
- One PostgreSQL database, **separate schema per company** (`SET search_path TO company_<id>, public`) — physical isolation, no `company_id` columns anywhere
- `companyId` derived from JWT only, request-scoped via `AsyncLocalStorage`

**Auth & RBAC**
- JWT access (15m) + refresh (7d), argon2 password hashing
- Roles: SuperAdmin, CompanyAdmin, Recruiter, HiringManager, Interviewer, Candidate — enforced frontend (route guards) + backend (guards, 403 per role per action)
- Per-user + per-company suspend/reactivate, admin-set passwords, password reset, audit logging

**Recruiting core**
- Job postings CRUD with required skills, publish/close, metadata (employment type, location, work setup)
- Kanban pipeline with drag-and-drop stage moves (dnd-kit) + notes
- Resume storage (S3/MinIO) + manual skill matching with match score on applications
- Interviews scheduling (auto-moves application to Interview stage, server-side interviewer scoping) + 1:1 feedback

**Candidate experience**
- Public careers pages (unauthenticated browse), job search, apply, bookmarks, application history with status stepper + withdraw, profile management
- Shared job detail view for candidates and public careers

**Platform (SuperAdmin)**
- Cross-company companies/users/applications/jobs/interviews management, merged views with search/filter/sort/pagination, company hard-delete (drops schema)

**Ops**
- Redis: sign-in rate limiting (5/15min) + company dashboard cache
- BullMQ notifications queue (stage-change → audit log delivery)
- Backend-driven search/filter/sort/pagination on all 13 list endpoints
- Self-hosted production stack (`docker-compose.prod.yml`) + GitHub Actions CI

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | NestJS 11 (controller → service → repository) |
| ORM / DB | Drizzle ORM + PostgreSQL 16 (drizzle-kit migrations) |
| Frontend | React 19 + Vite 8 + Mantine 9 + TanStack Query 5 + TanStack Router 1 + Zustand 5 |
| Validation | Zod 4 (shared frontend + backend) |
| Infra | Docker Compose: postgres:16 + redis:7-alpine + minio |
| Storage | S3-compatible (MinIO local) |
| Cache/Queue | Redis + BullMQ |

## Requirements

- Docker Desktop (infra: Postgres, Redis, MinIO)
- Node.js 20+ and npm
- Free local ports: `5432` (Postgres), `6379` (Redis), `9000/9001` (MinIO), `3000` (backend), `5173` (frontend)

## Project Structure

```
backend/    NestJS API (auth, company modules, platform, repositories, migrations in drizzle/)
frontend/   Vite + React app (company platform, candidate portal, admin)
docs/       Specs: PRD, architecture, ERD, API reference, data model, implementation guide
docker-compose.yml          Local infra (postgres + redis + minio)
docker-compose.prod.yml     Production stack (backend/frontend/migrate services)
```

## Setup (Quickstart)

> Full step-by-step runbook with checks and troubleshooting: [`docs/00b_LOCAL_DEV_BOOTSTRAP.md`](docs/00b_LOCAL_DEV_BOOTSTRAP.md)

Migrations and the seed are **not** run automatically. On a fresh DB:

```sh
# 1. Start infra (postgres + redis + minio)
docker compose up -d

# 2. Apply the migrations under backend/drizzle/<timestamp>_<name>/migration.sql
#    in chronological order, then the template schema — run via:
#    Get-Content <file> | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
#    (bash: docker exec -i ... psql ... < file.sql)
#    Order: 20260722095156_bright_iron_fist, 20260723191416_fresh_blindfold,
#    20260727163000_smooth_spitfire, 20260803085856_redundant_tyrannus,
#    20260804101500_candidate_profile_redesign, 20260805090000_candidate_application_integrity,
#    20260806191320_superb_king_cobra, 20260807090000_scheduled_at_timezone,
#    20260808090000_platform_user_suspend, 20260808100000_platform_account_cascades

# 3. Apply the company schema template (cloned on every company signup)
Get-Content backend/drizzle/template-schema.sql | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe

# 4. Seed 6 sample accounts (backend/.env must point at local infra)
cd backend && npm install && npm run seed
```

Start the app:

```sh
# Terminal 1 — backend (http://localhost:3000/api)
cd backend && npm run start:dev

# Terminal 2 — frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

### Sample accounts

| Role | Email | Password |
|------|-------|----------|
| SuperAdmin | `superadmin@talentpipe.com` | `SuperAdmin123!` |
| CompanyAdmin (Acme Corp) | `admin@acme.com` | `Admin123!` |
| Interviewer | `interviewer@acme.com` | `Interviewer123!` |
| HiringManager | `hiring.manager@acme.com` | `HiringManager123!` |
| Recruiter | `recruiter@acme.com` | `Recruiter123!` |
| Candidate | `candidate@test.com` | `Candidate123!` |

Login at `http://localhost:5173/auth/signin`. Health check: `curl http://localhost:3000/api/health`.

## Common Commands

```sh
# Backend
cd backend && npm run start:dev   # dev server on :3000
cd backend && npm run typecheck    # tsc --noEmit
cd backend && npm run lint         # eslint --fix
cd backend && npm test             # unit tests (Jest)
cd backend && npm run test:e2e     # e2e release gates (supertest)
cd backend && npm run build        # nest build

# Frontend
cd frontend && npm run dev         # Vite dev server on :5173
cd frontend && npm run build       # tsc -b && vite build
cd frontend && npm run lint        # oxlint
```

> Note: backend lint is **eslint**, frontend lint is **oxlint**, backend tests use **Jest**.

## Documentation

| File | Content |
|------|---------|
| [`docs/00_PROJECT_INSTRUCTIONS.md`](docs/00_PROJECT_INSTRUCTIONS.md) | Canonical spec — product, architecture, API, roles, isolation strategy |
| [`docs/00b_LOCAL_DEV_BOOTSTRAP.md`](docs/00b_LOCAL_DEV_BOOTSTRAP.md) | Local dev runbook — bootstrap, daily loop, schema-change workflow, troubleshooting |
| [`docs/01_TALENTPIPE_PRD_SRS.md`](docs/01_TALENTPIPE_PRD_SRS.md) | Product requirements & software requirements spec |
| [`docs/02_TECHNICAL_OVERVIEW.md`](docs/02_TECHNICAL_OVERVIEW.md) | Architecture decisions, stack rationale |
| [`docs/03_RECRUITMENT_ATS_ARCHITECTURE.md`](docs/03_RECRUITMENT_ATS_ARCHITECTURE.md) | System architecture, modules, data flow |
| [`docs/04_ERD_DIAGRAM.md`](docs/04_ERD_DIAGRAM.md) | Entity-relationship diagram |
| [`docs/05_DATA_ISOLATION_STRATEGY.md`](docs/05_DATA_ISOLATION_STRATEGY.md) | Schema-per-company isolation deep-dive |
| [`docs/06_ROLE_INTERACTIONS.md`](docs/06_ROLE_INTERACTIONS.md) | Role hierarchy & permissions matrix |
| [`docs/07_API_ENDPOINT_DOCUMENTATION.md`](docs/07_API_ENDPOINT_DOCUMENTATION.md) | Full REST API reference |
| [`docs/08_FRONTEND_COMPONENT_STRUCTURE.md`](docs/08_FRONTEND_COMPONENT_STRUCTURE.md) | Frontend component tree & routing |
| [`docs/09_IMPLEMENTATION_GUIDE.md`](docs/09_IMPLEMENTATION_GUIDE.md) | Step-by-step build guide incl. production deploy runbook |
| [`docs/DATA_MODEL_DEFINITION.md`](docs/DATA_MODEL_DEFINITION.md) | Column types, constraints, indexes, enums |

## Production

Self-hosted Docker stack: `docker compose -f docker-compose.prod.yml up -d --build` with secrets from the root `.env` (see `.env.prod.example`). One-shot `migrate` service applies migrations at deploy. Full runbook: `docs/09_IMPLEMENTATION_GUIDE.md` Phase 10.
