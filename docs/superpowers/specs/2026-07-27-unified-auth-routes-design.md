# Unified Auth Routes — Design

**Date:** 2026-07-27  
**Status:** Approved  
**Milestone:** M1 (Auth + Tenancy + RBAC) refinement

## Motivation

Separate login paths for candidates (`/candidate/login`) and company users (`/login`) create confusion and unnecessary route proliferation. All roles should authenticate through a single entry point, with role-based redirect to the appropriate dashboard.

## Route Structure

| Route | Access | Purpose |
|---|---|---|
| `/auth/signin` | Public | Unified sign in — all roles |
| `/auth/signup` | Public | Candidate registration |
| `/auth/company/signup` | Public | Company/company registration |
| `/dashboard` | Candidate only | Candidate home (job search) |
| `/applications` | Candidate only | Candidate applications |
| `/bookmarks` | Candidate only | Saved jobs |
| `/settings` | Candidate only | Candidate profile |
| `/company/dashboard` | Company users only | Company home |
| `/company/job-postings` | Company users only | Job management |
| `/company/candidates` | Company users only | Candidate management |
| `/company/pipeline` | Company users only | Kanban pipeline |
| `/company/interviews` | Company users only | Interview management |
| `/admin/dashboard` | SuperAdmin only | Platform overview |
| `/admin/companies` | SuperAdmin only | Company management |

### Principles

- **Auth routes** live under `/auth/*` — `/auth/signin`, `/auth/signup`, `/auth/company/signup`
- **Candidate routes** are at root level (`/dashboard`, `/applications`, etc.) — simplest path for the most common user type
- **Company routes** are under `/company/*` — clear namespace for internal users
- **Admin routes** are under `/admin/*` — platform-level access
- **No cross-role access** — route guards enforce strict isolation

## Backend API Changes

### Unified Sign In: `POST /auth/signin`

Replaces `/auth/login` and `/auth/candidate/login`.

Flow:
1. Accept `{ email, password }`
2. Look up email in `public.user_emails` (company users)
3. If found → connect to company schema → verify password against `users.passwordHash` → issue JWT with `{ sub, companyId, role, email }`
4. If NOT found → look up in `public.candidate_accounts` → verify password → issue JWT with `{ sub, role: 'Candidate', email }`
5. If neither → `401 UNAUTHORIZED`

### Candidate Registration: `POST /auth/signup`

Replaces `/auth/candidate/signup`. Same logic — creates entry in `public.candidate_accounts`.

### Company Registration: `POST /auth/company/signup`

Replaces `/auth/signup`. Same logic — creates company, schema, CompanyAdmin user.

### Removals

- `POST /auth/login` — replaced by `/auth/signin`
- `POST /auth/candidate/login` — replaced by `/auth/signin`
- `POST /auth/candidate/signup` — replaced by `/auth/signup`

### JWT Payload

- **Candidate:** `{ role: "Candidate", sub: userId, email }` (no companyId)
- **Company user:** `{ role: "CompanyAdmin"|..., sub: userId, companyId, email }`
- **SuperAdmin:** `{ role: "SuperAdmin", sub: userId, email }` (no companyId)

## Frontend Auth Flow

1. User enters email + password at `/auth/signin`
2. Backend validates, returns `{ accessToken, refreshToken }`
3. Frontend decodes JWT, stores in Zustand + localStorage: `{ userId, companyId?, role, email }`
4. Role-based redirect:
   - `Candidate` → `/dashboard`
   - `CompanyAdmin` / `Recruiter` / `HiringManager` / `Interviewer` → `/company/dashboard`
   - `SuperAdmin` → `/admin/dashboard`
5. Route guards prevent cross-role navigation
6. Logout → redirect to `/auth/signin` for all roles

## Email Identity Rule

Candidate accounts and company accounts are mutually exclusive. An email cannot exist in both `user_emails` and `candidate_accounts`. If someone with an existing candidate account is hired, their candidate status is marked as "Hired" — they do not become an company user under the same email.

## Files to Modify

### Backend
- `backend/src/modules/auth/auth.controller.ts` — rename/restructure endpoints
- `backend/src/modules/auth/auth.service.ts` — unified login logic
- `backend/src/modules/auth/auth.module.ts` — route prefix? (keep `/auth`)

### Frontend — Routes
- `frontend/src/routes/login.tsx` → move to `routes/auth/signin.tsx`
- `frontend/src/routes/signup.tsx` → move to `routes/auth/signup.tsx` (candidate)
- `frontend/src/routes/_candidate.candidate.login.tsx` → remove
- `frontend/src/routes/_candidate.candidate.signup.tsx` → remove
- `frontend/src/routes/auth/company-signup.tsx` — new (company registration)
- `frontend/src/routes/_candidate.candidate.dashboard.tsx` → `routes/dashboard.tsx`
- `frontend/src/routes/_candidate.candidate.applications.tsx` → `routes/applications.tsx`
- `frontend/src/routes/_candidate.candidate.bookmarks.tsx` → `routes/bookmarks.tsx`
- `frontend/src/routes/_candidate.candidate.settings.tsx` → `routes/settings.tsx`
- New `routes/company/` directory for company routes
- New `routes/admin/` directory for admin routes

### Frontend — Layouts
- `frontend/src/app/AppShell.tsx` — update router config
- Remove `CandidatePlatform.tsx` layout (candidate routes at root now)
- Remove `_candidate` route group
- Simplify to `_org`, `_admin`, and root-level candidate routes
