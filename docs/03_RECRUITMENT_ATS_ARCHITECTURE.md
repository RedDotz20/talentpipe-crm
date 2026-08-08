# TalentPipe — Multi-Company Recruitment CRM / ATS

**Purpose:** High-level architectural scaffold — entity model, module boundaries, API surface shape, Redis usage, infra, and build order. This is a *narrative overview*; the authoritative, conflict-resolved build reference is `00_PROJECT_INSTRUCTIONS.md`.

**One-line pitch:** A multi-company Applicant Tracking System where each company manages job postings, candidate pipelines, interviews, and recruiter collaboration — with candidate profile storage, explainable skill matching, and company-specific public careers browsing.

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

---

## 0. Framework Note (resolved)

**Backend is NestJS (Node.js).** An earlier draft used Hono as the target framework — NestJS supersedes it. NestJS's built-in DI, Guards, Interceptors, and module-scoped providers are the right fit for this project's layered multi-company architecture. (Confirmed in `00_PROJECT_INSTRUCTIONS.md` §0.)

---

## 1. Multi-Company Model

**Approach: one PostgreSQL database, separate schema per company.**

Each company gets their own PostgreSQL schema (e.g. `company_abc123`) with an identical set of tables. Queries are routed to the correct schema by setting `search_path` per request. This provides **physical namespace isolation** — tables in schema A are invisible to queries in schema B.

Why schema-per-company instead of shared-schema or database-per-company:
- **Stronger isolation than shared-schema:** No risk of a missing `WHERE company_id = X` clause. The schema IS the filter.
- **Lighter than database-per-company:** All companies share one connection pool, one backup strategy, one migration pipeline. No separate DB server per company.
- **PostgreSQL is the natural choice:** It natively supports multiple schemas within one database. MySQL's "schema" = "database" — schema-per-company there means database-per-company, with far more overhead.
- **Enterprise-ready migration path:** If a company ever needs dedicated resources, export their schema and promote it to its own database. The app only needs a config change.

**Enforcement pattern:** a request-scoped company context, populated from the authenticated user's JWT (`companyId` claim) and never from request body/params. The company ID maps directly to a PostgreSQL schema name. Before any query runs, a NestJS interceptor sets the `search_path` to that company's schema — all subsequent Drizzle queries execute in that schema context automatically. No `WHERE company_id = X` is needed because the schema boundary IS the isolation. See `05_DATA_ISOLATION_STRATEGY.md` for the full layered approach: schema-per-company model, per-request schema routing, namespaced Redis/S3 keys, and an automated cross-company test suite run in CI.

---

## 2. Core Entities (ER Sketch)

```
Company (lives in `public` schema)
 └─ id, name, slug, plan, status [active|suspended], createdAt

User (lives in company's schema — no companyId column, inheritance is by schema)
 └─ id, email, passwordHash, role [SuperAdmin|CompanyAdmin|Recruiter|HiringManager|Interviewer]

JobPosting (company's schema)
 └─ id, title, description, requiredSkills[], status [draft|open|closed], createdBy

Candidate (company's schema — a person who applied)
 └─ id, name, email, phone

Application (company's schema — the pipeline record)
 └─ id, candidateId, jobPostingId, currentStage, matchScore, appliedAt

PipelineStage (company's schema, customizable per Company, ordered)
 └─ id, name, order   e.g. Applied → Screening → Interview → Offer → Hired/Rejected

CandidateAccount resume metadata (public schema)
 └─ resumeFileUrl, resumeUploadedAt; file bytes live in MinIO/S3

Skill (master taxonomy, lives in `public` schema — shared across companies)
 └─ id, name, category

Interview (company's schema)
 └─ id, applicationId, interviewerId, scheduledAt, feedback, rating

Note (company's schema)
 └─ id, applicationId, authorId, content, createdAt

CandidateAccount (lives in `public` schema — global identity)
 └─ id, email, passwordHash, firstName, lastName, phone

CandidateApplicationsIndex (lives in `public` schema — cross-company)
 └─ id, candidateAccountId, companyId, jobPostingId, applicationId, jobTitle, companyName, status, appliedAt

CandidateBookmark (lives in `public` schema)
 └─ id, candidateAccountId, companyId, jobPostingId, jobTitle, companyName, createdAt

JobListingsIndex (lives in `public` schema — cross-company)
 └─ id, companyId, jobPostingId, title, description, companyName, companySlug, status, createdAt

UserEmail (lives in `public` schema — email → company lookup for login)
 └─ id, email (unique), companyId, userId, createdAt

RefreshToken (lives in `public` schema — hashed at rest)
 └─ id, tokenHash, userId, companyId?, expiresAt, createdAt, revokedAt?

SuperAdmin (lives in `public` schema — platform accounts)
 └─ id, email, passwordHash, name, createdAt

AuditLog (lives in `public` schema)
 └─ id, companyId, userId, action, resourceId, metadata, timestamp
```

