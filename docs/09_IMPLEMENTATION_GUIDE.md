# TalentPipe — Implementation Guide

**Purpose:** Concise step-by-step instructions per phase. Each step is an actionable command or file to create. Complete phases in order.

**Stack:** NestJS + PostgreSQL + Drizzle ORM — React + Mantine + TanStack Query + dnd-kit
**Package manager:** npm
**Prerequisites:** Node 20+, Docker Desktop, Git

> **Status legend:** ✅ = implemented in the repo. ⬜ = planned / not yet built. Phases 0–11, including the Phase 5b candidate-account slice, are implemented and covered by release-gate tests. The steps below match the actual implementation, including the backend SOLID restructure, unified auth routes, global response envelope, three frontend platforms, candidate accounts, manual skills, storage-only resumes, read-only public careers API, Redis login limiting, company dashboard caching, the BullMQ notifications queue, interviews with feedback, the Phase 9 admin/platform/CI work (company status + suspension, company settings + user management, SuperAdmin platform module, GitHub Actions CI), the Phase 10 self-hosted Docker deployment (Dockerfiles, prod compose, one-shot migrations, resume file streaming endpoint), and the Phase 11 platform-control + candidate-experience work (per-user suspension, SuperAdmin account/data management across companies, candidate job detail + withdraw).

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
S3_ENDPOINT=localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
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
>   common/           # context/company-context.ts, auth/ (auth-core.module, jwt.strategy),
>                     # guards/ (roles, candidate-auth), decorators/ (roles, current-user),
>                     # interceptors/ (company-context, response), filters/ (api-exception),
>                     # middlewares/ (logger), pipes/ (zod-validation), password.ts
>   database/         # database.module.ts, drizzle.provider.ts, drizzle-schema.service.ts, schema.ts
>   repositories/     # base.repository.ts, repositories.module.ts, + 11 entity repos
>   modules/          # auth/, candidate-account/, health/
> ```

### Step 1.1 — Drizzle schema
Create `backend/src/database/schema.ts` with ALL tables below.

**Public schema tables (live once, shared across companies):**
- `companies`: id (uuid pk), name (varchar 255), slug (varchar 100, unique), plan (varchar 50, default 'free'), status (varchar 20, default 'active'), createdAt.
- `skills`: id (uuid pk), name (varchar 255, unique), category (varchar 100).
- `auditLogs`: id (uuid pk), companyId, userId, action (varchar 100), resourceId, metadata (text), createdAt. Index on (companyId, action).
- `userEmails`: id (uuid pk), email (varchar 255, unique), companyId, userId — **login lookup bridge** between a public-schema email and the owning company's schema.
- `refreshTokens`: id (uuid pk), userId, companyId, tokenHash (argon2 hash of refresh token), expiresAt, createdAt. Index on userId.
- `superAdmins`: id (uuid pk), email (varchar 255, unique), passwordHash, name, createdAt — platform-level accounts (SuperAdmin role, no company).
- `candidateAccounts`: id (uuid pk), email (varchar 255, unique), passwordHash, firstName, lastName, phone, resumeFileUrl, resumeUploadedAt, createdAt.
- `candidateSkills`: id, candidateAccountId (FK), skillId (FK), createdAt. Unique on (candidateAccountId, skillId).
- `candidateBookmarks`: id, candidateAccountId (FK), companyId, jobPostingId, jobTitle, companyName, createdAt. Indexes on account + (companyId, jobPostingId).
- `candidateApplicationsIndex`: id, candidateAccountId (FK), companyId, jobPostingId, applicationId, jobTitle, companyName, status, appliedAt. Indexes on account + (companyId, jobPostingId).
- `jobListingsIndex`: id, companyId, jobPostingId (unique), title, description, companyName, companySlug, status, createdAt, updatedAt. Indexes on status / companyName / companyId.

> **Note:** These public candidate tables are NOT cloned into the per-company template schema. Candidate accounts are cross-company by design.

**Company-schema tables (no companyId columns — the schema boundary is the isolation):**
- `users`: id, email (unique), passwordHash, role (default 'CompanyAdmin'), createdAt.
- `jobPostings`: id, title (varchar 255), description (text), status (default 'draft'), createdByUserId (FK), createdAt.
- `candidates`: id, name, email, phone, candidateAccountId (FK, nullable), createdAt. Indexes on email and candidateAccountId.
- `pipelineStages`: id, name (varchar 100), order (integer, default 0). Index on order.
- `applications`: id, candidateId (FK), jobPostingId (FK), currentStageId (FK), candidate snapshot fields, appliedSkillIds (JSONB), matchScore (float, default 0), appliedAt. Index on (jobPostingId, currentStageId).
- `jobRequiredSkills`: jobPostingId (FK), skillId. Unique on (jobPostingId, skillId).
- `interviews`: id, applicationId (FK), interviewerId (FK), scheduledAt, status (default 'scheduled'). Indexes on interviewerId, applicationId.
- `interviewFeedbacks`: id, interviewId (FK, unique), rating (integer), comments, submittedAt.
- `notes`: id, applicationId (FK), authorUserId (FK), content, createdAt. Index on applicationId.

### Step 1.2 — Migration & template schema
```
cd backend
npx drizzle-kit generate
```
This writes SQL files under `backend/drizzle/<timestamp>_<name>/migration.sql` — Drizzle never auto-applies. Apply manually via psql (see `00b_LOCAL_DEV_BOOTSTRAP.md` steps 3–7).

**Applied migrations (current repo):**
```
backend/drizzle/20260722095156_bright_iron_fist/migration.sql    # 16 public tables
backend/drizzle/20260723191416_fresh_blindfold/migration.sql      # +candidate tables
backend/drizzle/20260727163000_smooth_spitfire/migration.sql      # +super_admins
backend/drizzle/20260803085856_redundant_tyrannus/migration.sql   # +candidate skills
backend/drizzle/20260804101500_candidate_profile_redesign/migration.sql # profile/resume redesign
backend/drizzle/20260805090000_candidate_application_integrity/migration.sql # application/candidate integrity
backend/drizzle/20260806191320_superb_king_cobra/migration.sql # +companies.status (suspend/reactivate)
backend/drizzle/20260807090000_scheduled_at_timezone/migration.sql # interviews.scheduled_at → timestamptz
backend/drizzle/20260808090000_platform_user_suspend/migration.sql # +users.status (per-user suspend, public+template+company)
backend/drizzle/20260808100000_platform_account_cascades/migration.sql # FK cascades (bookmarks/feedbacks/interviews/notes/job_postings)
```

**Template schema** (`backend/drizzle/template-schema.sql`) — the hand-written file cloned per company at signup. Apply it once to create the `template` schema:
```
Get-Content backend/drizzle/template-schema.sql |
  docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```
It defines the 9 company tables: `users, job_postings, candidates, pipeline_stages, applications, job_required_skills, interviews, interview_feedbacks, notes`.

> **Note:** The candidate-related public tables (`candidate_accounts`, `candidate_skills`, `candidate_bookmarks`, `candidate_applications_index`, `job_listings_index`) are NOT in the template — they exist only in `public`. `super_admins`, `user_emails`, `refresh_tokens` are also public-only. Company `resumes` and `resume_skills` were removed in Phase 4.
> **Runtime check:** any `relation "..." does not exist` on login means a migration or the template schema was skipped — re-run `00b_LOCAL_DEV_BOOTSTRAP.md` steps 3–8.

### Step 1.3 — Drizzle provider
Create `backend/src/database/drizzle.provider.ts` — export `DRIZZLE_PROVIDER` symbol + a factory that creates a `pg.Pool` from `DATABASE_URL` (injected via `ConfigService` — no direct `process.env`). Owned by `DatabaseModule`, which also provides/exports `DrizzleSchemaService`.

### Step 1.4 — Company context
Create `backend/src/common/context/company-context.ts` — `AsyncLocalStorage<CompanyContext>`, `getCompanyId()`, `getSchema()` (returns `public` for SuperAdmin/company-less, else `company_{id}`), `getCurrentUser()`. Accessors throw if no context.

### Step 1.5 — Company interceptor
Create `backend/src/common/interceptors/company-context.interceptor.ts` — extracts `request.user`, maps SuperAdmin/company-less users to `'public'`, runs `asyncStorage.run({companyId, userId, role}, ...)` around `next.handle()`. Registered globally in `AppModule` via `APP_INTERCEPTOR`.

### Step 1.6 — Schema routing service
Create `backend/src/database/drizzle-schema.service.ts` — injects the pool, provides:
- `forCurrentCompany()` → acquires a client, `SET search_path TO "<schema>", public`, returns `{ db, release }`
- `forSchema(name)` → same for an explicit schema
- `forPublic()` → `SET search_path TO public`

`BaseRepository` wraps these in `withDb(schema, fn)` with try/finally `release()`. **All DB access goes through repositories.**

### Step 1.7 — Password utility
Create `backend/src/common/password.ts` — `hashPassword(password)` and `verifyPassword(hash, password)` using argon2.

### Step 1.8 — AuthModule
Create `backend/src/modules/auth/auth.module.ts` — imports `AuthCoreModule` (Passport + JwtModule + JwtStrategy, configured from `ConfigService`, 15m access) + `RepositoriesModule`. Providers: `AuthService`, `TokenService`, `CompanyProvisioningService`.

Create `backend/src/modules/auth/auth.controller.ts` — **unified auth routes** (current):
```
POST /auth/company/signup   — create Company + first CompanyAdmin
POST /auth/signin       — unified sign-in (company user | candidate | superadmin)
POST /auth/signup       — candidate signup
POST /auth/refresh      — exchange refresh token
POST /auth/logout       — revoke refresh token (JWT-protected)
```
All bodies validated via `@Body(new ZodValidationPipe(Schema))` (Zod DTOs in `dto/`: `company-signup.dto.ts`, `signin.dto.ts`, `refresh.dto.ts`, `candidate-auth.dto.ts`).

Create `backend/src/modules/auth/auth.service.ts` — orchestration only (no raw Drizzle, no `process.env`, no argon2):
- `companySignup(dto)` → `CompanyProvisioningService.createCompany(dto)` → `TokenService.issueTokens({ id: userId, companyId, role: 'CompanyAdmin' })` → returns `{ data: tokens, message: 'Company created' }`
- `signin(dto)` → resolve email via `UserEmailRepository` (public) → fetch company user via `UserRepository.findByEmail(email, "company_<id>")` → `verifyPassword` → issue tokens; fall back to `CandidateAccountRepository` → `role: 'Candidate'`, no companyId; fall back to `SuperAdminRepository` → `role: 'SuperAdmin'`, no companyId
- `candidateSignup(dto)` → `CandidateAccountRepository.create` → issue tokens with `role: 'Candidate'`
- `refresh(dto)` / `logout(userId)` → delegated to `TokenService`

Create `backend/src/modules/auth/services/token.service.ts` — one `issueTokens({ id, companyId, role })` signing access (JWT_SECRET, 15m) + refresh (JWT_REFRESH_SECRET, 7d), argon2-hash the refresh token, delete-by-user + insert via `RefreshTokenRepository`, return `{ accessToken, refreshToken }`. Also `rotate(refreshToken)` (verify hash + expiry, re-issue) and `logout(userId)`.

Create `backend/src/modules/auth/services/company-provisioning.service.ts` — `createCompany(dto)`:
1. `CompanyRepository.findBySlug` → 409 if taken
2. `CompanyRepository.create({ id, name, slug })`
3. `CompanyRepository.provisionSchema(companyId)` — `CREATE SCHEMA "company_<id>"` + `CREATE TABLE ... (LIKE template."<table>" INCLUDING ALL)` for all 9 current company tables
4. `UserRepository.create({ ... role: 'CompanyAdmin' }, "company_<id>")`
5. `PipelineStageRepository.createMany(DEFAULT_STAGES, "company_<id>")` — Applied/Screening/Interview/Offer/Hired/Rejected
6. `UserEmailRepository.create({ email, companyId, userId })`
Returns `{ companyId, userId }`.

Create `backend/src/common/auth/jwt.strategy.ts` — PassportStrategy extracting Bearer token; `validate(payload)` returns `{ userId: payload.sub, companyId, role }`.

### Step 1.9 — RolesGuard + @Roles decorator
Create `backend/src/common/guards/roles.guard.ts` — reads Reflector metadata `roles` (from `@Roles(...)`) against `request.user.role`; returns true when no roles required. Registered **globally** via `APP_GUARD` in `AppModule`. Create `backend/src/common/decorators/roles.decorator.ts` — `Roles(...roles: string[])` sets metadata.
Also: `backend/src/common/guards/candidate-auth.guard.ts` — `CanActivate` returning `request.user?.role === 'Candidate'` (protects `/candidate/*`), and `backend/src/common/decorators/current-user.decorator.ts` — typed `req.user` accessor.

### Step 1.10 — Repositories
Create `backend/src/repositories/base.repository.ts` — abstract class injecting `DrizzleSchemaService`; `withDb(schema, fn)` acquires a client, sets `search_path`, runs `fn(db)`, releases in `finally`. Schema resolution: explicit arg > current-company (ALS) > public.
Create `backend/src/repositories/repositories.module.ts` — imports `DatabaseModule`, provides + exports all repos.

**Company-scoped repos (default to current-company context):** `user`, `pipeline-stage`, `candidate`, `application`, and the Phase-2 additions (`job-posting`, `resume`, `interview`, etc.).
**Public-scoped repos (explicit `'public'`):** `company` (findBySlug/findById/create/provisionSchema), `user-email`, `refresh-token`, `super-admin`, `candidate-account`, `candidate-bookmark`, `candidate-applications-index`, `job-listings-index`.

Return convention: singletons → `T | null`; lists → `T[]`.

### Step 1.11 — Health controller
Create `backend/src/modules/health/health.module.ts` + `health.controller.ts` — `GET /health` returns `{ status: 'ok', timestamp }` (wrapped by the response interceptor as `{ data: { status, timestamp }, message: 'OK' }` at `/api/health`).

### Step 1.12 — Wire AppModule
Update `src/app.module.ts` — imports `ConfigModule.forRoot({ isGlobal: true })`, `AuthModule`, `CandidateAccountModule`, `HealthModule`. Global providers:
```
APP_INTERCEPTOR → CompanyContextInterceptor, ResponseInterceptor
APP_GUARD       → RolesGuard
APP_FILTER      → ApiExceptionFilter
```
`configure()` applies `LoggerMiddleware` to all routes.
`ResponseInterceptor` (`common/interceptors/response.interceptor.ts`) wraps every 2xx body as `{ data, message }` (passes through explicit envelopes). `ApiExceptionFilter` (`common/filters/api-exception.filter.ts`) normalizes errors to `{ error: { code, message } }` (status→code map: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 422 UNPROCESSABLE, 429 RATE_LIMITED, 500 INTERNAL_ERROR, 503 SERVICE_UNAVAILABLE).

### Step 1.13 — Verify backend
```
curl http://localhost:3000/api/health          -> {"data":{"status":"ok","timestamp":"..."},"message":"OK"}
curl -X POST http://localhost:3000/api/auth/signin -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"Admin123!"}'   # seeded company admin
  -> {"data":{"accessToken":"...","refreshToken":"..."},"message":"Signed in"}
curl -X POST http://localhost:3000/api/auth/company/signup -d '{"companyName":"Globex","slug":"globex","email":"admin@globex.com","password":"SomePass123!"}'
  -> {"data":{"accessToken":"...","refreshToken":"..."},"message":"Company created"}
```
Seed first (`cd backend && npm run seed`) or create an account via company signup.

### Step 1.14 — Frontend auth
Create `frontend/src/api/useAuth.ts` — Zustand store (`accessToken`/`refreshToken`/`userId`/`companyId`/`role`) persisted to localStorage; `setTokens` decodes the JWT payload, `logout`/`clearTokens`, `isAuthenticated`.
Create `frontend/src/api/client.ts` — axios instance (`baseURL: VITE_API_URL ?? 'http://localhost:3000/api'`); request interceptor attaches `Bearer` token; response interceptor logs out + redirects to `/auth/signin` **only when a token was held** (401 from signin with no token just rejects).
Create `frontend/src/hooks/useApiMutation.ts` — `useApiMutation` wrapper around TanStack `useMutation` that auto-toasts success (`{data,message}` envelope) and error (`{error:{code,message}}`) via Mantine Notifications (skips toasts on 401). **All M2+ mutations should use this hook.**
Create `frontend/src/hooks/auth/*` — `useSignIn`, `useCompanySignup`, `useCandidateSignup`, `useLogout`, `useRefreshAuth` (built on `useApiMutation` + `authApi`).
Create `frontend/src/api/authApi.ts` — `signin`, `candidateSignup` (POST `/auth/signup`), `companySignup` (POST `/auth/company/signup`), `logout`, `refreshAuth`.
Create `frontend/src/features/auth/SignInPage.tsx` (unified email+password, role-based redirect), `CompanySignupPage.tsx` (company+email+password → navigates to signin), `AuthLayout.tsx`.
Create `frontend/src/features/candidate-portal/signup/SignupPage.tsx` (candidate registration).
Create `frontend/src/app/router.tsx` + file-based `frontend/src/routes/**` — `/auth/signin`, `/auth/signup`, `/auth/company/signup` public; `_candidate` layout (`/dashboard`, `/applications`, `/bookmarks`, `/settings`) for CANDIDATE; `company` layout (`/company/dashboard`) for internal roles; `admin` layout (`/admin/companies`) for SuperAdmin. **Auth guards live in each route's `beforeLoad`** (TanStack Router), redirecting to the correct platform by role.
A `frontend/src/components/RoleGuard.tsx` exists (renders children only when `role ∈ allowedRoles`, else 403/redirect — UX layer only; backend guard is the real block). Note: current routes use `beforeLoad` guards instead of `RoleGuard`.

### Step 1.15 — Frontend shell (three platforms)
Create `frontend/src/features/company/layout.tsx` (`CompanyPlatform`) — Mantine AppShell: header (brand + role + logout), sidebar (Dashboard, Job Postings, Candidates, Pipeline, Interviews). Parent for `company/*`.
Create `frontend/src/features/admin/layout.tsx` (`SuperAdminPlatform`) — separate AppShell, sidebar starts with "Companies". Parent for `admin/*`.
Create `frontend/src/features/candidate-portal/layout.tsx` (`CandidatePlatform`) — minimal header (Jobs, Applications, Bookmarks, Settings, Logout), no sidebar. Parent for `_candidate/*`.
Create `frontend/src/app/providers.tsx` — QueryClientProvider + MantineProvider + `<Notifications />` + RouterProvider + ReactQueryDevtools (dev).
Create `frontend/src/app/router.tsx` — `createRouter({ routeTree })` from `routeTree.gen.ts` (auto-generated by the TanStack Router Vite plugin; regenerate after adding route files).

**Verify:** `/auth/signin` → sign in as each role → lands in the correct platform; `/auth/company/signup` creates a company; `/auth/signup` creates a candidate account.

**Commit:** `git add -A && git commit -m "phase1: auth, schema-per-company, RBAC — backend + frontend"`

> **Post-M1 refinements already in the repo (do not redo):** seed script (`backend/scripts/seed.ts`) with SuperAdmin/Company/Candidate accounts; `super_admins` table; candidate-account module + `/candidate/*` API + candidate portal frontend (originally Phase 5b, built early); backend SOLID restructure (this section's layout); unified auth routes; global response envelope + error filter; toast foundation (`useApiMutation` + Notifications provider).

---

## Phase 2 — Job Postings & Candidates CRUD ✅ (complete)

> **Conventions to follow (from the Phase 1 restructure):**
> - Modules live in `backend/src/modules/<name>/` with `module.ts`, `controller.ts`, `service.ts`, `dto/` (Zod schemas + inferred types).
> - Controllers validate via `@Body(new ZodValidationPipe(Schema))` and use `@CurrentUser()` / `@Roles(...)` decorators; route handlers return raw values (the global `ResponseInterceptor` wraps them).
> - All DB access goes through repositories extending `BaseRepository` (`withDb('current', ...)` for company-scoped, `'public'` for shared tables). Register new repos in `RepositoriesModule`; register modules in `AppModule`.
> - Frontend mutations use `useApiMutation` (auto-toasts); queries use TanStack Query hooks under `frontend/src/api/` or a feature folder; pages live under `frontend/src/features/company/job-postings` + `frontend/src/features/company/candidates`, routed as `/company/job-postings` and `/company/candidates`.

### Step 2.1 — Ensure template tables
Template schema already contains `job_postings` and `candidates` (`backend/drizzle/template-schema.sql`). No action unless the company table set changed.

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
POST   /job-postings               — CompanyAdmin, Recruiter (@Roles)
GET    /job-postings/:id           — any authenticated user
PATCH  /job-postings/:id           — CompanyAdmin, Recruiter
POST   /job-postings/:id/publish   — CompanyAdmin, Recruiter (status draft→open; also sync jobListingsIndex — see Phase 5b)
POST   /job-postings/:id/close     — CompanyAdmin, Recruiter (status→closed; sync index)
DELETE /job-postings/:id           — CompanyAdmin only
GET    /candidates                 — CompanyAdmin, Recruiter, HiringManager
POST   /candidates                 — CompanyAdmin, Recruiter
GET    /candidates/:id             — CompanyAdmin, Recruiter, HiringManager
```
Use `@Roles('CompanyAdmin', 'Recruiter')` etc. on handlers (global `RolesGuard` enforces). Guarded endpoints also need `AuthGuard('jwt')` unless a global jwt guard is added — follow the pattern used by `CandidateAccountController`.

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

### Step 2.9 — Frontend components (under `features/company/job-postings` + `features/company/candidates`)
Create `JobPostingList.tsx` — Mantine Table (Title/Status/Created/Actions), status badges (draft/gray, open/green, closed/red).
Create `JobPostingForm.tsx` — Mantine `useForm` + zod resolver; fields: title, description, required skills MultiSelect.
Create `RequiredSkillsPicker.tsx` — MultiSelect calling `GET /skills?search=` on input change (debounced).
Create `CandidateList.tsx` — Table: name, email, phone, created.
Create `CandidateProfile.tsx` — detail view with applications list (Phase 3+).
Create route files `frontend/src/routes/company/job-postings.tsx` and `frontend/src/routes/company/candidates.tsx` (parents already gated in `company.tsx` `beforeLoad`).

**Commit:** `git add -A && git commit -m "phase2: job postings and candidates CRUD — backend + frontend"`

---

## Phase 3 — Pipeline (Kanban Board)

### Step 3.1 — Pipeline stage repository
`backend/src/repositories/pipeline-stage.repository.ts` **already exists** (findAll ordered by stage order, findFirst, createMany used at company provisioning). Add findById/update/delete as needed.

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

### Step 3.6 — Frontend pipeline board (under `features/company/pipeline`)
Create `PipelineBoard.tsx` — DndContext with onDragEnd, renders PipelineColumn per stage.
Create `PipelineColumn.tsx` — useDroppable, shows stage name + count, renders ApplicationCard list.
Create `ApplicationCard.tsx` — useDraggable, shows candidate name / match score badge / applied date, opens drawer on click.
Implement optimistic update in `useUpdateStage`: onMutate snapshots cache, onError rolls back, onSettled refetches.

### Step 3.7 — Application detail drawer
Create `ApplicationDetailDrawer.tsx` — Mantine Drawer with candidate info, job title, match score. Tabs: Notes (list+add form), Interviews.

### Step 3.8 — Stage editor (CompanyAdmin)
Create `StageEditor.tsx` — ordered list with drag handle, inline name edit, add/delete with confirmation.

**Commit:** `git add -A && git commit -m "phase3: pipeline Kanban board with drag-and-drop — backend + frontend"`

---

## Phase 4 — Resume Upload & Manual Skill Matching ✅ (complete)

> **Design change:** Automated PDF/DOCX text extraction and substring skill matching removed. Resume is now **pure storage** (MinIO) for recruiter review. Candidates **manually declare skills** in their cross-company profile (`public.candidate_skills`). Match score = candidate's self-declared skills (or per-application override) vs job's required skills. See `docs/superpowers/specs/2026-08-03-phase4-redesign-manual-skills.md`.

### Step 4.1 — Install libs
```
cd backend && npm install @aws-sdk/client-s3
cd backend && npm install -D @types/multer
cd frontend && npm install @mantine/dropzone
```
> **Removed:** `pdf-parse`, `mammoth`, `@types/pdf-parse`, `@types/mammoth` (no longer needed)

### Step 4.2 — Storage module (MinIO/S3) — UNCHANGED
Create `backend/src/common/storage/storage.provider.ts` — `STORAGE_PROVIDER` factory (mirrors `drizzleProvider`): `new S3Client({ region: 'us-east-1', endpoint: S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })`.
Create `backend/src/common/storage/storage.service.ts` — `ensureBucket()` (on `onApplicationBootstrap`), `upload(key, buffer, contentType)`, `get(key)`, `delete(key)`.
Create `backend/src/common/storage/storage.module.ts` — provides + exports `StorageService`.
Bucket name configurable via `S3_BUCKET` (default `resumes`).

### Step 4.3 — Database schema changes
**Add to `backend/src/database/schema.ts` (public schema):**
```ts
candidateSkills = pgTable('candidate_skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateAccountId: uuid('candidate_account_id')
    .notNull()
    .references(() => candidateAccounts.id, { onDelete: 'cascade' }),
  skillId: uuid('skill_id')
    .notNull()
    .references(() => skills.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueCandidateSkill: uniqueIndex('unique_candidate_skill').on(t.candidateAccountId, t.skillId),
}));
```

**Update `backend/drizzle/template-schema.sql`:**
- Remove the company `resumes` and `resume_skills` tables entirely
- Keep the current 9-table company template in sync with `backend/src/database/schema.ts`

Run migration:
```
cd backend && npx drizzle-kit generate
# Apply generated migration via psql (see 00b_LOCAL_DEV_BOOTSTRAP.md)
# Update template-schema.sql and re-apply to template schema
```

### Step 4.4 — Candidate Skill Repository (public schema)
Create `backend/src/repositories/candidate-skill.repository.ts`:
- `findByCandidateAccountId(accountId: string): Promise<CandidateSkill[]>`
- `replaceAll(accountId: string, skillIds: string[]): Promise<void>` — delete existing + bulk insert
- `delete(accountId: string, skillId: string): Promise<void>`
Register in `RepositoriesModule` (public schema).

### Step 4.5 — Skill matching service — UNCHANGED (reused)
`backend/src/modules/skill-matching/skill-matching.service.ts` already exists with `computeScore(requiredSkillIds, candidateSkillIds)`. No changes needed.

### Step 4.6 — Candidate Account Module — Add Skills Endpoints
Update `backend/src/modules/candidate-account/`:
- **Service:** Add `getSkills(accountId)` and `setSkills(accountId, skillIds[])`
- **Controller:** Add endpoints:
  ```
  GET  /candidate/skills          — Candidate (returns [{ id, name, category }])
  PUT  /candidate/skills          — Candidate (body: { skillIds: string[] })
  ```
- **DTOs:** Zod schema for `skillIds: string[]`

### Step 4.7 — Candidate Apply — Accept Optional Skill Override
**Candidate Apply Module** (`POST /candidate/jobs/:companyId/:jobId/apply`):
- Same logic: optional `skillIds` override, default to profile skills
- Persist used `skillIds` to the company application's `applied_skill_ids` JSONB field for history

### Step 4.8 — Resumes Module — Simplify to Storage Only
Update `backend/src/modules/resumes/`:
- **Service:** Remove `extractText()`, `extractSkills()`, `recomputeScores()`
  - `upload(candidateAccountId, file)`: validate type/size → upload to MinIO → update `candidate_accounts.resume_file_url` and `resume_uploaded_at`
  - `get(candidateAccountId)`: return resume metadata from the candidate account (no parsedText, no skills)
- **Controller:** Same endpoints, simplified response
- **Repository:** Use `CandidateAccountRepository` resume metadata methods; no company resume repository exists

### Step 4.9 — Candidates Service (Company) — Include Candidate Skills
Update `backend/src/modules/candidates/candidates.service.ts`:
- `getOne(id)`: join candidate → candidate_account (via email) → candidate_skills
- Return `{ ..., skills: [{ id, name, category }] }` for company view

### Step 4.10 — Unit Tests
- `skill-matching.service.spec.ts` — unchanged (keep existing tests)
- `resumes.service.spec.ts` — test upload stores the file and candidate-account metadata only
- `candidate-account.service.spec.ts` — add tests for `getSkills`/`setSkills`
- `candidate-apply` tests — verify match score with profile skills vs override

### Step 4.11 — Frontend: Candidate Skills Page
Create `frontend/src/features/candidate-portal/skills/`:
- `SkillsPage.tsx` — Mantine MultiSelect searching `GET /skills?search=` (debounced), save via `PUT /candidate/skills`
- `useCandidateSkills` hook — TanStack Query + `useApiMutation`

Create route: `frontend/src/routes/_candidate/skills.tsx`

Update `CandidatePlatform` sidebar: add "Skills" link.

### Step 4.12 — Frontend: Candidate Apply Form
The authenticated candidate apply modal:
- Prefills skills from `GET /candidate/skills`
- Allows add/remove before submit
- Submits `skillIds` to the Candidate-only apply endpoint

### Step 4.13 — Frontend: Company Candidate Profile
Update `frontend/src/features/company/candidates/CandidateProfile.tsx`:
- Show read-only skill badges from `candidate.skills`
- Resume card: only file link + upload date (no parsedText, no extracted skills)

### Step 4.14 — Frontend: Pipeline Match Score (UNCHANGED)
`MatchScoreBadge` and `ApplicationCard` continue reading `application.matchScore` — no changes needed.

### Step 4.15 — Cleanup Dependencies
```
cd backend && npm uninstall pdf-parse mammoth @types/pdf-parse @types/mammoth
```

**Commit:** `git add -A && git commit -m "feat(m4): resume storage + manual candidate skills, match score from profile — backend + frontend"`

---

## Phase 5 — Public Careers & Candidate Apply ✅ (complete)

> **Design decision:** Phase 5 public careers is unauthenticated read-only browsing. Every application requires an authenticated Candidate account. Redis and rate limiting remain in Phase 6.

### Step 5.1 — Public careers backend ✅
Implemented `backend/src/modules/public-careers/` with:
```
GET /public/:companySlug/jobs       — company-specific open jobs from job_listings_index
GET /public/:companySlug/jobs/:id   — open job detail + required skills
```
The service resolves the company by slug, filters the public index by company and `open` status, and reads required skills from the explicit company schema. Missing, draft, and closed jobs return `404`.

### Step 5.2 — Candidate-only application boundary ✅
There is intentionally no `POST /public/:companySlug/jobs/:id/apply` endpoint. The existing endpoint remains the only application write path:
```
POST /candidate/jobs/:companyId/:jobId/apply — Candidate JWT + Candidate role required
```
Anonymous Apply actions redirect to `/auth/signin?returnTo=/careers/...`; the unified sign-in and candidate signup pages preserve the safe return path.

### Step 5.3 — Public careers frontend ✅
Implemented:
- `frontend/src/features/public-careers/JobListingPage.tsx`
- `frontend/src/features/public-careers/JobDetailPage.tsx`
- `frontend/src/features/public-careers/api/publicCareersApi.ts`
- `frontend/src/features/public-careers/hooks/usePublicCareers.ts`
- `/careers/$companySlug/jobs`
- `/careers/$companySlug/jobs/$jobId`
- Shared authenticated `CandidateApplyModal` used by public detail and candidate job search.

### Step 5.4 — Verify ✅
```
curl http://localhost:3000/api/public/acme/jobs
curl http://localhost:3000/api/public/acme/jobs/<open-job-id>
curl http://localhost:3000/api/public/acme/jobs/<draft-or-closed-job-id>  # 404
curl -X POST http://localhost:3000/api/candidate/jobs/<company-id>/<open-job-id>/apply -d '{}'  # 401 without JWT
```

**Commit:** `git add -A && git commit -m "feat(m5): public careers and Candidate-only apply"`

---

## Phase 5b — Candidate Accounts & Dashboard ✅ (implemented early)

> **Status: ✅ implemented** (built early with the backend SOLID restructure and completed through Phase 5b). The `/candidate/*` API + `CandidatePlatform` frontend exist, including profile skills, storage-only resume upload, authenticated apply, bookmarks, application history, and candidate-owned application detail. Steps below are kept for reference.

### Step 5b.1 — Add public schema tables
**Done.**
Add to `backend/src/database/schema.ts`:
- `candidateAccounts`: id, email (unique), passwordHash, firstName, lastName, phone, resumeFileUrl, resumeUploadedAt, createdAt
- `candidateSkills`: id, candidateAccountId (FK), skillId (FK), createdAt
- `candidateBookmarks`: id, candidateAccountId (FK → candidateAccounts.id), companyId, jobPostingId, jobTitle, companyName, createdAt
- `candidateApplicationsIndex`: id, candidateAccountId (FK → candidateAccounts.id), companyId, jobPostingId, applicationId, status, appliedAt, jobTitle, companyName
- `jobListingsIndex`: id, companyId, jobPostingId (unique), title, description, companyName, companySlug, status, createdAt, updatedAt

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
**Done.** `POST /auth/signup` and `POST /auth/signin` are unified — candidate vs company signup is inferred from the DTO. `auth.service.ts` `candidateSignup(dto)` operates on `candidateAccounts` (public schema) and returns a JWT with `{ sub: candidateAccountId, role: 'Candidate' }` (no companyId).

### Step 5b.4 — Create CandidateAccountModule
**Done.** `backend/src/modules/candidate-account/`:
- `candidate-account.controller.ts` — all /candidate/* endpoints
- `candidate-account.service.ts` — business logic
- `candidate-account.module.ts` — imports, providers, guards

Endpoints:
```
GET    /candidate/jobs                              — CANDIDATE (list from jobListingsIndex)
GET    /candidate/jobs/:companyId/:jobId             — CANDIDATE (job detail)
POST   /candidate/jobs/:companyId/:jobId/apply       — CANDIDATE (write to company schema + index)
GET    /candidate/applications                      — CANDIDATE (from candidateApplicationsIndex)
GET    /candidate/applications/:id                  — CANDIDATE (detail)
POST   /candidate/bookmarks                         — CANDIDATE (save)
DELETE /candidate/bookmarks/:id                     — CANDIDATE (remove)
GET    /candidate/bookmarks                         — CANDIDATE (list)
GET    /candidate/profile                           — CANDIDATE (view)
PATCH  /candidate/profile                           — CANDIDATE (update)
```

All candidate routes above are authenticated with a Candidate JWT. Public careers remain
read-only (`GET /public/:companySlug/jobs` and `GET /public/:companySlug/jobs/:id`); there is
no anonymous application route. The application-detail route is implemented at
`GET /candidate/applications/:id` and returns `404` when the application is not owned by
the authenticated candidate.

### Step 5b.5 — Update ApplicationsModule
In the stage transition handler (`PATCH /applications/:id/stage`): after updating the company's application record, also update `candidateApplicationsIndex` status field for that application. **Done.**

### Step 5b.6 — Update JobPostingsModule
In the publish/close/delete handlers: sync the `jobListingsIndex` table — upsert on publish, update status on close, and delete the index row on deletion. **Done.**

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
curl http://localhost:3000/api/candidate/jobs -H "Authorization: Bearer $CANDIDATE_TOKEN"  -> { data: [ jobs from all companies ] }
curl -X POST http://localhost:3000/api/candidate/jobs/<companyId>/<jobId>/apply -H "Authorization: Bearer $CANDIDATE_TOKEN"  -> { data: { applicationId } }

# Anonymous apply remains out of scope and must not be available
curl -X POST http://localhost:3000/api/public/testcorp/jobs/<id>/apply -d '{"name":"Jane","email":"j@e.com"}'  -> 404
```

**Commit:** `git add -A && git commit -m "phase5b: candidate accounts and dashboard — backend + frontend"`

---

## Phase 6 — Redis: Full Integration ✅ (implemented)

> **Status: ✅ implemented.** Redis is used for sign-in limiting and the
> company-scoped dashboard summary cache. BullMQ background jobs remain out of scope for
> this phase.

### Step 6.1 — Install Redis client and provider
```
cd backend && npm install ioredis
```
Create `backend/src/database/redis.provider.ts` — `REDIS_PROVIDER` factory using the configured Redis URL.

### Step 6.2 — Login rate limiter ✅
Implemented in `backend/src/common/middlewares/login-rate-limiter.guard.ts`. The limiter is
sign-in-only, normalizes the email, keys by email and IP, and allows five attempts per
15-minute window. The sixth attempt returns `429 RATE_LIMITED` with a numeric `Retry-After`
header. Other auth routes and the candidate apply route are not limited by this guard.

### Step 6.3 — Cache service ✅
Implemented in `backend/src/common/cache/cache.service.ts` with JSON-safe `get<T>`, `set`
with TTL, pattern invalidation, and company dashboard-key invalidation. Cache failures fall
back to the underlying database operation.

Final integrity hardening adds a company dashboard generation key. Invalidation advances
the generation and removes the summary atomically; dashboard writes use an atomic
generation compare-and-set, so a result queried before a mutation cannot repopulate a
stale summary.

### Step 6.4 — Dashboard cache ✅
`GET /dashboard/summary` is authenticated for internal company roles and uses the
company-namespaced key `company:{companyId}:dashboard:summary:v1` with a 60-second TTL.
Application, job-posting, pipeline-stage, and candidate-apply writes invalidate only the
affected company's key; another company's cached summary remains available.

Candidate detail, bookmark, and apply flows re-read the selected company job after the
public open-job index lookup and return `404` if the source posting is no longer open.
Company candidates now have a partial unique account link, with migration-time duplicate
reconciliation and race-safe candidate creation.

**Release-gate coverage:** `backend/test/phase5b-phase6.e2e-spec.ts` verifies candidate
open-job filtering, duplicate application conflicts, ownership `404`s, index status
synchronization, sign-in limiting, dashboard cache presence, company isolation, and scoped
invalidation.

**Out of scope:** anonymous apply and BullMQ workers/queues. These remain explicitly
deferred to later milestones.

**Commit:** `git add -A && git commit -m "docs(m6): verify phase5b and phase6"`

---

## Phase 7 — BullMQ Background Jobs ✅ (complete)

> **Design decisions (see `docs/superpowers/specs/2026-08-07-phase7-bullmq-notifications-design.md`):**
> - Delivery is an `audit_logs` row + log output — the first real writer of the table. Email (FR-26 "email, queued") plugs into the worker's `deliver()` method when a mailer exists.
> - Resume parsing is **not** part of the product design and is not queued.
> - BullMQ uses a **dedicated** ioredis connection (`maxRetriesPerRequest: null` required by BullMQ; the Phase 6 limiter/cache connection uses `1` and is untouched).
> - Step 7.4's `bootstrap.ts` was replaced by a Nest-managed `NotificationWorkerService` (`QueuesModule`): it gets DI (`AuditLogRepository`) and lifecycle (`onModuleDestroy` closes worker → queue → connection) for free, and e2e apps boot the worker automatically.

### Step 7.1 — Install ✅
```
cd backend && npm install bullmq
```

### Step 7.2 — Queue definitions ✅
Created `backend/src/queues/queues.ts` — dedicated BullMQ connection, `notificationQueue` (`Queue('notifications')` with `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 100 }`), `STAGE_CHANGE_JOB` constant, and the `StageChangeNotificationPayload` type. Registered in `backend/src/queues/queues.module.ts` (`QueuesModule` — provides `NOTIFICATION_QUEUE` + `BULLMQ_CONNECTION`, imports `RepositoriesModule`).

### Step 7.3 — Notification worker ✅
Created `backend/src/workers/notification.worker.service.ts` — Nest-managed worker (concurrency 1) processing `stage-change` jobs: writes an `audit_logs` row (`action = 'notification.stage_change'`, `resourceId` = application id, JSON `metadata`) + logs. 3 retries with exponential backoff come from the queue's `defaultJobOptions`. Producer: `ApplicationsService.updateStage` enqueues fire-and-forget (a queue failure logs a warning and never fails the stage change).

### Step 7.4 — Wire up worker ✅
`QueuesModule` is imported by `AppModule` (worker starts on module init). `ApplicationsModule` imports `QueuesModule` for the queue token. No `bootstrap.ts` / `main.ts` change needed (deviation from the guide — Nest-managed lifecycle).

**Release-gate coverage:** `backend/test/phase7.e2e-spec.ts` — apply → stage change → poll `public.audit_logs` for the delivered notification row (payload fields: company, job, to-stage, recipient email).

**Commit:** `git add -A && git commit -m "phase7: BullMQ background jobs — stage-change notifications with audit-log delivery"`

---

## Phase 8 — Interviews & Feedback ✅ (complete)

> **Design decisions (see `docs/superpowers/specs/2026-08-07-phase8-interviews-feedback-design.md`):**
> - No schema or migration work — `interviews` and `interview_feedbacks` already existed in the template schema and every company.
> - The API surface is docs `07`'s five endpoints (the guide's three plus detail + reschedule/cancel) plus `GET /company/users` for the interviewer picker (also serves Phase 9).
> - The Interviewer role's `GET /interviews` is filtered **server-side** to `interviewerId = current user` (FR-21); `?assignedToMe=true` is an optional filter for other roles.
> - Scheduling auto-moves the application to the company's `Interview` stage by reusing `ApplicationsService.updateStage` — inheriting candidate-index sync, dashboard-cache invalidation, and the Phase 7 stage-change notification.
> - Feedback is 1:1 with the interview: duplicate submission → `409 CONFLICT`; a successful submission flips the interview `status` to `completed`.
> - Interviewer users come from the seed (`interviewer@acme.com`, password `Interviewer123!`); user management itself remains Phase 9.

### Step 8.1 — Repositories ✅
Created `backend/src/repositories/interview.repository.ts` — `findAll(filters?: { interviewerId?, applicationId? })` (joins applications → candidate name/job title, users → interviewer email, leftJoin feedback), `findById`, `create`, `update`; and `interview-feedback.repository.ts` — `findByInterviewId`, `create`. Added `UserRepository.findAll()` (id, email, role) for the picker. All registered in `RepositoriesModule` (company-scoped).

### Step 8.2 — Interviews module ✅
Created `backend/src/modules/interviews/` with module, controller, service, dto/:
```
GET   /interviews?assignedToMe=true — OA, R, HM, IV (Interviewer role is always own-only, server-side)
GET   /interviews/:id               — OA, R, HM, IV (assigned) — 403 for unassigned Interviewers
POST  /interviews                   — OA, R, HM (body: applicationId, interviewerId, scheduledAt ISO)
PATCH /interviews/:id               — OA, R, HM (body: scheduledAt?, status? ∈ scheduled|completed|cancelled)
POST  /interviews/:id/feedback      — IV only, verifies assignment (body: rating 1–5 required, comments?)
GET   /company/users                    — OA, R, HM (company users for the interviewer picker)
```
All bodies validated via `@Body(new ZodValidationPipe(...))`. `ApplicationsModule` now exports `ApplicationsService` so scheduling can reuse the stage-move pipeline. Registering `InterviewsModule` in `AppModule` was the only wiring change.

### Step 8.3 — Frontend components ✅
Under `frontend/src/features/company/interviews/`:
- `InterviewListView.tsx` — table (candidate, job, date, interviewer, status badge) with role-aware actions: Interviewer ⇒ Feedback button; OA/R/HM ⇒ Schedule / Reschedule / Cancel.
- `InterviewScheduler.tsx` — modal: application select, interviewer select (from `GET /company/users`), native `datetime-local` input (no new Mantine package).
- `InterviewFeedbackForm.tsx` — Mantine `Rating` 1–5 + comments; only rendered for the assigned interviewer.
- Route `frontend/src/routes/company/interviews.tsx` (nav link already existed).
- `ApplicationDetailDrawer` Interviews tab is now live (filters the shared interviews query by application id).

### Step 8.4 — Verify ✅
```
curl -X POST http://localhost:3000/api/interviews -H "Authorization: Bearer $TOKEN" \
  -d '{"applicationId":"<id>","interviewerId":"<id>","scheduledAt":"2026-08-01T14:00:00Z"}'  # 201; application auto-moved to Interview stage
curl -X POST http://localhost:3000/api/interviews/<id>/feedback -H "Authorization: Bearer $IV_TOKEN" \
  -d '{"rating":4,"comments":"Strong"}'  # 201; interview status -> completed
```
Non-assigned user → 403; duplicate feedback → 409.

**Release-gate coverage:** `backend/test/phase8.e2e-spec.ts` — schedule → auto-stage move + candidate-index status sync, server-side assignment filtering (assigned IV sees own, other IV sees none), feedback 403/404/409 rules, reschedule + cancel, role 403s (candidate on all interview routes, OA on feedback), and interviewer-picker listing.

**Commit:** `git add -A && git commit -m "phase8: interviews and feedback — backend + frontend"`

---

## Phase 9 — Admin, Platform & CI ✅ (complete)

> **Design decisions (see `docs/superpowers/specs/2026-08-07-phase9-admin-platform-ci-design.md`):**
> - **No mailer exists**, so `POST /company/users/invite` takes an **admin-set initial password** (shared out-of-band); a password-change flow is deferred. Invited users get a company `users` row + a `user_emails` bridge row (so the unified sign-in finds them).
> - **Suspend enforcement is sign-in + refresh + public careers only.** A suspended company's users get `403 FORBIDDEN` at sign-in and `401` on refresh rotation; existing 15-minute access tokens simply expire. No per-request status check (deferred until throughput demands it). Public careers for a suspended company return `404`.
> - **Platform stats scope** is company / user / application totals (`GET /platform/stats`), counted per company schema; company detail returns that company's own counts.
> - **`PATCH /company` edits the company name only** — slug (URL identity) and plan (platform-managed) stay immutable.
> - `companies.status` (varchar, default `'active'`) is the first public-schema migration added by a `drizzle-kit generate` in this phase (`20260806191320_superb_king_cobra`); the generated file was hand-trimmed to the real change because the diff-vs-live-DB output contained stale drift from earlier manual migrations.
> - The Phase 8 `CompanyUsersController` moved from `modules/interviews/` to the new `modules/company/` and gained invite/role/delete; `GET /company/users` (picker) keeps its OA/R/HM roles.
> - Audit rows via `common/audit/audit.service.ts` (`AuditService`): `user.invite`, `user.role_change`, `user.remove`, `company.suspend`, `company.reactivate` (platform rows record the target company id).

### Step 9.1 — Company status + suspension (backend) ✅
- Migration `backend/drizzle/20260806191320_superb_king_cobra/migration.sql` adds `public.companies.status` (default `'active'`).
- `CompanyRepository` gained `findAll()`, `updateStatus(id, status)`, `updateName(id, name)`; `UserRepository` gained `updateRole()` / `remove()`; `UserEmailRepository` gained `deleteByUserId()`; new `UsageRepository` counts users/applications per explicit company schema (`forSchema`).
- `AuthService.signin` and `TokenService.rotate` reject suspended companies; `PublicCareersService` returns `404` for suspended companies.

### Step 9.2 — Company module (settings + users, backend) ✅
`backend/src/modules/company/` — `CompanyController` (`GET /company` any internal role, `PATCH /company` CompanyAdmin), `CompanyUsersController` (moved from interviews + `POST /company/users/invite`, `PATCH /company/users/:userId/role`, `DELETE /company/users/:userId`, all CompanyAdmin-only), `CompanyUsersService` with self-change / self-remove / last-CompanyAdmin guards and audit rows. DTOs under `dto/`. Registered in `AppModule`.

### Step 9.3 — Platform module (SuperAdmin, backend) ✅
`backend/src/modules/platform/` — `@Roles('SuperAdmin')` on all routes, public-schema repos only:
```
GET    /platform/companies                — list all companies (id, name, slug, plan, status, createdAt)
GET    /platform/companies/:id            — company detail + users/applications counts
PATCH  /platform/companies/:id/suspend    — 404 missing, 409 already suspended, audit
PATCH  /platform/companies/:id/reactivate — 404 missing, 409 already active, audit
GET    /platform/stats                  — totals across companies (companies/users/applications)
```

### Step 9.4 — Frontend admin (CompanyAdmin) ✅
Under `frontend/src/features/company/settings/` + `frontend/src/features/company/users/`:
- `CompanySettingsPage.tsx` — company info, editable name (CompanyAdmin), slug/plan/status read-only; routes `/company/settings`.
- `UserManagementPage.tsx` — team table (email / role Select / created / remove), invite modal (email + role + initial password), self-row actions disabled; routes `/company/users`.
- Both routes carry an CompanyAdmin-only `beforeLoad`; the `CompanyPlatform` sidebar shows "Team" and "Settings" only for CompanyAdmin.
- API: `frontend/src/api/companyApi.ts`, extended `companyUsersApi.ts`, hooks under each feature folder.

### Step 9.5 — Frontend platform (SuperAdmin) ✅
Under `frontend/src/features/admin/`:
- `CompaniesPage.tsx` — platform stats cards (companies/users/applications from `GET /platform/stats`) + company table (company, slug, plan, status badge, created), row click → detail.
- `CompanyDetailPage.tsx` — detail + usage counts + suspend/reactivate button (route `/admin/companies/$companyId`).
- API: `frontend/src/api/platformApi.ts`, hooks in `features/admin/hooks/usePlatform.ts`.

### Step 9.6 — GitHub Actions CI ✅
Created `.github/workflows/ci.yml`:
- Trigger: push, pull_request. Two parallel jobs (`backend`, `frontend`).
- Services: postgres:16 + redis:7-alpine + minio (the backend requires MinIO at bootstrap — `StorageService.onApplicationBootstrap` creates the bucket).
- Backend: `npm ci` → apply all `drizzle/*/migration.sql` in order + `drizzle/template-schema.sql` via `docker exec` against the service container → lint → typecheck → unit tests → **e2e release gates** (`npm run test:e2e` — the isolation suite breaks the build) → build.
- Frontend: `npm ci` → lint (oxlint) → build.

**Release-gate coverage:** `backend/test/phase9.e2e-spec.ts` — SuperAdmin company list/detail/stats, non-SuperAdmin 403, suspend → sign-in 403 + refresh 401 + public careers 404 + double-suspend 409, reactivate → sign-in/rotation/careers restored + double-reactivate 409, company settings GET/PATCH, invite → sign-in works + duplicate 409 + role change + remove (removed user can't sign in), self/last-admin 403s, recruiter 403s, and audit rows for suspend/reactivate/invite/role_change/remove.

**Commits (checkpoints):** `phase9: company status + suspension enforcement` · `phase9: company settings and user management — backend` · `phase9: platform module — company management and stats` · `phase9: company settings and user management — frontend` · `phase9: superadmin platform views — frontend` · `phase9: e2e release gate and CI pipeline` · `docs(m9): mark phase 9 complete`

---

## Phase 10 — Deployment ✅ (complete)

> **Design decisions (see `docs/superpowers/specs/2026-08-07-phase10-deployment-design.md`):**
> - Target is a **self-hosted Ubuntu server** running a `docker compose` prod stack. TLS/domain handled by **host-level nginx** (user-managed); the frontend container exposes port 80 only. Postgres/Redis/MinIO live on an internal Docker network, unreachable from outside.
> - Resume upload stays **backend-proxied** (browser → NestJS → MinIO); nginx `client_max_body_size 15m` covers the 10MB multer limit. Presigned uploads deferred.
> - Secrets come from a root `.env` file (compose auto-loads it for `${VAR}` interpolation, and `backend` consumes it via `env_file`). `.env.prod.example` is committed; `.env` is gitignored.
> - **Migrations** run via a one-shot `migrate` compose service (postgres:16-alpine + bind-mounted `backend/drizzle/` + `scripts/prod-migrate.sh`). Idempotent guard: skips when `public.companies` exists. `backend` waits on `condition: service_completed_successfully`.
> - No seed in prod — company signup provisions everything.
> - **Resume view fix:** the company candidate profile previously linked `href={fileUrl}` where `fileUrl` is a bare S3 key (dead relative URL in dev and prod). Added `GET /candidates/:candidateId/resume/file` (OA/R/HM) streaming from MinIO with `@SkipEnvelope()` (new decorator that short-circuits the global `ResponseInterceptor`), and the frontend now blob-fetches through `apiClient` (Bearer attached) → object URL. No MinIO exposure needed.
> - YAGNI: no CI docker builds, no presigned uploads, no HTTPS config (host nginx), no backup automation (one-liner below), no monitoring.

### Step 10.1 — Backend Dockerfile ✅
`backend/Dockerfile` — 3-stage `node:20-alpine`:
- `deps`: `apk add python3 make g++` (argon2 has no musl prebuilds — node-gyp compiles it) → `npm ci --omit=dev`
- `build`: `FROM deps AS build` (inherits the compile tools) → `npm ci` → `nest build`
- `runtime`: copies `node_modules` from deps + `dist` from build → `CMD ["node", "dist/main.js"]`, EXPOSE 3000.
`backend/.dockerignore` — node_modules, dist, .env, test, coverage.

### Step 10.2 — Frontend Dockerfile ✅
`frontend/Dockerfile` — build stage (`ARG VITE_API_URL=/api` — required: the client default `http://localhost:3000/api` is wrong in prod) → `nginx:alpine` runtime with `frontend/nginx.conf`:
```
location /api/ { proxy_pass http://backend:3000; ... }   # same-origin API
location / { try_files $uri $uri/ /index.html; }          # SPA fallback
client_max_body_size 15m;
```

