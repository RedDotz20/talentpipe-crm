# M11 — Platform Control + Candidate Experience: Design

**Date:** 2026-08-08
**Status:** implemented

## Context

M10 (deploy) is complete. User review of the working product surfaced four gaps:

1. **Missing role accounts** — the seed creates SuperAdmin, CompanyAdmin, Interviewer, and Candidate only. HiringManager and Recruiter roles exist in code (guards, permission matrix) but there is no account that can log in as either.
2. **SuperAdmin is read-only** — `/platform/*` only lists companies, shows stats, and suspends/reactivates. No account CRUD (company users, candidates), no cross-company application or interview management. `/admin/*` UI matches.
3. **No candidate job detail page** — a public detail route exists (`/careers/$companySlug/jobs/$jobId`), but the candidate portal's Job Search page (`JobSearchPage.tsx`) opens the Apply modal inline instead of linking to a detail page.
4. **Candidate applications UX is bare** — a plain table + drawer; no link to the job, no timeline, no withdraw.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Cross-company data access | New platform repos using the sanctioned `withDb('company_<id>', ...)` pattern (as `UsageRepository` already does) | SuperAdmin is the one sanctioned cross-schema exception; company code stays untouched; no impersonation tokens |
| Platform module structure | Existing `PlatformService` stays; new `PlatformAccountsService` (users, candidates) + `PlatformDataService` (applications, interviews) | Keeps services focused; all under `modules/platform/`, `@Roles('SuperAdmin')` |
| Platform user management | Create/role-change/password-reset/remove on `company_<id>.users` with `user_emails` + `refresh_tokens` cleanup | Mirrors CompanyUsersService semantics without its self/last-admin guards (SuperAdmin is external to the company) |
| User suspension | SuperAdmin can suspend/reactivate individual company users via a `status` column (`active\|suspended`, default `active`) on `users`; enforced at sign-in (403) + refresh (401); 404 missing, 409 same-state, audit rows | Extends the M9 company-suspend pattern to accounts; CompanyAdmin still removes users outright |
| Candidate delete | Cascade: remove applications in each company schema + `candidate_applications_index` rows | Prevents dangling candidate refs in company pipelines and candidate index lookups |
| Application stage move | Reuse existing stage repo logic against explicit schema; sync candidate index; audit row | Same behavior a company CompanyAdmin gets, with audit attribution to the target company |
| Interview manage | Reschedule (datetime) + cancel only | Matches user scope: "view + stage moves + interview reschedule"; no create/delete |
| Withdraw | `DELETE /candidate/applications/:id` deletes company application row + candidate index row; 404 if not owned | Candidate self-service; ownership check via index lookup |
| Job detail sharing | Extract `JobDetailsView` component; public `JobDetailPage` and new candidate route both render it | One component, two hosts; candidate variant is pre-authenticated and routes by `companyId` (already in the job row) |
| Job meta fields (location/salary/type) | **Not added** | Job postings have no such columns; user chose to skip — no migration |
| Migration | None | Roles, candidates, applications, interviews, index tables all exist |
| Audit rows | Every platform mutation logs with target company id | Consistent with M9 platform audit convention |

## Data model

`users` (master in public, cloned to `template` + each `company_<id>`) gains:

```sql
status VARCHAR(20) NOT NULL DEFAULT 'active'  -- active | suspended
```

Migration: `backend/drizzle/20260808090000_platform_user_suspend/migration.sql` — `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status ...` + DO-loop over `template` and `company_%` schemas (same shape as the `scheduled_at_timezone` migration). Existing users default to `active`; no backfill.

## Backend

```
scripts/seed.ts
  + seedHiringManager: hiring.manager@acme.com / HiringManager123!  (role HiringManager)
  + seedRecruiter:     recruiter@acme.com / Recruiter123!          (role Recruiter)
  (mirror seedInterviewer, incl. user_emails rows)

repositories/
  platform-user.repository.ts         company users via withDb('company_<id>'): list, create
                                      (role ∈ CompanyAdmin|HiringManager|Recruiter|Interviewer),
                                      updateRole, resetPassword, setStatus, remove
  platform-candidate.repository.ts    public schema: list/create/update/remove candidates
                                      + cascade delete (applications + index)
  platform-application.repository.ts  list across companies (companyId/status filters), getById,
                                      setStage (stage id lookup, update, index sync)
  platform-interview.repository.ts    list across companies (companyId/status filters), getById,
                                      reschedule, cancel

database/schema.ts                   users gains status column (matches migration)

modules/platform/
  platform-accounts.controller.ts  @Roles('SuperAdmin')
    GET    /platform/companies/:id/users
    POST   /platform/companies/:id/users
    PATCH  /platform/companies/:id/users/:userId
    PATCH  /platform/companies/:id/users/:userId/suspend
    PATCH  /platform/companies/:id/users/:userId/reactivate
    DELETE /platform/companies/:id/users/:userId
    GET    /platform/candidates
    POST   /platform/candidates
    PATCH  /platform/candidates/:id
    DELETE /platform/candidates/:id
  platform-data.controller.ts      @Roles('SuperAdmin')
    GET    /platform/applications
    PATCH  /platform/applications/:id/stage
    GET    /platform/interviews
    PATCH  /platform/interviews/:id
  platform-accounts.service.ts, platform-data.service.ts
  dto/  create-company-user, update-company-user, create-candidate, update-candidate,
        move-application-stage, reschedule-interview (Zod)

modules/candidate-account/
  + DELETE /candidate/applications/:id   (Candidate role; ownership via candidate index; audit)
```

