# Team Account Creation & Management (Company Admin)

**Date:** 2026-08-12
**Status:** Approved (brainstorming session)

## Problem

The company admin's "Invite user" flow already creates accounts (email + role + password, no email sent), but the wording implies an email invitation that never happens. Gaps:

1. No suspend/activate at company level (only the platform has per-user suspend).
2. No company-alias email assistance (`john@acme.com` from company slug).

## Design

### Backend (`backend/src/modules/company/`)

- Rename `invite()` → `create()`; route `POST /company/users` (was `POST /company/users/invite`). DTO unchanged (`email`, `role` incl. `CompanyAdmin`, `password` ≥8). Audit action `user.invite` → `user.create`. Email generation is a frontend convenience; backend still validates a real email.
- New endpoints, CompanyAdmin only:
  - `PATCH /company/users/:id/suspend`
  - `PATCH /company/users/:id/reactivate`
  - Mirror `platform-accounts.service.ts` `setCompanyUserStatus`: `userRepo.updateStatus`, delete user's refresh tokens on suspend, audit `user.suspend` / `user.reactivate`.
  - Guards: 404 missing, 409 already in status, 403 self-suspend (cannot lock yourself out), 403 suspending the last active CompanyAdmin (extends `ensureCompanyAdminRemains` to consider status).
  - No company-wide cascade — suspending a company user affects only that account (platform retains the cascade privilege).
- `list()` already returns `status` via `userRepo.findAll` — no repo change needed.

### Frontend (`frontend/src/features/company/users/`)

- Button + modal relabel: **"Add team member"** / **"Create account"** (submit "Create account").
- New **Name** field in the modal; on change, email auto-fills as `first@<slug>.com` (lowercased, alphanumeric only, fallback when no space), editable after. Slug from existing `GET /company` (`companyApi.getSettings` → `CompanySettings.slug`).
- Table gains a **Status column** (active/suspended badge) and a suspend/activate action per row (disabled on own row; suspended rows show "Reactivate").
- `CompanyUser` type gains `status`; new `useSuspendUser` / `useReactivateUser` hooks.

### Testing

- Update `company-users.service.spec.ts`: rename cases + suspend/reactivate (self-guard, last-admin guard, 409 already-suspended).
- Update e2e phase spec: `/company/users/invite` → `/company/users`; add suspend → sign-in-blocked assertion.
- Docs: `docs/07_API_ENDPOINT_DOCUMENTATION.md` (route + new endpoints), AGENTS.md current-state line.

## Out of scope

- Email sending, password-reset flow, name column on `users` (name is form-only).
