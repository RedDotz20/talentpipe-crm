# TalentPipe — Multi-Tenant ATS

**One-liner:** Schema-per-tenant applicant tracking system. Each company gets an isolated PostgreSQL schema for job postings, candidate pipelines, interviews, recruiter collaboration, resume parsing, skill-matching, and rate-limited public application intake.

**Status:** M6 (Redis rate limiting + tenant dashboard cache) — implemented; final review fixes are being applied on the current branch.

---

## Stack

| Layer | Choice |
|-------|--------|
| Backend | NestJS 11 — controller → service → repository |
| ORM | Drizzle ORM (drizzle-orm rc4), PostgreSQL 16 |
| DB toolkit | `drizzle-kit` (rc4) for migrations |
| Frontend | React 19 + Vite 8 + Mantine 9 + TanStack Query 5 + TanStack Router 1 + dnd-kit + Zustand 5 |
| Validation | Zod 4 (shared frontend + backend) |
| Infra | Docker Compose (postgres:16 + redis:7-alpine + minio/minio) |
| Auth | JWT access (15m) + refresh (7d), argon2 password hashing |
| Multi-tenancy | One PostgreSQL database, **separate schema per tenant** (`SET search_path TO tenant_<id>, public`) |
| Storage | S3-compatible (MinIO local) |
| Cache/Queue/Rate-limit | Redis (limiter + dashboard cache; BullMQ deferred) |

## Current State

- **Backend:** Auth, schema-per-tenant repositories, candidate accounts, public careers, applications/pipeline, Redis sign-in limiting, and tenant dashboard cache. Health endpoint at `GET /api/health`.
- **Frontend:** Vite/Mantine application with organization and candidate platforms, candidate job search/apply/bookmarks/profile flows, and the organization dashboard summary.
- **Not yet built:** BullMQ, interviews, platform administration, and CI. Anonymous apply remains out of scope.

## Commands

```sh
# Backend
cd backend && npm run start:dev    # Dev server on :3000 (api prefix)
cd backend && npm run typecheck     # tsc --noEmit
cd backend && npm run lint          # eslint --fix
cd backend && npm test              # Jest (unit tests)
cd backend && npm run test:e2e      # Jest (e2e tests)
cd backend && npm run build         # nest build (ts compile)
cd backend && npm run format        # prettier --write

# Frontend
cd frontend && npm run dev          # Vite dev server on :5173
cd frontend && npm run build        # tsc -b && vite build
cd frontend && npm run lint         # oxlint (not eslint)

# Infrastructure
docker compose up -d                # Start postgres:16 + redis:7 + minio
```

**Important:** `npm run lint` on backend runs **eslint** (tsc check is separate via `typecheck`). Frontend uses **oxlint** (not eslint). Backend uses **Jest** (not Vitest).

## First-time bootstrap (or after `docker compose down -v`)

Migrations and the seed are **not** run automatically. On a fresh DB you must, in order:

1. `docker compose up -d` (wait for postgres to be ready)
2. Apply the six migrations under `backend/drizzle/*/migration.sql` chronologically via `psql` (see `docs/00b_LOCAL_DEV_BOOTSTRAP.md` for the exact one-liners)
3. Apply `backend/drizzle/template-schema.sql`
4. `cd backend && npm run seed` (creates the 3 sample accounts)

Without steps 2–4 you'll get `relation "..." does not exist` on the first login. Full runbook with checks after each step: `docs/00b_LOCAL_DEV_BOOTSTRAP.md`.

Applied migration order includes:
```text
20260722095156_bright_iron_fist
20260723191416_fresh_blindfold
20260727163000_smooth_spitfire
20260803085856_redundant_tyrannus
20260804101500_candidate_profile_redesign
20260805090000_candidate_application_integrity
```

## Architecture

### Multi-Tenancy (schema-per-tenant)

