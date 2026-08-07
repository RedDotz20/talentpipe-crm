# TalentPipe — API Endpoint Documentation

**Purpose:** The complete HTTP API contract — every route, method, role restriction, and the standard error shape. Use this to implement route handlers and frontend API hooks. Authoritative endpoint list is mirrored in `00_PROJECT_INSTRUCTIONS.md` §5.

Base URL: `http://localhost:3000/api` (local) / `https://api.talentpipe.dev` (prod). All routes are under the global `api` prefix.
Auth: Bearer JWT in `Authorization` header, except `/public/*` routes.
All internal (non-public) endpoints are implicitly tenant-scoped via the authenticated user's JWT — tenant ID is never accepted as a request parameter.

**Response envelope:** every handler returns a raw value and a global `ResponseInterceptor` wraps it as `{ "data": ..., "message": "OK" }` (explicit envelopes with `data`+`message` pass through unchanged). Errors use the shape at the bottom of this doc.

> **Legend:** ✅ = implemented · ⬜ = planned/next milestone (see `09_IMPLEMENTATION_GUIDE.md`).

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

**Cross-tenant access convention:** if an authenticated request references a resource ID that exists but in another tenant's schema (which should be unreachable via `search_path` scoping), the API returns `404 Not Found` — not `403 Forbidden`. This avoids confirming to a caller that a given resource ID exists in another tenant. The schema boundary ensures this never happens in normal operation. See `05_DATA_ISOLATION_STRATEGY.md` for the full enforcement approach.

Legend for **Roles**: SA = SuperAdmin, OA = Org Admin, R = Recruiter, HM = Hiring Manager, IV = Interviewer, — = any authenticated tenant user, PUBLIC = no auth, CANDIDATE = candidate account holder (authenticated)

---

## Auth ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/auth/signin` | PUBLIC | Unified sign-in — accepts email+password, routes to org/candidate/SuperAdmin auth based on account type. Returns `{ data: { accessToken, refreshToken } }` |
| POST | `/auth/signup` | PUBLIC | Creates a new candidate account (email, password, firstName, lastName, phone?) |
| POST | `/auth/org/signup` | PUBLIC | Creates a new Tenant + first Org Admin user (companyName, slug, email, password) |
| POST | `/auth/refresh` | PUBLIC | Exchanges refresh token for a new token pair |
| POST | `/auth/logout` | — | Revokes the current refresh token |

## Tenants / Org Settings

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/org` | OA, R, HM, IV | Get current tenant's settings (name, slug, plan, status) |
| PATCH | `/org` | OA | Update tenant name (`{ name }`; slug and plan immutable) |
| GET | `/org/users` | OA, R, HM | List all users in the tenant (interviewer picker) |
| POST | `/org/users/invite` | OA | Invite a new user by email + role + password (no mailer — admin shares credentials out-of-band) |
| PATCH | `/org/users/:userId/role` | OA | Change a user's role (no self-change; last OrgAdmin protected) |
| DELETE | `/org/users/:userId` | OA | Remove a user from the tenant (no self-removal; last OrgAdmin protected; revokes refresh tokens) |
| GET | `/org/pipeline-stages` | — | List configured pipeline stages, ordered |
| POST | `/org/pipeline-stages` | OA | Create a new stage |
| PATCH | `/org/pipeline-stages/:id` | OA | Rename/reorder a stage |
| DELETE | `/org/pipeline-stages/:id` | OA | Remove a stage (only if no applications reference it) |

> `/org`, `PATCH /org`, and the user-management routes (`invite`, `role`, `delete`) are **implemented** (M9) in `backend/src/modules/org/` (`OrgController` + `OrgUsersController`, moved here from the interviews module in M9). User-management actions write audit rows (`user.invite`, `user.role_change`, `user.remove`). `GET /org/pipeline-stages` exists as a tenant-scoped repo but no controller yet.

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
| GET | `/candidates` | OA, R, HM | List candidates in the tenant |
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
| GET | `/interviews` | OA, R, HM, IV | List interviews. Interviewer role is always filtered server-side to own assignments (FR-21); other roles see all in tenant, or pass `?assignedToMe=true` |
| POST | `/interviews` | OA, R, HM | Schedule an interview: `{ applicationId, interviewerId, scheduledAt }`. Auto-moves the application to the tenant's `Interview` stage |
| GET | `/interviews/:id` | OA, R, HM, IV (if assigned) | Interview detail (candidate, job, interviewer, feedback) |
| POST | `/interviews/:id/feedback` | IV (if assigned) | Submit `{ rating: 1–5, comments? }` — 1:1 per interview, duplicate → 409; flips status to `completed` |
| PATCH | `/interviews/:id` | OA, R, HM | Reschedule `{ scheduledAt }` / cancel `{ status: 'cancelled' }` |

## Organization users ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/org/users` | OA, R, HM | List tenant users (`id`, `email`, `role`) — interviewer picker |

