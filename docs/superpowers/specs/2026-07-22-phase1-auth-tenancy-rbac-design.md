# Phase 1 — Auth, Tenancy & RBAC

**Date:** 2026-07-22
**Status:** Approved

## Objective

Implement multi-company auth with schema-per-company isolation, JWT-based sessions, role-based access control, and a basic frontend auth shell.

## Deviations from Implementation Guide

| Guide Step | Adaptation |
|------------|------------|
| 1.1 (schema) | Added `userEmails` table (public) — global email → (companyId, userId) lookup for O(1) login. Added `refreshTokens` table (public) — DB-backed refresh tokens for revocable sessions. |
| 1.8 (login) | Login no longer iterates schemas. Instead: query `userEmails` → get companyId → set search_path → verify password. |
| 1.8 (refresh) | Refresh token is stored as a hashed value in `refreshTokens` table, not a stateless JWT. Expiry tracked server-side. |

## Architecture

### Data Model — Public Schema

| Table | Columns | Purpose |
|-------|---------|---------|
| `companies` | id (uuid pk), name (varchar 255), slug (varchar 100, unique), plan (varchar 50, default 'free'), createdAt (timestamp) | Company registration |
| `skills` | id (uuid pk), name (varchar 255, unique), category (varchar 100) | Skill taxonomy (seeded in Phase 2) |
| `auditLogs` | id (uuid pk), companyId (varchar 36), userId (varchar 36), action (varchar 100), resourceId (varchar 36), metadata (text), createdAt (timestamp) | Cross-company audit trail |
| `userEmails` | id (uuid pk), email (varchar 255, unique), companyId (uuid), userId (uuid) | **New** — O(1) login lookup |
| `refreshTokens` | id (uuid pk), userId (uuid), companyId (uuid), tokenHash (varchar 255), expiresAt (timestamp), createdAt (timestamp) | **New** — DB-backed refresh tokens |

Indexes: `companies.slug` unique, `skills.name` unique, `userEmails.email` unique, `auditLogs(companyId, action)`, `refreshTokens(userId)`.

### Data Model — Per-Company Schema (created per signup)

All tables in `company_{id}` schema, no `company_id` columns:

- `users` — id, email (unique), passwordHash, role (varchar 50, default 'CompanyAdmin'), createdAt
- `jobPostings` — id, title, description, status (default 'draft'), createdByUserId (FK), createdAt
- `candidates` — id, name, email, phone, createdAt
- `pipelineStages` — id, name, order
- `applications` — id, candidateId (FK), jobPostingId (FK), currentStageId (FK), matchScore, appliedAt
- `resumes` — id, candidateId (FK), fileUrl, parsedText, uploadedAt
- `resumeSkills` — resumeId, skillId (unique pair)
- `jobRequiredSkills` — jobPostingId, skillId (unique pair)
- `interviews` — id, applicationId (FK), interviewerId (FK), scheduledAt, status
- `interviewFeedbacks` — id, interviewId (FK, unique), rating, comments, submittedAt
- `notes` — id, applicationId (FK), authorUserId (FK), content, createdAt

### Tenancy Layer

1. **AsyncLocalStorage** (`company-context.ts`): Holds `{ companyId: string, userId: string, role: string }` per request. Provides `getCompanyId()`, `getSchema()`, `getCurrentUser()` accessors.

2. **CompanyContextInterceptor** (`company-context.interceptor.ts`): Global NestJS interceptor. Extracts `request.user` (set by Passport JWT strategy), runs the request handler inside `asyncStorage.run(context, ...)`.

3. **DrizzleSchemaService** (`drizzle-schema.service.ts`): Injects the Drizzle client. `forCurrentCompany()` executes `SET search_path TO {schema_name}, public` before each query. `forPublic()` executes `SET search_path TO public`.

### Auth Flow

**Signup** (`POST /auth/signup`):
1. Validate slug uniqueness via `companyRepository.findBySlug()`
2. Insert company into `public.companies`
3. Execute raw SQL: `CREATE SCHEMA company_{id}` + clone tables from `template` schema
4. Hash password via argon2
5. Insert CompanyAdmin user into `company_{id}.users`
6. Insert default pipeline stages (Applied, Screening, Interview, Offer, Hired, Rejected)
7. Insert row into `public.userEmails` (email → companyId + userId)
8. Generate JWT access token (15m) + refresh token (7d), store hashed refresh in `public.refreshTokens`
9. Return `{ accessToken, refreshToken }`