- `tenantId` from **JWT only** — never from body/params/headers
- Request-scoped via `AsyncLocalStorage` in `TenantContextInterceptor` (app-global)
- Drizzle client created per-request with `SET search_path TO tenant_<id>, public` via `DrizzleSchemaService`
- **No `tenant_id` columns** on any tenant-scoped table — schema boundary is the filter
- Cross-tenant resource reference → **404 Not Found** (never 403)
- SuperAdmin operates in `public` schema with unscoped repos, guarded by `requireRole('SuperAdmin')`
- Repos use `forCurrentTenant()` (tenant-scoped) or `forPublic()` (global/public tables)
- Important: `forCurrentTenant()` throws if no tenant context. `forPublic()` and `forSchema(name)` don't need one.

### Schema Layout

Tables split across two groups:
- **Public schema:** `tenants`, `skills`, `audit_logs`, `user_emails`, `refresh_tokens`
- **Per-tenant schema (created on signup):** `users`, `job_postings`, `candidates`, `pipeline_stages`, `applications`, `resumes`, `resume_skills`, `job_required_skills`, `interviews`, `interview_feedbacks`, `notes`

Template schema `template` is created by `drizzle/template-schema.sql`. Signup clones it.

### Backend Structure

```
backend/src/
  app.module.ts           — imports AuthModule, registers TenantContextInterceptor + RolesGuard globally
  main.ts                 — CORS (localhost:5173), global prefix api, listen :3000
  database/
    schema.ts             — all Drizzle table definitions (public + tenant)
    drizzle.provider.ts   — Pool provider (pg)
    drizzle-schema.service.ts — forCurrentTenant() / forPublic() / forSchema()
  interceptors/
    tenant-context.ts     — AsyncLocalStorage, getTenantId(), getSchema(), getCurrentUser()
    tenant-context.interceptor.ts — sets context from JWT user
  repositories/           — one per entity, currently: tenant.repository.ts, user.repository.ts
  shared/                 — password.ts (argon2), roles.guard.ts, roles.decorator.ts
  modules/
    auth/                 — controller, service, jwt.strategy, module
    health/               — health controller
```

### Frontend Structure

```
frontend/src/
  app/                    — router.tsx (TanStack Router), AppShell.tsx, providers.tsx
  features/
    auth/                 — LoginPage.tsx, SignupPage.tsx
    admin/, candidates/, dashboard/, interviews/, job-postings/,
    pipeline/, platform/, public-careers/, resumes/  (scaffolded, empty)
  shared/
    api/useAuth.ts        — Zustand auth store with localStorage persistence
    components/, hooks/, types/, utils/  (scaffolded, empty)
```

### Database Connection

- `Pool` from `pg` — single pool for all tenants, schema routing per-connection via `SET search_path`
- Each DB operation acquires a client from pool, sets `search_path`, then releases
- `DATABASE_URL=postgres://devuser:devpassword@localhost:5432/talentpipe` (dev .env committed)

### Key Conventions

