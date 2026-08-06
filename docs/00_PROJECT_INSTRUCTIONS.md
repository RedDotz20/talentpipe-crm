# TalentPipe — AI Build Context & Project Instructions

**Purpose:** Single canonical reference for an AI coding assistant building TalentPipe. Consolidates the 8 source spec documents (`08_FRONTEND_COMPONENT_STRUCTURE.md`, `04_ERD_DIAGRAM.md`, `07_API_ENDPOINT_DOCUMENTATION.md`, `06_ROLE_INTERACTIONS.md`, `02_TECHNICAL_OVERVIEW.md`, `05_DATA_ISOLATION_STRATEGY.md`, `03_RECRUITMENT_ATS_ARCHITECTURE.md`, `01_TALENTPIPE_PRD_SRS.md`). Load THIS file as the source of truth. The 8 originals remain for traceability.

**Status:** v1 — portfolio + functional demo. Solo-built, self-tested, no external/real-user data.

**Implementation status:** Phases 0–9 are implemented and release-gate coverage is present. Phase 5 public tenant-specific careers browsing is read-only: public GET listing/detail routes are available, while applications require an authenticated Candidate account. Phase 6 provides sign-in-only Redis limiting (five attempts per 15 minutes) and a 60-second tenant-scoped dashboard cache. Phase 7 adds a BullMQ `notifications` queue whose worker delivers stage-change notifications to `audit_logs` (3 retries, exponential backoff; email delivery deferred until a mailer exists). Phase 8 adds interviews + feedback (scheduling with auto-move to the Interview stage, server-side interviewer scoping, 1:1 feedback). Phase 9 adds tenant status (`active|suspended`) with sign-in/refresh/careers enforcement, org settings + user management (`GET/PATCH /org`, invite/role/remove with audit rows), the SuperAdmin platform module (`/platform/*`), the admin frontends, and a GitHub Actions CI pipeline (lint → typecheck → unit → e2e release gates → build). Anonymous apply remains out of scope.

---

## 0. Canonical Decisions (read first)

- **Backend framework: NestJS (Node.js).** Provides built-in DI, Guards, Interceptors, and module-scoped providers — the right fit for a large-scale, layered multi-tenant architecture.
- **ORM:** Drizzle (SQL-first, typed). PostgreSQL 16+.
- **Frontend:** React + TypeScript + Vite + Mantine + TanStack Query + TanStack Router + dnd-kit + Zod.
- **Cache/Queue/Rate-limit:** Redis (3 distinct roles) + BullMQ.
- **Storage:** S3-compatible (MinIO local, AWS S3 prod), presigned upload URLs.
- **Multi-tenancy:** one PostgreSQL database, **separate schema per tenant** — isolated at the database namespace level. Queries are routed via `search_path`. No `tenant_id` columns needed on tables. See §7 for the full isolation strategy.
- **Primary goal:** explainable, clean architecture + a passing CI isolation test suite; functionally demoable end-to-end.

---

## 1. Resolved Conflicts (from the source docs)

| # | Conflict | Resolution |
|---|----------|------------|
| C1 | Architecture doc originally listed "Module Breakdown (**NestJS**)" while earlier tech overview used Hono | **NestJS is canonical.** Hono references are deprecated. All stack docs updated to reflect NestJS + PostgreSQL. |
| C2 | Architecture module list omits a Platform/SuperAdmin module, but `04` and `03` define `/platform/*` routes + SuperAdmin role | Add **`PlatformModule`** (cross-tenant, role-guarded, unscoped repositories). See §3. |
| C3 | `04` describes interview feedback as a field on `Interview`; `02` ERD defines a separate `INTERVIEW_FEEDBACK` table | `INTERVIEW_FEEDBACK` is a **separate table** joined to `Interview` (1:1). Feedback is submitted via `POST /interviews/:id/feedback`. |
| C4 | `03_RECRUITMENT_ATS_ARCHITECTURE.md` mentions "MVC-style convention" while PRD NFR-8 says route → service → repository | Use **route/controller → service → repository** layering (NFR-8 wins). No direct Drizzle client outside `/repositories`. |

---

## 2. Product Overview (PRD distilled)

