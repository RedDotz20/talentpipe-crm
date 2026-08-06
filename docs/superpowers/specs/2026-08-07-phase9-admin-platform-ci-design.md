# Phase 9 — Admin, Platform & CI: Design

**Date:** 2026-08-07
**Status:** implemented
**Supersedes:** guide Phase 9 steps in `docs/09_IMPLEMENTATION_GUIDE.md` (this spec records the actual design decisions)

## Context

Phases 0–8 are implemented and covered by release-gate e2e suites. Phase 9 delivers the last product milestone: OrgAdmin settings + user management, the SuperAdmin platform module, audit logging, and CI. Existing state that matters:

- `tenants` has no status column — suspend/reactivate needs a migration.
- `AuditLogRepository.create` exists (BullMQ worker writes it); no service wrapper.
- `OrgUsersController` (interviews module) only lists users.
- No `/org` settings endpoints, no platform module, no CI.
- `user_emails` (public) bridges login email → tenant schema; invited users must get a row or unified sign-in won't find them.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Invite credentials | OrgAdmin sets the initial password in the invite modal | No mailer exists; email delivery stays deferred. Password-change flow deferred with it. |
| Suspend enforcement | Block sign-in (403) + refresh rotation (401) + public careers (404) only | No per-request DB hit; existing 15m access tokens expire quickly. |
| Stats scope | Tenants / users / applications totals, counted per tenant schema | Matches the guide's "totals across tenants"; detail shows one tenant's counts. |
| `PATCH /org` fields | Name only | Slug is URL identity; plan is platform-managed. |
| Users module home | New `modules/org/`; picker controller moved from interviews | Coherent ownership; `GET /org/users` endpoint unchanged. |
| User management guards | No self role-change, no self-remove, last OrgAdmin protected, duplicate email → 409 | Prevents lockout; last-admin guard is defensive (unreachable via API today since the actor is always an OrgAdmin). |
| Platform audit rows | `tenantId` = target tenant id (not `'public'`) | Keeps platform actions attributable to the affected tenant. |
| Migration hygiene | Hand-trim generated migration to the real change | `drizzle-kit` rc4 diffs against the live DB; generated file contained stale drift from earlier manual migrations. |

## Data model

`public.tenants` gains:

```sql
status VARCHAR(20) NOT NULL DEFAULT 'active'  -- active | suspended
```

Migration: `backend/drizzle/20260806191320_superb_king_cobra/migration.sql`. Existing tenants default to `active`; no backfill.

## Backend

```
common/audit/audit.module.ts, audit.service.ts
  AuditService.log(action, resourceId?, metadata?, tenantId?) — tenantId defaults to
  current context (platform calls pass the target tenant id); falls back to 'system' outside ALS.

repositories/
  tenant.repository.ts   + findAll(), updateStatus(id, status), updateName(id, name)
  user.repository.ts     + updateRole(id, role), remove(id); findAll() now returns createdAt
  user-email.repository  + deleteByUserId(userId)
  usage.repository.ts     countUsers(schema), countApplications(schema) via forSchema()

modules/org/              OrgModule (registered in AppModule)
  org.controller.ts       GET /org (OA,R,HM,IV) · PATCH /org (OA)
  org-users.controller.ts moved from interviews + POST /org/users/invite,
                          PATCH /org/users/:userId/role, DELETE /org/users/:userId (OA)
  org-users.service.ts    invite (hash password, create tenant user + user_emails, audit),
                          updateRole/remove with self + last-OrgAdmin guards + audit
  dto/                    update-org, invite-user, update-role (Zod)

modules/platform/         PlatformModule (registered in AppModule) — @Roles('SuperAdmin')
  GET /platform/tenants | GET /platform/tenants/:id (+users/applications)
  PATCH /platform/tenants/:id/suspend | reactivate (404 missing, 409 same state, audit)
  GET /platform/stats     totals across all tenant schemas
```

Enforcement hooks: `AuthService.signin` (403 after password check), `TokenService.rotate` (401), `PublicCareersService.list/getOne` (404).

## Frontend

```
api/orgApi.ts, orgUsersApi.ts (+invite/updateRole/remove), platformApi.ts; queryKeys additions
features/org/settings/OrgSettingsPage.tsx   name editable (OA), slug/plan/status read-only
features/org/users/UserManagementPage.tsx   table + invite modal (email/role/password) + role Select + remove confirm
features/admin/TenantsPage.tsx              stats cards + tenant table → detail
features/admin/TenantDetailPage.tsx         usage counts + suspend/reactivate
routes: /org/settings, /org/users (OrgAdmin beforeLoad), /admin/tenants, /admin/tenants/$tenantId
OrgPlatform sidebar: Team + Settings links only for OrgAdmin
```

## CI

`.github/workflows/ci.yml` — push/PR; backend job (postgres:16 + redis:7 + minio services, migrations + template schema applied via `docker exec`, then lint → typecheck → unit → e2e release gates → build) and frontend job (lint → build). MinIO is required because `StorageService.onApplicationBootstrap` creates the bucket and would otherwise fail app bootstrap in e2e.

## Release gate

`backend/test/phase9.e2e-spec.ts` — see the coverage list in `09_IMPLEMENTATION_GUIDE.md` Step 9.6.

## Out of scope (deferred)

- Password change flow (invite passwords stand until an admin changes them — no admin "reset password" endpoint yet either).
- Per-request suspension enforcement.
- Platform email/notifications; data export (audit call sites).
- Pipeline-stage management endpoints (`GET /org/pipeline-stages` repo exists, no controller).
