# TalentPipe — Implementation Guide

**Purpose:** Concise step-by-step instructions per phase. Each step is an actionable command or file to create. Complete phases in order.

**Stack:** NestJS + PostgreSQL + Drizzle ORM — React + Mantine + TanStack Query + dnd-kit
**Package manager:** npm
**Prerequisites:** Node 20+, Docker Desktop, Git

---

## Phase 0 — Project Scaffold

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
Create `src/main.ts` — call `NestFactory.create(AppModule)`, enableCors(), listen(3000).
Create `src/app.module.ts` — import `ConfigModule.forRoot({ isGlobal: true })`, export class AppModule.

Add scripts to package.json:
```
"start:dev": "tsx watch src/main.ts"
"build": "tsc"
"start": "node dist/main.js"
"lint": "tsc --noEmit"
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
cd backend && npm run start:dev    # http://localhost:3000
cd frontend && npm run dev         # http://localhost:5173
```

**Commit:** `git add -A && git commit -m "phase0: NestJS backend + Vite frontend + Docker infra scaffold"`

---

## Phase 1 — Auth, Tenancy & RBAC

### Step 1.1 — Drizzle schema
Create `backend/src/database/schema.ts` with ALL tables below.

**Public schema tables:**
- `tenants`: id (uuid pk), name (varchar 255), slug (varchar 100, unique), plan (varchar 50, default 'free'), createdAt (timestamp). Unique index on slug.
- `skills`: id (uuid pk), name (varchar 255, unique), category (varchar 100). Unique index on name.
- `auditLogs`: id (uuid pk), tenantId (varchar 36), userId (varchar 36), action (varchar 100), resourceId (varchar 36), metadata (text), createdAt (timestamp). Index on (tenantId, action).

**Tenant-schema tables (no tenantId columns):**
- `users`: id, email (unique), passwordHash, role (default 'OrgAdmin'), createdAt. Unique index on email.
- `jobPostings`: id, title (varchar 255), description (text), status (varchar 50, default 'draft'), createdByUserId (FK to users.id), createdAt.
- `candidates`: id, name (varchar 255), email (varchar 255), phone (varchar 50), createdAt. Index on email.
- `pipelineStages`: id, name (varchar 100), order (integer, default 0). Index on order.
- `applications`: id, candidateId (FK to candidates.id), jobPostingId (FK to jobPostings.id), currentStageId (FK to pipelineStages.id), matchScore (float, default 0), appliedAt. Index on (jobPostingId, currentStageId).
- `resumes`: id, candidateId (FK to candidates.id), fileUrl (varchar 512), parsedText (text), uploadedAt. Index on candidateId.
- `resumeSkills`: resumeId (FK to resumes.id), skillId (uuid). Unique index on (resumeId, skillId).
- `jobRequiredSkills`: jobPostingId (FK to jobPostings.id), skillId (uuid). Unique index on (jobPostingId, skillId).
- `interviews`: id, applicationId (FK to applications.id), interviewerId (FK to users.id), scheduledAt, status (default 'scheduled'). Indexes on interviewerId, applicationId.
- `interviewFeedbacks`: id, interviewId (FK to interviews.id, unique), rating (integer), comments (text), submittedAt. Unique index on interviewId.
- `notes`: id, applicationId (FK to applications.id), authorUserId (FK to users.id), content (text), createdAt. Index on applicationId.

### Step 1.2 — Migration & template schema
```
cd backend
npx drizzle-kit generate
npx drizzle-kit migrate
```

Connect psql to postgres container and run:
```
CREATE SCHEMA IF NOT EXISTS template;
CREATE TABLE template."user" (LIKE public."user" INCLUDING ALL);
CREATE TABLE template.job_posting (LIKE public.job_posting INCLUDING ALL);
CREATE TABLE template.candidate (LIKE public.candidate INCLUDING ALL);
CREATE TABLE template.pipeline_stage (LIKE public.pipeline_stage INCLUDING ALL);
CREATE TABLE template.application (LIKE public.application INCLUDING ALL);
CREATE TABLE template.resume (LIKE public.resume INCLUDING ALL);
CREATE TABLE template.resume_skill (LIKE public.resume_skill INCLUDING ALL);
CREATE TABLE template.job_required_skill (LIKE public.job_required_skill INCLUDING ALL);
CREATE TABLE template.interview (LIKE public.interview INCLUDING ALL);
CREATE TABLE template.interview_feedback (LIKE public.interview_feedback INCLUDING ALL);
CREATE TABLE template.note (LIKE public.note INCLUDING ALL);
```

