# TalentPipe — Implementation Guide

**Purpose:** Concise step-by-step instructions per phase. Each step is an actionable command or file to create. Complete phases in order.

**Stack:** NestJS + PostgreSQL + Drizzle ORM — React + Mantine + TanStack Query + dnd-kit
**Package manager:** npm
**Prerequisites:** Node 20+, Docker Desktop, Git

> **Status legend:** ✅ = already implemented in the repo. ⬜ = planned / not yet built. Phase 0 and Phase 1 are complete and the steps below have been corrected to match the *actual* implementation (which includes post-M1 refinements: backend SOLID restructure, unified auth routes, global response envelope, three frontend platforms, seed script, and early candidate accounts).

---

## Phase 0 — Project Scaffold ✅ (complete)

### Step 0.1 — Init repo & folders
```
git init
mkdir backend frontend
```

### Step 0.2 — Scaffold backend
```
cd backend
npm init -y
npm install @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs
npm install drizzle-orm pg zod @nestjs/jwt @nestjs/config argon2 @nestjs/passport passport passport-jwt
npm install -D typescript drizzle-kit @types/node @types/pg @nestjs/cli @types/passport-jwt tsx
```

Create `backend/tsconfig.json` with:
- target ES2022, module commonjs, outDir ./dist, rootDir ./src
- strict true, esModuleInterop true, experimentalDecorators true, emitDecoratorMetadata true
- include `src/**/*`

Create dirs: `src src/modules src/interceptors src/repositories src/database src/shared drizzle`

### Step 0.3 — NestJS entry point
Create `src/main.ts` — `NestFactory.create(AppModule)`, `enableCors()` (localhost:5173 via `CORS_ORIGIN`), `setGlobalPrefix('api')`, listen(3000).
Create `src/app.module.ts` — import `ConfigModule.forRoot({ isGlobal: true })`, export class AppModule.

**Actual scripts (current `backend/package.json`):**
```
"start:dev": "nest start --watch"
"build": "nest build"
"start:prod": "node dist/main"
"typecheck": "tsc --noEmit"
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
"test": "jest"
"test:e2e": "jest --config ./test/jest-e2e.json"
"seed": "npx tsx scripts/seed.ts"
"format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\""
```

### Step 0.4 — Docker Compose
Create `docker-compose.yml` at project root with services:
- `postgres`: image postgres:16, env POSTGRES_USER=devuser / PASSWORD=devpassword / DB=talentpipe, port 5432
- `redis`: image redis:7-alpine, port 6379
- `minio`: image minio/minio, command `server /data --console-address ":9001"`, ports 9000+9001, env MINIO_ROOT_USER/PASSWORD=minioadmin