**Candidates exist in two forms:** (1) global `candidate_accounts` in the public schema (auth identity + profile), and (2) per-company `candidates` records (snapshot at application time for the company's hiring context).

**Skill matching** is manual and explainable in the current build: Candidates select skills from the shared taxonomy, and the application score is `(matched required skills / total required skills)`. An optional per-application skill override is persisted with the application. Resume files are stored for recruiter review but are not parsed in v1. If you want a v2 flex later, automated extraction or embeddings-based semantic matching can be added without changing the public careers read boundary.

---

## 3. Module Breakdown (NestJS — controller → service → repository)

| Module | Responsibility |
|---|---|
| `AuthModule` ✅ | JWT auth, refresh tokens, role Guards |
| `CompaniesModule` | Company creation/settings, plan info |
| `CompanyModule` ✅ | Company settings (`GET/PATCH /company`) + user management — invite/role-change/remove with audit rows (`modules/company/`) |
| `JobPostingsModule` | CRUD on job postings, required-skills config |
| `CandidatesModule` | Company candidate records (created by authenticated candidate apply or manual entry) |
| `CandidateAccountModule` ✅ | Candidate auth (signup/login via unified `/auth/*`), global `/candidate/*` API: dashboard, job search, applications history, bookmarks, profile |
| `ApplicationsModule` | The pipeline — stage transitions, Kanban board data, notes |
| `ResumeModule` | Candidate profile file upload and storage-only metadata |
| `SkillMatchingModule` | Score computation against a JobPosting's requirements |
| `InterviewsModule` | Scheduling, feedback capture |
| `NotificationsModule` | Email queue (stage changes, interview reminders) via BullMQ |
| `PublicCareersModule` | **Unauthenticated read-only** careers API — company job listing + detail |
| `PlatformModule` ✅ | **SuperAdmin only** — cross-company company list/detail/suspend/reactivate/stats (`/platform/*`), guarded by `@Roles('SuperAdmin')`, public-schema repos; usage counts read explicit `company_<id>` schemas via `forSchema`. |

Backend also ships `RepositoriesModule` (all repos extend `BaseRepository` with `withDb('current'|'public'|schema)`), `DatabaseModule` (pg `Pool` + `DrizzleSchemaService`), and `HealthModule` (`GET /api/health`).

`PublicCareersModule` is the unauthenticated read surface. It never creates candidates, applications, or resumes. Anonymous Apply actions redirect to unified sign-in/signup; the authenticated Candidate module owns application writes. Redis rate limiting is deferred to Phase 6 for login and any future public write endpoints.

---

## 4. API Surface (Representative)

```
-- Auth --
POST   /auth/company/signup               (creates Company + first CompanyAdmin)
POST   /auth/signin                   (unified login — company users AND candidates)
POST   /auth/signup                   (creates candidate account)
POST   /auth/refresh
POST   /auth/logout

-- Internal, authenticated, company-scoped --
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
GET    /public/:companySlug/jobs                  (careers page listing)
GET    /public/:companySlug/jobs/:id              (job detail + required skills)

-- Candidate (authenticated, cross-company) ✅ implemented --
GET    /candidate/jobs                       (list open jobs from index)
POST   /candidate/jobs/:companyId/:jobId/apply (apply with account)
GET    /candidate/applications                (history)
POST   /candidate/bookmarks
DELETE /candidate/bookmarks/:id
```
All routes are prefixed `api` (e.g. `POST /api/auth/company/signup`).

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
    /public-careers    (separate unauthenticated route group — company job listing + detail; Apply requires Candidate auth)
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

1. ✅ Auth + Company creation + role Guards (no Redis, no file upload yet)
2. ✅ Job Postings CRUD + Candidates CRUD (manual entry)
3. ✅ Applications/Pipeline module — Kanban board working end-to-end
4. ⬜ Resume upload → MinIO/S3 storage → text extraction → skill extraction → matchScore
5. ✅ Public careers page + Candidate-only apply; public API is read-only
5b. ✅ Candidate accounts + dashboard — `candidate_accounts` auth, job search, apply-as-candidate, bookmarks, history (built early)
6. ⬜ Redis: rate limiting on public apply + login, dashboard query caching
7. ✅ BullMQ: stage-change notifications moved to a background worker (audit-log delivery; resume parsing is out of product design)
8. ⬜ Interviews module + feedback
9. ⬜ Docker Compose full stack, then GitHub Actions CI
10. ⬜ Deploy; S3-compatible client already used (MinIO→real S3 = env swap)

---

## 9. Testing Strategy

- **Unit tests:** skill-matching score calculation (pure function, easy to test exhaustively with edge cases — 0 skills, all skills matched, partial overlap)
- **Integration tests:** pipeline stage transitions (valid transitions only, company isolation — assert Company A can never fetch Company B's applications)
- **Load test:** future `k6`/`autocannon` coverage for the Phase 6 authentication/public-write rate-limit scope
- **E2E (optional, high value for demo):** Playwright script that signs up a company, posts a job, browses public careers, signs in/signs up as Candidate, applies, and drags the application through pipeline stages
