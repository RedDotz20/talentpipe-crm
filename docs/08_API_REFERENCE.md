# TalentPipe — API Endpoint Documentation

**Purpose:** The complete HTTP API contract — every route, method, role restriction, and the standard error shape. Use this to implement route handlers and frontend API hooks. Authoritative endpoint list is mirrored in `00_PROJECT_INSTRUCTIONS.md` §5.

Base URL: `http://localhost:3000/api` (local) / `https://api.talentpipe.dev` (prod). All routes are under the global `api` prefix.
Auth: Bearer JWT in `Authorization` header, except `/public/*` routes.
All internal (non-public) endpoints are implicitly company-scoped via the authenticated user's JWT — company ID is never accepted as a request parameter.

**Response envelope:** every handler returns a raw value and a global `ResponseInterceptor` wraps it as `{ "data": ..., "message": "OK" }` (explicit envelopes with `data`+`message` pass through unchanged). Errors use the shape at the bottom of this doc.

> **Legend:** ✅ = implemented · ⬜ = planned/next milestone (see `09_IMPLEMENTATION_GUIDE.md`).

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

**Cross-company access convention:** if an authenticated request references a resource ID that exists but in another company's schema (which should be unreachable via `search_path` scoping), the API returns `404 Not Found` — not `403 Forbidden`. This avoids confirming to a caller that a given resource ID exists in another company. The schema boundary ensures this never happens in normal operation. See `05_DATA_ISOLATION_STRATEGY.md` for the full enforcement approach.

Legend for **Roles**: SA = SuperAdmin, OA = Company Admin, R = Recruiter, HM = Hiring Manager, IV = Interviewer, — = any authenticated company user, PUBLIC = no auth, CANDIDATE = candidate account holder (authenticated)

---

## Auth ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/auth/signin` | PUBLIC | Unified sign-in — accepts email+password, routes to company/candidate/SuperAdmin auth based on account type. Returns `{ data: { accessToken, refreshToken } }` |
| POST | `/auth/signup` | PUBLIC | Creates a new candidate account (email, password, firstName, lastName, phone?) |
| POST | `/auth/company/signup` | PUBLIC | Creates a new Company + first Company Admin user (companyName, slug, email, password) |
| POST | `/auth/refresh` | PUBLIC | Exchanges refresh token for a new token pair |
| POST | `/auth/logout` | — | Revokes the current refresh token |

## Company Settings

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/company` | OA, R, HM, IV | Get current company's settings (name, slug, plan, status) |
| PATCH | `/company` | OA | Update company name (`{ name }`; slug and plan immutable) |
| GET | `/company/users` | OA, R, HM | List all users in the company (interviewer picker) |
| POST | `/company/users` | OA | Create a new account by email + role + password (no mailer — admin shares credentials out-of-band; duplicate → 409) |
| PATCH | `/company/users/:userId/role` | OA | Change a user's role (no self-change; last CompanyAdmin protected) |
| PATCH | `/company/users/:userId/password` | OA | Reset a user's password (no self-reset; revokes refresh tokens) |
| PATCH | `/company/users/:userId/suspend` | OA | Suspend a user (no self-suspend; last active CompanyAdmin protected; revokes refresh tokens) |
| PATCH | `/company/users/:userId/reactivate` | OA | Reactivate a suspended user |
| DELETE | `/company/users/:userId` | OA | Remove a user from the company (no self-removal; last CompanyAdmin protected; revokes refresh tokens) |
| GET | `/company/pipeline-stages` | — | List configured pipeline stages, ordered |
| POST | `/company/pipeline-stages` | OA | Create a new stage |
| PATCH | `/company/pipeline-stages/:id` | OA | Rename/reorder a stage |
| DELETE | `/company/pipeline-stages/:id` | OA | Remove a stage (only if no applications reference it) |

> `/company`, `PATCH /company`, and the user-management routes (`create`, `role`, `password`, `suspend/reactivate`, `delete`) are **implemented** (M9) in `backend/src/modules/company/` (`CompanyController` + `CompanyUsersController`, moved here from the interviews module in M9). User-management actions write audit rows (`user.create`, `user.role_change`, `user.password_reset`, `user.suspend`, `user.reactivate`, `user.remove`). `GET /company/pipeline-stages` exists as a company-scoped repo but no controller yet.

## Job Postings

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/job-postings` | — | List job postings (filter by status) |
| POST | `/job-postings` | OA, R | Create a job posting (draft) |
| GET | `/job-postings/:id` | — | Get a single job posting |
| PATCH | `/job-postings/:id` | OA, R | Update fields, including required skills |
| POST | `/job-postings/:id/publish` | OA, R | Move from draft → open (appears on careers page) |
| POST | `/job-postings/:id/close` | OA, R | Close the posting |
| DELETE | `/job-postings/:id` | OA | Delete a draft posting |