### Step 1.3 — Drizzle provider
Create `backend/src/database/drizzle.provider.ts` — export `DRIZZLE_PROVIDER` symbol and `drizzleProvider` factory creating a `Pool` from `DATABASE_URL` env + `drizzle(pool)`.

### Step 1.4 — Tenant context
Create `backend/src/interceptors/tenant-context.ts` — `AsyncLocalStorage<TenantContext>`, `getTenantId()`, `getSchema()` (returns `tenant_{id}`), `getCurrentUser()`. All throw if no context.

### Step 1.5 — Tenant interceptor
Create `backend/src/interceptors/tenant-context.interceptor.ts` — extracts `request.user`, runs `asyncStorage.run({tenantId, userId, role}, ...)` around `next.handle()`.

### Step 1.6 — Schema routing service
Create `backend/src/database/drizzle-schema.service.ts` — inject DRIZZLE_PROVIDER, provide `forCurrentTenant()` (sets search_path to tenant schema) and `forPublic()` (sets search_path to public).

### Step 1.7 — Password utility
Create `backend/src/shared/password.ts` — `hashPassword(password)` and `verifyPassword(hash, password)` using argon2.

### Step 1.8 — AuthModule
Create `backend/src/modules/auth/auth.module.ts` — imports JwtModule (secret from env, 15m expiry), providers: AuthService, JwtStrategy, DrizzleSchemaService, drizzleProvider, TenantRepository, UserRepository.

Create `backend/src/modules/auth/auth.controller.ts` — POST /auth/signup, POST /auth/login, POST /auth/refresh.

Create `backend/src/modules/auth/auth.service.ts` — implement:
- `signup(dto)`: check slug uniqueness, insert tenant, CREATE SCHEMA + clone tables, hash password, insert OrgAdmin user, insert default stages (Applied/Screening/Interview/Offer/Hired/Rejected), return JWT
- `login(dto)`: iterate tenants to find user email, verify password, return JWT
- `refresh(token)`: verify + reissue access token

Create `backend/src/modules/auth/jwt.strategy.ts` — PassportStrategy extracting Bearer token, validates payload as {tenantId, userId, role}.

### Step 1.9 — RolesGuard + @Roles decorator
Create `backend/src/shared/roles.guard.ts` — checks Reflector metadata `roles` against `request.user.role`.
Create `backend/src/shared/roles.decorator.ts` — `Roles(...roles: string[])` sets metadata.

### Step 1.10 — Repositories
Create `backend/src/repositories/tenant.repository.ts` — findBySlug, findById, create (all use `forPublic()`).
Create `backend/src/repositories/user.repository.ts` — findByEmail, findById, create (all use `forCurrentTenant()`).

### Step 1.11 — Health controller
Create `backend/src/modules/health/health.controller.ts` — GET /health returns `{ status: 'ok', timestamp }`.

### Step 1.12 — Wire AppModule
Update `src/app.module.ts` — imports ConfigModule + AuthModule, controllers HealthController, providers APP_INTERCEPTOR using TenantContextInterceptor.

### Step 1.13 — Verify backend
```
curl http://localhost:3000/health                              -> {"status":"ok",...}
curl -X POST http://localhost:3000/auth/signup ... -> { accessToken, refreshToken }
curl -X POST http://localhost:3000/auth/login ...  -> { accessToken, refreshToken }
```

### Step 1.14 — Frontend auth
Create `frontend/src/shared/api/useAuth.ts` — Zustand store with login/signup/logout, stores token in localStorage.
Create `frontend/src/features/auth/LoginPage.tsx` — email+password form using Mantine, calls login, navigates to /dashboard.
Create `frontend/src/features/auth/SignupPage.tsx` — company+email+password+confirm form, navigates to /login on success.
Create `frontend/src/app/router.tsx` — /login, /signup, /dashboard (protected).
Create `frontend/src/shared/components/RoleGuard.tsx` — checks role against allowedRoles.

### Step 1.15 — Frontend shell
Create `frontend/src/app/AppShell.tsx` — Mantine AppShell with sidebar: Dashboard, Job Postings, Candidates, Pipeline, Interviews.
Create `frontend/src/app/providers.tsx` — QueryClientProvider + MantineProvider + Router.
Update `frontend/src/app/App.tsx` — render router, check localStorage on mount for auth.

**Verify:** /login form -> /signup form -> sign up -> redirected to login -> log in -> dashboard with sidebar.

**Commit:** `git add -A && git commit -m "phase1: auth, schema-per-tenant, RBAC — backend + frontend"`

---

## Phase 2 — Job Postings & Candidates CRUD

### Step 2.1 — Ensure template tables
Run the Step 1.2 SQL if template schemas don't include job_posting and candidate.