### Step 0.5 — Environment file
Create `backend/.env` with:
```
DATABASE_URL=postgres://devuser:devpassword@localhost:5432/talentpipe
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### Step 0.6 — Drizzle config
Create `backend/drizzle.config.ts` — schema `./src/database/schema.ts`, out `./drizzle`, driver pg, connectionString from env.

### Step 0.7 — Scaffold frontend
```
cd frontend
npm create vite@latest . -- --template react-ts
npm install @mantine/core @mantine/hooks @mantine/form @mantine/notifications @tabler/icons-react
npm install @tanstack/react-query @tanstack/react-router zustand
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install zod dayjs
```
Create dirs: `src/app src/features src/shared/components src/shared/hooks src/shared/api src/shared/types`

### Step 0.8 — Verify
```
docker compose up -d
cd backend && npm run start:dev    # http://localhost:3000/api/health
cd frontend && npm run dev         # http://localhost:5173
```

**Commit:** `git add -A && git commit -m "phase0: NestJS backend + Vite frontend + Docker infra scaffold"`

> **Deltas from the guide (already applied in the repo):**
> - Backend is NestJS 11 CLI-managed (`nest start/build`), not `tsx`/`tsc` scripts.
> - `lint` is ESLint; type checking is the separate `typecheck` script.
> - Frontend is Vite 8 + React 19 + Mantine 9 + TanStack Router/Query + dnd-kit + Zod + axios + Zustand.
> - `backend/.env` is committed for local dev (see `00b_LOCAL_DEV_BOOTSTRAP.md`).

---

## Phase 1 — Auth, Tenancy & RBAC ✅ (complete)

> **Important:** Phase 1 is implemented and then refactored. The steps below reflect the **current** state of the repo (after the backend SOLID restructure), not the original first-pass layout. Current file layout:
> ```
> backend/src/
>   common/           # context/tenant-context.ts, auth/ (auth-core.module, jwt.strategy),
>                     # guards/ (roles, candidate-auth), decorators/ (roles, current-user),
>                     # interceptors/ (tenant-context, response), filters/ (api-exception),
>                     # middlewares/ (logger), pipes/ (zod-validation), password.ts
>   database/         # database.module.ts, drizzle.provider.ts, drizzle-schema.service.ts, schema.ts
>   repositories/     # base.repository.ts, repositories.module.ts, + 11 entity repos
>   modules/          # auth/, candidate-account/, health/
> ```

### Step 1.1 — Drizzle schema
Create `backend/src/database/schema.ts` with ALL tables below.

**Public schema tables (live once, shared across tenants):**
- `tenants`: id (uuid pk), name (varchar 255), slug (varchar 100, unique), plan (varchar 50, default 'free'), createdAt.
- `skills`: id (uuid pk), name (varchar 255, unique), category (varchar 100).
- `auditLogs`: id (uuid pk), tenantId, userId, action (varchar 100), resourceId, metadata (text), createdAt. Index on (tenantId, action).
- `userEmails`: id (uuid pk), email (varchar 255, unique), tenantId, userId — **login lookup bridge** between a public-schema email and the owning tenant's schema.
- `refreshTokens`: id (uuid pk), userId, tenantId, tokenHash (argon2 hash of refresh token), expiresAt, createdAt. Index on userId.
- `superAdmins`: id (uuid pk), email (varchar 255, unique), passwordHash, name, createdAt — platform-level accounts (SuperAdmin role, no tenant).
- `candidateAccounts`: id (uuid pk), email (varchar 255, unique), passwordHash, firstName, lastName, phone, createdAt.
- `candidateBookmarks`: id, candidateAccountId (FK), tenantId, jobPostingId, jobTitle, companyName, createdAt. Indexes on account + (tenantId, jobPostingId).
- `candidateApplicationsIndex`: id, candidateAccountId (FK), tenantId, jobPostingId, applicationId, jobTitle, companyName, status, appliedAt. Indexes on account + (tenantId, jobPostingId).
- `jobListingsIndex`: id, tenantId, jobPostingId (unique), title, description, companyName, companySlug, status, createdAt, updatedAt. Indexes on status / companyName / tenantId.

> **Note:** These public candidate tables are NOT cloned into the per-tenant template schema. Candidate accounts are cross-tenant by design.

**Tenant-schema tables (no tenantId columns — the schema boundary is the isolation):**
- `users`: id, email (unique), passwordHash, role (default 'OrgAdmin'), createdAt.
- `jobPostings`: id, title (varchar 255), description (text), status (default 'draft'), createdByUserId (FK), createdAt.
- `candidates`: id, name, email, phone, createdAt. Index on email.
- `pipelineStages`: id, name (varchar 100), order (integer, default 0). Index on order.
- `applications`: id, candidateId (FK), jobPostingId (FK), currentStageId (FK), matchScore (float, default 0), appliedAt. Index on (jobPostingId, currentStageId).
- `resumes`: id, candidateId (FK), fileUrl (varchar 512), parsedText (text), uploadedAt. Index on candidateId.
- `resumeSkills`: resumeId (FK), skillId. Unique on (resumeId, skillId).
- `jobRequiredSkills`: jobPostingId (FK), skillId. Unique on (jobPostingId, skillId).
- `interviews`: id, applicationId (FK), interviewerId (FK), scheduledAt, status (default 'scheduled'). Indexes on interviewerId, applicationId.
- `interviewFeedbacks`: id, interviewId (FK, unique), rating (integer), comments, submittedAt.
- `notes`: id, applicationId (FK), authorUserId (FK), content, createdAt. Index on applicationId.

### Step 1.2 — Migration & template schema
```
cd backend
npx drizzle-kit generate
```
This writes SQL files under `backend/drizzle/<timestamp>_<name>/migration.sql` — Drizzle never auto-applies. Apply manually via psql (see `00b_LOCAL_DEV_BOOTSTRAP.md` steps 3–4).

**Applied migrations (current repo):**
```
backend/drizzle/20260722095156_bright_iron_fist/migration.sql    # 16 public tables
backend/drizzle/20260723191416_fresh_blindfold/migration.sql      # +candidate tables
backend/drizzle/20260727163000_smooth_spitfire/migration.sql      # +super_admins
```

**Template schema** (`backend/drizzle/template-schema.sql`) — the hand-written file cloned per tenant at signup. Apply it once to create the `template` schema:
```
Get-Content backend/drizzle/template-schema.sql |
  docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```
It defines the 11 tenant tables: `users, job_postings, candidates, pipeline_stages, applications, resumes, resume_skills, job_required_skills, interviews, interview_feedbacks, notes`.

> **Note:** The candidate-related public tables (`candidate_accounts`, `candidate_bookmarks`, `candidate_applications_index`, `job_listings_index`) are NOT in the template — they exist only in `public`. `super_admins`, `user_emails`, `refresh_tokens` are also public-only.
> **Runtime check:** any `relation "..." does not exist` on login means a migration or the template schema was skipped — re-run `00b_LOCAL_DEV_BOOTSTRAP.md` steps 3–5.

### Step 1.3 — Drizzle provider
Create `backend/src/database/drizzle.provider.ts` — export `DRIZZLE_PROVIDER` symbol + a factory that creates a `pg.Pool` from `DATABASE_URL` (injected via `ConfigService` — no direct `process.env`). Owned by `DatabaseModule`, which also provides/exports `DrizzleSchemaService`.

### Step 1.4 — Tenant context
Create `backend/src/common/context/tenant-context.ts` — `AsyncLocalStorage<TenantContext>`, `getTenantId()`, `getSchema()` (returns `public` for SuperAdmin/tenantless, else `tenant_{id}`), `getCurrentUser()`. Accessors throw if no context.

### Step 1.5 — Tenant interceptor
Create `backend/src/common/interceptors/tenant-context.interceptor.ts` — extracts `request.user`, maps SuperAdmin/tenantless users to `'public'`, runs `asyncStorage.run({tenantId, userId, role}, ...)` around `next.handle()`. Registered globally in `AppModule` via `APP_INTERCEPTOR`.

### Step 1.6 — Schema routing service
Create `backend/src/database/drizzle-schema.service.ts` — injects the pool, provides:
- `forCurrentTenant()` → acquires a client, `SET search_path TO "<schema>", public`, returns `{ db, release }`
- `forSchema(name)` → same for an explicit schema
- `forPublic()` → `SET search_path TO public`

`BaseRepository` wraps these in `withDb(schema, fn)` with try/finally `release()`. **All DB access goes through repositories.**

### Step 1.7 — Password utility
Create `backend/src/common/password.ts` — `hashPassword(password)` and `verifyPassword(hash, password)` using argon2.

### Step 1.8 — AuthModule
Create `backend/src/modules/auth/auth.module.ts` — imports `AuthCoreModule` (Passport + JwtModule + JwtStrategy, configured from `ConfigService`, 15m access) + `RepositoriesModule`. Providers: `AuthService`, `TokenService`, `TenantProvisioningService`.

Create `backend/src/modules/auth/auth.controller.ts` — **unified auth routes** (current):
```
POST /auth/org/signup   — create Tenant + first OrgAdmin
POST /auth/signin       — unified sign-in (org user | candidate | superadmin)
POST /auth/signup       — candidate signup
POST /auth/refresh      — exchange refresh token
POST /auth/logout       — revoke refresh token (JWT-protected)
```
All bodies validated via `@Body(new ZodValidationPipe(Schema))` (Zod DTOs in `dto/`: `org-signup.dto.ts`, `signin.dto.ts`, `refresh.dto.ts`, `candidate-auth.dto.ts`).

Create `backend/src/modules/auth/auth.service.ts` — orchestration only (no raw Drizzle, no `process.env`, no argon2):
- `orgSignup(dto)` → `TenantProvisioningService.createTenant(dto)` → `TokenService.issueTokens({ id: userId, tenantId, role: 'OrgAdmin' })` → returns `{ data: tokens, message: 'Company created' }`
- `signin(dto)` → resolve email via `UserEmailRepository` (public) → fetch tenant user via `UserRepository.findByEmail(email, "tenant_<id>")` → `verifyPassword` → issue tokens; fall back to `CandidateAccountRepository` → `role: 'Candidate'`, no tenantId; fall back to `SuperAdminRepository` → `role: 'SuperAdmin'`, no tenantId
- `candidateSignup(dto)` → `CandidateAccountRepository.create` → issue tokens with `role: 'Candidate'`
- `refresh(dto)` / `logout(userId)` → delegated to `TokenService`

Create `backend/src/modules/auth/services/token.service.ts` — one `issueTokens({ id, tenantId, role })` signing access (JWT_SECRET, 15m) + refresh (JWT_REFRESH_SECRET, 7d), argon2-hash the refresh token, delete-by-user + insert via `RefreshTokenRepository`, return `{ accessToken, refreshToken }`. Also `rotate(refreshToken)` (verify hash + expiry, re-issue) and `logout(userId)`.

Create `backend/src/modules/auth/services/tenant-provisioning.service.ts` — `createTenant(dto)`:
1. `TenantRepository.findBySlug` → 409 if taken
2. `TenantRepository.create({ id, name, slug })`
3. `TenantRepository.provisionSchema(tenantId)` — `CREATE SCHEMA "tenant_<id>"` + `CREATE TABLE ... (LIKE template."<table>" INCLUDING ALL)` for all 11 tenant tables
4. `UserRepository.create({ ... role: 'OrgAdmin' }, "tenant_<id>")`
5. `PipelineStageRepository.createMany(DEFAULT_STAGES, "tenant_<id>")` — Applied/Screening/Interview/Offer/Hired/Rejected
6. `UserEmailRepository.create({ email, tenantId, userId })`
Returns `{ tenantId, userId }`.

Create `backend/src/common/auth/jwt.strategy.ts` — PassportStrategy extracting Bearer token; `validate(payload)` returns `{ userId: payload.sub, tenantId, role }`.

### Step 1.9 — RolesGuard + @Roles decorator
Create `backend/src/common/guards/roles.guard.ts` — reads Reflector metadata `roles` (from `@Roles(...)`) against `request.user.role`; returns true when no roles required. Registered **globally** via `APP_GUARD` in `AppModule`. Create `backend/src/common/decorators/roles.decorator.ts` — `Roles(...roles: string[])` sets metadata.
Also: `backend/src/common/guards/candidate-auth.guard.ts` — `CanActivate` returning `request.user?.role === 'Candidate'` (protects `/candidate/*`), and `backend/src/common/decorators/current-user.decorator.ts` — typed `req.user` accessor.

### Step 1.10 — Repositories
Create `backend/src/repositories/base.repository.ts` — abstract class injecting `DrizzleSchemaService`; `withDb(schema, fn)` acquires a client, sets `search_path`, runs `fn(db)`, releases in `finally`. Schema resolution: explicit arg > current-tenant (ALS) > public.
Create `backend/src/repositories/repositories.module.ts` — imports `DatabaseModule`, provides + exports all repos.

**Tenant-scoped repos (default to current-tenant context):** `user`, `pipeline-stage`, `candidate`, `application`, and the Phase-2 additions (`job-posting`, `resume`, `interview`, etc.).
**Public-scoped repos (explicit `'public'`):** `tenant` (findBySlug/findById/create/provisionSchema), `user-email`, `refresh-token`, `super-admin`, `candidate-account`, `candidate-bookmark`, `candidate-applications-index`, `job-listings-index`.

Return convention: singletons → `T | null`; lists → `T[]`.

### Step 1.11 — Health controller
Create `backend/src/modules/health/health.module.ts` + `health.controller.ts` — `GET /health` returns `{ status: 'ok', timestamp }` (wrapped by the response interceptor as `{ data: { status, timestamp }, message: 'OK' }` at `/api/health`).

### Step 1.12 — Wire AppModule
Update `src/app.module.ts` — imports `ConfigModule.forRoot({ isGlobal: true })`, `AuthModule`, `CandidateAccountModule`, `HealthModule`. Global providers:
```
APP_INTERCEPTOR → TenantContextInterceptor, ResponseInterceptor
APP_GUARD       → RolesGuard
APP_FILTER      → ApiExceptionFilter
```
`configure()` applies `LoggerMiddleware` to all routes.
`ResponseInterceptor` (`common/interceptors/response.interceptor.ts`) wraps every 2xx body as `{ data, message }` (passes through explicit envelopes). `ApiExceptionFilter` (`common/filters/api-exception.filter.ts`) normalizes errors to `{ error: { code, message } }` (status→code map: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 422 UNPROCESSABLE, 429 RATE_LIMITED, 500 INTERNAL_ERROR, 503 SERVICE_UNAVAILABLE).

### Step 1.13 — Verify backend
```
curl http://localhost:3000/api/health          -> {"data":{"status":"ok","timestamp":"..."},"message":"OK"}
curl -X POST http://localhost:3000/api/auth/signin -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"Admin123!"}'   # seeded org admin
  -> {"data":{"accessToken":"...","refreshToken":"..."},"message":"Signed in"}
curl -X POST http://localhost:3000/api/auth/org/signup -d '{"companyName":"Globex","slug":"globex","email":"admin@globex.com","password":"SomePass123!"}'
  -> {"data":{"accessToken":"...","refreshToken":"..."},"message":"Company created"}
```
Seed first (`cd backend && npm run seed`) or create an account via org signup.

### Step 1.14 — Frontend auth
Create `frontend/src/api/useAuth.ts` — Zustand store (`accessToken`/`refreshToken`/`userId`/`tenantId`/`role`) persisted to localStorage; `setTokens` decodes the JWT payload, `logout`/`clearTokens`, `isAuthenticated`.
Create `frontend/src/api/client.ts` — axios instance (`baseURL: VITE_API_URL ?? 'http://localhost:3000/api'`); request interceptor attaches `Bearer` token; response interceptor logs out + redirects to `/auth/signin` **only when a token was held** (401 from signin with no token just rejects).
Create `frontend/src/hooks/useApiMutation.ts` — `useApiMutation` wrapper around TanStack `useMutation` that auto-toasts success (`{data,message}` envelope) and error (`{error:{code,message}}`) via Mantine Notifications (skips toasts on 401). **All M2+ mutations should use this hook.**
Create `frontend/src/hooks/auth/*` — `useSignIn`, `useOrgSignup`, `useCandidateSignup`, `useLogout`, `useRefreshAuth` (built on `useApiMutation` + `authApi`).
Create `frontend/src/api/authApi.ts` — `signin`, `candidateSignup` (POST `/auth/signup`), `orgSignup` (POST `/auth/org/signup`), `logout`, `refreshAuth`.
Create `frontend/src/features/auth/SignInPage.tsx` (unified email+password, role-based redirect), `OrgSignupPage.tsx` (company+email+password → navigates to signin), `AuthLayout.tsx`.
Create `frontend/src/features/candidate-portal/signup/SignupPage.tsx` (candidate registration).
Create `frontend/src/app/router.tsx` + file-based `frontend/src/routes/**` — `/auth/signin`, `/auth/signup`, `/auth/org/signup` public; `_candidate` layout (`/dashboard`, `/applications`, `/bookmarks`, `/settings`) for CANDIDATE; `org` layout (`/org/dashboard`) for internal roles; `admin` layout (`/admin/tenants`) for SuperAdmin. **Auth guards live in each route's `beforeLoad`** (TanStack Router), redirecting to the correct platform by role.
A `frontend/src/components/RoleGuard.tsx` exists (renders children only when `role ∈ allowedRoles`, else 403/redirect — UX layer only; backend guard is the real block). Note: current routes use `beforeLoad` guards instead of `RoleGuard`.

### Step 1.15 — Frontend shell (three platforms)
Create `frontend/src/features/org/layout.tsx` (`OrgPlatform`) — Mantine AppShell: header (brand + role + logout), sidebar (Dashboard, Job Postings, Candidates, Pipeline, Interviews). Parent for `org/*`.
Create `frontend/src/features/admin/layout.tsx` (`SuperAdminPlatform`) — separate AppShell, sidebar starts with "Tenants". Parent for `admin/*`.
Create `frontend/src/features/candidate-portal/layout.tsx` (`CandidatePlatform`) — minimal header (Jobs, Applications, Bookmarks, Settings, Logout), no sidebar. Parent for `_candidate/*`.
Create `frontend/src/app/providers.tsx` — QueryClientProvider + MantineProvider + `<Notifications />` + RouterProvider + ReactQueryDevtools (dev).
Create `frontend/src/app/router.tsx` — `createRouter({ routeTree })` from `routeTree.gen.ts` (auto-generated by the TanStack Router Vite plugin; regenerate after adding route files).

**Verify:** `/auth/signin` → sign in as each role → lands in the correct platform; `/auth/org/signup` creates a tenant; `/auth/signup` creates a candidate account.

**Commit:** `git add -A && git commit -m "phase1: auth, schema-per-tenant, RBAC — backend + frontend"`

> **Post-M1 refinements already in the repo (do not redo):** seed script (`backend/scripts/seed.ts`) with SuperAdmin/Org/Candidate accounts; `super_admins` table; candidate-account module + `/candidate/*` API + candidate portal frontend (originally Phase 5b, built early); backend SOLID restructure (this section's layout); unified auth routes; global response envelope + error filter; toast foundation (`useApiMutation` + Notifications provider).

---

## Phase 2 — Job Postings & Candidates CRUD ⬜ (next milestone)

> **Conventions to follow (from the Phase 1 restructure):**
> - Modules live in `backend/src/modules/<name>/` with `module.ts`, `controller.ts`, `service.ts`, `dto/` (Zod schemas + inferred types).
> - Controllers validate via `@Body(new ZodValidationPipe(Schema))` and use `@CurrentUser()` / `@Roles(...)` decorators; route handlers return raw values (the global `ResponseInterceptor` wraps them).
> - All DB access goes through repositories extending `BaseRepository` (`withDb('current', ...)` for tenant-scoped, `'public'` for shared tables). Register new repos in `RepositoriesModule`; register modules in `AppModule`.
> - Frontend mutations use `useApiMutation` (auto-toasts); queries use TanStack Query hooks under `frontend/src/api/` or a feature folder; pages live under `frontend/src/features/org/job-postings` + `frontend/src/features/org/candidates`, routed as `/org/job-postings` and `/org/candidates`.

### Step 2.1 — Ensure template tables
Template schema already contains `job_postings` and `candidates` (`backend/drizzle/template-schema.sql`). No action unless the tenant table set changed.

### Step 2.2 — Repositories
Create `backend/src/repositories/job-posting.repository.ts` — `findAll(filters?)`, `findById`, `create`, `update`, `delete` (all via `withDb('current', ...)` on the `jobPostings` table).
**`candidate.repository.ts` already exists** (findAll/findById/create — verify it covers Phase-2 needs, e.g. `findByEmail` used by apply).
Create `backend/src/repositories/skill.repository.ts` — `search(query)` using LIKE, `findByIds(ids)`. Both via `withDb('public', ...)`.
Add all three to `RepositoriesModule` provides/exports.

### Step 2.3 — Zod schemas (DTOs)
Create `backend/src/modules/job-postings/dto/` — `CreateJobPostingSchema` (title, optional description, optional requiredSkillIds[]), `UpdateJobPostingSchema` (partial), plus inferred DTO types.
Create `backend/src/modules/candidates/dto/` — `CreateCandidateSchema` (name, email, optional phone), inferred DTO type.

### Step 2.4 — Modules
Create module dirs `job-postings` and `candidates`, each with `.module.ts`, `.controller.ts`, `.service.ts`, `dto/`.

Endpoints:
```
GET    /job-postings?status=       — any authenticated user
POST   /job-postings               — OrgAdmin, Recruiter (@Roles)
GET    /job-postings/:id           — any authenticated user
PATCH  /job-postings/:id           — OrgAdmin, Recruiter
POST   /job-postings/:id/publish   — OrgAdmin, Recruiter (status draft→open; also sync jobListingsIndex — see Phase 5b)
POST   /job-postings/:id/close     — OrgAdmin, Recruiter (status→closed; sync index)
DELETE /job-postings/:id           — OrgAdmin only
GET    /candidates                 — OrgAdmin, Recruiter, HiringManager
POST   /candidates                 — OrgAdmin, Recruiter
GET    /candidates/:id             — OrgAdmin, Recruiter, HiringManager
```
Use `@Roles('OrgAdmin', 'Recruiter')` etc. on handlers (global `RolesGuard` enforces). Guarded endpoints also need `AuthGuard('jwt')` unless a global jwt guard is added — follow the pattern used by `CandidateAccountController`.

### Step 2.5 — Register modules
Add `JobPostingsModule` and `CandidatesModule` to `AppModule` imports.

### Step 2.6 — Seed skills
Add a `seedSkills` step to `backend/scripts/seed.ts` — insert the 40+ skills from `DATA_MODEL_DEFINITION.md` (Languages, Frontend, Backend, Database, DevOps, Testing, Soft Skills) into `public.skills`, skipping existing names. Run: `npm run seed`.

### Step 2.7 — Verify backend
```
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/signin -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"Admin123!"}' | ... # extract data.accessToken)
curl -X POST http://localhost:3000/api/job-postings -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Senior Engineer"}'
curl http://localhost:3000/api/job-postings -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:3000/api/candidates -H "Authorization: Bearer $TOKEN" -d '{"name":"Jane Doe","email":"jane@example.com"}'
```
All responses come back as `{ "data": ..., "message": "OK" }`.

### Step 2.8 — Frontend API hooks
Create `frontend/src/api/jobPostingsApi.ts` (+ `useJobPostings` hooks) — `useJobPostings(status?)` query, `useCreateJobPosting`/`useUpdateJobPosting`/`useDeleteJobPosting` mutations built on `useApiMutation`.
Create `frontend/src/api/candidatesApi.ts` (+ hooks) — `useCandidates()`, `useCandidate(id)`, `useCreateCandidate`.
Create `frontend/src/api/skillsApi.ts` — `searchSkills(query)` (used by the picker).
Use `queryKeys.ts` for cache keys.

### Step 2.9 — Frontend components (under `features/org/job-postings` + `features/org/candidates`)
Create `JobPostingList.tsx` — Mantine Table (Title/Status/Created/Actions), status badges (draft/gray, open/green, closed/red).
Create `JobPostingForm.tsx` — Mantine `useForm` + zod resolver; fields: title, description, required skills MultiSelect.
Create `RequiredSkillsPicker.tsx` — MultiSelect calling `GET /skills?search=` on input change (debounced).
Create `CandidateList.tsx` — Table: name, email, phone, created.
Create `CandidateProfile.tsx` — detail view with applications list (Phase 3+).
Create route files `frontend/src/routes/org/job-postings.tsx` and `frontend/src/routes/org/candidates.tsx` (parents already gated in `org.tsx` `beforeLoad`).

**Commit:** `git add -A && git commit -m "phase2: job postings and candidates CRUD — backend + frontend"`

---

## Phase 3 — Pipeline (Kanban Board)

### Step 3.1 — Pipeline stage repository
`backend/src/repositories/pipeline-stage.repository.ts` **already exists** (findAll ordered by stage order, findFirst, createMany used at tenant provisioning). Add findById/update/delete as needed.

### Step 3.2 — Application repository
`backend/src/repositories/application.repository.ts` **already exists** (create used by candidate apply). Add findAll(filters?), findById (join candidate+stage), updateStage(id, stageId).

### Step 3.3 — Applications module
Create `backend/src/modules/applications/` with module, controller, service, dto/.
Endpoints:
```
GET    /applications?jobPostingId=&stageId=  — OA, R, HM
GET    /applications/:id                      — OA, R, HM
PATCH  /applications/:id/stage                — OA, R, HM (body: { stageId })
POST   /applications/:id/notes                — OA, R, HM (body: { content })
GET    /applications/:id/notes                — OA, R, HM
```
Use `@Roles` + `AuthGuard('jwt')` per handler (as in `CandidateAccountController`).

### Step 3.4 — Verify backend
```
curl -X PATCH http://localhost:3000/api/applications/<id>/stage -H "Authorization: Bearer $TOKEN" -d '{"stageId":"<uuid>"}'
curl -X POST http://localhost:3000/api/applications/<id>/notes ... -d '{"content":"Phone screen scheduled"}'
```

### Step 3.5 — Frontend API hooks
Create `frontend/src/api/applicationsApi.ts` (+ hooks) — `useApplications(filters?)`, `useApplication(id)`, `useUpdateStage` (with optimistic update via `onMutate`/`onError` rollback), `useNotes(applicationId)`, `useAddNote`.

### Step 3.6 — Frontend pipeline board (under `features/org/pipeline`)
Create `PipelineBoard.tsx` — DndContext with onDragEnd, renders PipelineColumn per stage.
Create `PipelineColumn.tsx` — useDroppable, shows stage name + count, renders ApplicationCard list.
Create `ApplicationCard.tsx` — useDraggable, shows candidate name / match score badge / applied date, opens drawer on click.
Implement optimistic update in `useUpdateStage`: onMutate snapshots cache, onError rolls back, onSettled refetches.

### Step 3.7 — Application detail drawer
Create `ApplicationDetailDrawer.tsx` — Mantine Drawer with candidate info, job title, match score. Tabs: Notes (list+add form), Interviews.

### Step 3.8 — Stage editor (OrgAdmin)
Create `StageEditor.tsx` — ordered list with drag handle, inline name edit, add/delete with confirmation.

**Commit:** `git add -A && git commit -m "phase3: pipeline Kanban board with drag-and-drop — backend + frontend"`

---

## Phase 4 — Resume Upload & Skill Matching ⬜ (next milestone)

> **Storage decision:** resume files are stored in **MinIO** (S3-compatible) from the start — not local disk. MinIO already runs in Docker Compose (`:9000`) with creds in `backend/.env`. The client is `@aws-sdk/client-s3` with `forcePathStyle: true`, so the **same client code works against real S3 in prod** (swap `MINIO_ENDPOINT`). Object keys are server-generated `tenants/{tenantId}/resumes/{candidateId}/{uuid}.{ext}` — never client-supplied (`05_DATA_ISOLATION_STRATEGY.md`).

### Step 4.1 — Install libs
```
cd backend && npm install pdf-parse mammoth @aws-sdk/client-s3
cd backend && npm install -D @types/pdf-parse @types/mammoth @types/multer
cd frontend && npm install @mantine/dropzone
```

### Step 4.2 — Storage module (MinIO/S3)
Create `backend/src/common/storage/storage.provider.ts` — `STORAGE_PROVIDER` factory (mirrors `drizzleProvider`): `new S3Client({ region: 'us-east-1', endpoint: MINIO_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })`.
Create `backend/src/common/storage/storage.service.ts` — `ensureBucket()` (on `onApplicationBootstrap`), `upload(key, buffer, contentType)`, `get(key)`, `delete(key)`.
Create `backend/src/common/storage/storage.module.ts` — provides + exports `StorageService`.
Bucket name configurable via `MINIO_BUCKET` (default `resumes`).

### Step 4.3 — Resume repository
Create `backend/src/repositories/resume.repository.ts` — findByCandidateId, create, updateParsedText, setResumeSkills (resume_skills join), findSkillsByResumeId. Register in `RepositoriesModule`.
Extend `SkillRepository` with `findAll()`. Extend `ApplicationRepository` with `findByCandidateId(candidateId)` and `updateMatchScore(id, score)`.

### Step 4.4 — Resume service
Create `backend/src/modules/resumes/resumes.service.ts`:
- `upload(candidateId, file)`: validate type (PDF/DOCX) + size (10MB multer limit), upload buffer to MinIO, create DB record (fileUrl = object key), extractText, extractSkills, persist resume_skills, recompute matchScore for all the candidate's applications (against each job's required skills), return record.
- `extractText(buffer, mimeType)`: use pdf-parse for PDF, mammoth for DOCX.
- `extractSkills(text)`: lowercase text, check each taxonomy skill for substring match, return matched skill IDs.

### Step 4.5 — Skill matching service
Create `backend/src/modules/skill-matching/skill-matching.service.ts` — computeScore(requiredSkillIds, extractedSkillIds): matched / required.length (0 if none required). Export `SkillMatchingModule`.

### Step 4.6 — Unit tests
Create `backend/src/modules/skill-matching/skill-matching.service.spec.ts` — test 0 score, full score, partial, no match. (Note: named `*.spec.ts` to match the Jest `testRegex`, not the guide's original `__tests__/*.test.ts` path.)
Create `backend/src/modules/resumes/resumes.service.spec.ts` — mocked storage + parsers + repos: rejects bad mimetype, extracts + persists skills, recomputes matchScore.

### Step 4.7 — Resume controller
Create `backend/src/modules/resumes/resumes.controller.ts`:
```
GET  /candidates/:candidateId/resume  — OA, R, HM (metadata + extracted skills)
POST /candidates/:candidateId/resume  — OA, R (FileInterceptor('file'), 10MB limit)
```

### Step 4.8 — Frontend resume upload
Create `frontend/src/api/resumesApi.ts` (FormData upload — clears the client's default JSON content-type) + `useResume`/`useUploadResume` hooks + `queryKeys.org.resume(candidateId)`.
Create `ResumeUploadInput.tsx` — Mantine Dropzone, accept PDF/DOCX, max 10MB.
Create `MatchScoreBadge.tsx` — percentage, green >=70%, yellow >=40%, red <40% (reused in `ApplicationCard` + candidate profile).
`CandidatesService.getOne` returns `{ ...candidate, resume, applications }` — the candidate profile shows upload + extracted-skill badges + per-application match scores.

**Commit:** `git add -A && git commit -m "feat(m4): resume upload to MinIO, text extraction, skill matching — backend + frontend"`

---

## Phase 5 — Public Careers & Apply

> **Note:** Phase 5 (public careers) is the unauthenticated flow. Phase 5b (below) adds the authenticated candidate experience. Both coexist.

### Step 5.1 — Install Redis client
```
cd backend && npm install ioredis
```

### Step 5.2 — Redis provider
Create `backend/src/database/redis.provider.ts` — REDIS_PROVIDER symbol, factory returning `new Redis(process.env.REDIS_URL)`.

### Step 5.3 — Rate limiter guard
Create `backend/src/common/middlewares/rate-limiter.guard.ts` — key `ratelimit:public-apply:{ip}`, threshold 20 per 15 min, returns 429 with Retry-After.

### Step 5.4 — Public apply module
Create `backend/src/modules/public-apply/` with controller.
Endpoints:
```
GET  /public/:tenantSlug/jobs           — list open jobs (tenant lookup by slug, set search_path)
GET  /public/:tenantSlug/jobs/:id       — job detail
POST /public/:tenantSlug/jobs/:id/apply — rate-limited, honeypot, create candidate+application+resume
```

### Step 5.5 — Frontend careers pages
Create `JobListingPage.tsx` — no auth, fetch GET /public/:slug/jobs, list titles+descriptions.
Create `JobDetailPage.tsx` — full description, required skills, "Apply Now".
Create `ApplyForm.tsx` — name/email/phone + resume upload + hidden honeypot. On 429 show retry message.
Create `ApplySuccessPage.tsx` — "Application submitted!" + link back.

### Step 5.6 — Verify
```
curl http://localhost:3000/api/public/testcorp/jobs
curl -X POST http://localhost:3000/api/public/testcorp/jobs/<id>/apply -d '{"name":"Jane","email":"j@e.com"}'
for i in $(seq 1 25); do curl ...; done  # first 20 -> 200, rest -> 429
```

**Commit:** `git add -A && git commit -m "phase5: public careers page and rate-limited apply — backend + frontend"`

---

## Phase 5b — Candidate Accounts & Dashboard

> **Status: ✅ implemented** (built early with the backend SOLID restructure). The `/candidate/*` API + `CandidatePlatform` frontend exist. Steps below are kept for reference.

### Step 5b.1 — Add public schema tables
**Done.**
Add to `backend/src/database/schema.ts`:
- `candidateAccounts`: id, email (unique), passwordHash, firstName, lastName, phone, createdAt
- `candidateBookmarks`: id, candidateAccountId (FK → candidateAccounts.id), tenantId, jobPostingId, jobTitle, companyName, createdAt
- `candidateApplicationsIndex`: id, candidateAccountId (FK → candidateAccounts.id), tenantId, jobPostingId, applicationId, status, appliedAt, jobTitle, companyName
- `jobListingsIndex`: id, tenantId, jobPostingId (unique), title, description, companyName, companySlug, status, createdAt, updatedAt

Run: `cd backend && npx drizzle-kit generate && npx drizzle-kit migrate`

### Step 5b.2 — CandidateAuthGuard
Create `backend/src/common/auth/candidate-auth.guard.ts` (or reuse `RolesGuard` with `@Roles('Candidate')`):
```typescript
@Injectable()
export class CandidateAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return request.user?.role === 'Candidate';
  }
}
```

### Step 5b.3 — Update AuthModule
**Done.** `POST /auth/signup` and `POST /auth/signin` are unified — candidate vs org signup is inferred from the DTO. `auth.service.ts` `candidateSignup(dto)` operates on `candidateAccounts` (public schema) and returns a JWT with `{ sub: candidateAccountId, role: 'Candidate' }` (no tenantId).

### Step 5b.4 — Create CandidateAccountModule
**Done.** `backend/src/modules/candidate-account/`:
- `candidate-account.controller.ts` — all /candidate/* endpoints
- `candidate-account.service.ts` — business logic
- `candidate-account.module.ts` — imports, providers, guards

Endpoints:
```
GET    /candidate/jobs                              — CANDIDATE (list from jobListingsIndex)
GET    /candidate/jobs/:tenantId/:jobId             — CANDIDATE (job detail)
POST   /candidate/jobs/:tenantId/:jobId/apply       — CANDIDATE (write to tenant schema + index)
GET    /candidate/applications                      — CANDIDATE (from candidateApplicationsIndex)
GET    /candidate/applications/:id                  — CANDIDATE (detail)
POST   /candidate/bookmarks                         — CANDIDATE (save)
DELETE /candidate/bookmarks/:id                     — CANDIDATE (remove)
GET    /candidate/bookmarks                         — CANDIDATE (list)
GET    /candidate/profile                           — CANDIDATE (view)
PATCH  /candidate/profile                           — CANDIDATE (update)
```

### Step 5b.5 — Update ApplicationsModule
In the stage transition handler (`PATCH /applications/:id/stage`): after updating the tenant's application record, also update `candidateApplicationsIndex` status field for that application. **Not yet done** — pending Phase 3.

### Step 5b.6 — Update JobPostingsModule
In the publish/close handlers: sync the `jobListingsIndex` table — upsert on publish, update status on close. **Not yet done** — pending Phase 2.

### Step 5b.7 — Frontend: Candidate shell & auth
**Done.** `frontend/src/features/candidate-portal/layout.tsx` (`CandidatePlatform` — minimal layout: header with logo + nav to jobs/applications/bookmarks/profile), plus login/signup pages in the same feature folder calling the unified `POST /auth/signin` / `POST /auth/signup`.

### Step 5b.8 — Frontend: Candidate dashboard
**Done.** Under `frontend/src/features/candidate-portal/`: `dashboard/JobSearchPage.tsx` (search + job cards from GET /candidate/jobs), `applications/ApplicationsPage.tsx`, `bookmarks/BookmarksPage.tsx`, `settings/SettingsPage.tsx` (profile edit form).

### Step 5b.9 — Frontend routing
**Done.** File-based routes under `frontend/src/routes/_candidate/` (`_candidate.tsx` pathless layout; `/dashboard`, `/applications`, `/bookmarks`, `/settings` behind `CandidatePlatform` layout + `requireRole('Candidate')` `beforeLoad` guard; login/signup are the shared `/auth/*` routes).

### Step 5b.10 — Verify
```
# Backend
curl -X POST http://localhost:3000/api/auth/signup -d '{"email":"c@c.com","password":"pass","firstName":"Jane","lastName":"Doe"}'  -> { data: { accessToken, refreshToken, ... } }
CANDIDATE_TOKEN=...
curl http://localhost:3000/api/candidate/jobs -H "Authorization: Bearer $CANDIDATE_TOKEN"  -> { data: [ jobs from all tenants ] }
curl -X POST http://localhost:3000/api/candidate/jobs/<tenantId>/<jobId>/apply -H "Authorization: Bearer $CANDIDATE_TOKEN"  -> { data: { applicationId } }

# Existing unauthenticated apply still works
curl -X POST http://localhost:3000/api/public/testcorp/jobs/<id>/apply -d '{"name":"Jane","email":"j@e.com"}'  -> 200
```

**Commit:** `git add -A && git commit -m "phase5b: candidate accounts and dashboard — backend + frontend"`

---

## Phase 6 — Redis: Full Integration

### Step 6.1 — Login rate limiter
Create `backend/src/common/middlewares/login-rate-limiter.guard.ts` — key `ratelimit:login:{email}:{ip}`, threshold 5 per 15 min. Apply to POST /auth/signin.

### Step 6.2 — Cache service
Create `backend/src/common/cache.service.ts` — get<T>(key), set(key, value, ttlSeconds), invalidate(pattern).

### Step 6.3 — Dashboard cache
In dashboard service: check cache before expensive queries. Set with 60s TTL. Invalidate on writes.

**Commit:** `git add -A && git commit -m "phase6: Redis rate limiting, login lockout, dashboard cache"`

---

## Phase 7 — BullMQ Background Jobs

### Step 7.1 — Install
```
cd backend && npm install bullmq
```

### Step 7.2 — Queue definitions
Create `backend/src/queues/queues.ts` — resumeQueue ('resume-processing') and notificationQueue ('notifications'), both with Redis connection (Redis provider from Phase 5, `backend/src/database/redis.provider.ts`).

### Step 7.3 — Resume worker
Create `backend/src/workers/resume.worker.ts` — Worker('resume-processing', job -> set search_path, fetch resume, extract text, extract skills, update matchScore). 3 retries with exponential backoff.

### Step 7.4 — Enqueue on apply
In resume/apply service: `resumeQueue.add('process-resume', { resumeId, candidateId, tenantId })` instead of processing inline.

### Step 7.5 — Wire up worker
Create `backend/src/workers/bootstrap.ts` — import workers. Call in main.ts after app boot.

**Commit:** `git add -A && git commit -m "phase7: BullMQ background jobs — resume parsing + notifications"`

---

## Phase 8 — Interviews & Feedback

### Step 8.1 — Repositories
Create `backend/src/repositories/interview.repository.ts` — findAll(filters?), findById, create, update.
Create `backend/src/repositories/interview-feedback.repository.ts` — findByInterviewId, create.

### Step 8.2 — Interviews module
Create `backend/src/modules/interviews/` with module, controller, service.
Endpoints:
```
GET   /interviews?assignedToMe=true   — all users (Interviewer sees only own)
POST  /interviews                      — OA, R, HM (body: applicationId, interviewerId, scheduledAt)
POST  /interviews/:id/feedback         — Interviewer only, verifies assignment (body: rating, comments?)
```

### Step 8.3 — Frontend components
Create `InterviewScheduler.tsx` — select application, select interviewer, date+time picker.
Create `InterviewListView.tsx` — table: candidate, date, interviewer, status. Filter for Interviewer role.
Create `InterviewFeedbackForm.tsx` — rating 1-5, comments. Only render if current user is assigned interviewer.

### Step 8.4 — Verify
```
curl -X POST http://localhost:3000/interviews ... -d '{"applicationId":"<id>","interviewerId":"<id>","scheduledAt":"2026-08-01T14:00:00Z"}'
curl -X POST http://localhost:3000/interviews/<id>/feedback ... -d '{"rating":4,"comments":"Strong"}'
```
Non-assigned user -> 403.

**Commit:** `git add -A && git commit -m "phase8: interviews and feedback — backend + frontend"`

---

## Phase 9 — Admin, Platform & CI

### Step 9.1 — Platform module (SuperAdmin)
Create `backend/src/modules/platform/` — uses `forPublic()` only, `@Roles('SuperAdmin')` guard.
Endpoints:
```
GET    /platform/tenants                — list all tenants
GET    /platform/tenants/:id            — tenant detail
PATCH  /platform/tenants/:id/suspend    — mark suspended
PATCH  /platform/tenants/:id/reactivate — mark active
GET    /platform/stats                  — totals across tenants
```

### Step 9.2 — Audit logging
Create `backend/src/common/audit.service.ts` — `log(action, resourceId?, metadata?)` inserts into public.audit_logs with current tenantId + userId.
Call in: user invite, role change, tenant suspend/reactivate, data export.

### Step 9.3 — Frontend admin
Under `frontend/src/features/org/settings/` + `frontend/src/features/org/users/`:
Create `OrgSettingsForm.tsx` — display company info, edit name, PATCH /org.
Create `UserManagementTable.tsx` — table: email/role/created/actions, invite button, role dropdown, remove with confirm.

### Step 9.4 — Frontend platform (SuperAdmin)
Under `frontend/src/features/admin/`:
Create `TenantsList.tsx` — table: company, slug, plan, status, created. Click -> detail.
Create `TenantDetail.tsx` — detail + suspend/reactivate + usage stats.
Create `PlatformStats.tsx` — cards: total tenants/users/applications.

### Step 9.5 — GitHub Actions CI
Create `.github/workflows/ci.yml`:
- Trigger: push, pull_request
- Services: postgres:16 + redis:7-alpine
- Steps: checkout -> setup-node 20 -> npm ci -> npm run lint -> npm test -> npm run build
- Isolation tests run as part of npm test; failure breaks build.

**Commit:** `git add -A && git commit -m "phase9: admin UI, platform module, CI pipeline"`

---

## Phase 10 — Deployment

### Step 10.1 — Backend Dockerfile
Create `backend/Dockerfile` — multi-stage build (node:20-alpine), expose 3000, run dist/main.js.

### Step 10.2 — Frontend Dockerfile
Create `frontend/Dockerfile` — build with node:20-alpine, serve with nginx:alpine.
Create `frontend/nginx.conf` — listen 80, root /usr/share/nginx/html, try_files for SPA.

### Step 10.3 — Production env
Create `backend/.env.production` with production DATABASE_URL, REDIS_URL, JWT_SECRET, MINIO keys, CORS_ORIGIN.

### Step 10.4 — Deploy to Railway/Render
Backend: connect repo, Node.js service, build `cd backend && npm ci && npm run build`, start `cd backend && node dist/main.js`.
Frontend: connect repo, build `cd frontend && npm ci && npm run build`, publish dir `frontend/dist`.

### Step 10.5 — Verify production
Visit live URL -> signup -> post job -> public apply (incognito) -> drag pipeline -> schedule interview + feedback -> confirm rate limiting.

**Commit:** `git add -A && git commit -m "phase10: Dockerfiles, production config, deployment"`