## Candidates

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/candidates` | OA, R, HM | List candidates in the company |
| GET | `/candidates/:id` | OA, R, HM | Candidate profile: resume, **skills (from candidate's public profile)**, application history |
| POST | `/candidates` | OA, R | Manually add a candidate (not via public apply) |

## Applications / Pipeline

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/applications` | OA, R, HM | List applications, filterable by job posting / stage |
| GET | `/applications/:id` | OA, R, HM | Full application detail (notes, interviews, stage history) |
| PATCH | `/applications/:id/stage` | OA, R, HM | Move to a different pipeline stage |
| POST | `/applications/:id/notes` | OA, R, HM | Add a note |
| GET | `/applications/:id/notes` | OA, R, HM | List notes |

## Resumes

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/candidates/:id/resume` | OA, R, HM | Get resume metadata only — returns `{ fileUrl, uploadedAt }` (no parsed text, no extracted skills) |

Note: resume upload is an authenticated candidate profile operation (`POST /candidate/resume`) or an internal recruiter upload for an existing candidate. Public careers browsing never accepts multipart files.

## Interviews ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/interviews` | OA, R, HM, IV | List interviews. Interviewer role is always filtered server-side to own assignments (FR-21); other roles see all in company, or pass `?assignedToMe=true` |
| POST | `/interviews` | OA, R, HM | Schedule an interview: `{ applicationId, interviewerId, scheduledAt }`. Auto-moves the application to the company's `Interview` stage |
| GET | `/interviews/:id` | OA, R, HM, IV (if assigned) | Interview detail (candidate, job, interviewer, feedback) |
| POST | `/interviews/:id/feedback` | IV (if assigned) | Submit `{ rating: 1–5, comments? }` — 1:1 per interview, duplicate → 409; flips status to `completed` |
| PATCH | `/interviews/:id` | OA, R, HM | Reschedule `{ scheduledAt }` / cancel `{ status: 'cancelled' }` |

## Company users ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/company/users` | OA, R, HM | List company users (`id`, `email`, `role`) — interviewer picker |

## Candidate (authenticated) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/candidate/jobs` | CANDIDATE | List all open jobs across companies (from job_listings_index), searchable |
| GET | `/candidate/jobs/:companyId/:jobId` | CANDIDATE | Job posting detail |
| POST | `/candidate/jobs/:companyId/:jobId/apply` | CANDIDATE | Submit application. Body: `{ phone?, coverLetter?, skillIds?: string[] }` — if omitted, uses candidate's profile skills from `/candidate/skills` |
| GET | `/candidate/applications` | CANDIDATE | Application history with statuses |
| GET | `/candidate/applications/:id` | CANDIDATE | Application detail |
| DELETE | `/candidate/applications/:id` | CANDIDATE | Withdraw own application — deletes the company application row + `candidate_applications_index` row; `404` if the application is not owned by the caller (via index lookup); `409` when the application still has interviews/notes |
| POST | `/candidate/bookmarks` | CANDIDATE | Bookmark a job |
| DELETE | `/candidate/bookmarks/:id` | CANDIDATE | Remove a bookmark |
| GET | `/candidate/bookmarks` | CANDIDATE | List bookmarks |
| GET | `/candidate/profile` | CANDIDATE | View profile |
| PUT | `/candidate/profile` | CANDIDATE | Update profile |
| POST | `/candidate/resume` | CANDIDATE | Upload or replace the candidate profile resume (PDF/DOCX, max 10MB). `400` for wrong type/content, `413` when >10MB (both `VALIDATION_ERROR`) |
| DELETE | `/candidate/resume` | CANDIDATE | Remove the candidate profile resume |
| GET | `/candidate/resume/file` | CANDIDATE | Download/preview own resume — `Content-Disposition: inline`; PDF renders in-tab, DOCX downloads (browser limitation). `404` when no resume |
| GET | `/candidate/skills` | CANDIDATE | List candidate's declared skills (returns `[{ id, name, category }]`) |
| PUT | `/candidate/skills` | CANDIDATE | Replace all skills. Body: `{ skillIds: string[] }` |