### Step 10.3 — Production compose + env ✅
`docker-compose.prod.yml` (project `talentpipe-prod`): services `postgres:16-alpine`, `migrate` (one-shot), `redis:7-alpine`, `minio`, `backend` (`env_file: .env`), `frontend` (ports `80:80`). All on internal network `backend`; healthchecks on postgres/redis/minio; `restart: unless-stopped`; named volumes `pgdata`/`miniodata`.
`.env.prod.example` (committed) → copy to `.env` (gitignored) and replace all values. Keys: POSTGRES_USER/PASSWORD/DB, DATABASE_URL (`@postgres:5432`), REDIS_URL (`redis://redis:6379`), JWT_SECRET, JWT_REFRESH_SECRET, S3_ENDPOINT (`http://minio:9000`), MINIO_ROOT_USER/PASSWORD + S3_ACCESS_KEY/SECRET_KEY (**must match each other** — the app authenticates as the MinIO root user), S3_BUCKET (resumes), S3_AVATAR_BUCKET (avatars), CORS_ORIGIN.
`.gitattributes` — `*.sh text eol=lf` (protects the migrate script on Windows checkouts).

### Step 10.4 — First-boot migrations ✅
`scripts/prod-migrate.sh` (bind-mounted into the `migrate` service): applies `drizzle/*/migration.sql` chronologically + `drizzle/template-schema.sql` via psql; skips everything when `public.companies` already exists (idempotent across `compose up` re-runs).

