# TalentPipe — Multi-Company ATS

**One-liner:** Schema-per-company applicant tracking system. Each company gets an isolated PostgreSQL schema for job postings, candidate pipelines, interviews, recruiter collaboration, resume parsing, skill-matching, and rate-limited public application intake.

**Status:** M18 (Permission Management) — implemented on top of M18 (Landing Page + Public Jobs).

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
| Multi-tenancy | One PostgreSQL database, **separate schema per company** (`SET search_path TO company_<id>, public`) |
| Storage | S3-compatible (MinIO local) |
| Cache/Queue/Rate-limit | Redis (limiter + dashboard cache) + BullMQ notifications queue |

## Current State

- **Backend:** Auth, schema-per-company repositories, candidate accounts, public careers, applications/pipeline, Redis sign-in limiting, company dashboard cache, a BullMQ notifications queue (stage-change jobs delivered to `audit_logs`), interviews + feedback (scheduling with auto-move to the Interview stage, server-side interviewer scoping, 1:1 feedback, `GET /company/users`), company settings + user management (create account with admin-set password / role change / password reset / suspend-reactivate / remove with audit rows), company suspend/reactivate (blocks sign-in/refresh + hides public careers), and the SuperAdmin platform module (`/platform/*`). Health endpoint at `GET /api/health`.
- **Frontend:** Vite/Mantine application with company and candidate platforms, candidate job search/apply/bookmarks/profile flows, the company dashboard summary, interviews list/scheduler/feedback UI, CompanyAdmin settings + team pages, and the SuperAdmin platform views (companies list/detail/stats).
- **M11:** SuperAdmin account management across companies (user create/role/password/suspend/reactivate/remove, candidate CRUD with cascade delete), cross-company application stage moves + interview reschedule/cancel, per-user suspension (`users.status`, enforced at sign-in/refresh), candidate withdraw (`DELETE /candidate/applications/:id`), candidate job detail page (`/jobs/$jobId` via shared `JobDetailsView`), and the applications page (job links, status stepper, withdraw). Seed now creates 6 accounts (all five internal roles + Candidate).
- **M12:** SuperAdmin platform control — merged users endpoint (`GET /platform/users` returns company users + candidates with `type` discriminator), company hard-delete (`DELETE /platform/companies/:id` — drops schema, cleans public rows, cancels candidate applications), company suspend/reactivate cascades to all users in the schema, CompanyAdmin suspend cascades to all company users, frontend CompaniesPage with search/filter/pagination/actions/delete, new UsersPage (merged table, company-user + candidate actions, "Add user" modal with type toggle), new ApplicationsPage (cross-company table, company + stage filters, move-stage modal), admin nav updated (Tenants/Users/Applications). E2e: `phase12.e2e-spec.ts`.
- **M13:** Platform jobs management — cross-company job CRUD (`GET/POST/PATCH/DELETE /platform/jobs`, `POST /platform/jobs/:id/publish|close`) with listings-index sync + dashboard cache invalidation + audit rows, admin JobsPage (company/status filters, create/edit/publish/close/delete, nav "Jobs"), candidate job search excludes jobs of deleted companies, applied candidates can view closed job details (`getAppliedJobDetail`), e2e hook-timeout hardening (jest.setTimeout at describe level in all e2e specs). E2e: `phase13.e2e-spec.ts`.
- **M14:** Job post metadata — `employment_type` (full-time/part-time/contract/intern), `location`, `work_setup` (on-site/hybrid/work-from-home) columns on `job_postings` + `job_listings_index` (nullable, required in create forms), company `JobPostingForm` + admin `JobsPage` modal gain the fields, candidate search/detail + public careers pages show `JobMetaBadges` ("Not specified" fallback for legacy rows), candidate job detail now enriches `requiredSkills` (was missing vs public careers), migration `20260811100000_job_post_metadata`. E2e: phase13 metadata + skills round-trip assertions.
- **M15:** Backend-driven search/filter/sort/pagination on every list surface. Shared `ListQuerySchema` (`search`, `page`, `pageSize` ≤50, `sortBy`, `sortDir`) + `repositories/list-query.helper.ts` (`toWhere`/`toOrderBy`/`toPagination`/`listEnvelope`/`inMemorySearch`/`sortAndPageInMemory`/`andConditions`); upgraded endpoints return `{ data, total, page, pageSize }`. Single-schema lists (candidate jobs/applications/bookmarks, company job-postings/candidates/interviews, platform companies, public careers) run SQL ilike/orderBy/limit-offset/count; platform aggregated lists (users/applications/jobs/interviews) filter/sort/page in-memory in the service. `GET /applications` (company, kanban/scheduler) gets search+sort only, stays a plain array. Sort columns are whitelisted per endpoint (injection-safe). Frontend: shared `useListQuery` hook + `ListControls` component (debounced search, filter Selects, sort Select + direction toggle), server-driven `Pagination` on all list pages (admin pages dropped client-side slicing). E2e: `phase14.e2e-spec.ts`.
- **M16:** CSV export for admin tables — 9 backend export endpoints (`/platform/{companies,users,applications,jobs,interviews}/export` with `companyId` scope for the CompanyDetail tabs, `/company/users/export`, `/job-postings/export`, `/candidates/export`, `/interviews/export`) sharing `toCsv` (RFC 4180 escaping, UTF-8 BOM, CRLF, formula-injection guard) + `csvFilename` + `sendCsv` in `common/csv.helper.ts`; repo `findAllFiltered` variants (same where, no pagination) and platform in-memory `exportX` methods (search + filters respected, sort/pagination ignored); shared `ExportCsvButton` wired into all 11 admin table pages via `ListControls.actions` (main pages) or header groups (CompanyDetail tabs). E2e: `phase16.e2e-spec.ts`.
- **M17:** Dashboard analytics — `@mantine/charts` + `recharts` charts on both admin dashboards. Company `GET /dashboard/summary` gains `applicationsOverTime` (day=30d/week=12w/month=12m buckets, zero-filled via `repositories/time-series.helper.ts` `timeBucketedCounts`), `topJobsByApplications` (top 8), `interviewStatusBreakdown`, `jobsByStatus`, `jobsByEmploymentType`, `rejection` (name-based heuristic on `%reject%` stages, `ponytail:`-documented). New `GET /platform/dashboard` (SuperAdmin): stat cards (companies/active/suspended/users/applications/jobs), `companiesOverTime` buckets, `applicationsPerCompany` + `usersPerCompany` + `jobsByStatusPerCompany` (top 10, schema-loop via `UsageRepository.countJobsByStatus`, uncached). Frontend: new `/admin/dashboard` route (login now redirects SuperAdmin to `/admin`), admin nav "Dashboard" item, `PlatformDashboardPage` + `CompanyDashboardPage` with Area/Bar/Donut charts + Day/Week/Month `SegmentedControl` slicing pre-bucketed series (no refetch), rejection-rate stat card, empty-chart guards. E2e: `phase17.e2e-spec.ts`.
- **M18:** Landing page + public jobs — unauthenticated visitors hitting `/` now see a static `LandingPage` (`features/landing/`) instead of being redirected to sign-in (authenticated users keep role redirects: Candidate → `/dashboard`, SuperAdmin → `/admin/dashboard`, else → `/company/dashboard`). Hero CTAs: "Browse open positions" → new public `GET /public/jobs` (new `PublicJobsController`, `PublicCareersService.listAll` reusing `JobListingsIndexRepository.findAll` — open jobs of active companies only, `companySlug` + meta fields now in every public listing mapping) and "Sign in" → `/auth/signin`. New public `/jobs` route reuses `JobListingPage` with optional `companySlug` (link targets use `job.companySlug`); `usePublicJobs` branches to `publicCareersApi.getAllJobs` when no slug. Landing sections: header anchors (Browse jobs / Sign in / Register / For companies), hero, 6 feature cards, CTA + footer. E2e: `phase18.e2e-spec.ts`.
- **M18:** Permission management — role-bound permission presets. `permission_presets` tables (public: 4 read-only seeded defaults + SuperAdmin globals; per-company: CompanyAdmin customs) + `users.preset_id` (null → role default; role change resets), ceiling rule (a preset is always a subset of its role's default — `ROLE_PERMISSIONS` in `common/permissions/permissions.ts` is the single source of truth; assignment requires role match). New `@Permissions('key')` decorator + global `PermissionsGuard` (stacks after `@Roles`, narrows it), 17-key catalog, effective set resolved per-request (preset join, no cache) + mirrored as a JWT claim. Company `/company/permissions` (CompanyAdmin) + platform `/platform/permissions` (SuperAdmin) pages, preset assignment in both users pages (company: non-CA rows; platform: all rows incl. CA). Phase18 e2e caught + fixed the new-company schema provision leak (`permission_presets` now cloned via the company template). Design: `docs/superpowers/specs/2026-08-12-permission-management-design.md`. E2e: `phase18.e2e-spec.ts`.
- **Not yet built:** platform email/notifications, password-change flow, pipeline-stage management endpoints, anonymous apply, and automated resume parsing. CI runs via `.github/workflows/ci.yml` (lint → typecheck → unit → e2e release gates → build). Production: self-hosted `docker-compose.prod.yml` stack (backend/frontend Dockerfiles, one-shot migrate service, env-file secrets) — see `09_IMPLEMENTATION_GUIDE.md` Phase 10 for the deploy runbook.

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
2. Apply the eight migrations under `backend/drizzle/*/migration.sql` chronologically via `psql` (see `docs/00b_LOCAL_DEV_BOOTSTRAP.md` for the exact one-liners)
3. Apply `backend/drizzle/template-schema.sql`
4. `cd backend && npm run seed` (creates the 6 sample accounts: SuperAdmin, CompanyAdmin, Interviewer, HiringManager, Recruiter, Candidate)

Without steps 2–4 you'll get `relation "..." does not exist` on the first login. Full runbook with checks after each step: `docs/00b_LOCAL_DEV_BOOTSTRAP.md`.

Applied migration order includes:
```text
20260722095156_bright_iron_fist
20260723191416_fresh_blindfold
20260727163000_smooth_spitfire
20260803085856_redundant_tyrannus
20260804101500_candidate_profile_redesign
20260805090000_candidate_application_integrity
20260806191320_superb_king_cobra
20260807090000_scheduled_at_timezone
20260808090000_platform_user_suspend
20260808100000_platform_account_cascades
20260812000000_permission_management
```

## Architecture

### Multi-Company (schema-per-company)

- `companyId` from **JWT only** — never from body/params/headers
- Request-scoped via `AsyncLocalStorage` in `CompanyContextInterceptor` (app-global)
- Drizzle client created per-request with `SET search_path TO company_<id>, public` via `DrizzleSchemaService`
- **No `company_id` columns** on any company-scoped table — schema boundary is the filter
- Cross-company resource reference → **404 Not Found** (never 403)
- SuperAdmin operates in `public` schema with unscoped repos, guarded by `requireRole('SuperAdmin')`
- Repos use `forCurrentCompany()` (company-scoped) or `forPublic()` (global/public tables)
- Important: `forCurrentCompany()` throws if no company context. `forPublic()` and `forSchema(name)` don't need one.

### Schema Layout

Tables split across two groups:
- **Public schema:** `companies`, `skills`, `audit_logs`, `user_emails`, `refresh_tokens`
- **Per-company schema (created on signup):** `users`, `job_postings`, `candidates`, `pipeline_stages`, `applications`, `resumes`, `resume_skills`, `job_required_skills`, `interviews`, `interview_feedbacks`, `notes`

Template schema `template` is created by `drizzle/template-schema.sql`. Signup clones it.

### Backend Structure

```
backend/src/
  app.module.ts           — imports AuthModule, registers CompanyContextInterceptor + RolesGuard globally
  main.ts                 — CORS (localhost:5173), global prefix api, listen :3000
  database/
    schema.ts             — all Drizzle table definitions (public + company)
    drizzle.provider.ts   — Pool provider (pg)
    drizzle-schema.service.ts — forCurrentCompany() / forPublic() / forSchema()
  interceptors/
    company-context.ts     — AsyncLocalStorage, getCompanyId(), getSchema(), getCurrentUser()
    company-context.interceptor.ts — sets context from JWT user
  repositories/           — one per entity, currently: company.repository.ts, user.repository.ts
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

- `Pool` from `pg` — single pool for all companies, schema routing per-connection via `SET search_path`
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
| M1 | Auth + Tenancy + RBAC | Signup creates company schema, isolation tests pass |
| M2 | Job Postings + Candidates | CRUD via API |
| M3 | Pipeline (Kanban) | Drag stage move end-to-end (dnd-kit) |
| M4 | Resume + Skill Match | Match score computed on apply |
| M5 | Public Careers + Apply | Unauthenticated browse + apply |
| M6 | Redis (rate-limit + cache) | 429 on public apply, dashboard cache |
| M7 | BullMQ background jobs | Stage-change notifications via BullMQ worker (audit-log delivery) |
| M8 | Interviews + Feedback | Schedule + submit feedback works — done ✅ |
| M9 | Admin + Platform + CI | CompanyAdmin settings/users UI, platform views, CI green — done ✅ |
| M10 | Deploy | Live URL, prod config — done ✅ |
| M11 | Platform Control + Candidate Experience | SA account CRUD + per-user suspend + cross-company applications/interviews + candidate job detail/withdraw — done ✅ |
| M12 | Platform Control | Merged users/applications views + company hard-delete + suspend cascades — done ✅ |
| M13 | Platform Jobs + Candidate Visibility | Cross-company job CRUD + search/detail visibility fixes — done ✅ |
| M14 | Job Post Metadata | Type/location/setup on forms, search, detail, public careers, and admin — done ✅ |
| M15 | List Search/Filter/Sort | Backend-driven search/filter/sort/pagination on all 13 list endpoints + pages — done ✅ |
| M16 | CSV Export | Export button on all admin tables downloads filtered CSV — done ✅ |
| M17 | Dashboard Analytics | Charts (area/bar/donut) on company + platform dashboards with day/week/month aggregation — done ✅ |
| M18 | Landing Page + Public Jobs | Public landing at `/` + platform-wide public jobs listing with hero CTAs — done ✅ |
| M18 | Permission Management | Presets CRUD + assignment + enforcement — done ✅ |

## Documentation Index

| # | File | Content | Agent Use |
|---|------|---------|-----------|
| 00 | `docs/00_PROJECT_INSTRUCTIONS.md` | **Canonical spec** — consolidates all 8 source docs into one single-source-of-truth | Read first when starting a new milestone. Overrides any contradiction in 01–09. |
| 00b | `docs/00b_LOCAL_DEV_BOOTSTRAP.md` | **Local dev runbook** — docker up → migrations → template schema → seed → start backend/frontend → login. Includes checks after each step, daily loop, nuke-and-restart, and troubleshooting table. | Read first when you haven't run the project in a while, after `docker compose down -v`, or when something is broken and you forgot the sequence. |
| 01 | `docs/01_TALENTPIPE_PRD_SRS.md` | Product requirements & software requirements spec | Understand feature scope, user stories, and acceptance criteria for a given milestone. |
| 02 | `docs/02_TECHNICAL_OVERVIEW.md` | High-level architecture decisions, stack rationale | Context on *why* specific tech was chosen (NestJS, Drizzle, schema-per-company, etc.). |
| 03 | `docs/03_RECRUITMENT_ATS_ARCHITECTURE.md` | System architecture — modules, data flow, integration points | Reference when wiring cross-module interactions (e.g., apply → resume parsing → pipeline). |
| 04 | `docs/04_ERD_DIAGRAM.md` | Entity-relationship diagram (Mermaid) | Consult before creating or modifying any Drizzle table definition. |
| 05 | `docs/05_DATA_ISOLATION_STRATEGY.md` | Schema-per-company isolation deep-dive | Debug multi-tenancy issues, understand search_path mechanics, verify isolation correctness. |
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
- E2E release gates live in `backend/test/` (`phase*.e2e-spec.ts` — M11 adds `phase11.e2e-spec.ts` with platform-account/data + candidate-withdraw scenarios)
- Unit specs live alongside sources (`platform-accounts.service.spec.ts`, `platform-data.service.spec.ts`, etc.)
- CI pipeline runs lint → typecheck → unit → e2e release gates → build (`.github/workflows/ci.yml`)
- Docker daemon needed for integration tests hitting real postgres
