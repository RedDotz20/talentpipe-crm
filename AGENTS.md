# TalentPipe — Multi-Tenant ATS

**One-liner:** A multi-tenant Applicant Tracking System where each company manages job postings, candidate pipelines, interviews, and recruiter collaboration — with schema-isolated data, resume parsing, skill-matching, and abuse-resistant public application intake.

**Status:** v1 portfolio project. Backend scaffolded (NestJS), frontend folder empty, no commits yet.

---

## Stack

| Layer | Choice |
|-------|--------|
| Backend | NestJS (Node.js) — controller → service → repository |
| ORM | Drizzle (SQL-first, typed), PostgreSQL 16+ |
| Frontend | React + TypeScript + Vite + Mantine + TanStack Query + TanStack Router + dnd-kit |
| Validation | Zod (shared frontend + backend) |
| Cache/Queue/Rate-limit | Redis (3 roles: rate-limit counters, dashboard cache, BullMQ backing) + BullMQ |
| Storage | S3-compatible (MinIO local, AWS S3 prod), presigned upload URLs |
| Auth | JWT access + refresh tokens, argon2 password hashing |
| Multi-tenancy | One PostgreSQL database, **separate schema per tenant** (`SET search_path TO tenant_<id>, public`) |
| Infra | Docker Compose (app + postgres + redis + minio), GitHub Actions CI |

## Canonical Decisions

- **NestJS** (not Hono) — DI, Guards, Interceptors for large-scale multi-tenant architecture
- **Schema-per-tenant** (not shared-schema or DB-per-tenant) — strongest isolation without connection pool overhead
- **`tenantId` from JWT only** — never from body/params/headers
- **AsyncLocalStorage** for request-scoped tenant context — removes "forgot to pass it" failure mode
- **No `tenant_id` columns** on any table — schema boundary is the filter
- **Interview feedback** is a separate `INTERVIEW_FEEDBACK` table (1:1 with Interview), not a field on Interview
- **Skill matching** is keyword/taxonomy (not ML) in v1

## Architecture

### Multi-Tenancy Model (8-layer isolation)

1. Tenant identity from JWT only
2. Request-scoped context via `AsyncLocalStorage` (NestJS interceptor)
3. Schema-routed Drizzle client (`search_path` per request)
4. PostgreSQL schema boundary (physical namespace isolation)
5. Post-fetch `assertFound` (standard not-found, not tenant check)
6. Namespaced Redis keys (`tenant:{id}:...`) and S3 keys (`tenants/{id}/...`)
7. Automated isolation test suite in CI (release gate)
8. Audit logging for sensitive actions

**SuperAdmin exception:** operates in `public` schema with separate unscoped repositories, never routed through tenant context. Protected by `requireRole('SuperAdmin')` guard.

### Modules

| Module | Responsibility |
|--------|---------------|
| `AuthModule` | JWT access+refresh, login/signup/logout, role guards |
| `TenantsModule` | Org creation/settings, plan info |
| `UsersModule` | Recruiters/admins within tenant, invites, role changes |
| `JobPostingsModule` | CRUD, required-skills config, publish/close |
| `CandidatesModule` | Candidate records (public apply or manual entry) |
| `ApplicationsModule` | Pipeline — stage transitions, Kanban data, notes |
| `ResumeModule` | File upload, text extraction, skill extraction |
| `SkillMatchingModule` | Score computation vs job posting requirements |
| `InterviewsModule` | Scheduling, feedback capture |
| `NotificationsModule` | Email queue (stage changes, reminders) via BullMQ |
| `PublicApplyModule` | Unauthenticated careers API — listing + apply (rate-limited) |
| `PlatformModule` | SuperAdmin only — cross-tenant tenant list/suspend/stats |

### Key Endpoints

```
POST   /auth/signup | /auth/login | /auth/refresh | /auth/logout
GET    /job-postings | POST /job-postings | PATCH /job-postings/:id
GET    /applications?stage= | PATCH /applications/:id/stage
POST   /interviews | POST /interviews/:id/feedback
GET    /public/:tenantSlug/jobs | POST /public/:tenantSlug/jobs/:id/apply
GET    /platform/tenants | PATCH /platform/tenants/:id/suspend
```

