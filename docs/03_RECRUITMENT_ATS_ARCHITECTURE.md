# TalentPipe — Multi-Tenant Recruitment CRM / ATS

**Purpose:** High-level architectural scaffold — entity model, module boundaries, API surface shape, Redis usage, infra, and build order. This is a *narrative overview*; the authoritative, conflict-resolved build reference is `00_PROJECT_INSTRUCTIONS.md`.

**One-line pitch:** A multi-tenant Applicant Tracking System where each company manages job postings, candidate pipelines, interviews, and recruiter collaboration — with candidate profile storage, explainable skill matching, and tenant-specific public careers browsing.

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

---

## 0. Framework Note (resolved)

**Backend is NestJS (Node.js).** An earlier draft used Hono as the target framework — NestJS supersedes it. NestJS's built-in DI, Guards, Interceptors, and module-scoped providers are the right fit for this project's layered multi-tenant architecture. (Confirmed in `00_PROJECT_INSTRUCTIONS.md` §0.)

---

## 1. Multi-Tenancy Model

**Approach: one PostgreSQL database, separate schema per tenant.**

Each tenant gets their own PostgreSQL schema (e.g. `tenant_abc123`) with an identical set of tables. Queries are routed to the correct schema by setting `search_path` per request. This provides **physical namespace isolation** — tables in schema A are invisible to queries in schema B.

Why schema-per-tenant instead of shared-schema or database-per-tenant:
- **Stronger isolation than shared-schema:** No risk of a missing `WHERE tenant_id = X` clause. The schema IS the filter.
- **Lighter than database-per-tenant:** All tenants share one connection pool, one backup strategy, one migration pipeline. No separate DB server per tenant.
- **PostgreSQL is the natural choice:** It natively supports multiple schemas within one database. MySQL's "schema" = "database" — schema-per-tenant there means database-per-tenant, with far more overhead.
- **Enterprise-ready migration path:** If a tenant ever needs dedicated resources, export their schema and promote it to its own database. The app only needs a config change.

**Enforcement pattern:** a request-scoped tenant context, populated from the authenticated user's JWT (`tenantId` claim) and never from request body/params. The tenant ID maps directly to a PostgreSQL schema name. Before any query runs, a NestJS interceptor sets the `search_path` to that tenant's schema — all subsequent Drizzle queries execute in that schema context automatically. No `WHERE tenant_id = X` is needed because the schema boundary IS the isolation. See `05_DATA_ISOLATION_STRATEGY.md` for the full layered approach: schema-per-tenant model, per-request schema routing, namespaced Redis/S3 keys, and an automated cross-tenant test suite run in CI.

---

## 2. Core Entities (ER Sketch)

```
Tenant (lives in `public` schema)
 └─ id, name, slug, plan, createdAt

User (lives in tenant's schema — no tenantId column, inheritance is by schema)
 └─ id, email, passwordHash, role [SuperAdmin|OrgAdmin|Recruiter|HiringManager|Interviewer]

JobPosting (tenant's schema)
 └─ id, title, description, requiredSkills[], status [draft|open|closed], createdBy

Candidate (tenant's schema — a person who applied)
 └─ id, name, email, phone

Application (tenant's schema — the pipeline record)
 └─ id, candidateId, jobPostingId, currentStage, matchScore, appliedAt

PipelineStage (tenant's schema, customizable per Tenant, ordered)
 └─ id, name, order   e.g. Applied → Screening → Interview → Offer → Hired/Rejected

CandidateAccount resume metadata (public schema)
 └─ resumeFileUrl, resumeUploadedAt; file bytes live in MinIO/S3

Skill (master taxonomy, lives in `public` schema — shared across tenants)
 └─ id, name, category

Interview (tenant's schema)
 └─ id, applicationId, interviewerId, scheduledAt, feedback, rating

Note (tenant's schema)
 └─ id, applicationId, authorId, content, createdAt

CandidateAccount (lives in `public` schema — global identity)
 └─ id, email, passwordHash, firstName, lastName, phone

CandidateApplicationsIndex (lives in `public` schema — cross-tenant)
 └─ id, candidateAccountId, tenantId, jobPostingId, applicationId, jobTitle, companyName, status, appliedAt

CandidateBookmark (lives in `public` schema)
 └─ id, candidateAccountId, tenantId, jobPostingId, jobTitle, companyName, createdAt

JobListingsIndex (lives in `public` schema — cross-tenant)
 └─ id, tenantId, jobPostingId, title, description, companyName, companySlug, status, createdAt

UserEmail (lives in `public` schema — email → tenant lookup for login)
 └─ id, email (unique), tenantId, userId, createdAt

RefreshToken (lives in `public` schema — hashed at rest)
 └─ id, tokenHash, userId, tenantId?, expiresAt, createdAt, revokedAt?

SuperAdmin (lives in `public` schema — platform accounts)
 └─ id, email, passwordHash, name, createdAt

AuditLog (lives in `public` schema)
 └─ id, tenantId, userId, action, resourceId, metadata, timestamp
```

