# Profile Avatars & Universal User Menu — Design

**Date:** 2026-08-15
**Milestone:** M20 — Profile Avatars & Universal User Menu
**Status:** Approved (brainstorming) — pending implementation plan

## 1. Overview

Universal profile avatars: every account (candidate, company user, SuperAdmin) can
upload/edit/remove a profile picture, and every role sees the **same top-right header
control** — an avatar button opening a menu with **Profile** + **Logout** (candidate
already has this shape; company and SuperAdmin layouts get it too). New profile pages
for company users and SuperAdmins (candidate keeps `/settings`, gains an avatar
section). Avatar photos also appear wherever a person is listed: company candidates
table + candidate modal, company users table, platform users table, and the three
navbar footers.

Scope is deliberately self-service: no admin-set avatars, no email editing, no
password change (password-change flow stays on the "not yet built" list).

## 2. Data Model

No new tables. Four nullable `text` columns:

| Table | Column | Notes |
|---|---|---|
| `users` (per-company) | `name` | display name; seed defaults from email prefix |
| `users` (per-company) | `avatar_url` | S3 key of the avatar object |
| `candidate_accounts` (public) | `avatar_url` | S3 key |
| `super_admins` (public) | `avatar_url` | S3 key |

- Migration `20260816000000_profile_avatars`: 4 `ALTER TABLE ... ADD COLUMN` statements
  (next number after `20260815000000_preset_enable_disable`).
- **Template sync:** `drizzle/template-schema.sql` — `users` gains `name` + `avatar_url`
  so new-company signups clone them (same leak class phase19 caught for
  `permission_presets`; phase21 e2e asserts it).
- **Seed:** sample company accounts get real names (e.g., Ada Lovelace, Grace Hopper)
  so initials fallbacks look right immediately. Candidates/SuperAdmin already have names.
- No `company_id` columns (schema boundary unchanged), no new indexes (columns fetched
  by PK only).

## 3. Storage

Two buckets, one `StorageService`, one S3Client:

| Axis | Mechanism | Example key |
|---|---|---|
| Media type | bucket | `resumes` (existing) vs `avatars` (new) |
| Tenant | key prefix inside the bucket | `companies/<companyId>/avatars/<userId>/<uuid>.<ext>` |

Key conventions (mirror the resume convention):
- Company users: `companies/<companyId>/avatars/<userId>/<uuid>.<ext>`
- Candidates: `candidate-avatars/<candidateAccountId>/<uuid>.<ext>`
- SuperAdmins: `platform/avatars/<superAdminId>/<uuid>.<ext>`

**`storage.service.ts` changes (minimal):**
- New env `S3_AVATAR_BUCKET` (default `avatars`); `S3_BUCKET` (default `resumes`) unchanged.
- Boot auto-creates both buckets (loop over `[S3_BUCKET, S3_AVATAR_BUCKET]`).
- Methods gain an optional last param: `upload(key, buffer, contentType, bucket?)`,
  `get(key, bucket?)`, `delete(key, bucket?)` — default resume bucket, so existing
  resume callers are untouched.
- `storage.provider.ts` unchanged (one S3Client — the client is bucket-agnostic).

Isolation is enforced by (a) the key containing the company id and (b) the app only
ever fetching objects whose exact key came from a DB row the requesting user may see
— never by listing or guessing. Per-company buckets were considered and rejected
(provisioning overhead, zero security gain).

## 4. Backend API

All endpoints authenticated via the existing per-role auth guards. No new permission
catalog keys (self-service only).

### 4.1 `GET /auth/me` (all roles)

Returns `{ id, role, companyId?, email, name, avatarUrl }`. Hydrates the header at
boot; company/SuperAdmin currently have no self-profile fetch (candidate has
`GET /candidate/profile`).

### 4.2 Shared avatar core — `common/avatars/`

The only place avatar logic lives; thin role controllers delegate here.

- `validate(file)`: MIME whitelist `image/png | image/jpeg | image/webp` + magic-byte
  check (`\x89PNG`, `\xFF\xD8\xFF`, `RIFF....WEBP`) — same pattern as the resume validator.
- `upload(actor, file)`: build key by actor → `storage.upload(key, buf, type, AVATAR_BUCKET)`
  → delete previous avatar object if one existed → return key.
- `remove(key)`: `storage.delete(key, AVATAR_BUCKET)`.
- `serve(key)`: `storage.get(key, AVATAR_BUCKET)` → bytes + content-type (buffered, no
  presigned URLs — matches resumes).
- Multer limit `5MB` (`fileSize: 5 * 1024 * 1024`); MulterError already mapped by the
  global `ApiExceptionFilter` (413/400). No server-side resize.
  `ponytail:` no resize — browsers scale; add `sharp` only if storage/bandwidth costs matter.

### 4.3 Endpoints per role

**Candidate** (extends `candidate-account` module):
- `GET /candidate/profile`, `PUT /candidate/profile` — response gains `avatarUrl`;
  input DTO unchanged.
- `POST /candidate/profile/avatar` — multipart `file` → `{ avatarUrl }`.
- `DELETE /candidate/profile/avatar` — removes S3 object + nulls column.

