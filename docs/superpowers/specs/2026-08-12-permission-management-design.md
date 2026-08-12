# Permission Management — Design

**Date:** 2026-08-12
**Milestone:** M18 — Permission Management
**Status:** Approved (brainstorming) — pending implementation plan

## 1. Overview

Fine-grained, per-user permission control layered on top of the existing role system.
Admins can revoke individual capabilities from an account, but never grant beyond the
account's role preset. Role presets are fixed code constants applied at account creation.

- **SuperAdmin** controls permissions of every account in every company (including CompanyAdmins).
- **CompanyAdmin** controls permissions of Recruiter / HiringManager / Interviewer accounts in their own company only.
- **Candidate** accounts are out of scope (no permission toggles).
- Permissions can only **restrict** — never grant beyond the role's default set.

## 2. Permission Catalog

17 permissions, mapped from the current endpoint role sets (`VIEW_ROLES`, `EDIT_ROLES`,
`SCHEDULER_ROLES`, `PICKER_ROLES`, `INTERNAL_ROLES` in the controllers).

| Permission | CA | Recruiter | Hiring Mgr | Interviewer |
|---|:-:|:-:|:-:|:-:|
| `jobs.view` | ✅ | ✅ | ✅ | — |
| `jobs.create_edit` | ✅ | ✅ | — | — |
| `jobs.publish_close` | ✅ | ✅ | — | — |
| `jobs.delete` | ✅ | — | — | — |
| `candidates.view` | ✅ | ✅ | ✅ | — |
| `candidates.manage` | ✅ | ✅ | — | — |
| `applications.view` | ✅ | ✅ | ✅ | — |
| `applications.move` | ✅ | ✅ | ✅ | — |
| `applications.note` | ✅ | ✅ | ✅ | — |
| `interviews.view` | ✅ | ✅ | ✅ | ✅ (assigned) |
| `interviews.schedule` | ✅ | ✅ | ✅ | — |
| `interviews.feedback` | — | — | — | ✅ (assigned) |
| `stages.manage` | ✅ | — | — | — |
| `settings.manage` | ✅ | — | — | — |
| `users.manage` | ✅ | — | — | — |
| `permissions.manage` | ✅ | — | — | — |
| `dashboard.view` | ✅ | ✅ | ✅ | ✅ |

CSV export endpoints ride on their resource's view permission (identical role sets today).
`ponytail:` separate `export` permission only if export becomes more sensitive than view.

SuperAdmin is not in the catalog — nothing controls SuperAdmin.

## 3. Role Presets (fixed code)

- Single source of truth: `ROLE_PERMISSIONS: Record<InternalRole, Permission[]>` constant
  (backend, e.g. `common/permissions/permissions.ts`). The ✅ columns above.
- Applied at account creation in all three paths:
  - `POST /company/users` (CompanyAdmin creates team account)
  - `POST /auth/company/signup` (new company's CompanyAdmin)
  - `POST /platform/companies/:id/users` (SuperAdmin creates company user)
- New accounts start with the full preset; zero deny-rows in `user_permissions`.
- **Role change resets overrides:** when a user's role is changed, their `user_permissions`
  deny-rows are deleted — fresh start on the new role's preset.

## 4. Hierarchy Rules

1. **SuperAdmin** — full control over every account in every company, including
   CompanyAdmins, via `/platform/*` (cross-schema `forSchema`).
2. **CompanyAdmin** — only Recruiter / HiringManager / Interviewer accounts in own
   company. Cannot edit other CompanyAdmin accounts or self (prevents lockout and
   self-escalation). Requires own `permissions.manage` (always in preset).
3. **Ceiling rule** — toggles only revoke preset defaults, never grant beyond.
4. **Lockout safety** — `permissions.manage` + `users.manage` on CompanyAdmin accounts
   are revocable only by SuperAdmin.

## 5. Data Model

New per-company table (added to `database/schema.ts` + `template-schema.sql` + migration):

```
user_permissions
  id          uuid PK (defaultRandom)
  user_id     uuid NOT NULL → users.id (cascade delete)
  permission  varchar(50) NOT NULL
  created_by  uuid NOT NULL → users.id
  created_at  timestamp default now
  UNIQUE(user_id, permission)
```

Deny-list semantics: a row present = permission **revoked** for that user.
Effective permissions = `ROLE_PERMISSIONS[role]` − rows for the user.

## 6. Enforcement

- `@Permissions('permission.key', ...)` decorator + `PermissionsGuard` (global, like
  `RolesGuard`). Stacks with existing `@Roles(...)` — role check passes first, permission
  guard narrows.
- Guard resolves the user's effective set: role preset − deny-rows (one indexed query per
  request). SuperAdmin bypasses (no catalog entry, no rows).