**Login** (`POST /auth/login`):
1. Look up email in `public.userEmails` → get companyId + userId
2. Set search_path to `company_{companyId}`
3. Fetch full user row, verify password via argon2
4. Generate new access + refresh tokens, store hashed refresh
5. Return `{ accessToken, refreshToken }`

**Refresh** (`POST /auth/refresh`):
1. Validate the refresh token JWT structure
2. Look up hash in `public.refreshTokens` by userId
3. Verify hash matches, check expiry
4. Issue new access token (+ optionally rotate refresh token)
5. Return `{ accessToken, refreshToken? }`

### RBAC

- **RolesGuard** (`roles.guard.ts`): NestJS guard. Reads `@Roles(...)` metadata from reflector. Compares against `request.user.role`. Returns 403 if not authorized.
- **@Roles decorator** (`roles.decorator.ts`): `@Roles('CompanyAdmin', 'Recruiter')` sets metadata.
- Roles: SuperAdmin (platform), CompanyAdmin (company), Recruiter, HiringManager, Interviewer, Candidate.

### Repositories

- **CompanyRepository**: `findBySlug(slug)`, `findById(id)`, `create(data)` — all use `forPublic()`
- **UserRepository**: `findByEmail(email)`, `findById(id)`, `create(data)` — all use `forCurrentCompany()`
- **RefreshTokenRepository**: `create(data)`, `findByUserId(userId)`, `deleteByUserId(userId)` — uses `forPublic()`

### Endpoints

| Method | Path | Auth | Roles | Body |
|--------|------|------|-------|------|
| POST | `/auth/signup` | No | — | `{ companyName, slug, email, password }` |
| POST | `/auth/login` | No | — | `{ email, password }` |
| POST | `/auth/refresh` | No | — | `{ refreshToken }` |
| GET | `/health` | No | — | — |

JWT payload: `{ sub: userId, companyId, role }`.

### App Wiring

`AppModule` imports: `ConfigModule`, `AuthModule`, `HealthController`.  
Global providers: `APP_INTERCEPTOR` → `CompanyContextInterceptor`, `APP_GUARD` → `RolesGuard`.

### Frontend Auth

- **`useAuth.ts`** — Zustand store: `login(email, password)`, `signup(data)`, `logout()`, `refreshToken()`. Stores access + refresh tokens in localStorage. On mount, checks localStorage for existing session.
- **`LoginPage.tsx`** — Mantine form: email + password + submit. Calls `useAuth.login()`. On success, navigates to `/dashboard`.
- **`SignupPage.tsx`** — Mantine form: company name, slug, email, password, confirm password. Calls `useAuth.signup()`. On success, navigates to `/login` with success notification.
- **`router.tsx`** — TanStack Router: `/login` (public), `/signup` (public), `/dashboard` (protected).
- **`RoleGuard.tsx`** — Wraps protected routes. Checks `user.role` against allowed roles. Redirects to `/login` if unauthenticated, shows 403 if wrong role.
- **`AppShell.tsx`** — Mantine AppShell with sidebar: Dashboard, Job Postings, Candidates, Pipeline, Interviews.
- **`providers.tsx`** — QueryClientProvider + MantineProvider + RouterProvider.
- **`App.tsx`** — Mounts providers, checks localStorage for auth on mount.
- **`main.tsx`** — Renders `<App />`.

## Template Schema Creation

After `drizzle-kit migrate` creates public tables, connect to postgres and run SQL to clone all company-scoped tables into a `template` schema. This is a one-time manual step (or added to a migration script).

## Verification

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/auth/signup -H 'Content-Type: application/json' -d '{"companyName":"TestCorp","slug":"testcorp","email":"admin@testcorp.com","password":"password123"}'
curl -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@testcorp.com","password":"password123"}'
# Frontend: /login -> /signup -> sign up -> redirect to /login -> log in -> /dashboard with sidebar
```
