# Candidate Accounts & Dashboard — Design

**Date:** 2026-07-24
**Status:** Approved for implementation

## Overview

Candidates transition from unauthenticated visitors to having full global accounts. A candidate can sign up once, browse job postings from all companies/companies, apply, track application statuses, and bookmark jobs — all from a single dashboard.

**Key shift:** Candidates are now authenticated global users (public schema), while company hiring data (job postings, applications, interviews, notes) stays per-company. A lightweight cross-schema index layer enables the candidate dashboard without querying every company schema.

## Data Model

### New public schema tables

| Table | Purpose |
|-------|---------|
| `candidate_accounts` | Auth identity — id, email, passwordHash, firstName, lastName, phone, createdAt |
| `candidate_bookmarks` | Saved jobs — id, candidateAccountId, companyId, jobPostingId, createdAt |
| `candidate_applications_index` | Dashboard history — id, candidateAccountId, companyId, jobPostingId, applicationId, status (stage name), appliedAt |
| `job_listings_index` | Cross-company job search — id, companyId, jobPostingId, title, description, companyName, companySlug, status, requiredSkills[], createdAt, updatedAt |

### Existing tables (unchanged in company schemas)

`users`, `jobPostings`, `candidates`, `applications`, `pipelineStages`, `resumes`, `resumeSkills`, `jobRequiredSkills`, `interviews`, `interviewFeedbacks`, `notes` — all stay per-company, all existing FKs intact.

### Flow: Candidate applies

1. Candidate logged in → `POST /api/candidate/jobs/:companyId/:jobId/apply`
2. Backend switches to company schema, creates/finds `candidates` record (by email)
3. Creates `applications` record in company schema
4. Backend switches to public schema
5. Creates `candidate_applications_index` row (lightweight summary)
6. Returns success

### Flow: Company updates application stage

1. `PATCH /applications/:id/stage` updates the company schema
2. Application service also updates the matching `candidate_applications_index` row (via a cross-schema write to the public index)
3. Candidate dashboard reflects the change

### Flow: Company publishes a job

1. `POST /job-postings` / `POST /job-postings/:id/publish`
2. Job posting service also writes/updates `job_listings_index` in public schema
3. Open jobs appear in candidate search immediately

## Authentication

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/candidate/signup` | Create candidate account → returns JWT |
| `POST /api/auth/candidate/login` | Login → returns JWT |
| `POST /api/auth/refresh` | Reuse existing refresh endpoint |

Candidate JWT payload: `{ sub: candidateAccountId, role: 'Candidate' }` — no `companyId`.

## API Endpoints

### Candidate module (`/api/candidate/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/candidate/jobs` | Candidate | List open jobs (from index), searchable |
| GET | `/candidate/jobs/:companyId/:jobId` | Candidate | Job detail |
| POST | `/candidate/jobs/:companyId/:jobId/apply` | Candidate | Submit application |
| GET | `/candidate/applications` | Candidate | My application history from index |
| GET | `/candidate/applications/:appId` | Candidate | Application detail + status |
| POST | `/candidate/bookmarks` | Candidate | Save a job |
| DELETE | `/candidate/bookmarks/:id` | Candidate | Remove saved job |
| GET | `/candidate/bookmarks` | Candidate | List saved jobs |
| GET/PATCH | `/candidate/profile` | Candidate | View/update profile |

### CandidateAuthGuard

```typescript
@Injectable()
export class CandidateAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return request.user?.role === 'Candidate';
  }
}
```

Applied to all `/candidate/*` routes. The `CompanyContextInterceptor` sees no `companyId` and sets context to `public` schema.

## Frontend Routes

```
/candidate/login       → LoginPage (separate from company login)
/candidate/signup      → SignupPage
/candidate/dashboard    → Main dashboard: job listings with search
/candidate/applications → Application history with status per row
/candidate/bookmarks    → Saved jobs list
/candidate/settings     → Profile/account settings
```

Separate `CandidateShell` layout — minimal chrome, no AppShell sidebar.

## Open / Unauthenticated Apply (backward compatible)

`POST /public/:companySlug/jobs/:id/apply` continues to work for unauthenticated candidates (no account needed). These create company-scoped candidate + application records but do NOT create a candidate account or index entry. This preserves the fast-apply flow.

## Guard & Permission Changes

- New `CandidateAuthGuard` for `/candidate/*` routes
- Existing `RolesGuard` updated to recognize `'Candidate'` role string
- `CompanyContextInterceptor` handles JWT without `companyId` → operates in public schema

## Affected Backend Modules

| Module | Change |
|--------|--------|
| `AuthModule` | Add `POST /auth/candidate/signup`, `POST /auth/candidate/login` |
| `AuthService` | Add `candidateSignup()`, `candidateLogin()` — operates on `candidate_accounts` table |
| `CandidateModule` (new) | `CandidateController` + `CandidateService` — all `/candidate/*` endpoints |
| `ApplicationsModule` | On stage update, also update `candidate_applications_index` |
| `JobPostingsModule` | On publish/status change, also sync `job_listings_index` |
| `PublicApplyModule` | No change (still works for unauthenticated flow) |
| `shared/` | New `CandidateAuthGuard`, update `RolesGuard` |

## Frontend Directories

```
/features/candidate/
  login/    → LoginPage.tsx
  signup/   → SignupPage.tsx
  dashboard/ → DashboardPage.tsx (job search)
  applications/ → ApplicationsPage.tsx (history)
  bookmarks/ → BookmarksPage.tsx
  settings/ → SettingsPage.tsx

/shared/components/
  CandidateShell.tsx  (new — minimal layout)
  RoleGuard.tsx       (update to handle Candidate role)
```

## Open Questions (resolved)

- **Q: Does the unauthenticated apply flow still work?** Yes — `/public/:companySlug/jobs/:id/apply` unchanged. Candidates without accounts can still apply.
- **Q: How does candidate_applications_index get updated when company moves stages?** The application service's `updateStage()` method does a dual write — updates the company's `applications` row and the public `candidate_applications_index` row (identified by `candidateAccountId` + `companyId` + `jobPostingId`).
- **Q: What happens when a company deletes a job posting?** The index row gets deleted/synced as well (cascade or explicit delete).