- All company-scoped endpoints tagged with their catalog key:
  - job-postings: `jobs.*` (view / create_edit / publish_close / delete)
  - candidates: `candidates.*`
  - applications (+ notes): `applications.*`
  - interviews: `interviews.*` (feedback stays `@Roles('Interviewer')` + `interviews.feedback`)
  - pipeline-stages: `stages.manage`
  - company settings: `settings.manage`
  - company users: `users.manage` (mutations) / `permissions.manage` (permission endpoints)
  - dashboard: `dashboard.view`
  - exports mirror their resource's view permission
- `ponytail:` no Redis caching of permission sets; one indexed query per request is fine
  at this scale. Add caching only if profiling demands.

## 7. API Endpoints

Company (CompanyAdmin only, own company, target must be Recruiter/HM/Interviewer):

- `GET /company/users/:userId/permissions`
  → `{ permissions: { key, granted }[] }` — full catalog, `granted` = effective for role.
- `PATCH /company/users/:userId/permissions`
  Body `{ revoke: string[], restore: string[] }` (zod-validated, keys checked against
  catalog and the target role's preset — revoking a non-preset key → 400).
  → updated permission list. Audit row `permissions.update`.

Platform (SuperAdmin only, cross-schema, any company user incl. CompanyAdmin):

- `GET /platform/companies/:id/users/:userId/permissions`
- `PATCH /platform/companies/:id/users/:userId/permissions`
  Audit row `platform.permissions.update`.

Auth surface: effective `permissions: string[]` added as a claim in the **JWT access token**
(issued at signin / signup / refresh), alongside the existing `id`, `companyId`, `role`.
No new endpoint. Non-company roles (SuperAdmin, Candidate) get `[]`.
`ponytail:` UI lags up to the 15-min token lifetime after a revoke (backend 403 is
immediate — the guard reads the DB). Upgrade path if that lag matters: fetch-on-mount
endpoint refreshed on 403.

## 8. Frontend

- Auth store gains `permissions: string[]` (hydrated from `/auth/me` on login/app load).
- `usePermission(...keys)` hook — true if any key is in effective set.
- Permission editor drawer/modal:
  - Company Users page: "Permissions" action on non-CompanyAdmin rows.
  - Platform UsersPage: "Permissions" action on all rows (incl. CompanyAdmin).
  - Toggle switches render only the target role's preset keys, pre-toggled to `granted`.
  - Save → `PATCH` with `{ revoke, restore }`.
- Route guards: permissions editor route/action gated by `permissions.manage` (frontend
  hide + backend 403). Button-level hiding via `usePermission` on nav/menu items.

## 9. Audit

- `permissions.update` (company-scoped, attributed to actor, target company user).
- `platform.permissions.update` (cross-company via platform ops).
- Follows existing audit-log conventions (actor/target/timestamp).

## 10. Testing

Unit:
- Permission resolver spec: preset minus deny-rows, unknown keys rejected, role-change
  clears rows, SuperAdmin bypass.

E2e (`phase18.e2e-spec.ts`):
- New accounts start with full preset (no deny rows) in all three creation paths.
- Revoke → 403 on the tagged endpoint; restore → 200.
- Untouched users keep full role baseline.
- CA blocked from: editing a CompanyAdmin's permissions, editing self, editing another
  company's user (404), revoking non-preset key (400).
- SuperAdmin revokes a CompanyAdmin's `settings.manage` → CA gets 403 on settings PATCH;
  restore → 200.
- Lockout safety: CA cannot revoke own `permissions.manage`/`users.manage`.
- Role change clears deny-rows (promoted user gets fresh preset).
- Frontend `usePermission`/drawer behavior covered by existing component tests where applicable.

## 11. Out of Scope

- Candidate account permissions.
- Editable role presets (fixed code per decision).
- Custom roles.
- Permission-granted escalation (restrict-only).
- Redis caching of permission sets.