## Candidate Skills (public taxonomy) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/skills?search=` | ALL AUTHED | Search the skill taxonomy (used by the company RequiredSkillsPicker and the candidate apply modal) |

## Public Careers (unauthenticated read-only) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/public/:companySlug/jobs` | PUBLIC | List this company's open jobs from `job_listings_index` |
| GET | `/public/:companySlug/jobs/:id` | PUBLIC | Open job detail with required skill metadata; draft/closed/missing jobs return `404` |

The public careers section is read-only in Phase 5. Apply buttons redirect anonymous visitors to unified sign-in/signup; authenticated Candidates submit through `/candidate/jobs/:companyId/:jobId/apply`. Redis rate limiting is deferred to Phase 6 because there is no anonymous public write endpoint.

## Platform (SuperAdmin only, cross-company) ✅

| Method | Path | Roles | Description |
|---|---|---|---|---|
| GET | `/platform/companies` | SA | List all companies on the platform |
| GET | `/platform/companies/:id` | SA | Company detail + usage stats (`users`, `applications` counts) |
| PATCH | `/platform/companies/:id/suspend` | SA | Suspend a company account (409 if already suspended; blocks sign-in/refresh and hides public careers) |
| PATCH | `/platform/companies/:id/reactivate` | SA | Reactivate a suspended company (409 if already active) |
| GET | `/platform/stats` | SA | Platform-wide aggregate stats (company / user / application totals) |

> **Suspend semantics (M9):** a suspended company's users get `403 FORBIDDEN` at sign-in and `401` on refresh-token rotation (existing 15-minute access tokens simply expire). Public careers routes for the company return `404`. Suspend/reactivate writes an audit row (`company.suspend` / `company.reactivate`) with the target company's id.

## Platform Accounts (SuperAdmin, M11) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/platform/companies/:id/users` | SA | List company users (email, role, status, created) |
| POST | `/platform/companies/:id/users` | SA | Create company user: `{ email, password, role }` (role ∈ CompanyAdmin/HiringManager/Recruiter/Interviewer); mirrors company invite incl. `user_emails` bridge; audit `platform.user.create` |
| PATCH | `/platform/companies/:id/users/:userId` | SA | Update role and/or reset password; audit `platform.user.update` |
| PATCH | `/platform/companies/:id/users/:userId/suspend` | SA | Suspend an individual user (`users.status = 'suspended'`); 404 missing, 409 already suspended; blocks sign-in (403) + refresh (401); audit `platform.user.suspend` |
| PATCH | `/platform/companies/:id/users/:userId/reactivate` | SA | Reactivate a suspended user; 409 already active; audit `platform.user.reactivate` |
| DELETE | `/platform/companies/:id/users/:userId` | SA | Remove company user (revokes refresh tokens); audit `platform.user.remove` |
| GET | `/platform/companies/:id/pipeline-stages` | SA | List the company's configured pipeline stages, ordered |
| GET | `/platform/candidates` | SA | List candidates across companies (filterable by company) |
| POST | `/platform/candidates` | SA | Create a candidate; audit `platform.candidate.create` |
| PATCH | `/platform/candidates/:id` | SA | Update a candidate; audit `platform.candidate.update` |
| DELETE | `/platform/candidates/:id` | SA | Remove a candidate — cascades: company applications + `candidate_applications_index` rows + linked candidate account; audit `platform.candidate.remove` |

## Platform Data (SuperAdmin, M11) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/platform/applications?companyId=&status=` | SA | List applications across companies (optional filters) |
| PATCH | `/platform/applications/:id/stage` | SA | Move an application to a stage in its own company's schema (stage must belong to that company); syncs `candidate_applications_index` status — on sync failure the move rolls back and returns `503 SERVICE_UNAVAILABLE`; audit `platform.application.stage_move` (no BullMQ) |
| GET | `/platform/interviews?companyId=&status=` | SA | List interviews across companies (optional filters) |
| PATCH | `/platform/interviews/:id` | SA | Reschedule (`{ scheduledAt }`) / cancel (`{ status: 'cancelled' }`); audit `platform.interview.update` |