### Step 10.5 — Deploy runbook (Ubuntu server)
```sh
# On the server
git clone <repo> && cd talentpipe-crm
cp .env.prod.example .env        # edit: strong passwords/secrets, S3_ACCESS_KEY = MINIO_ROOT_USER
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps   # all Up / Healthy, backend not restarting
```
Host nginx: point the domain at the server and reverse-proxy port 80 (or serve it directly as the frontend listens on 80). TLS via certbot if desired. The frontend serves both the SPA and `/api` (same-origin proxy), so no CORS config needed beyond `CORS_ORIGIN`.

**Verify:** visit the live URL → `/api/health` → company signup → post + publish a job → apply as a candidate (incognito careers page) → check the company pipeline → upload a resume as a candidate and open "View Resume" as an company user → sign-in rate limit (6 bad attempts → 429).

**Backup one-liner:**
```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup-$(date +%F).sql
```
**Updates:** `git pull && docker compose -f docker-compose.prod.yml up -d --build` (migrate service no-ops when already migrated).

**Commit:** `git add -A && git commit -m "phase10: Dockerfiles, production config, deployment"`

---

## Phase 11 — Platform Control + Candidate Experience ✅ (complete)

> **Design decisions (see `docs/superpowers/specs/2026-08-08-m11-platform-control-candidate-ux-design.md`):**
> - **Per-user suspension** extends the M9 company-suspend pattern to accounts: `users.status VARCHAR(20) NOT NULL DEFAULT 'active'` on `public.users`, cloned to `template` + every `company_<id>` (migration `20260808090000_platform_user_suspend`, same DO-loop shape as `scheduled_at_timezone`). Enforced at sign-in (`403`) + refresh rotation (`401`); `404` missing, `409` same-state, audit rows.
> - **Cascade migration** `20260808100000_platform_account_cascades` (delta vs the design, which said "no migration"): FK cascades on `candidate_bookmarks → candidate_accounts` (CASCADE), `interview_feedbacks → interviews` (CASCADE), `interviews → applications` (CASCADE), `notes → applications` (CASCADE), `notes → users` (CASCADE), `job_postings → users` (SET NULL) — applied to `public`, `template`, and every `company_%` schema. `provisionSchema` (`company.repository.ts`) and `template-schema.sql` create the same FKs for new companies.
> - **Platform account/data modules** reuse the sanctioned `withDb('company_<id>', ...)` cross-schema pattern (as `UsageRepository` does). All routes `@Roles('SuperAdmin')`. Every mutation writes an audit row with the target `companyId` as the 4th arg (`platform.user.create|update|suspend|reactivate|remove`, `platform.candidate.create|update|remove`, `platform.application.stage_move`, `platform.interview.update`).
> - **Stage move** syncs `candidate_applications_index` (same as the company path); on sync failure the whole move rolls back and returns `503 SERVICE_UNAVAILABLE`. No BullMQ enqueue on the platform path.
> - **Withdraw** is ownership-checked via `candidate_applications_index` (foreign → `404`); an application with interviews or notes refuses with `409 CONFLICT` (delete would violate the new cascades).
> - Seed now creates **6 accounts** (SuperAdmin, CompanyAdmin, Interviewer, + new HiringManager `hiring.manager@acme.com` / `HiringManager123!` and Recruiter `recruiter@acme.com` / `Recruiter123!`, + Candidate).
> - Candidate job detail route is `/_candidate/jobs.$jobId.tsx` → URL `/jobs/$jobId` with `companyId` as a search param (delta vs the design's `/candidate/jobs/$jobId`); public careers `JobDetailPage` and the candidate route share `JobDetailsView`.

### Step 11.1 — Per-user suspension (backend) ✅
Migration `20260808090000_platform_user_suspend` adds `users.status` (default `'active'`) to `public`, `template`, and all `company_%` schemas; `database/schema.ts` mirrors the column. Enforcement: `AuthService.signin` → `403 FORBIDDEN` for suspended users (alongside the existing company-status check); `TokenService.rotate` → `401`. Existing users default to `active`; no backfill.

### Step 11.2 — Platform accounts (SuperAdmin) ✅
`backend/src/modules/platform/` gains `PlatformAccountsService` + controller:
```
GET    /platform/companies/:id/users              — list company users
POST   /platform/companies/:id/users              — create (email, password, role; mirrors company invite incl. user_emails bridge)
PATCH  /platform/companies/:id/users/:userId      — change role / reset password
PATCH  /platform/companies/:id/users/:userId/suspend    — 404 missing, 409 same-state
PATCH  /platform/companies/:id/users/:userId/reactivate — 404 missing, 409 same-state
DELETE /platform/companies/:id/users/:userId      — remove (revokes refresh tokens)
GET    /platform/companies/:id/pipeline-stages    — company's ordered stages
GET/POST /platform/candidates                   — cross-company list / create
PATCH/DELETE /platform/candidates/:id           — update / remove (cascade delete: company applications + candidate_applications_index + linked candidate account)
```
Repos: `platform-user.repository.ts` (explicit `withDb('company_<id>', ...)`), `platform-candidate.repository.ts` (public schema). Unit specs: `platform-accounts.service.spec.ts` (14 cases).

### Step 11.3 — Platform data (SuperAdmin) ✅
`PlatformDataService` + controller:
```
GET   /platform/applications?companyId=&status=   — cross-company list
PATCH /platform/applications/:id/stage           — stage move (stage must belong to that company; index sync with rollback + 503 on failure)
GET   /platform/interviews?companyId=&status=     — cross-company list
PATCH /platform/interviews/:id                   — reschedule / cancel
```
Repos: `platform-application.repository.ts`, `platform-interview.repository.ts`. Unit specs: `platform-data.service.spec.ts` (9 cases).

### Step 11.4 — Candidate withdraw ✅
`DELETE /candidate/applications/:id` in `candidate-account` module: ownership via `candidate_applications_index` (foreign → 404); `409` when interviews/notes exist; deletes the company application row + index row.

### Step 11.5 — Frontend ✅
- `features/admin/CompanyDetailPage.tsx` — tabs: Users (table + create modal + role select + reset-password + suspend/reactivate + remove confirm), Applications (stage select from the company's stages), Interviews (reschedule/cancel).
- `features/admin/CandidatesPage.tsx` — new route `/admin/candidates`.
- `features/candidate-portal/jobs/JobDetailsView.tsx` — shared with public `JobDetailPage`; route `routes/_candidate/jobs.$jobId.tsx` (URL `/jobs/$jobId`).
- `features/candidate-portal/applications/ApplicationsPage.tsx` — job links, status stepper (Applied → current stage), Withdraw with confirm.

### Step 11.6 — Verify ✅
```
# Per-user suspend: platform suspend → user sign-in 403 + refresh 401; reactivate → restored; double-actions 409
# Platform stage move cross-company → candidate index status updated; audit row present
# Withdraw: candidate deletes own application (row + index gone); other candidate → 404; interviews/notes present → 409
# Seed: all five internal roles + Candidate can sign in
```

**Release-gate coverage:** `backend/test/phase11.e2e-spec.ts` (9 scenarios: platform user CRUD + sign-in checks, suspension cycle, candidate CRUD + cascade delete, application list/stage-move, interview list/reschedule/cancel, withdraw rules, audit rows, non-SuperAdmin 403s). The seed creates five-role accounts (SuperAdmin, CompanyAdmin, Interviewer, HiringManager, Recruiter) plus a Candidate, but the phase11 gate does not sign into those seeded accounts — it covers platform/candidate flows with self-created accounts. Auth specs extended for user suspension; existing phase e2e suites still green.

**Commits (checkpoints):** `feat(m11): platform account management — users, candidates, audit` · `feat(m11): per-user suspension + account cascades` · `feat(m11): cross-company applications and interviews` · `feat(m11): candidate withdraw` · `feat(m11): company detail tabs + candidates page` · `feat(m11): candidate job detail + applications UX` · `test(m11): e2e release gate for platform control and candidate UX` · `docs(m11): platform control + candidate experience`