**What:** Multi-tenant ATS. Each company manages its own job postings, candidate pipelines, interviews, and hiring notes — with provably isolated data.

**Personas:** Org Admin, Recruiter, Hiring Manager, Interviewer (tenant-scoped); Candidate (authenticated, global accounts — signup, login, dashboard); SuperAdmin (platform-level, no tenant).

**In scope v1:** tenant signup/auth/RBAC; job posting CRUD + required skills; public careers browsing with Candidate-only apply; candidate/application pipeline (Kanban); candidate profile resume storage + manual skill-match scoring; rate limiting on future public/auth write endpoints; interviews + feedback; notes; Redis cache + BullMQ background jobs; Docker + CI/CD.

**Out of scope v1:** real billing, native mobile, calendar sync, ML semantic matching.

**Success metrics:** single-interaction stage move; <2 min browse-to-authenticated-apply flow; zero cross-tenant leakage under test; future rate limiter blocks scripted spam; skill score visible at application time.

**Feature priority (MoSCoW):** Must — tenancy/auth/RBAC, job CRUD, public careers, Candidate-only apply, pipeline, resume storage+manual skills. Should — rate limiting, interviews+feedback, notes, dashboard cache, candidate accounts. Could — email notifications, customizable stages. Won't — anonymous applications, billing, calendar.

---

## 3. Architecture

### 3.1 Multi-Tenancy Model

**Approach: one database, separate schema per tenant.**

Each tenant gets their own PostgreSQL schema (e.g., `tenant_abc123`). When a request comes in, the `search_path` is set to that tenant's schema before any query runs. This means:
- All tables are identical across schemas — the schema template is replicated per tenant.
- Queries are **physically isolated** at the namespace level: schema A literally cannot see schema B's tables without explicit cross-schema qualification.
- No `tenant_id` columns needed on any table — the schema itself is the isolation boundary.
- `tenantId` is derived ONLY from the verified JWT claim — never from body/params/headers for internal routes. It maps to the PostgreSQL schema name.

Enforced via the 8-layer strategy in §7.

### 3.2 Module Breakdown (NestJS — controller → service → repository)

