# TalentPipe — API Endpoint Documentation

**Purpose:** The complete HTTP API contract — every route, method, role restriction, and the standard error shape. Use this to implement route handlers and frontend API hooks. Authoritative endpoint list is mirrored in `00_PROJECT_INSTRUCTIONS.md` §5.

Base URL (example): `https://api.talentpipe.dev`
Auth: Bearer JWT in `Authorization` header, except `/public/*` routes.
All internal (non-public) endpoints are implicitly tenant-scoped via the authenticated user's JWT — tenant ID is never accepted as a request parameter.

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

**Cross-tenant access convention:** if an authenticated request references a resource ID that exists but in another tenant's schema (which should be unreachable via `search_path` scoping), the API returns `404 Not Found` — not `403 Forbidden`. This avoids confirming to a caller that a given resource ID exists in another tenant. The schema boundary ensures this never happens in normal operation. See `05_DATA_ISOLATION_STRATEGY.md` for the full enforcement approach.

Legend for **Roles**: SA = SuperAdmin, OA = Org Admin, R = Recruiter, HM = Hiring Manager, IV = Interviewer, — = any authenticated tenant user, PUBLIC = no auth.

---

## Auth

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/auth/signup` | PUBLIC | Creates a new Tenant + first Org Admin user |
| POST | `/auth/login` | PUBLIC | Returns access + refresh tokens |
| POST | `/auth/refresh` | PUBLIC | Exchanges refresh token for new access token |
| POST | `/auth/logout` | — | Revokes current refresh token |

## Tenants / Org Settings

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/org` | — | Get current tenant's settings |
| PATCH | `/org` | OA | Update tenant name/settings |
| GET | `/org/users` | OA | List all users in the tenant |
| POST | `/org/users/invite` | OA | Invite a new user by email + role |
| PATCH | `/org/users/:userId/role` | OA | Change a user's role |
| DELETE | `/org/users/:userId` | OA | Remove a user from the tenant |
| GET | `/org/pipeline-stages` | — | List configured pipeline stages, ordered |
| POST | `/org/pipeline-stages` | OA | Create a new stage |
| PATCH | `/org/pipeline-stages/:id` | OA | Rename/reorder a stage |
| DELETE | `/org/pipeline-stages/:id` | OA | Remove a stage (only if no applications reference it) |

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
| GET | `/candidates/:id` | OA, R, HM | Candidate profile: resume, skills, application history |
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
| GET | `/candidates/:id/resume` | OA, R, HM | Get resume metadata + extracted skills |
| POST | `/candidates/:id/resume` | OA, R | Manually (re)upload a resume for an existing candidate |

Note: the primary resume upload path is via `POST /public/:tenantSlug/jobs/:id/apply` (below) — this internal endpoint exists for manual/edge-case uploads only.

## Interviews

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/interviews` | OA, R, HM | List interviews (HM/R see all in tenant) |
| GET | `/interviews?assignedToMe=true` | IV | List only the requester's own assigned interviews |
| POST | `/interviews` | OA, R, HM | Schedule an interview, assign interviewer(s) |
| GET | `/interviews/:id` | OA, R, HM, IV (if assigned) | Interview detail |
| POST | `/interviews/:id/feedback` | IV (if assigned) | Submit rating + comments |
| PATCH | `/interviews/:id` | OA, R, HM | Reschedule / cancel |

## Skills (shared taxonomy)

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/skills?search=` | — | Search the skill taxonomy (for the RequiredSkillsPicker) |

## Public Careers (unauthenticated)

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/public/:tenantSlug/jobs` | PUBLIC | List open job postings for a tenant |
| GET | `/public/:tenantSlug/jobs/:id` | PUBLIC | Job posting detail |
| POST | `/public/:tenantSlug/jobs/:id/apply` | PUBLIC (rate-limited) | Submit application: name, email, resume file |

**Rate limiting applies to this section specifically** — see `02_TECHNICAL_OVERVIEW.md` for the Redis-backed limiter design. Expect `429` responses with a `Retry-After` header once a caller exceeds the configured window.

## Platform (SuperAdmin only, cross-tenant)

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/platform/tenants` | SA | List all tenants on the platform |
| GET | `/platform/tenants/:id` | SA | Tenant detail + usage stats |
| PATCH | `/platform/tenants/:id/suspend` | SA | Suspend a tenant account |
| PATCH | `/platform/tenants/:id/reactivate` | SA | Reactivate a suspended tenant |
| GET | `/platform/stats` | SA | Platform-wide aggregate stats |

---

## Standard Error Shape

```json
{
  "error": {
    "code": "TENANT_MISMATCH" ,
    "message": "Resource does not belong to the authenticated tenant"
  }
}
```

Suggested `code` values worth standardizing early: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.

Note: a tenant mismatch is logged server-side with detail (for audit purposes, per `05_DATA_ISOLATION_STRATEGY.md` Layer 8) but is always returned to the client as `NOT_FOUND` — there is no client-facing `TENANT_MISMATCH` code, to avoid leaking that the resource exists elsewhere.