**Candidates exist in two forms:** (1) global `candidate_accounts` in the public schema (auth identity + profile), and (2) per-tenant `candidates` records (snapshot at application time for the tenant's hiring context).

**Skill matching** is manual and explainable in the current build: Candidates select skills from the shared taxonomy, and the application score is `(matched required skills / total required skills)`. An optional per-application skill override is persisted with the application. Resume files are stored for recruiter review but are not parsed in v1. If you want a v2 flex later, automated extraction or embeddings-based semantic matching can be added without changing the public careers read boundary.

---

## 3. Module Breakdown (NestJS — controller → service → repository)

| Module | Responsibility |
|---|---|
| `AuthModule` ✅ | JWT auth, refresh tokens, role Guards |
| `TenantsModule` | Org creation/settings, plan info |
| `UsersModule` | Recruiters/admins within a tenant, invites |
| `JobPostingsModule` | CRUD on job postings, required-skills config |
| `CandidatesModule` | Tenant candidate records (created by authenticated candidate apply or manual entry) |
| `CandidateAccountModule` ✅ | Candidate auth (signup/login via unified `/auth/*`), global `/candidate/*` API: dashboard, job search, applications history, bookmarks, profile |
| `ApplicationsModule` | The pipeline — stage transitions, Kanban board data, notes |
| `ResumeModule` | Candidate profile file upload and storage-only metadata |
| `SkillMatchingModule` | Score computation against a JobPosting's requirements |
| `InterviewsModule` | Scheduling, feedback capture |
| `NotificationsModule` | Email queue (stage changes, interview reminders) via BullMQ |
| `PublicCareersModule` | **Unauthenticated read-only** careers API — tenant job listing + detail |
| `PlatformModule` | **SuperAdmin only** — cross-tenant tenant list/suspend/stats. Uses SEPARATE unscoped repositories, reachable only via `requireRole('SuperAdmin')`, in its own `/platform/*` route file. (Added to match `00_PROJECT_INSTRUCTIONS.md` §3.2 — the original module list omitted it though `/platform/*` routes and the SuperAdmin role are defined in `07_API_ENDPOINT_DOCUMENTATION.md` and `06_ROLE_INTERACTIONS.md`.) |

Backend also ships `RepositoriesModule` (all repos extend `BaseRepository` with `withDb('current'|'public'|schema)`), `DatabaseModule` (pg `Pool` + `DrizzleSchemaService`), and `HealthModule` (`GET /api/health`).

`PublicCareersModule` is the unauthenticated read surface. It never creates candidates, applications, or resumes. Anonymous Apply actions redirect to unified sign-in/signup; the authenticated Candidate module owns application writes. Redis rate limiting is deferred to Phase 6 for login and any future public write endpoints.

---

## 4. API Surface (Representative)

```
-- Auth --
POST   /auth/org/signup               (creates Tenant + first OrgAdmin)
POST   /auth/signin                   (unified login — org users AND candidates)
POST   /auth/signup                   (creates candidate account)
POST   /auth/refresh
POST   /auth/logout

-- Internal, authenticated, tenant-scoped --
GET    /job-postings
POST   /job-postings
PATCH  /job-postings/:id
GET    /applications?stage=Interview
PATCH  /applications/:id/stage       (move candidate through pipeline)
POST   /applications/:id/notes
GET    /candidates/:id
POST   /interviews
POST   /interviews/:id/feedback

-- Public, unauthenticated, read-only (implemented M5) --
GET    /public/:tenantSlug/jobs                  (careers page listing)
GET    /public/:tenantSlug/jobs/:id              (job detail + required skills)

-- Candidate (authenticated, cross-tenant) ✅ implemented --
GET    /candidate/jobs                       (list open jobs from index)
POST   /candidate/jobs/:tenantId/:jobId/apply (apply with account)
GET    /candidate/applications                (history)
POST   /candidate/bookmarks
DELETE /candidate/bookmarks/:id
```
All routes are prefixed `api` (e.g. `POST /api/auth/org/signup`).

---

## 5. Redis Usage Map

| Use case | Mechanism |
|---|---|
| Future public/auth write protection | Fixed-window or token-bucket limiter, keyed by IP/account |
| Login brute-force protection | Counter per email/IP, lockout after N failed attempts |
| Dashboard query caching | Cache expensive aggregate queries (e.g. "applications per stage" counts) with short TTL, invalidate on write |
| Background jobs | BullMQ queues for future slow processing and email sending — keeps the request/response cycle fast |
| Session/token blacklist | Store revoked refresh tokens for logout-everywhere functionality |

This gives you **three distinct, explainable Redis use cases** instead of one — a stronger interview answer than "I used Redis for rate limiting" alone.

---

## 6. Frontend Structure (React + TS + Mantine)

```
/src
  /features
    /auth
    /job-postings
    /pipeline          (Kanban board — dnd-kit for drag/drop stage changes)
    /candidate
    /candidates
    /interviews
    /public-careers    (separate unauthenticated route group — tenant job listing + detail; Apply requires Candidate auth)
  /shared
    /components
    /hooks
    /api               (TanStack Query hooks per resource)
```

Feature-folder structure matches what you already prefer. The Kanban pipeline board is your visual centerpiece for demos — drag a candidate from "Screening" to "Interview" and have it call `PATCH /applications/:id/stage` optimistically via TanStack Query.

---

## 7. DevOps

- **Docker Compose services:** `app` (NestJS), `frontend` (or served statically), `postgres`, `redis`, `minio` (S3-compatible local storage for resume files — avoids needing a real AWS account during dev)
- **CI (GitHub Actions):** lint → unit tests → build → (on main) build+push Docker image
- **Deployment:** Railway/Render for a fast, cheap full-stack deploy; or AWS (ECS/Fargate + RDS + ElastiCache + S3) if you want the AWS resume line — you're already building that knowledge, and this project gives it a genuine home
- **Resume storage in production:** real S3 bucket, presigned upload URLs from the backend (don't proxy large file uploads through your API if avoidable)

---

## 8. Suggested Build Order (always demoable, never mid-scramble)

> Status: 1 ✅ done, 5b ✅ done (built early), 2 ⬜ next. See `09_IMPLEMENTATION_GUIDE.md`.

1. ✅ Auth + Tenant creation + role Guards (no Redis, no file upload yet)
2. ✅ Job Postings CRUD + Candidates CRUD (manual entry)
3. ✅ Applications/Pipeline module — Kanban board working end-to-end
4. ⬜ Resume upload → MinIO/S3 storage → text extraction → skill extraction → matchScore
5. ✅ Public careers page + Candidate-only apply; public API is read-only
5b. ✅ Candidate accounts + dashboard — `candidate_accounts` auth, job search, apply-as-candidate, bookmarks, history (built early)
6. ⬜ Redis: rate limiting on public apply + login, dashboard query caching
7. ⬜ BullMQ: move resume parsing and notification emails to background jobs
8. ⬜ Interviews module + feedback
9. ⬜ Docker Compose full stack, then GitHub Actions CI
10. ⬜ Deploy; S3-compatible client already used (MinIO→real S3 = env swap)

---

## 9. Testing Strategy

- **Unit tests:** skill-matching score calculation (pure function, easy to test exhaustively with edge cases — 0 skills, all skills matched, partial overlap)
- **Integration tests:** pipeline stage transitions (valid transitions only, tenant isolation — assert Tenant A can never fetch Tenant B's applications)
- **Load test:** future `k6`/`autocannon` coverage for the Phase 6 authentication/public-write rate-limit scope
- **E2E (optional, high value for demo):** Playwright script that signs up a tenant, posts a job, browses public careers, signs in/signs up as Candidate, applies, and drags the application through pipeline stages