Error semantics: missing company/user/candidate/application/interview → 404; invalid role → 400 `VALIDATION_ERROR`; stage must belong to the application's company schema.

Enforcement hooks: `AuthService.signin` (403 after password check — alongside the existing company-status check at auth.service.ts:55), `TokenService.rotate` (401 — alongside token.service.ts:81).

## Frontend

```
features/admin/CompanyDetailPage.tsx   → tabs: Users / Applications / Interviews
  Users:        table (email/role/status/created) + create modal (email, role, password)
                + role Select + reset-password + suspend/reactivate + remove confirm
  Applications: table (candidate, job, stage, date) + stage Select (company stages)
  Interviews:   table (candidate, job, interviewer, datetime, status)
                + reschedule/cancel actions
features/admin/CandidatesPage.tsx    → new route /admin/candidates + nav entry
  table (name/email/created) + create/edit modal + delete confirm
features/candidate-portal/dashboard/JobSearchPage.tsx
  job cards link to /candidate/jobs/$jobId instead of inline apply modal
features/candidate-portal/jobs/JobDetailsView.tsx  (shared, extracted from public JobDetailPage)
routes/_candidate/jobs.$jobId.tsx   → candidate job detail (uses existing useJobDetail +
                                       getJobDetail(companyId, jobId))
features/candidate-portal/applications/ApplicationsPage.tsx
  rows link to job detail · status timeline in drawer (Applied → current stage) ·
  Withdraw button with confirm
```

## Release gate

`backend/test/phase11.e2e-spec.ts`:

- Platform users: create → sign-in works → role change → password reset → delete → sign-in fails; non-SuperAdmin → 403 on every platform route.
- Platform user suspension: suspend → sign-in 403 + refresh 401; reactivate → sign-in restored; double-suspend/double-reactivate → 409; audit rows.
- Platform candidates: CRUD cycle; delete cascades to company applications + candidate index.
- Platform applications: list filters, stage move updates stage + candidate index status; unknown id → 404.
- Platform interviews: list filters, reschedule + cancel; unknown id → 404.
- Withdraw: candidate withdraws own application (row + index gone); another candidate → 404; not a candidate → 403.
- Audit rows exist for each mutation.
- Seed: all five roles sign in (SuperAdmin, CompanyAdmin, HiringManager, Recruiter, Interviewer, Candidate).

## Out of scope (deferred)

- Job meta fields (location/salary/type) — user chose to skip.
- SuperAdmin create/delete of applications and interviews (view + stage/reschedule only).
- CompanyAdmin-level user suspension (platform-only; CompanyAdmin removes users).
- Platform email/notifications.

## Implemented notes (deltas from the design above)

- **Platform data access lives on the EXISTING repositories** — the design called for new `platform-accounts.repository.ts` / `platform-data.repository.ts`; instead the existing repos gained schema-param reuse (`findAll(filters, schema)`, `findByApplicationId(id, schema)`, etc.), and the new `platform-accounts.service.ts` / `platform-data.service.ts` compose them with `forSchema('company_<id>')`-style calls. No new `platform-*.repository.ts` files were created.
- **Cascade migration was added** — the design said "Migration: None"; shipping added `backend/drizzle/20260808100000_platform_account_cascades/migration.sql` (FK cascades: `candidate_bookmarks → candidate_accounts` CASCADE, `interview_feedbacks → interviews` CASCADE, `interviews → applications` CASCADE, `notes → applications` CASCADE, `notes → users` CASCADE, `job_postings → users` SET NULL) applied across `public`, `template`, and every `company_%` schema. `provisionSchema` (`company.repository.ts`) and `template-schema.sql` create the same FKs for new companies.
- **`GET /platform/companies/:id/pipeline-stages`** was added to `PlatformAccountsController` (not in the design's endpoint list) so the admin UI's Applications tab can render the company's stages.
- **Candidate job detail route is `/jobs/$jobId`** via `routes/_candidate/jobs.$jobId.tsx` with `companyId` as a search param (design said `/candidate/jobs/$jobId`). `JobDetailsView` is shared with the public careers `JobDetailPage` as designed.
- **Withdraw returns `409 CONFLICT`** when the application has interviews or notes (design said only 404-not-owned); the `409` avoids tripping the new cascades.
- **Stage move robustness**: platform stage moves sync `candidate_applications_index` with full rollback + `503 SERVICE_UNAVAILABLE` on sync failure, and deliberately do **not** enqueue a BullMQ notification (design didn't specify either).
- **Audit actions** as shipped: `platform.user.create|update|suspend|reactivate|remove`, `platform.candidate.create|update|remove`, `platform.application.stage_move`, `platform.interview.update` — target `companyId` recorded as the 4th audit arg.
- **Tests**: `backend/test/phase11.e2e-spec.ts` release gate (9 scenarios) + unit specs `platform-accounts.service.spec.ts` (14) and `platform-data.service.spec.ts` (9); auth specs extended for user suspension.
