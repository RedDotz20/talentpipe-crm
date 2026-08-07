# M11 — Platform Control + Candidate Experience: Design

**Date:** 2026-08-08
**Status:** planned

## Context

M10 (deploy) is complete. User review of the working product surfaced four gaps:

1. **Missing role accounts** — the seed creates SuperAdmin, OrgAdmin, Interviewer, and Candidate only. HiringManager and Recruiter roles exist in code (guards, permission matrix) but there is no account that can log in as either.
2. **SuperAdmin is read-only** — `/platform/*` only lists tenants, shows stats, and suspends/reactivates. No account CRUD (org users, candidates), no cross-tenant application or interview management. `/admin/*` UI matches.
3. **No candidate job detail page** — a public detail route exists (`/careers/$tenantSlug/jobs/$jobId`), but the candidate portal's Job Search page (`JobSearchPage.tsx`) opens the Apply modal inline instead of linking to a detail page.
4. **Candidate applications UX is bare** — a plain table + drawer; no link to the job, no timeline, no withdraw.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Cross-tenant data access | New platform repos using the sanctioned `withDb('tenant_<id>', ...)` pattern (as `UsageRepository` already does) | SuperAdmin is the one sanctioned cross-schema exception; tenant code stays untouched; no impersonation tokens |
| Platform module structure | Existing `PlatformService` stays; new `PlatformAccountsService` (users, candidates) + `PlatformDataService` (applications, interviews) | Keeps services focused; all under `modules/platform/`, `@Roles('SuperAdmin')` |
| Platform user management | Create/role-change/password-reset/remove on `tenant_<id>.users` with `user_emails` + `refresh_tokens` cleanup | Mirrors OrgUsersService semantics without its self/last-admin guards (SuperAdmin is external to the tenant) |
| Candidate delete | Cascade: remove applications in each tenant schema + `candidate_applications_index` rows | Prevents dangling candidate refs in tenant pipelines and candidate index lookups |
| Application stage move | Reuse existing stage repo logic against explicit schema; sync candidate index; audit row | Same behavior a tenant OrgAdmin gets, with audit attribution to the target tenant |
| Interview manage | Reschedule (datetime) + cancel only | Matches user scope: "view + stage moves + interview reschedule"; no create/delete |
| Withdraw | `DELETE /candidate/applications/:id` deletes tenant application row + candidate index row; 404 if not owned | Candidate self-service; ownership check via index lookup |
| Job detail sharing | Extract `JobDetailsView` component; public `JobDetailPage` and new candidate route both render it | One component, two hosts; candidate variant is pre-authenticated and routes by `tenantId` (already in the job row) |
| Job meta fields (location/salary/type) | **Not added** | Job postings have no such columns; user chose to skip — no migration |
| Migration | None | Roles, candidates, applications, interviews, index tables all exist |
| Audit rows | Every platform mutation logs with target tenant id | Consistent with M9 platform audit convention |

## Backend

```
scripts/seed.ts
  + seedHiringManager: hiring.manager@acme.com / HiringManager123!  (role HiringManager)
  + seedRecruiter:     recruiter@acme.com / Recruiter123!          (role Recruiter)
  (mirror seedInterviewer, incl. user_emails rows)

repositories/
  platform-user.repository.ts         tenant users via withDb('tenant_<id>'): list, create
                                      (role ∈ OrgAdmin|HiringManager|Recruiter|Interviewer),
                                      updateRole, resetPassword, remove
  platform-candidate.repository.ts    public schema: list/create/update/remove candidates
                                      + cascade delete (applications + index)
  platform-application.repository.ts  list across tenants (tenantId/status filters), getById,
                                      setStage (stage id lookup, update, index sync)
  platform-interview.repository.ts    list across tenants (tenantId/status filters), getById,
                                      reschedule, cancel

modules/platform/
  platform-accounts.controller.ts  @Roles('SuperAdmin')
    GET    /platform/tenants/:id/users
    POST   /platform/tenants/:id/users
    PATCH  /platform/tenants/:id/users/:userId
    DELETE /platform/tenants/:id/users/:userId
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
  dto/  create-tenant-user, update-tenant-user, create-candidate, update-candidate,
        move-application-stage, reschedule-interview (Zod)

modules/candidate-account/
  + DELETE /candidate/applications/:id   (Candidate role; ownership via candidate index; audit)
```

Error semantics: missing tenant/user/candidate/application/interview → 404; invalid role → 400 `VALIDATION_ERROR`; stage must belong to the application's tenant schema.

## Frontend

```
features/admin/TenantDetailPage.tsx   → tabs: Users / Applications / Interviews
  Users:        table (email/role/created) + create modal (email, role, password)
                + role Select + reset-password + remove confirm
  Applications: table (candidate, job, stage, date) + stage Select (tenant stages)
  Interviews:   table (candidate, job, interviewer, datetime, status)
                + reschedule/cancel actions
features/admin/CandidatesPage.tsx    → new route /admin/candidates + nav entry
  table (name/email/created) + create/edit modal + delete confirm
features/candidate-portal/dashboard/JobSearchPage.tsx
  job cards link to /candidate/jobs/$jobId instead of inline apply modal
features/candidate-portal/jobs/JobDetailsView.tsx  (shared, extracted from public JobDetailPage)
routes/_candidate/jobs.$jobId.tsx   → candidate job detail (uses existing useJobDetail +
                                       getJobDetail(tenantId, jobId))
features/candidate-portal/applications/ApplicationsPage.tsx
  rows link to job detail · status timeline in drawer (Applied → current stage) ·
  Withdraw button with confirm
```

## Release gate

`backend/test/phase11.e2e-spec.ts`:

- Platform users: create → sign-in works → role change → password reset → delete → sign-in fails; non-SuperAdmin → 403 on every platform route.
- Platform candidates: CRUD cycle; delete cascades to tenant applications + candidate index.
- Platform applications: list filters, stage move updates stage + candidate index status; unknown id → 404.
- Platform interviews: list filters, reschedule + cancel; unknown id → 404.
- Withdraw: candidate withdraws own application (row + index gone); another candidate → 404; not a candidate → 403.
- Audit rows exist for each mutation.
- Seed: all five roles sign in (SuperAdmin, OrgAdmin, HiringManager, Recruiter, Interviewer, Candidate).

## Out of scope (deferred)

- Job meta fields (location/salary/type) — user chose to skip.
- SuperAdmin create/delete of applications and interviews (view + stage/reschedule only).
- User suspension per account (tenants have status; users are removed or role-changed).
- Platform email/notifications.
