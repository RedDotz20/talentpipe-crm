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
| PATCH | `/company/users/:userId/suspend` | OA | Suspend a user (no self-suspend; last active CompanyAdmin protected; revokes refresh tokens) |
| PATCH | `/company/users/:userId/reactivate` | OA | Reactivate a suspended user |
| DELETE | `/company/users/:userId` | OA | Remove a user from the company (no self-removal; last CompanyAdmin protected; revokes refresh tokens) |
| GET | `/company/pipeline-stages` | — | List configured pipeline stages, ordered |
| POST | `/company/pipeline-stages` | OA | Create a new stage |
| PATCH | `/company/pipeline-stages/:id` | OA | Rename/reorder a stage |
| DELETE | `/company/pipeline-stages/:id` | OA | Remove a stage (only if no applications reference it) |

> `/company`, `PATCH /company`, and the user-management routes (`create`, `role`, `suspend/reactivate`, `delete`) are **implemented** (M9) in `backend/src/modules/company/` (`CompanyController` + `CompanyUsersController`, moved here from the interviews module in M9). User-management actions write audit rows (`user.create`, `user.role_change`, `user.suspend`, `user.reactivate`, `user.remove`). `GET /company/pipeline-stages` exists as a company-scoped repo but no controller yet.

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
| POST | `/candidate/resume` | CANDIDATE | Upload or replace the candidate profile resume (PDF/DOCX, max 10MB) |
| DELETE | `/candidate/resume` | CANDIDATE | Remove the candidate profile resume |
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
|---|---|---|
| GET | `/platform/applications?companyId=&status=` | SA | List applications across companies (optional filters) |
| PATCH | `/platform/applications/:id/stage` | SA | Move an application to a stage in its own company's schema (stage must belong to that company); syncs `candidate_applications_index` status — on sync failure the move rolls back and returns `503 SERVICE_UNAVAILABLE`; audit `platform.application.stage_move` (no BullMQ) |
| GET | `/platform/interviews?companyId=&status=` | SA | List interviews across companies (optional filters) |
| PATCH | `/platform/interviews/:id` | SA | Reschedule (`{ scheduledAt }`) / cancel (`{ status: 'cancelled' }`); audit `platform.interview.update` |

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
