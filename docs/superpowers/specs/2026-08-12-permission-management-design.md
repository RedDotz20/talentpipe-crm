# Permission Management — Design

**Date:** 2026-08-12
**Milestone:** M18 — Permission Management
**Status:** Approved (brainstorming, v2: preset model) — pending implementation plan

## 1. Overview

Fine-grained permission control via **permission presets**. Roles (SuperAdmin,
CompanyAdmin, Recruiter, HiringManager, Interviewer, Candidate) stay the anchor for
routing/context; each account's effective permissions come from the **preset assigned**
to it. Admins manage presets on a dedicated `/permissions` page (company + platform
variants) and assign them in `/users`.

- **SuperAdmin** manages **global presets** (public schema) available to every company,
  and can assign presets to any account in any company (including CompanyAdmins).
- **CompanyAdmin** manages **company presets** (company schema) available only to their
  own company, and assigns them to Recruiter / HiringManager / Interviewer accounts.
- **Default presets** (one per internal role) are seeded, read-only, and serve as the
  basis for new accounts and as Duplicate sources.
- **Ceiling rule:** a preset's permissions are always a **subset of its bound role's
  default**; assignment requires the preset's role to **match the user's role**.
  Permissions can only ever restrict, never grant beyond the role default.
- **Candidate** accounts are out of scope.

## 2. Permission Catalog

17 permissions, mapped from the current endpoint role sets (`VIEW_ROLES`, `EDIT_ROLES`,
`SCHEDULER_ROLES`, `PICKER_ROLES`, `INTERNAL_ROLES` in the controllers). These are the
default presets:

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

## 3. Presets

**Default presets** — 4 rows seeded in the **public** schema (one per internal role),
`is_default = true`, `permissions` = the ✅ columns above. Read-only: no edit, no delete,
Duplicate only. Canonical source of the defaults = the `ROLE_PERMISSIONS` code constant
(single source of truth for validation).

**Global presets (SuperAdmin)** — public schema rows, `is_default = false`. Full CRUD.
Available to every company.

**Company presets (CompanyAdmin)** — company schema rows, `is_default = false`. Full CRUD.
Available only to their own company (schema boundary enforces this).

**Ceiling rule (validated server-side):** `permissions ⊆ ROLE_PERMISSIONS[preset.role]`
on create and update — the UI shows the role's default keys as toggle switches (pre-on),
only unchecking allowed; the API rejects any key outside the role default (400).

**Defaults = the null fallback:** users with `preset_id = NULL` (legacy accounts)
effectively have their role's default preset. New accounts get the role's default preset
assigned explicitly.

## 4. Hierarchy Rules

1. **SuperAdmin** — full control: global preset CRUD, preset assignment for every account
   in every company (incl. CompanyAdmins), sees company presets read-only.
2. **CompanyAdmin** — preset CRUD scoped to own company; assignment only for
   Recruiter / HiringManager / Interviewer accounts in own company. Cannot assign to
   other CompanyAdmins or self (prevents lockout and self-escalation). Requires own
   `permissions.manage` (always in the CA default preset).
3. **Ceiling rule** — preset ⊆ role default; assignment requires role match (400 otherwise).
4. **Lockout safety** — a CompanyAdmin's `permissions.manage` + `users.manage` can only be
   removed by assigning them a CA preset lacking those — which only SuperAdmin can do
   (CA cannot assign to CA accounts).
5. **Role change resets the preset** to the new role's default preset.

## 5. Data Model

New tables + column:

```
permission_presets  (PUBLIC schema — defaults + SuperAdmin globals)
  id          uuid PK (defaultRandom)
  name        varchar(100) NOT NULL
  role        varchar(50) NOT NULL        -- CompanyAdmin | Recruiter | HiringManager | Interviewer
  permissions jsonb NOT NULL              -- string[] subset of ROLE_PERMISSIONS[role]
  is_default  boolean NOT NULL default false
  created_by  uuid                        -- super_admin id for globals; null for seeds
  created_at  timestamp default now

permission_presets  (COMPANY schema — CompanyAdmin customs)
  same shape; created_by → users.id; is_default always false

users (COMPANY schema) — add:
  preset_id    uuid NULL → permission_presets.id (on delete: set null, though delete is
               blocked while in use — see §7)
```

## 6. Enforcement

- `@Permissions('permission.key', ...)` decorator + `PermissionsGuard` (global, like
  `RolesGuard`). Stacks with existing `@Roles(...)` — role check passes first, permission
  guard narrows.
- Guard resolves the user's effective set: `preset_id` set → `preset.permissions`;
  else `ROLE_PERMISSIONS[role]`. One indexed query per request (join users → presets).
  SuperAdmin bypasses (no catalog entry).
