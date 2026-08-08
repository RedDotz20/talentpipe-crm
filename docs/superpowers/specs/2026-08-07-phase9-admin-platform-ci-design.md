# Phase 9 — Admin, Platform & CI: Design

**Date:** 2026-08-07
**Status:** implemented
**Supersedes:** guide Phase 9 steps in `docs/09_IMPLEMENTATION_GUIDE.md` (this spec records the actual design decisions)

## Context

Phases 0–8 are implemented and covered by release-gate e2e suites. Phase 9 delivers the last product milestone: CompanyAdmin settings + user management, the SuperAdmin platform module, audit logging, and CI. Existing state that matters:

- `companies` has no status column — suspend/reactivate needs a migration.
- `AuditLogRepository.create` exists (BullMQ worker writes it); no service wrapper.
- `CompanyUsersController` (interviews module) only lists users.
- No `/company` settings endpoints, no platform module, no CI.
- `user_emails` (public) bridges login email → company schema; invited users must get a row or unified sign-in won't find them.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Invite credentials | CompanyAdmin sets the initial password in the invite modal | No mailer exists; email delivery stays deferred. Password-change flow deferred with it. |
| Suspend enforcement | Block sign-in (403) + refresh rotation (401) + public careers (404) only | No per-request DB hit; existing 15m access tokens expire quickly. |
| Stats scope | Companies / users / applications totals, counted per company schema | Matches the guide's "totals across companies"; detail shows one company's counts. |
| `PATCH /company` fields | Name only | Slug is URL identity; plan is platform-managed. |
| Users module home | New `modules/company/`; picker controller moved from interviews | Coherent ownership; `GET /company/users` endpoint unchanged. |
| User management guards | No self role-change, no self-remove, last CompanyAdmin protected, duplicate email → 409 | Prevents lockout; last-admin guard is defensive (unreachable via API today since the actor is always an CompanyAdmin). |
| Platform audit rows | `companyId` = target company id (not `'public'`) | Keeps platform actions attributable to the affected company. |
| Migration hygiene | Hand-trim generated migration to the real change | `drizzle-kit` rc4 diffs against the live DB; generated file contained stale drift from earlier manual migrations. |

## Data model

`public.companies` gains:

```sql
status VARCHAR(20) NOT NULL DEFAULT 'active'  -- active | suspended
```

Migration: `backend/drizzle/20260806191320_superb_king_cobra/migration.sql`. Existing companies default to `active`; no backfill.

## Backend

```
common/audit/audit.module.ts, audit.service.ts
  AuditService.log(action, resourceId?, metadata?, companyId?) — companyId defaults to
  current context (platform calls pass the target company id); falls back to 'system' outside ALS.

repositories/
  company.repository.ts   + findAll(), updateStatus(id, status), updateName(id, name)
  user.repository.ts     + updateRole(id, role), remove(id); findAll() now returns createdAt
  user-email.repository  + deleteByUserId(userId)
  usage.repository.ts     countUsers(schema), countApplications(schema) via forSchema()

modules/company/              CompanyModule (registered in AppModule)
  company.controller.ts       GET /company (OA,R,HM,IV) · PATCH /company (OA)
  company-users.controller.ts moved from interviews + POST /company/users/invite,
                          PATCH /company/users/:userId/role, DELETE /company/users/:userId (OA)
  company-users.service.ts    invite (hash password, create company user + user_emails, audit),
                          updateRole/remove with self + last-CompanyAdmin guards + audit
  dto/                    update-company, invite-user, update-role (Zod)

modules/platform/         PlatformModule (registered in AppModule) — @Roles('SuperAdmin')
  GET /platform/companies | GET /platform/companies/:id (+users/applications)
  PATCH /platform/companies/:id/suspend | reactivate (404 missing, 409 same state, audit)
  GET /platform/stats     totals across all company schemas
```

Enforcement hooks: `AuthService.signin` (403 after password check), `TokenService.rotate` (401), `PublicCareersService.list/getOne` (404).

## Frontend

```
api/companyApi.ts, companyUsersApi.ts (+invite/updateRole/remove), platformApi.ts; queryKeys additions
features/company/settings/CompanySettingsPage.tsx   name editable (OA), slug/plan/status read-only
features/company/users/UserManagementPage.tsx   table + invite modal (email/role/password) + role Select + remove confirm
features/admin/CompaniesPage.tsx              stats cards + company table → detail
features/admin/CompanyDetailPage.tsx         usage counts + suspend/reactivate
routes: /company/settings, /company/users (CompanyAdmin beforeLoad), /admin/companies, /admin/companies/$companyId
CompanyPlatform sidebar: Team + Settings links only for CompanyAdmin
```

## CI

`.github/workflows/ci.yml` — push/PR; backend job (postgres:16 + redis:7 + minio services, migrations + template schema applied via `docker exec`, then lint → typecheck → unit → e2e release gates → build) and frontend job (lint → build). MinIO is required because `StorageService.onApplicationBootstrap` creates the bucket and would otherwise fail app bootstrap in e2e.

## Release gate

`backend/test/phase9.e2e-spec.ts` — see the coverage list in `09_IMPLEMENTATION_GUIDE.md` Step 9.6.

## Out of scope (deferred)

- Password change flow (invite passwords stand until an admin changes them — no admin "reset password" endpoint yet either).
- Per-request suspension enforcement.
- Platform email/notifications; data export (audit call sites).
- Pipeline-stage management endpoints (`GET /company/pipeline-stages` repo exists, no controller).