## Permission Presets (M18) ✅

Presets bind a role to a restricted permission subset. The default presets (one per internal role) are seeded read-only; SuperAdmin manages global presets, CompanyAdmin manages company-scoped customs. The ceiling rule is enforced server-side on every write: `permissions` must be a subset of the preset role's default (`ROLE_PERMISSIONS`) — else `400 VALIDATION_ERROR`; assignment requires the preset's role to match the user's role — else `400`. All preset routes require `permissions.manage` in the caller's effective set. Effective permissions are mirrored as a `permissions` claim in the JWT access token (SuperAdmin/Candidate get `[]`). Design: `docs/superpowers/specs/2026-08-12-permission-management-design.md`.

### Company presets (CompanyAdmin, own company)

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/company/permissions` | OA | List defaults + globals + own customs — `{ presets: [{ id, name, role, permissions, isDefault, isEnabled, usageCount }] }`; defaults/globals have `usageCount: 0` |
| POST | `/company/permissions` | OA | Create a custom preset. Body: `{ name, role, permissions: string[] }` (subset validated) — audit `permissions.preset.create` |
| PATCH | `/company/permissions/:id` | OA | Update a custom preset (defaults live in the public schema and are not addressable here → `404`). Body: `{ name?, permissions? }` (subset validated) — audit `permissions.preset.update` |
| DELETE | `/company/permissions/:id` | OA | Delete a custom preset; defaults not addressable → `404`; **`409` if assigned to users** (reassign first) — audit `permissions.preset.delete` |
| POST | `/company/permissions/bulk-delete` | OA | Bulk-delete customs. Body: `{ ids: string[] }` (1-50 UUIDs, deduped). Atomic: `404` if any id is missing (nothing deleted/reverted). Auto-reverts users assigned to the deleted presets to their role default. Returns `{ deleted, revertedUsers }` — audit `permissions.preset.delete` per preset with `revertedUsers` metadata |
| PATCH | `/company/permissions/:id/disable` | OA | Disable a custom preset (defaults not addressable → `404`). Reverts every user assigned to it to their role default. Returns `{ id, revertedUsers }` — audit `permissions.preset.disable` |
| PATCH | `/company/permissions/:id/enable` | OA | Re-enable a custom preset. Returns `{ id }` — audit `permissions.preset.enable` |
| POST | `/company/permissions/bulk-status` | OA | Bulk set enabled state on customs. Body: `{ ids: string[] }` (1-50 UUIDs, deduped), `enabled: boolean`. Atomic: `404` if any id is missing (nothing changed). Disabling auto-reverts assigned users; enabling never reverts. Returns `{ updated, revertedUsers }` — audit `permissions.preset.disable\|enable` per preset |
| PATCH | `/company/users/:userId/preset` | OA | Assign a preset to a non-CA user. Body: `{ presetId: string \| null }` (`null` → role default); `403` on CompanyAdmin targets, `404` unknown preset/user, `400` role mismatch or **`400` if the preset is disabled** — audit `permissions.preset.assign` |

### Platform presets (SuperAdmin, cross-company)

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/platform/permissions` | SA | List defaults + globals + every company's customs — `{ presets: [{ id, name, role, permissions, isDefault, isEnabled, companyId, companyName, usageCount }] }` (`companyId`/`companyName` null for defaults/globals) |
| POST | `/platform/permissions` | SA | Create a global preset. Body: `{ name, role, permissions: string[] }` (subset validated) — audit `platform.permissions.preset.create` |
| PATCH | `/platform/permissions/:id` | SA | Update a global preset (defaults → `400`). Body: `{ name?, permissions? }` (subset validated) — audit `platform.permissions.preset.update` |
| DELETE | `/platform/permissions/:id` | SA | Delete a global preset; defaults → `400`; **`409` if assigned in any company** — audit `platform.permissions.preset.delete` |
| POST | `/platform/permissions/bulk-delete` | SA | Bulk-delete globals. Body: `{ ids: string[] }` (1-50 UUIDs, deduped). Atomic: `404` if any id is missing (nothing deleted/reverted); `400` if any id is a default preset. Revert loops all company schemas. Returns `{ deleted, revertedUsers }` — audit `platform.permissions.preset.delete` per preset |
| PATCH | `/platform/permissions/:id/disable` | SA | Disable a global preset; defaults → `400`. Reverts every user assigned to it across **all company schemas** to their role default. Returns `{ id, revertedUsers }` — audit `platform.permissions.preset.disable` |
| PATCH | `/platform/permissions/:id/enable` | SA | Re-enable a global preset; defaults → `400`. Returns `{ id }` — audit `platform.permissions.preset.enable` |
| POST | `/platform/permissions/bulk-status` | SA | Bulk set enabled state on globals. Body: `{ ids: string[] }` (1-50 UUIDs, deduped), `enabled: boolean`. Atomic: `404` if any id is missing (nothing changed); `400` if any id is a default preset. Disabling reverts assigned users across all company schemas. Returns `{ updated, revertedUsers }` — audit `platform.permissions.preset.disable\|enable` per preset |
| PATCH | `/platform/companies/:id/users/:userId/preset` | SA | Assign a preset to any account in the company (incl. CompanyAdmins). Body: `{ presetId: string \| null }`; `404` unknown user/preset (or foreign company), `400` role mismatch or **`400` if the preset is disabled** — audit `platform.permissions.preset.assign` |