## Candidate (authenticated) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/candidate/jobs` | CANDIDATE | List all open jobs across tenants (from job_listings_index), searchable |
| GET | `/candidate/jobs/:tenantId/:jobId` | CANDIDATE | Job posting detail |
| POST | `/candidate/jobs/:tenantId/:jobId/apply` | CANDIDATE | Submit application. Body: `{ phone?, coverLetter?, skillIds?: string[] }` — if omitted, uses candidate's profile skills from `/candidate/skills` |
| GET | `/candidate/applications` | CANDIDATE | Application history with statuses |
| GET | `/candidate/applications/:id` | CANDIDATE | Application detail |
| DELETE | `/candidate/applications/:id` | CANDIDATE | Withdraw own application — deletes the tenant application row + `candidate_applications_index` row; `404` if the application is not owned by the caller (via index lookup); `409` when the application still has interviews/notes |
| POST | `/candidate/bookmarks` | CANDIDATE | Bookmark a job |
| DELETE | `/candidate/bookmarks/:id` | CANDIDATE | Remove a bookmark |
| GET | `/candidate/bookmarks` | CANDIDATE | List bookmarks |
| GET | `/candidate/profile` | CANDIDATE | View profile |
| PUT | `/candidate/profile` | CANDIDATE | Update profile |
| POST | `/candidate/resume` | CANDIDATE | Upload or replace the candidate profile resume (PDF/DOCX, max 10MB) |
| DELETE | `/candidate/resume` | CANDIDATE | Remove the candidate profile resume |
| GET | `/candidate/skills` | CANDIDATE | List candidate's declared skills (returns `[{ id, name, category }]`) |
| PUT | `/candidate/skills` | CANDIDATE | Replace all skills. Body: `{ skillIds: string[] }` |

## Candidate Skills (public taxonomy) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/skills?search=` | ALL AUTHED | Search the skill taxonomy (used by the org RequiredSkillsPicker and the candidate apply modal) |

## Public Careers (unauthenticated read-only) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/public/:tenantSlug/jobs` | PUBLIC | List this tenant's open jobs from `job_listings_index` |
| GET | `/public/:tenantSlug/jobs/:id` | PUBLIC | Open job detail with required skill metadata; draft/closed/missing jobs return `404` |

The public careers section is read-only in Phase 5. Apply buttons redirect anonymous visitors to unified sign-in/signup; authenticated Candidates submit through `/candidate/jobs/:tenantId/:jobId/apply`. Redis rate limiting is deferred to Phase 6 because there is no anonymous public write endpoint.

## Platform (SuperAdmin only, cross-tenant) ✅

| Method | Path | Roles | Description |
|---|---|---|---|---|
| GET | `/platform/tenants` | SA | List all tenants on the platform |
| GET | `/platform/tenants/:id` | SA | Tenant detail + usage stats (`users`, `applications` counts) |
| PATCH | `/platform/tenants/:id/suspend` | SA | Suspend a tenant account (409 if already suspended; blocks sign-in/refresh and hides public careers) |
| PATCH | `/platform/tenants/:id/reactivate` | SA | Reactivate a suspended tenant (409 if already active) |
| GET | `/platform/stats` | SA | Platform-wide aggregate stats (tenant / user / application totals) |

> **Suspend semantics (M9):** a suspended tenant's users get `403 FORBIDDEN` at sign-in and `401` on refresh-token rotation (existing 15-minute access tokens simply expire). Public careers routes for the tenant return `404`. Suspend/reactivate writes an audit row (`tenant.suspend` / `tenant.reactivate`) with the target tenant's id.

## Platform Accounts (SuperAdmin, M11) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/platform/tenants/:id/users` | SA | List tenant users (email, role, status, created) |
| POST | `/platform/tenants/:id/users` | SA | Create tenant user: `{ email, password, role }` (role ∈ OrgAdmin/HiringManager/Recruiter/Interviewer); mirrors org invite incl. `user_emails` bridge; audit `platform.user.create` |
| PATCH | `/platform/tenants/:id/users/:userId` | SA | Update role and/or reset password; audit `platform.user.update` |
| PATCH | `/platform/tenants/:id/users/:userId/suspend` | SA | Suspend an individual user (`users.status = 'suspended'`); 404 missing, 409 already suspended; blocks sign-in (403) + refresh (401); audit `platform.user.suspend` |
| PATCH | `/platform/tenants/:id/users/:userId/reactivate` | SA | Reactivate a suspended user; 409 already active; audit `platform.user.reactivate` |
| DELETE | `/platform/tenants/:id/users/:userId` | SA | Remove tenant user (revokes refresh tokens); audit `platform.user.remove` |
| GET | `/platform/tenants/:id/pipeline-stages` | SA | List the tenant's configured pipeline stages, ordered |
| GET | `/platform/candidates` | SA | List candidates across tenants (filterable by tenant) |
| POST | `/platform/candidates` | SA | Create a candidate; audit `platform.candidate.create` |
| PATCH | `/platform/candidates/:id` | SA | Update a candidate; audit `platform.candidate.update` |
| DELETE | `/platform/candidates/:id` | SA | Remove a candidate — cascades: tenant applications + `candidate_applications_index` rows + linked candidate account; audit `platform.candidate.remove` |

## Platform Data (SuperAdmin, M11) ✅

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/platform/applications?tenantId=&status=` | SA | List applications across tenants (optional filters) |
| PATCH | `/platform/applications/:id/stage` | SA | Move an application to a stage in its own tenant's schema (stage must belong to that tenant); syncs `candidate_applications_index` status — on sync failure the move rolls back and returns `503 SERVICE_UNAVAILABLE`; audit `platform.application.stage_move` (no BullMQ) |
| GET | `/platform/interviews?tenantId=&status=` | SA | List interviews across tenants (optional filters) |
| PATCH | `/platform/interviews/:id` | SA | Reschedule (`{ scheduledAt }`) / cancel (`{ status: 'cancelled' }`); audit `platform.interview.update` |

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

Note: a tenant mismatch is logged server-side with detail (for audit purposes, per `05_DATA_ISOLATION_STRATEGY.md` Layer 8) but is always returned to the client as `NOT_FOUND` — there is no client-facing `TENANT_MISMATCH` code, to avoid leaking that the resource exists elsewhere.