**Company user** (company module):
- `GET /company/profile`, `PUT /company/profile` — `{ name, email, avatarUrl }`;
  PUT accepts `name` only (email read-only).
- `POST /company/profile/avatar`, `DELETE /company/profile/avatar` — same contract.

**SuperAdmin** (platform module):
- `GET /platform/profile`, `PUT /platform/profile`, `POST /platform/profile/avatar`,
  `DELETE /platform/profile/avatar` — same contract (name already exists).

**List endpoints gain avatar/name fields (additive, no new endpoints):**
- `GET /candidates` (company) — rows gain `avatarUrl`.
- `GET /company/users` — rows gain `name` + `avatarUrl`.
- `GET /platform/users` (merged) — rows gain `avatarUrl` (candidates + company users);
  company-user rows also gain `name`.
- CSV exports inherit the fields automatically.

## 5. Frontend

### 5.1 Shared components (`frontend/src/shared/components/`)

- `UserAvatar` — props `{ name, avatarUrl, size, color? }`. Mantine `Avatar` with photo
  when present; else initials from name (first letter of first + last word, single word
  → first letter); else `U`. Uses internal `useAvatarBlob(avatarUrl)` hook (TanStack
  Query fetch → blob → `URL.createObjectURL`, cached by key).
- `UserMenu` — `UserAvatar` button + dropdown: **Profile** (role-routed) + **Logout**
  (red). Universal top-right control for all three layouts.

### 5.2 Layout unification

- `candidate-portal/layout.tsx` — replace hardcoded `"C"` avatar with `UserMenu`;
  rename dropdown item "Settings" → **Profile** (still → `/settings`).
- `company/layout.tsx` — replace bare logout icon button with `UserMenu`
  (Profile → `/company/profile`); navbar footer static role-initial avatar →
  `UserAvatar` with real name/photo.
- `admin/layout.tsx` — same: `UserMenu` (Profile → `/admin/profile`); footer `"S"`
  avatar → `UserAvatar`.

### 5.3 Profile pages

- `features/company/profile/ProfilePage.tsx` — avatar upload/remove + editable name +
  read-only email + role badge. Route `/company/profile` (under existing company layout).
- `features/admin/profile/ProfilePage.tsx` — same for SuperAdmin. Route `/admin/profile`.
- Candidate `/settings` — new Avatar section (upload/remove + preview), rest untouched.

Upload UX mirrors the resume flow: FileButton accepts PNG/JPEG/WebP, client pre-check
≤5MB, preview via blob URL, Upload/Remove buttons, success/error toasts
(`useApiMutation` pattern).

### 5.4 Boot hydration

`providers.tsx` (or AppShell) fetches `GET /auth/me` once on mount; result stored in
the zustand `useAuth` store as `{ name, email, avatarUrl }`. Headers/footers read from
it. Logout clears it. Candidate header can reuse the same store value.

### 5.5 List thumbnails

- Company CandidatesPage table + CandidateProfile modal (avatar + name).
- Company UsersPage table (name + avatar columns).
- Platform UsersPage merged table (avatar column).

## 6. Cross-Cutting Checklist

- **New tables/repos:** none — column additions only; repos gain small
  select/update touches (user, candidate-account, super-admin).
- **Audit rows:** none — self-service profile edits are not administrative actions.
- **Dashboard-cache invalidation:** none — avatars/names don't feed the dashboard.
- **`job_listings_index` sync:** none.
- **Permission catalog:** no new keys (17-key catalog unchanged; `@Permissions` untouched).
- **List-query / CSV:** no new list endpoints; additive fields only.
- **Template sync:** `users.name` + `users.avatar_url` in `template-schema.sql`; e2e
  regression for new-company clone.
- **E2e:** `backend/test/phase21.e2e-spec.ts` (next after `phase20`).
- **AGENTS.md:** "Current State" paragraph + migration-order append + Build Order row M20.
- **Order:** backend → frontend.
- **Commit tag:** `feat(m20): topic`.

## 7. Testing

**E2e (phase21):**
- `GET /auth/me` shape per role (candidate/company user/SuperAdmin).
- Avatar round-trip per role: upload → serve bytes with correct content-type → remove
  → 404/empty on subsequent serve.
- Magic-byte rejection (fake image extension), >5MB → 413.
- Name update via profile PUT; read-only email rejected.
- `users.name`/`avatarUrl` in `GET /company/users` and `GET /platform/users`;
  candidate `avatarUrl` in `GET /candidates`.
- New-company signup clone regression: cloned `users` table has `name` + `avatar_url`.

**Unit:**
- `common/avatars/avatars.service.spec.ts` — magic-byte validation per type, key
  building per actor, old-avatar deletion on replace.
- `storage.service.spec.ts` — bucket param routing + dual-bucket creation.

## 8. Explicitly Out of Scope

- Server-side image resize/optimization (`ponytail:` noted above).
- Presigned URLs (buffered blob pattern proven with resumes).
- Avatar in JWT claims (stale by design; `/auth/me` is the source of truth).
- Email editing, password change (separate future milestone).
- Admin-set avatars for other users, company logos.