Preset names are unique per scope, compared case-insensitively on the trimmed name: a company preset cannot match another preset in the same company or any public default/global preset; a global preset cannot match any public preset. `POST`/`PATCH` with a colliding name returns `409 CONFLICT`; renaming a preset to its own name (any casing) is allowed.

Notes: `POST /company/users` accepts an optional `presetId` (defaults to the role's default preset); user list endpoints (`GET /company/users`, platform merged users) include each user's `presetId` (`null` → role default). Role-change endpoints reset `preset_id` to the new role's default preset. Assignment responses return `{ id: <userId>, presetId }`.

Every preset row in the list endpoints carries `isEnabled: boolean` (`true` for defaults and globals unless a SuperAdmin disabled the global). Disabled presets cannot be assigned — `PATCH .../users/:userId/preset` (company and platform) returns `400` while the preset stays disabled; `enable` (or bulk-status `enabled: true`) flips it back.

## Dashboards (M17) ✅

### `GET /dashboard/summary` — Company dashboard (CompanyAdmin/Recruiter/HiringManager/Interviewer)

Cached 60s per company (Redis generation-based invalidation). Returns:

```json
{
  "totalApplications": 12,
  "totalCandidates": 8,
  "openJobPostings": 3,
  "applicationsByStage": [{ "stageId": "...", "stageName": "Applied", "count": 4 }],
  "applicationsOverTime": {
    "day":  [{ "label": "2026-08-12", "count": 1 }],
    "week": [{ "label": "2026-08-10", "count": 2 }],
    "month":[{ "label": "2026-08", "count": 5 }]
  },
  "topJobsByApplications": [{ "title": "Engineer", "count": 3 }],
  "interviewStatusBreakdown": [{ "status": "scheduled", "count": 2 }],
  "jobsByStatus": [{ "status": "open", "count": 2 }],
  "jobsByEmploymentType": [{ "type": "full-time", "count": 2 }],
  "rejection": { "rejected": 1, "total": 12 }
}
```

- `applicationsOverTime` windows: day = last 30 days, week = last 12 weeks, month = last 12 months; buckets are zero-filled via `generate_series`.
- `rejection` counts applications whose current stage name matches `%reject%` (name-based heuristic; no `stage_type` column yet).

### `GET /platform/dashboard` — Platform dashboard (SuperAdmin)

Uncached, aggregates across all tenant schemas. Returns:

```json
{
  "companies": 2,
  "activeCompanies": 1,
  "suspendedCompanies": 1,
  "users": 4,
  "applications": 10,
  "jobs": 6,
  "companiesOverTime": { "day": [...], "week": [...], "month": [...] },
  "applicationsPerCompany": [{ "companyName": "Acme", "count": 10 }],
  "usersPerCompany": [{ "companyName": "Acme", "count": 4 }],
  "jobsByStatusPerCompany": [{ "companyName": "Acme", "draft": 1, "open": 3, "closed": 0 }]
}
```

- Per-company arrays are sorted desc and capped at the top 10; `applicationsPerCompany` excludes companies with zero applications.

## List Query Params (M15) ✅

Every upgraded list endpoint accepts the same query params and returns a paginated envelope:

**Query params:** `search` (ilike `%term%` on the endpoint's searchable columns), `page` (default 1), `pageSize` (default 10, max 50), `sortBy` (whitelisted per endpoint — unknown values fall back to the default sort), `sortDir` (`asc` | `desc`).

**Response shape:** `{ data: [...], total, page, pageSize }` (wrapped in the standard envelope as `data`).

Upgraded endpoints and their specifics:

| Endpoint | Searchable | Filters | Sortable (`sortBy`) | Default |
|---|---|---|---|---|
| `GET /candidate/jobs` | title, company, location | `employmentType`, `workSetup` | `createdAt`, `title`, `companyName` | createdAt desc |
| `GET /candidate/applications` | jobTitle, company | `status` (stage name) | `appliedAt`, `jobTitle`, `companyName` | appliedAt desc |
| `GET /candidate/bookmarks` | jobTitle, company | — | `createdAt`, `jobTitle`, `companyName` | createdAt desc |
| `GET /job-postings` | title | `status` | `createdAt`, `title` | createdAt desc |
| `GET /candidates` | name, email | — | `name`, `createdAt` | createdAt desc |
| `GET /interviews` | candidate, jobTitle | `status`, `assignedToMe` | `scheduledAt`, `candidateName` | scheduledAt asc |
| `GET /applications` (company) | candidate, jobTitle | `jobPostingId`, `stageId`, `status` | `appliedAt`, `candidateName` | appliedAt desc — **plain array, no pagination** (kanban/scheduler) |
| `GET /platform/companies` | name, slug | `status` | `name`, `createdAt` | createdAt desc |
| `GET /platform/users` | email, firstName, lastName, company | `type`, `companyId`, `role` | `email`, `createdAt` | email asc |
| `GET /platform/applications` | candidate, jobTitle, company | `companyId`, `status` | `appliedAt`, `jobTitle`, `companyName` | appliedAt desc |
| `GET /platform/jobs` | title, company | `companyId`, `status` | `createdAt`, `title`, `companyName` | createdAt desc |
| `GET /platform/interviews` | candidate, jobTitle, company | `companyId`, `status` | `scheduledAt` | scheduledAt asc |
| `GET /public/:companySlug/jobs` | title | `employmentType`, `workSetup` | `createdAt`, `title` | createdAt desc |

Notes: candidate jobs excludes jobs of suspended/deleted companies in SQL (totals stay correct); platform aggregated lists filter/sort/page in-memory in the service; single-schema lists run SQL ilike/orderBy/limit-offset/count.

---

## Success Response Shape

```json
{
  "data": { ... },
  "message": "OK"
}
```

Auth endpoints return an explicit envelope, e.g. `{ "data": { "accessToken": "...", "refreshToken": "..." }, "message": "Signed in" }`.

## Standard Error Shape

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

Standard `code` values: `VALIDATION_ERROR` (400 + 413), `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` (409), `UNPROCESSABLE` (422), `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`.

Note: a company mismatch is logged server-side with detail (for audit purposes, per `05_DATA_ISOLATION_STRATEGY.md` Layer 8) but is always returned to the client as `NOT_FOUND` — there is no client-facing `COMPANY_MISMATCH` code, to avoid leaking that the resource exists elsewhere.

## CSV Export Endpoints (M16)

All export endpoints return `text/csv` as a file download (`Content-Disposition: attachment; filename="{resource}-YYYY-MM-DD.csv"`). The body is RFC 4180 CSV with a UTF-8 BOM, cells starting with `= + - @` (or tab/CR) are prefixed with `'` to neutralize spreadsheet formula injection, and values are RFC 4180-escaped. Query params mirror the matching list endpoint (`search` plus the page's filters); pagination and sort params are accepted but ignored.

| Method | Path | Filters |
|---|---|---|
| GET | /platform/companies/export | search, status |
| GET | /platform/users/export | search, type, companyId, role |
| GET | /platform/applications/export | search, companyId, status |
| GET | /platform/interviews/export | search, companyId, status |
| GET | /platform/jobs/export | search, companyId, status |
| GET | /company/users/export | — |
| GET | /job-postings/export | search, status |
| GET | /candidates/export | search |
| GET | /interviews/export | search, status, assignedToMe |

All are protected by the same guards as their list endpoints (SuperAdmin for /platform/*; the VIEW/PICKER role sets for company endpoints).