- **One milestone per prompt** — never build ahead of the milestone plan
- **All DB via repositories** — no direct Drizzle client outside `repositories/`
- **Error shape:** `{ "error": { "code": "...", "message": "..." } }` — codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`
- **Interview feedback** is a separate `interview_feedbacks` table (1:1 with interviews), not a field
- **Skill matching** is keyword/taxonomy in v1
- **Commit tags:** `feat(m1): topic`
- **Frontend can lag backend** by one milestone (for API validation speed)
- Backend 403 test per role per protected action; frontend RoleGuard + backend guard both present

## Build Order

| M | Name | Done when |
|---|------|-----------|
| M0 | Scaffold | NestJS + Vite boot, Docker Compose up |
| M1 | Auth + Tenancy + RBAC | Signup creates tenant schema, isolation tests pass |
| M2 | Job Postings + Candidates | CRUD via API |
| M3 | Pipeline (Kanban) | Drag stage move end-to-end (dnd-kit) |
| M4 | Resume + Skill Match | Match score computed on apply |
| M5 | Public Careers + Apply | Unauthenticated browse + apply |
| M6 | Redis (rate-limit + cache) | 429 on public apply, dashboard cache |
| M7 | BullMQ background jobs | Async resume parsing + notifications |
| M8 | Interviews + Feedback | Schedule + submit feedback |
| M9 | Admin + Platform + CI | OrgAdmin UI, platform views, CI green |
| M10 | Deploy | Live URL, prod config |

## Documentation Index

| # | File | Content | Agent Use |
|---|------|---------|-----------|
| 00 | `docs/00_PROJECT_INSTRUCTIONS.md` | **Canonical spec** — consolidates all 8 source docs into one single-source-of-truth | Read first when starting a new milestone. Overrides any contradiction in 01–09. |
| 00b | `docs/00b_LOCAL_DEV_BOOTSTRAP.md` | **Local dev runbook** — docker up → migrations → template schema → seed → start backend/frontend → login. Includes checks after each step, daily loop, nuke-and-restart, and troubleshooting table. | Read first when you haven't run the project in a while, after `docker compose down -v`, or when something is broken and you forgot the sequence. |
| 01 | `docs/01_TALENTPIPE_PRD_SRS.md` | Product requirements & software requirements spec | Understand feature scope, user stories, and acceptance criteria for a given milestone. |
| 02 | `docs/02_TECHNICAL_OVERVIEW.md` | High-level architecture decisions, stack rationale | Context on *why* specific tech was chosen (NestJS, Drizzle, schema-per-tenant, etc.). |
| 03 | `docs/03_RECRUITMENT_ATS_ARCHITECTURE.md` | System architecture — modules, data flow, integration points | Reference when wiring cross-module interactions (e.g., apply → resume parsing → pipeline). |
| 04 | `docs/04_ERD_DIAGRAM.md` | Entity-relationship diagram (Mermaid) | Consult before creating or modifying any Drizzle table definition. |
| 05 | `docs/05_DATA_ISOLATION_STRATEGY.md` | Schema-per-tenant isolation deep-dive | Debug multi-tenancy issues, understand search_path mechanics, verify isolation correctness. |
| 06 | `docs/06_ROLE_INTERACTIONS.md` | Role hierarchy, permissions matrix, guard logic | Implement or audit RBAC guards, role decorators, and permission checks. |
| 07 | `docs/07_API_ENDPOINT_DOCUMENTATION.md` | Full REST API reference — routes, DTOs, responses, status codes | Build or test API endpoints. Canonical reference for request/response shapes. |
| 08 | `docs/08_FRONTEND_COMPONENT_STRUCTURE.md` | React component tree, routing, state management | Build frontend features — component hierarchy, data-fetching patterns, route design. |
| 09 | `docs/09_IMPLEMENTATION_GUID.md` | Step-by-step build guide, migration patterns, testing strategy | Follow during implementation — contains concrete build steps, testing checklists, and common gotchas. |
| — | `docs/DATA_MODEL_DEFINITION.md` | Extended data model — column types, constraints, indexes, enums | Reference for precise column definitions beyond the ERD (e.g., varchar lengths, default values, unique constraints). |

## Testing

- **Unit tests:** Jest (backend), located as `*.spec.ts` alongside source files
- **E2E tests:** Jest with supertest (backend), located in `backend/test/`
- **Test pattern:** `backend/src/**/*.spec.ts` — transform via `ts-jest`
- **Backend jest config** is inline in `package.json` (rootDir: src, testRegex: `.*\.spec\.ts$`)

## Testing Quirks

- Backend uses `supertest` (v7) for HTTP assertions
- Tests currently minimal (only health controller spec + default app e2e spec)
- No integration tests tenant isolation yet
- No CI pipeline configured yet (no .github/workflows)
- Docker daemon needed for integration tests hitting real postgres