- All company-scoped endpoints tagged with their catalog key:
  - job-postings: `jobs.*` (view / create_edit / publish_close / delete)
  - candidates: `candidates.*`
  - applications (+ notes): `applications.*`
  - interviews: `interviews.*` (feedback stays `@Roles('Interviewer')` + `interviews.feedback`)
  - pipeline-stages: `stages.manage`
  - company settings: `settings.manage`
  - company users: `users.manage` (mutations) / `permissions.manage` (preset + assignment endpoints)
  - dashboard: `dashboard.view`
  - exports mirror their resource's view permission
- `ponytail:` no Redis caching of permission sets; one indexed query per request is fine
  at this scale. Add caching only if profiling demands.

## 7. API Endpoints

Presets:

- Company (CompanyAdmin; own company):
  - `GET /company/permissions` → defaults + own customs, each with `{ id, name, role, permissions, isDefault, usageCount }`
  - `POST /company/permissions` body `{ name, role, permissions[] }` (subset validated) — audit `permissions.preset.create`
  - `PATCH /company/permissions/:id` body `{ name?, permissions[] }` (customs only; subset validated) — audit `permissions.preset.update`
  - `DELETE /company/permissions/:id` (customs only; **409 if in use** — admin reassigns first) — audit `permissions.preset.delete`
- Platform (SuperAdmin):
  - `GET /platform/permissions` → defaults + globals + company presets (with companyName)
  - `POST /platform/permissions`, `PATCH /platform/permissions/:id`, `DELETE /platform/permissions/:id` — same rules as company, for globals; audit `platform.permissions.preset.*`

Assignment:

- `POST /company/users` gains optional `presetId` (defaults to role's default preset).
- `GET /company/users` and the platform merged users endpoint include each user's `presetId` (null → role default) so the users page can show the current preset.
- `PATCH /company/users/:userId/preset` body `{ presetId }` (CA; target non-CA; preset.role must match target role — else 400) — audit `permissions.preset.assign`.
- `PATCH /platform/companies/:id/users/:userId/preset` body `{ presetId }` (SuperAdmin; any account incl. CA; role match enforced) — audit `platform.permissions.preset.assign`.
- Role-change endpoints internally reset `preset_id` to the new role's default.

Auth surface: effective `permissions: string[]` added as a claim in the **JWT access
token** (issued at signin / signup / refresh), alongside `id`, `companyId`, `role`.
No new endpoint. Non-company roles (SuperAdmin, Candidate) get `[]`.
`ponytail:` UI lags up to the 15-min token lifetime after a change (backend 403 is
immediate — the guard reads the DB). Upgrade path if that lag matters: fetch-on-mount
endpoint refreshed on 403.

## 8. Frontend

- Auth store gains `permissions: string[]` (decoded from the JWT claim, same pattern as
  role today). `usePermission(...keys)` hook — true if any key is in the effective set.
- New `/company/permissions` page (CompanyAdmin nav item): preset table — defaults shown
  read-only with Duplicate action; custom presets with Edit/Delete; Create opens the
  editor modal (name, role select, toggle grid of that role's default keys, uncheck-only).
  Delete blocked client-side when `usageCount > 0`.
- New `/admin/permissions` page (SuperAdmin nav item): same table + a read-only
  "Company presets" section (all companies); globals CRUD.
- Users pages: preset Select on create form; per-row "Preset" action to change a user's
  preset (company page: non-CA rows only; platform page: all rows incl. CA).
- Route guards: `/company/permissions` + `/admin/permissions` gated by `permissions.manage`
  (frontend hide + backend 403). Button-level hiding via `usePermission` on nav/menu items.

## 9. Audit

- `permissions.preset.create|update|delete|assign` (company-scoped) and
  `platform.permissions.preset.*` (cross-company via platform ops).
- Follows existing audit-log conventions (actor/target/timestamp).

## 10. Testing

Unit:
- Preset validation spec: subset-of-role-default enforced (400 on foreign key), role
  match on assignment (400), resolution (preset vs null → default), delete-in-use (409).

E2e (`phase18.e2e-spec.ts`):
- Defaults seeded read-only (edit/delete → 403/400); Duplicate creates a custom preset.
- CA-created preset visible only in own company (second company's CA does not see it).
- SuperAdmin global preset visible in every company.
- Assign preset to a user → revoked endpoint returns 403; restore (default preset) → 200.
- Untouched users keep their full role default.
- Assignment role-mismatch → 400; CA assigning to a CA account → 403; CA assigning to
  another company's user → 404.
- Role change resets preset to new role's default.
- Delete in-use preset → 409.
- JWT claim contains the effective permissions; SuperAdmin/Candidate get `[]`.

## 11. Out of Scope

- Candidate account permissions.
- Editable default presets (read-only by decision; Duplicate covers customization).
- Per-user permission toggles (preset assignment subsumes this).
- Redis caching of permission sets.