### Roles

| Role | Scope |
|------|-------|
| SuperAdmin | Platform-level, no tenant — manages all tenants |
| Org Admin | Tenant-scoped — settings, users, stages |
| Recruiter | Tenant-scoped — postings, pipeline, interviews |
| Hiring Manager | Tenant-scoped — applications, pipeline, interviews |
| Interviewer | Tenant-scoped — own interviews only, feedback |
| Candidate | Unauthenticated — browse + apply |

Cross-tenant resource reference → **404 Not Found** (never 403).

## Build Order (Milestones)

| M | Name | Done when |
|---|------|-----------|
| M0 | Scaffold | NestJS + Vite boot, Docker Compose up |
| M1 | Auth + Tenancy + RBAC | Signup creates tenant schema, isolation tests pass |
| M2 | Job Postings + Candidates | CRUD via API, schema isolation tests added |
| M3 | Pipeline (Kanban) | Drag stage move works end-to-end |
| M4 | Resume + Skill Match | Apply shows match score, unit tests for score fn |
| M5 | Public Careers + Apply | Candidate can browse+apply without login |
| M6 | Redis (rate-limit + cache) | Load test shows limiter triggers |
| M7 | BullMQ background jobs | Apply enqueues, worker parses async |
| M8 | Interviews + Feedback | Schedule + submit feedback works |
| M9 | Admin + Platform + CI | CI green, platform views work |
| M10 | Deploy | Live URL, public apply works in prod |

## Commands

```sh
# Backend
cd backend && npm run start:dev   # Dev server on :3000
cd backend && npm run build        # TypeScript compile
cd backend && npm run lint         # tsc --noEmit
cd backend && npm test             # Vitest
cd backend && npm run seed         # Seed skill taxonomy

# Frontend
cd frontend && npm run dev         # Vite dev server on :5173

# Infrastructure
docker compose up -d               # Start postgres + redis + minio
```

## Key Conventions

- **One milestone per prompt.** Never build M3 when asked for M1.
- **Isolation tests are CI release gate.** A failure breaks the build.
- **All DB via repositories.** No direct Drizzle client outside `/repositories`.
- **No `tenant_id` columns.** Schema boundary is the isolation.
- **Frontend can lag backend** by one milestone.
- **Commit tags by milestone:** `feat(m1): auth + tenant + rbac`.
- **Review diffs, don't trust green tests alone.** The isolation layer's value is in code review.
- **Error shape:** `{ "error": { "code": "...", "message": "..." } }` — codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.
- **Backend 403 test per role** per protected action.
- **Frontend RoleGuard + backend guard** both present.

## Project Structure

```
backend/
  src/
    modules/{auth,tenants,users,job-postings,candidates,applications,resumes,skill-matching,interviews,notifications,public-apply,platform}/
    interceptors/   (tenant-context.interceptor.ts)
    repositories/   (one per entity, use forCurrentTenant() or forPublic())
    database/       (schema.ts, drizzle.provider.ts, drizzle-schema.service.ts, redis.provider.ts)
    shared/         (password.ts, roles.guard.ts, roles.decorator.ts, cache.service.ts, audit.service.ts)
    workers/        (resume.worker.ts, bootstrap.ts)
    queues/         (queue definitions)
frontend/
  src/
    features/{auth,dashboard,job-postings,candidates,pipeline,resumes,interviews,public-careers,admin,platform}/
    shared/{components,hooks,api,types,utils}/
    app/            (router.tsx, providers.tsx)
docs/               (10 spec documents — 00_PROJECT_INSTRUCTIONS.md is canonical)
```

## Testing

- **Unit:** skill-match score (0/all/partial edge cases), stage-transition rules
- **Integration:** pipeline transitions, **tenant isolation** (Tenant A never fetches B's data)
- **Load:** k6/autocannon on `/public/:tenant/jobs/:id/apply` to confirm rate limiter
- **E2E (Playwright):** signup → post job → public apply → drag through stages