### Step 2.2 — Repositories
Create `backend/src/repositories/job-posting.repository.ts` — findAll(filters?), findById, create, update, delete. All use `forCurrentTenant()`.
Create `backend/src/repositories/candidate.repository.ts` — findAll, findById, create.
Create `backend/src/repositories/skill.repository.ts` — search(query) using LIKE, findByIds(ids). Both use `forPublic()`.

### Step 2.3 — Zod schemas
Create `backend/src/modules/job-postings/job-posting.schema.ts` — CreateJobPostingSchema (title, optional description, optional requiredSkillIds[]) and UpdateJobPostingSchema (partial).
Create `backend/src/modules/candidates/candidate.schema.ts` — CreateCandidateSchema (name, email, optional phone).

### Step 2.4 — Modules
Create module dirs for job-postings and candidates, each with .module.ts, .controller.ts, .service.ts, .schema.ts.

Endpoints:
```
GET    /job-postings?status=       — any authenticated user
POST   /job-postings               — OrgAdmin, Recruiter
GET    /job-postings/:id           — any authenticated user
PATCH  /job-postings/:id           — OrgAdmin, Recruiter
POST   /job-postings/:id/publish   — OrgAdmin, Recruiter
DELETE /job-postings/:id           — OrgAdmin only
GET    /candidates                 — OrgAdmin, Recruiter, HiringManager
POST   /candidates                 — OrgAdmin, Recruiter
GET    /candidates/:id             — OrgAdmin, Recruiter, HiringManager
```

### Step 2.5 — Register modules
Add `JobPostingsModule` and `CandidatesModule` to AppModule imports.

### Step 2.6 — Seed skills
Create `backend/src/seed.ts` — insert the 40+ skills from DATA_MODEL_DEFINITION.md (Languages, Frontend, Backend, Database, DevOps, Testing, Soft Skills).
Add seed script: `"seed": "tsx src/seed.ts"`. Run: `npm run seed`.

### Step 2.7 — Verify backend
```
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login ... | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
curl -X POST http://localhost:3000/job-postings ... -d '{"title":"Senior Engineer"}'
curl http://localhost:3000/job-postings ...
curl -X POST http://localhost:3000/candidates ... -d '{"name":"Jane Doe","email":"jane@example.com"}'
```

### Step 2.8 — Frontend API hooks
Create `frontend/src/shared/api/useJobPostings.ts` — useJobPostings(status?), useCreateJobPosting, useUpdateJobPosting, useDeleteJobPosting.
Create `frontend/src/shared/api/useCandidates.ts` — useCandidates(), useCandidate(id), useCreateCandidate.

### Step 2.9 — Frontend components
Create `JobPostingList.tsx` — Table with Title/Status/Created/Actions, status badges (draft/gray, open/green, closed/red).
Create `JobPostingForm.tsx` — Mantine useForm with zod, fields: title, description, required skills MultiSelect.
Create `RequiredSkillsPicker.tsx` — MultiSelect calling GET /skills?search= on input change.
Create `CandidateList.tsx` — Table: name, email, phone, created.
Create `CandidateProfile.tsx` — Detail view with applications list.

**Commit:** `git add -A && git commit -m "phase2: job postings and candidates CRUD — backend + frontend"`

---

## Phase 3 — Pipeline (Kanban Board)

### Step 3.1 — Pipeline stage repository
Create `backend/src/repositories/pipeline-stage.repository.ts` — findAll (ordered by pipelineStages.order), findById, create, update, delete.

### Step 3.2 — Application repository
Create `backend/src/repositories/application.repository.ts` — findAll(filters?), findById (join candidate+stage), create (set initial stage to "Applied"), updateStage(id, stageId).

### Step 3.3 — Applications module
Create `backend/src/modules/applications/` with module, controller, service.
Endpoints:
```
GET    /applications?jobPostingId=&stageId=  — OA, R, HM
GET    /applications/:id                      — OA, R, HM
PATCH  /applications/:id/stage                — OA, R, HM (body: { stageId })
POST   /applications/:id/notes                — OA, R, HM (body: { content })
GET    /applications/:id/notes                — OA, R, HM
```

### Step 3.4 — Verify backend
```
curl -X PATCH http://localhost:3000/applications/<id>/stage -H "Authorization: Bearer $TOKEN" -d '{"stageId":"<uuid>"}'
curl -X POST http://localhost:3000/applications/<id>/notes ... -d '{"content":"Phone screen scheduled"}'
```

### Step 3.5 — Frontend API hooks
Create `frontend/src/shared/api/useApplications.ts` — useApplications(filters?), useApplication(id), useUpdateStage (with optimistic update), useNotes(applicationId), useAddNote.