| Module | Responsibility |
|---|---|
| `AuthModule` | JWT access+refresh, login/signup/logout, role guards |
| `TenantsModule` | Org creation/settings, plan info (tenant-scoped) |
| `OrgModule` | Org settings (`GET/PATCH /org`) + user management — invite, role change, remove, audit (`modules/org/`) |
| `JobPostingsModule` | CRUD, required-skills config, publish/close |
| `CandidatesModule` | Tenant-scoped candidate records (company's view of who applied) |
| `ApplicationsModule` | Pipeline — stage transitions, Kanban data, notes |
| `ResumeModule` | Authenticated candidate resume storage and recruiter-facing metadata |
| `SkillMatchingModule` | Score computation vs job posting requirements |
| `InterviewsModule` | Scheduling, feedback capture (`GET /org/users` picker moved to `OrgModule` in M9) |
| `NotificationsModule` | Email queue (stage changes, reminders) via BullMQ |
| `PublicCareersModule` | **Unauthenticated read-only** tenant careers API — open job listing and detail |
| `CandidateAccountModule` | Candidate auth (signup/login via unified `POST /auth/signup` + `/auth/signin`), global /candidate/* API for dashboard, job search, applications history, bookmarks, profile |
| `PlatformModule` | **SuperAdmin only** — cross-tenant tenant list/suspend/reactivate/stats (`/platform/*`), public-schema repos, `@Roles('SuperAdmin')` only |

`PublicCareersModule` is the unauthenticated read surface. It never creates candidates, applications, or resumes. Apply actions redirect visitors to unified sign-in; only the authenticated Candidate API creates applications. Redis rate limiting is deferred to Phase 6 for authentication and any future public write surfaces.

### 3.3 API Surface (representative)
```
Auth:            POST /auth/signin | POST /auth/signup (candidate) | POST /auth/org/signup
                 | /auth/refresh | /auth/logout
Internal:        GET /job-postings | POST /job-postings | PATCH /job-postings/:id
                 GET /applications?stage= | PATCH /applications/:id/stage | POST /applications/:id/notes
                 GET /candidates/:id | POST /interviews | POST /interviews/:id/feedback
Public:          GET /public/:tenantSlug/jobs | GET /public/:tenantSlug/jobs/:id
Candidate:      GET /candidate/jobs | POST /candidate/jobs/:tenantId/:jobId/apply
                 GET /candidate/applications | POST/DELETE /candidate/bookmarks
Platform(SA):    GET /platform/tenants | PATCH /platform/tenants/:id/suspend | GET /platform/stats
```
All routes are prefixed `api` (e.g. `POST /api/auth/signin`). Success responses are wrapped in `{ "data": ..., "message": "OK" }` (pass-through if already enveloped); errors use the shape in §5. Full endpoint list with roles in §5.

---

## 4. Data Model (ERD consolidated)

Entities: **TENANT**, **USER**, **JOB_POSTING**, **CANDIDATE**, **APPLICATION**, **PIPELINE_STAGE**, **SKILL**, **CANDIDATE_SKILL**, **INTERVIEW**, **INTERVIEW_FEEDBACK**, **NOTE**, **CANDIDATE_ACCOUNT**, **JOB_LISTINGS_INDEX**, **CANDIDATE_APPLICATIONS_INDEX**, **CANDIDATE_BOOKMARK**. Resume metadata is stored on `CANDIDATE_ACCOUNT`; there is no current tenant `RESUME` table. Plus infra/identity tables in the `public` schema: **USER_EMAIL**, **REFRESH_TOKEN**, **SUPER_ADMIN**, **AUDIT_LOG**.

Relationships:
- TENANT ||--o{ USER / JOB_POSTING / CANDIDATE / PIPELINE_STAGE
- JOB_POSTING ||--o{ APPLICATION ; CANDIDATE ||--o{ APPLICATION
- APPLICATION }o--|| PIPELINE_STAGE ; APPLICATION ||--o{ NOTE / INTERVIEW
- CANDIDATE_ACCOUNT ||--o{ CANDIDATE_SKILL ; CANDIDATE_SKILL }o--|| SKILL ; JOB_POSTING }o--o{ SKILL
- USER ||--o{ INTERVIEW ; INTERVIEW ||--o| INTERVIEW_FEEDBACK ; USER ||--o{ NOTE
- CANDIDATE_ACCOUNT }o--o{ JOB_LISTINGS_INDEX ; CANDIDATE_ACCOUNT ||--o{ CANDIDATE_APPLICATIONS_INDEX
- CANDIDATE_ACCOUNT ||--o{ CANDIDATE_BOOKMARK ; CANDIDATE_BOOKMARK }o--|| JOB_LISTINGS_INDEX

**Cross-schema flow:** CANDIDATE_ACCOUNT and CANDIDATE_SKILL live in the `public` schema (global). CANDIDATE_APPLICATIONS_INDEX and CANDIDATE_BOOKMARK also live in `public` (cross-tenant). JOB_LISTINGS_INDEX is a materialized/public view of OPEN job postings across all tenant schemas. Public careers listing reads the tenant-filtered public index; public job detail additionally reads required skills from the explicit tenant schema and shared public taxonomy. The authenticated `/candidate/*` API queries public indexes and performs validated writes into the selected tenant schema.

**Key fields:**
- `USER.tenantId` — **nullable** (null = SuperAdmin).
- `SKILL` — **NOT tenant-scoped** (shared taxonomy).
- `APPLICATION.matchScore` — denormalized float (0.0–1.0), recompute via background job if required skills change.
- Join tables: `candidate_skills` (candidateAccountId, skillId), `job_required_skills` (jobPostingId, skillId).

**Schema-level isolation:** tables do NOT carry `tenantId` columns. Isolation is provided by the PostgreSQL schema boundary — each tenant's data lives in its own schema. Cross-tenant reference is structurally impossible without explicit cross-schema qualification.

---

## 5. API Endpoint Reference (roles: SA/OA/R/HM/IV/—/PUBLIC/CANDIDATE)

| Method | Path | Roles | Desc |
|---|---|---|---|
| POST | `/auth/org/signup` | PUBLIC | Create Tenant + first OrgAdmin (body: companyName, slug, email, password) |
| POST | `/auth/signin` | PUBLIC | Unified login — access+refresh tokens (org users and candidates) |
| POST | `/auth/signup` | PUBLIC | Create candidate account (body: email, password, firstName, lastName, phone?) |
| POST | `/auth/refresh` | PUBLIC | Exchange refresh token |
| POST | `/auth/logout` | — | Revoke refresh token |
| GET | `/org` | OA,R,HM,IV | Tenant settings (name, slug, plan, status) |
| PATCH | `/org` | OA | Update tenant name (slug/plan immutable) |
| GET | `/org/users` | OA,R,HM | List users (interviewer picker) |
| POST | `/org/users/invite` | OA | Invite user+role+password (no mailer; duplicate → 409) |
| PATCH | `/org/users/:userId/role` | OA | Change role (no self-change; last OrgAdmin protected) |
| DELETE | `/org/users/:userId` | OA | Remove user (no self-remove; last OrgAdmin protected) |
| GET/POST/PATCH/DELETE | `/org/pipeline-stages[/:id]` | OA (GET —) | Manage ordered stages |
| GET/POST | `/job-postings` | — / OA,R | List / create |
| GET/PATCH/DELETE | `/job-postings/:id` | — / OA,R / OA | Read / update / delete(draft) |
| POST | `/job-postings/:id/publish` | OA,R | draft→open |
| POST | `/job-postings/:id/close` | OA,R | Close |
| GET/POST | `/candidates` | OA,R,HM | List / manual add |
| GET | `/candidates/:id` | OA,R,HM | Profile |
| GET/PATCH | `/applications` , `/applications/:id/stage` | OA,R,HM | List / move stage |
| POST/GET | `/applications/:id/notes` | OA,R,HM | Add / list notes |
| GET | `/interviews` | OA,R,HM,IV (IV: own only, server-side) | List |
| GET | `/interviews/:id` | OA,R,HM,IV (if assigned) | Detail |
| POST/PATCH | `/interviews` , `/interviews/:id` | OA,R,HM | Schedule / reschedule-cancel |
| POST | `/interviews/:id/feedback` | IV (if assigned) | Rating+comments (1:1; duplicate → 409) |
| GET | `/org/users` | OA,R,HM | Tenant users (interviewer picker) |
| GET | `/skills?search=` | — | Taxonomy search |
| GET | `/public/:tenantSlug/jobs` | PUBLIC | Careers listing |
| GET | `/public/:tenantSlug/jobs/:id` | PUBLIC | Job detail |
| GET | `/public/:tenantSlug/jobs` | PUBLIC | List this tenant's open careers |
| GET | `/public/:tenantSlug/jobs/:id` | PUBLIC | Open job detail + required skills |
| GET | `/candidate/jobs` | CANDIDATE | List open jobs (from index) |
| GET | `/candidate/jobs/:tenantId/:jobId` | CANDIDATE | Job detail |
| POST | `/candidate/jobs/:tenantId/:jobId/apply` | CANDIDATE | Apply with account |
| GET | `/candidate/applications` | CANDIDATE | Application history |
| GET | `/candidate/applications/:id` | CANDIDATE | Application detail |
| POST | `/candidate/bookmarks` | CANDIDATE | Save job |
| DELETE | `/candidate/bookmarks/:id` | CANDIDATE | Remove bookmark |
| GET | `/candidate/bookmarks` | CANDIDATE | List bookmarks |
| GET/PUT | `/candidate/profile` | CANDIDATE | View/update profile |
| POST/DELETE | `/candidate/resume` | CANDIDATE | Upload/remove profile resume |
| GET/POST | `/platform/tenants[/:id]` | SA | Tenant mgmt |
| GET | `/platform/tenants/:id` | SA | Tenant detail + usage counts |
| PATCH | `/platform/tenants/:id/suspend` | SA | Suspend (409 if already; blocks sign-in/refresh/careers) |
| PATCH | `/platform/tenants/:id/reactivate` | SA | Reactivate (409 if already) |
| GET | `/platform/stats` | SA | Platform stats |

**Cross-tenant convention:** resource exists-but-other-tenant → return **404 Not Found** (never 403). Log server-side (audit), never expose `TENANT_MISMATCH` to client.
**Success shape:** `{ "data": ..., "message": "OK" }` (global `ResponseInterceptor`; explicit envelopes pass through).
**Error shape:** `{ "error": { "code": "...", "message": "..." } }` — codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.

---

## 6. Role & Permission Matrix

| Capability | SA | OA | R | HM | IV | Candidate |
|---|---|---|---|---|---|---|
| Manage all tenants | ✅ | — | — | — | — | — |
| Tenant settings / users / roles / stages | — | ✅ | — | — | — | — |
| Create/edit job postings | — | ✅ | ✅ | — | — | — |
| View candidates & applications | — | ✅ | ✅ | ✅ | — | — |
| Move applications / add notes | — | ✅ | ✅ | ✅ | — | — |
| Schedule interviews | — | ✅ | ✅ | ✅ | — | — |
| View own interviews / submit feedback | — | — | — | — | ✅ | — |
| Browse public careers (no auth) | — | — | — | — | — | ✅ |
| Apply after Candidate authentication | — | — | — | — | — | ✅ |
| Login/signup to account | — | — | — | — | — | ✅ |
| Apply via account | — | — | — | — | — | ✅ |
| View application history | — | — | — | — | — | ✅ |
| Bookmark/save jobs | — | — | — | — | — | ✅ |
| Manage profile | — | — | — | — | — | ✅ |

**Enforcement rule:** every non-SA, non-Candidate check has TWO layers — frontend route guard (`beforeLoad` role checks in TanStack Router; UX only) + backend authorization (real block). Write a backend test per role asserting forbidden action → 403. Interviewer `GET /interviews` is server-side filtered to `interviewerId = currentUser`, not just UI-hidden.

---

## 7. Data Isolation Strategy (highest-risk — defense in depth)

**Core model: schema-per-tenant.** Each tenant gets their own PostgreSQL schema (e.g. `tenant_abc123`). Queries are routed via `search_path` set per-request. No `tenant_id` columns exist on tables. This schema boundary is the primary isolation mechanism, backed by additional layers below.

1. **Tenant identity from one place:** JWT `tenantId` claim only; ignore any client-supplied `tenantId`.
2. **Request-scoped context:** Node `AsyncLocalStorage` binds `{tenantId, userId, role}` per request via a NestJS interceptor. Repositories call `getTenantId()` internally — this maps to the tenant's schema name.
3. **Schema-routed Drizzle client:** Each request gets a Drizzle client instance with `search_path` set to the tenant's schema (e.g. `SET search_path TO tenant_abc123, public`). All queries run in that schema context without `WHERE tenant_id = X` — the schema **is** the filter. Red flag: any query using explicit cross-schema table references.
4. **PostgreSQL schema isolation:** Each tenant's data lives in its own schema namespace. Schema A's tables are completely invisible to queries running in schema B — this is enforced by PostgreSQL itself, not by application code. Tenant schemas are created at signup by cloning a template schema.
5. **Post-fetch assertion (paranoia):** Not needed for tenant isolation (schema boundary guarantees it), but `assertFound` is still used for standard not-found semantics.
6. **Namespacing outside RDBMS:** Redis keys `tenant:{tenantId}:...`; S3 keys are generated server-side for candidate profile or tenant application context, such as `candidate-resumes/{candidateAccountId}/...` or `tenants/{tenantId}/...`. Never accept a client-supplied storage path.
7. **Automated isolation test suite (CI release gate):** one test per resource — create schemas for Tenant A and B, seed identical tables in both, auth as A, assert that queries in A's scope cannot access or even reference B's schema. Failure = broken build.
8. **Audit logging:** `{tenantId, userId, action, resourceId, timestamp}` for role changes, exports, tenant-settings.

**SuperAdmin exception:** operates in the `public` schema (or a dedicated `platform` schema) with its own repositories. Never routes through a tenant schema. Protected by `requireRole('SuperAdmin')` guard only.

---

## 8. Tech Stack Rationale (key talking points)

- **NestJS:** mature, opinionated DI/Guard/Interceptor system — the right structure for a large-scale, multi-layered multi-tenant system. Module-per-domain keeps the codebase navigable as it grows.
- **Drizzle:** SQL-first, typed, lightweight — pairs well with PostgreSQL's advanced features (row-level security policies, partial unique indexes).
- **PostgreSQL:** chosen specifically for **schema-per-tenant isolation**. PostgreSQL natively supports multiple schemas within one database — MySQL's "schema" concept is synonymous with "database," making schema-per-tenant far more complex there. PG's `search_path` enables per-request schema routing without connection pooling overhead. Also supports `pgcrypto` for column-level encryption, `citext` for case-insensitive email matching, and `ROW LEVEL SECURITY` as an optional defense layer.
- **Redis (3 roles):** (1) rate-limit counters, (2) short-TTL dashboard aggregate cache (keys `tenant:{id}:...`), (3) BullMQ job queue backing.
- **BullMQ:** offloads future notification and other slow background work from the request cycle; Phase 4 resume handling is storage-only.
- **argon2:** password hashing (preferred over bcrypt for interview answer).
- **Zod:** shared validation both ends.
- **AsyncLocalStorage:** request-scoped tenant context (see §7 L2).
- **Frontend:** Mantine (styled, fast), TanStack Query (optimistic pipeline updates), dnd-kit (accessible Kanban), TanStack Router (type-safe role-gated trees).
- **Infra:** Docker Compose (app+postgres+redis+minio) → `docker compose up`; GitHub Actions (lint→test→build→push); Railway/Render or AWS ECS/Fargate.

**Scope boundaries (know for interviews):** no real billing (static plan config); no ML matching v1 (keyword/taxonomy, clean "v2 embeddings" answer); single-region.

---

## 9. Frontend Structure (React + TS)

File-based TanStack Router (`frontend/src/routes/`), Mantine 9 + TanStack Query 5 + Zustand 5 auth store.

```
/src
  /main.tsx, /App.tsx        entry
  /app
    /providers.tsx           MantineProvider + Notifications + QueryClientProvider + RouterProvider
    /router.tsx              createRouter + routeTree import
  /routes                    FILE-BASED ROUTES (TanStack Router, generated routeTree.gen.ts)
    /auth/signin.tsx (unified login → features/auth/SignInPage), /auth/signup.tsx (candidate → features/candidate-portal/signup/SignupPage), /auth/org/signup.tsx
    /_candidate.tsx          pathless layout (CandidatePlatform) + beforeLoad guard: requireRole('Candidate')
    /_candidate/dashboard.tsx, /applications.tsx, /bookmarks.tsx, /settings.tsx   → URLs /dashboard, /applications, /bookmarks, /settings
    /org.tsx                 org layout (OrgPlatform) + beforeLoad guard (internal roles) → /org/dashboard.tsx
    /admin.tsx + /admin/tenants.tsx   SuperAdmin platform (SuperAdminPlatform) → /admin/tenants
    /index.tsx               role-based redirect to the correct platform
  /api
    /client.ts               axios instance (baseURL /api, access token, 401→refresh→retry)
    /useAuth.ts              Zustand auth store (login/signup/logout/refresh, localStorage persist)
    /authApi.ts              auth endpoints + types
    /queryKeys.ts            TanStack Query cache key factory (P2)
    /jobPostingsApi.ts, /candidatesApi.ts, /skillsApi.ts   (P2)
  /features
    /auth        LoginPage, SignupPage, OrgSignupPage (call useApiMutation)
    /org         OrgPlatform (layout), OrgDashboard, JobPostingList/Form (P2), CandidateList/Profile (P2),
                 PipelineBoard/Column/ApplicationCard (P3, dnd-kit), Interviews (P8)
    /admin       SuperAdminPlatform (layout), TenantsList, TenantDetail, PlatformStats (P9)
    /candidate-portal CandidatePlatform (layout), JobsPage, ApplicationsPage, BookmarksPage, ProfilePage
    /pipeline, /job-postings, /candidates, /resumes, /interviews, /public-careers   (implemented as M3–M5 features)
  /hooks
    /useApiMutation.ts       wrapper — auto success/error toasts via Notifications
  /components                (shared)
  /types                     mirror Zod schemas
  /utils
```

**Routing:** `/auth/*` public (`/auth/signin` unified login, `/auth/signup` candidate, `/auth/org/signup` org); `_candidate` layout gated to Candidate → `/dashboard`, `/applications`, `/bookmarks`, `/settings`; `org` layout gated to internal roles (OrgAdmin/Recruiter/HiringManager/Interviewer) via `beforeLoad` → `/org/*`; `admin` layout gated to SuperAdmin → `/admin/*`. Guards redirect to the correct platform by role.

---

## 10. Build Order & Testing

**Milestones (always demoable):**
1. ✅ Auth + Tenant + role guards (no Redis/upload yet) — **implemented**
2. ✅ Job Postings + Candidates CRUD (manual entry) — **implemented**
3. ✅ Applications/Pipeline — Kanban board end-to-end (demo centerpiece) — **implemented**
4. ✅ Candidate resume storage + manual skills → matchScore — **implemented**
5. ✅ Public tenant-specific careers listing/detail + Candidate-only apply — **implemented**
6. ✅ Redis: sign-in rate-limit + tenant dashboard cache
7. ✅ BullMQ: stage-change notifications as background jobs (audit-log delivery; resume parsing is out of product design)
8. ✅ Interviews + feedback — **implemented**
9. ⬜ Docker Compose full stack + GitHub Actions CI
10. ⬜ Deploy; S3-compatible client already in use (MinIO → real S3 = env swap)

> **Note:** Candidate Accounts were built early (with the M1 restructure). Authenticated candidate features (signup via unified `POST /auth/signup`, signin via `POST /auth/signin`, jobs, applications history, application detail, bookmarks, profile, skills, and resume storage) are **implemented** (`CandidateAccountModule`, public-schema candidate tables, `/candidate/*` API, and candidate-portal frontend). Public careers browsing is implemented through read-only `/public/:tenantSlug/jobs` GET routes. There is intentionally no anonymous `/public/*` apply path; Apply redirects anonymous visitors to sign-in/signup. Phase 6's sign-in limiter and tenant dashboard cache, Phase 7's BullMQ notifications queue (stage-change → audit-log delivery), and Phase 8's interviews + feedback (scheduling with auto-move to the Interview stage, server-side interviewer scoping, 1:1 feedback, `GET /org/users` picker) are implemented.

**Testing:**
- Unit: skill-match score (0/all/partial edge cases), stage-transition rules.
- Integration: pipeline transitions, **tenant isolation** (Tenant A never fetches B's data).
- Load: future `k6`/`autocannon` coverage for the Phase 6 authentication/public-write rate-limit scope.
- E2E (Playwright, doubles as demo): signup → post job → public careers browse → Candidate sign-in/signup → apply → drag through stages.

**CI release gate:** isolation test suite (§7 L7) must pass — treat failure as broken build.

---

## 11. Implementation Checklist (carry into build)

- [x] `tenantId` only from verified JWT
- [x] `AsyncLocalStorage` tenant context via NestJS interceptor before all guards and routes
- [x] Tenant schema created on signup (template schema cloned)
- [x] Per-request `search_path` set via Drizzle client wrapper based on `getTenantId()`
- [x] All DB via repositories; no direct Drizzle outside `/repositories`
- [x] Redis + S3 keys namespaced by `tenantId`
- [x] One isolation test per resource across schemas, in CI
- [x] SuperAdmin operates in public/platform schema with separate repos + role-only guard (`modules/platform/`, M9)
- [x] Audit logging for role changes/exports/tenant-settings (`common/audit/audit.service.ts`, M9 — invite/role/remove/suspend/reactivate; data export has no call site yet)
- [x] Backend 403 test per role per protected action (release-gate e2e suites)
- [x] Frontend route guards (`beforeLoad`) + backend guard both present

---

## 12. How To Build This (Your Control Plan)

**Principle:** Never one-shot the whole project. Build milestone-by-milestone; each milestone is one focused prompt/PR you review and approve before continuing. The AI assistant should load `00_PROJECT_INSTRUCTIONS.md` (this file) at the start of every session so context stays consistent.

### 12.1 Session protocol (repeat every milestone)
1. Open a new chat / fresh context and say: *"Build Milestone N of TalentPipe. Follow 00_PROJECT_INSTRUCTIONS.md. Scope: <specific slice>. Do not exceed this scope."*
2. The AI scaffolds only what's in scope, runs the relevant tests, and stops.
3. **You review** the diff/tests, run it locally (`docker-compose up` for infra), then approve.
4. Commit with a milestone tag (e.g. `feat(m1): auth + tenant + rbac`).
5. Only then proceed to the next milestone.

### 12.2 The milestones as independent build units

| M | Name | What to prompt | Done when | Depends on |
|---|------|----------------|-----------|------------|
| **M0** | **Scaffold** | "Scaffold monorepo: `/backend` (NestJS+Drizzle+Zod+AsyncLocalStorage), `/frontend` (Vite+React+Mantine+TanStack). Docker Compose with postgres/redis/minio. No features yet." | `npm run start:dev` boots backend; frontend dev server runs; DB migrates empty schema | — |
| **M1** | Auth + Tenancy + RBAC ✅ | "Build AuthModule + TenantsModule + tenant-context interceptor + isolation layers 1–3 (§7 L1-L3). On signup, create Tenant + OrgAdmin AND provision a new PostgreSQL schema. JWT access+refresh." | Signup creates tenant schema; login works; isolation tests across schemas pass | M0 |
| **M2** | Job Postings + Candidates ⬜ | "JobPostingsModule + CandidatesModule CRUD + repositories (§3,§5). All queries run in tenant schema via search_path." | CRUD works via API; schema isolation tests added | M1 |
| **M3** | Pipeline (Kanban) | "ApplicationsModule + PipelineStage + frontend PipelineBoard with dnd-kit optimistic updates (§9 /features/pipeline). Backend `PATCH /applications/:id/stage`." | Drag stage move works end-to-end | M2 |
| **M4** | Resume + Skill Match ✅ | "Candidate profile resume storage in MinIO plus manual candidate skills and explainable match score from profile/override." | Candidate profile stores resume and apply shows match score | M2 |
| **M5** | Public Careers + Candidate Apply ✅ | "PublicCareersModule: tenant-specific open listing/detail GET routes. Apply redirects anonymous visitors to unified auth; Candidate API performs the write." | Candidate can browse publicly and apply after authentication | M3,M4 |
| **M6** | **Redis (rate-limit + cache) ✅** | "Sign-in-only Redis rate limiter (429+Retry-After). Dashboard aggregate cache namespaced `tenant:{id}:`." | Release-gate tests show limiter, cache, and tenant isolation | M5 |
| **M7** | BullMQ background jobs ✅ | "Move stage-change notifications to BullMQ workers (§8, NFR-7 retries)." | Stage change enqueues, worker delivers (audit log) | M4,M6 |
| **M8** | Interviews + Feedback ✅ | "InterviewsModule + INTERVIEW_FEEDBACK table + scheduling + assigned-only feedback (server-side filter)." | Schedule + submit feedback works | M3 |
| **M9** | Admin + Platform + CI | "OrgAdmin settings/users UI + PlatformModule (SuperAdmin, unscoped repos). GitHub Actions CI (lint→test→build→push) with isolation suite as gate." | CI green; platform views work | M6,M8 |
| **M10** | Deploy | "Prod config: S3 presigned uploads, env-based secrets, deploy to Railway/Render or AWS." | Live URL; public apply works in prod | M9 |

### 12.3 Key control rules for you
- **Always pass `00_PROJECT_INSTRUCTIONS.md`** as context — this is the single source of truth.
- **One milestone per prompt.** If the AI tries to build M3 while you asked for M1, stop it.
- **Never skip M1's isolation tests** — they are the release gate (§7 L7) and the project's riskiest part.
- **Review the diff, don't just trust green tests.** The isolation layer's value is in code review (§7 L3 red-flag rule).
- **Frontend can lag backend** by a milestone if you want faster API validation — but keep M3's Kanban as the demo centerpiece.
- **Tag commits by milestone** so you can `git revert` one unit without losing the others — this is your safety net for staying in control.
