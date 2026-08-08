# SuperAdmin Platform Control Tables — Design

**Date:** 2026-08-08
**Status:** Approved
**Milestone tag:** `feat(m12)`

## Problem

The SuperAdmin dashboard (`/admin/companies`) shows three stat cards (companies, users, applications) but lacks data-control surfaces: no way to see every user across all companies, no global applications view, no company deletion, and no cascade semantics between companies and their accounts.

## Goals

1. SuperAdmin can view all companies (active/suspended) in a table with CRUD (suspend/reactivate/delete).
2. SuperAdmin can view every user in the system — company users **and** candidates — in one merged table, with per-type actions.
3. SuperAdmin can view all job applications across all companies (candidate, company, job, stage) in a table.
4. Cascade rules: suspending a company suspends all its users; suspending a CompanyAdmin suspends all users in that company; deleting a company deletes all accounts under it and cancels candidates' applications to it.

## Backend changes

### New: `GET /platform/users`

Merged list of company users + candidate accounts, ordered by email. SuperAdmin-only, `{ data, message }` envelope.

Row shape:

```ts
{
  type: 'company' | 'candidate',
  id: string,              // users.id (company) or candidate_accounts.id (candidate)
  email: string,
  role: string,            // actual role; candidates → 'Candidate'
  status: string | null,   // 'active' | 'suspended'; candidates → null (no status field)
  companyId: string | null,// candidates → null
  companyName: string | null,
  firstName: string | null, // candidates only
  lastName: string | null,  // candidates only
  createdAt: string,
}
```

Implementation: loop all company schemas (`userRepo.findAll(schema)` per tenant) + `candidateAccountRepo.findAll()`; attach `companyName` from the `companies` table.

### New: `DELETE /platform/companies/:id`

Hard delete, in order (404 if company not found):

1. `UPDATE candidate_applications_index SET status = 'cancelled' WHERE company_id = :id` — rows **kept**, candidates see the application as cancelled in their history.
2. Delete `job_listings_index`, `user_emails`, `refresh_tokens` rows by `companyId`.
3. `DROP SCHEMA company_<id> CASCADE` — wipes users, candidates, applications, resumes, interviews, notes, pipeline stages.
4. Delete the `companies` row. `audit_logs` kept (immutable history). Candidate accounts in `public.candidate_accounts` survive (they are platform-level).
5. Audit action `company.delete` with company metadata.

### Extended: suspend cascades

`PATCH /platform/companies/:id/suspend` → in addition to the existing behavior (company status + sign-in blocking), set `users.status = 'suspended'` for every user in that schema. `reactivate` sets them all back to `'active'`.

`PATCH /platform/companies/:id/users/:userId/suspend` → if the target user's role is `CompanyAdmin`, also set `users.status = 'suspended'` for every other user in the schema. Cascade is **suspend-only, one-directional** — reactivating the CompanyAdmin does NOT reactivate the company's users.

Documented edge case: an individually-suspended user's pre-suspension state is not preserved through a company suspend → reactivate cycle (binary status).

## Frontend changes

### Nav (`features/admin/layout.tsx`)

Links: Tenants (`/admin/companies`), Users (`/admin/users`), Applications (`/admin/applications`). Candidates link removed.

### CompaniesPage (improve)

- Keep the three stat cards (`GET /platform/stats`).
- Add: search input (name/slug), status filter select (All/Active/Suspended), client-side pagination.
- Add actions column per row: Suspend/Reactivate (existing `PATCH /platform/companies/:id/suspend|reactivate`), Delete (new, confirm modal → `DELETE /platform/companies/:id`, warns it deletes all accounts + cancels candidate applications).

### UsersPage (new, replaces CandidatesPage + route `admin/candidates.tsx`)

- Fetches `GET /platform/users`.
- Columns: **Name/Email, Type (badge), Company, Role, Status (badge), Created, Actions**.
- Filters: search (name/email), Type select (All/Company/Candidate), Company select (options from `GET /platform/companies`), client-side pagination.
- Actions by type:
  - Company row: Suspend/Reactivate (existing `PATCH /platform/companies/:id/users/:userId/suspend|reactivate`), Remove (existing `DELETE /platform/companies/:id/users/:userId`). Reuse modals from CompanyDetailPage.
  - Candidate row: Edit/Delete (existing `PATCH|DELETE /platform/candidates/:id`). Reuse modals from CandidatesPage.
- "Add user" button: modal with Type toggle:
  - Company: pick company + role + password → `POST /platform/companies/:id/users`.
  - Candidate: firstName/lastName/email/password → `POST /platform/candidates`.
- Mutations invalidate the `platform.users` query key (plus existing keys).

### ApplicationsPage (new)

- Fetches `GET /platform/applications` (no companyId → all companies).
- Columns: **Candidate, Company, Job, Stage, Applied, Match** (`matchScore*100%`).
- Filters: company select (from companies list), stage select (unique stage names present), search (candidate/job), client-side pagination.
- Action: Move stage modal (reuse pattern from CompanyDetailPage → `PATCH /platform/applications/:id/stage`). Company cell links to `/admin/companies/$companyId`.

### Deleted

- `frontend/src/routes/admin/candidates.tsx`, `features/admin/CandidatesPage.tsx` (replaced by UsersPage). Candidate create/edit/delete modals move into UsersPage.

## Non-goals / skipped

- Server-side pagination on platform endpoints (backend returns full lists; client-side search/filter/pagination over fetched data). Add when volume proves it necessary.
- Soft-delete of companies (hard delete chosen).
- Generic reusable DataTable component (each page is a small Mantine Table variant).
- Re-activation cascade from CompanyAdmin.

## Error handling

Existing envelope `{ error: { code, message } }` with `NOT_FOUND` (404), `CONFLICT` (409 already suspended), `FORBIDDEN` (403 non-SuperAdmin), `UNAUTHORIZED` (401). New endpoints reuse these; no new codes.

## Testing

- **e2e** (`backend/test/`): 
  - `GET /platform/users`: 401 unauthenticated, 403 for CompanyAdmin/Candidate, 200 merged shape (company users have companyName/status; candidates have type candidate, null company/status, populated names).
  - `DELETE /platform/companies/:id`: schema dropped, `user_emails`/`refresh_tokens`/`job_listings_index` rows gone, `candidate_applications_index` rows kept with status `cancelled`, candidate accounts survive, `companies` row gone, audit row written.
  - Company suspend → all `users.status = 'suspended'` in schema; reactivate → back to active.
  - CompanyAdmin user suspend → all other users in schema suspended; reactivate of the admin does not cascade.
- **Unit** (`platform.service.spec.ts`, `platform-accounts.service.spec.ts`): cascade branches.
- **Frontend:** `npm run lint` (oxlint) + `npm run build` (tsc -b + vite).