### Step 3.6 — Frontend pipeline board
Create `PipelineBoard.tsx` — DndContext with onDragEnd, renders PipelineColumn per stage.
Create `PipelineColumn.tsx` — useDroppable, shows stage name + count, renders ApplicationCard list.
Create `ApplicationCard.tsx` — useDraggable, shows candidate name / match score badge / applied date, opens drawer on click.
Implement optimistic update in useUpdateStage: onMutate snapshots cache, onError rolls back, onSettled refetches.

### Step 3.7 — Application detail drawer
Create `ApplicationDetailDrawer.tsx` — Mantine Drawer with candidate info, job title, match score. Tabs: Notes (list+add form), Interviews.

### Step 3.8 — Stage editor (OrgAdmin)
Create `StageEditor.tsx` — ordered list with drag handle, inline name edit, add/delete with confirmation.

**Commit:** `git add -A && git commit -m "phase3: pipeline Kanban board with drag-and-drop — backend + frontend"`

---

## Phase 4 — Resume Upload & Skill Matching

### Step 4.1 — Install libs
```
cd backend && npm install pdf-parse mammoth
```

### Step 4.2 — Resume repository
Create `backend/src/repositories/resume.repository.ts` — findByCandidateId, create, updateParsedText.

### Step 4.3 — Resume service
Create `backend/src/modules/resumes/resume.service.ts`:
- `upload(candidateId, file)`: validate type (PDF/DOCX), save to disk/MinIO, create DB record, extractText, extractSkills, return record.
- `extractText(buffer, mimeType)`: use pdf-parse for PDF, mammoth for DOCX.
- `extractSkills(text)`: lowercase text, check each taxonomy skill for substring match, return matched skill IDs.

### Step 4.4 — Skill matching service
Create `backend/src/modules/skill-matching/skill-matching.service.ts` — computeScore(requiredSkillIds, extractedSkillIds): matched / required.length (0 if none required).

### Step 4.5 — Unit test
Create `backend/src/__tests__/skill-matching.test.ts` — test 0 score, full score, partial, no match.

### Step 4.6 — Resume controller
Create `backend/src/modules/resumes/resume.controller.ts`:
```
GET  /candidates/:candidateId/resume  — OA, R, HM
POST /candidates/:candidateId/resume  — OA, R (FileInterceptor('file'))
```

### Step 4.7 — Frontend resume upload
Create `ResumeUploadInput.tsx` — Mantine Dropzone, accept PDF/DOCX, max 10MB.
Create `MatchScoreBadge.tsx` — percentage, green >=70%, yellow >=40%, red <40%.

**Commit:** `git add -A && git commit -m "phase4: resume upload, text extraction, skill matching — backend + frontend"`

---

## Phase 5 — Public Careers & Apply

### Step 5.1 — Install Redis client
```
cd backend && npm install ioredis
```

### Step 5.2 — Redis provider
Create `backend/src/database/redis.provider.ts` — REDIS_PROVIDER symbol, factory returning `new Redis(process.env.REDIS_URL)`.

### Step 5.3 — Rate limiter guard
Create `backend/src/middleware/rate-limiter.guard.ts` — key `ratelimit:public-apply:{ip}`, threshold 20 per 15 min, returns 429 with Retry-After.

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
curl http://localhost:3000/public/testcorp/jobs
curl -X POST http://localhost:3000/public/testcorp/jobs/<id>/apply -d '{"name":"Jane","email":"j@e.com"}'
for i in $(seq 1 25); do curl ...; done  # first 20 -> 200, rest -> 429
```

**Commit:** `git add -A && git commit -m "phase5: public careers page and rate-limited apply — backend + frontend"`

---

## Phase 6 — Redis: Full Integration

### Step 6.1 — Login rate limiter
Create `backend/src/middleware/login-rate-limiter.guard.ts` — key `ratelimit:login:{email}:{ip}`, threshold 5 per 15 min. Apply to POST /auth/login.

### Step 6.2 — Cache service
Create `backend/src/shared/cache.service.ts` — get<T>(key), set(key, value, ttlSeconds), invalidate(pattern).

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
Create `backend/src/queues/queues.ts` — resumeQueue ('resume-processing') and notificationQueue ('notifications'), both with Redis connection.

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
Create `backend/src/shared/audit.service.ts` — `log(action, resourceId?, metadata?)` inserts into public.audit_logs with current tenantId + userId.
Call in: user invite, role change, tenant suspend/reactivate, data export.

### Step 9.3 — Frontend admin
Create `OrgSettingsForm.tsx` — display company info, edit name, PATCH /org.
Create `UserManagementTable.tsx` — table: email/role/created/actions, invite button, role dropdown, remove with confirm.

### Step 9.4 — Frontend platform
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
