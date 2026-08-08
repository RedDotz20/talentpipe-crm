# Phase 5 Public Careers Design

**Date:** 2026-08-05
**Branch:** `feat/phase5-public-careers`
**Status:** Approved for implementation planning

## Goal

Deliver company-specific public careers browsing while ensuring that every application belongs to an authenticated candidate account. Public visitors can discover open jobs without authentication, but applying requires sign-in or candidate account creation. Candidate profile skills and resume storage remain part of the authenticated candidate experience delivered in Phase 4.

## Scope

### In scope

- Public company-specific job listing endpoint.
- Public company-specific job detail endpoint.
- Public careers listing and detail pages.
- Safe redirect from Apply to unified sign-in for anonymous visitors.
- Return to the original job after successful candidate sign-in or signup.
- Use of the existing authenticated candidate application endpoint for submissions.
- Backend and frontend tests for company filtering, visibility, authentication, and navigation.
- Updates to all affected documentation under `docs/` so Phase 0-4 implementation status and Phase 5 behavior match the codebase.

### Out of scope

- Anonymous applications.
- Anonymous resume upload, honeypot fields, or public multipart submission.
- Public application rate limiting.
- Redis provider or Redis integration. These belong to Phase 6.
- Skill-based job ranking or filtering. Phase 5 lists all open jobs only.
- New candidate profile, skill, or resume behavior beyond the existing Phase 4 implementation.

## Product Behavior

1. A visitor opens a company careers URL and sees only that company's open jobs.
2. Draft and closed jobs are not displayed publicly and behave as not found when requested directly.
3. A visitor can open a public job detail page without authentication.
4. An anonymous visitor selecting Apply is redirected to unified `/auth/signin` with a safe return path.
5. The sign-in page continues to offer candidate signup. A successful candidate sign-in or signup returns to the original job detail page.
6. An authenticated Candidate uses the existing candidate apply form and `POST /candidate/jobs/:companyId/:jobId/apply` endpoint.
7. A non-Candidate authenticated user cannot submit an application and receives a clear candidate-account-required state.
8. Applications and resumes are never created for an anonymous visitor.

## Backend Design

### Public careers module

Add `backend/src/modules/public-careers/` with module, controller, service, and DTO/type files as needed.

Endpoints:

```text
GET /api/public/:companySlug/jobs
GET /api/public/:companySlug/jobs/:id
```

Both endpoints are unauthenticated read operations and return the existing response envelope:

```json
{ "data": {}, "message": "OK" }
```

### Listing flow

1. Resolve `companySlug` with the public `CompanyRepository`.
2. Return `404 NOT_FOUND` when the company does not exist.
3. Query `JobListingsIndexRepository` for rows matching the company and `status = 'open'`.
4. Return public listing fields only: job ID, company ID, company slug, company name, title, description, and timestamps.

The listing query is company-specific even though the source index is public. It must never return another company's jobs.

### Detail flow

1. Resolve the company from the slug.
2. Find the indexed job by company ID and job ID.
3. Return `404 NOT_FOUND` when the job is absent, draft, or closed.
4. Read required skill IDs from the explicit company schema through the existing repository pattern.
5. Resolve skill names and categories from the public shared taxonomy.
6. Return the public job detail, including the company ID required by the existing candidate apply endpoint.

All database access remains inside repositories. The public module may use a repository's explicit public or company-schema operation, but it must not access Drizzle directly.

### Application boundary

Do not add `POST /public/:companySlug/jobs/:id/apply`. The existing candidate endpoint remains the only Phase 5 application write path:

```text
POST /api/candidate/jobs/:companyId/:jobId/apply
```

It continues to require both JWT authentication and the Candidate role. It uses profile skills by default, accepts an optional skill override, computes the match score, creates the company candidate/application records, and writes the cross-company application index.

### Job index consistency

The existing job-posting publish, update, close, and delete flows remain responsible for synchronizing `job_listings_index`. Phase 5 must verify that:

- Publishing creates or updates an open index row.
- Closing makes the row non-public.
- Deleting removes the index row.
- Public listing and detail never fall back to draft or closed company rows.

## Frontend Design

### Routes

Add public route files matching the existing TanStack Router conventions:

```text
/careers/$companySlug/jobs
/careers/$companySlug/jobs/$jobId
```

Add a public careers feature folder under `frontend/src/features/public-careers/` containing the listing page, detail page, apply action, and any focused shared components required by those pages.

### Public listing page

- Fetches the company-specific public jobs endpoint.
- Displays company identity, title, description, and open status.
- Links each listing to the company-specific detail route.
- Handles loading, empty, unknown-company, and request-error states.

### Public detail page

- Fetches the company-specific public job detail endpoint.
- Displays title, company, description, required skill badges, and application action.
- Handles not found and request-error states.

### Apply navigation

- No token: navigate to `/auth/signin?returnTo=<encoded-detail-path>`.
- Candidate token: render or open the existing authenticated candidate apply form and submit through the existing candidate hook.
- Non-Candidate token: display that a Candidate account is required and do not call the candidate apply API.

The `returnTo` value must be validated as an internal same-origin `/careers/...` path before it is used. When no return path exists, existing role-based post-auth redirects remain unchanged.

## Error and Security Rules

- Unknown company slug: `404` with `NOT_FOUND`.
- Unknown, draft, or closed public job: `404` with `NOT_FOUND`.
- Public responses never include password hashes, internal user data, candidate records, application records, or private storage keys.
- Company selection for public reads comes from the route slug and is resolved server-side.
- Candidate application company/job references are validated through the public job index and explicit company-schema lookup.
- Anonymous requests cannot create candidates, applications, resumes, or profile records.
- Arbitrary external `returnTo` URLs are rejected or ignored.
- Phase 5 does not claim rate limiting; Redis and public write protection are Phase 6 requirements.

## Testing Strategy

### Backend unit tests

- Listing returns only open jobs for the requested company.
- Jobs from another company are excluded.
- Detail returns required skill metadata for an open job.
- Unknown company, unknown job, draft job, and closed job produce not-found behavior.
- Job index synchronization remains correct for publish, close, and delete.
- Candidate apply remains unavailable to anonymous and non-Candidate users.

### Backend HTTP or integration tests

- Public GET routes work without a JWT.
- Public routes do not expose draft or closed postings.
- Candidate apply still requires authentication and the Candidate role.
- Candidate application creates the expected company and public index records.

### Frontend verification

- Public listing and detail queries use company/job-specific query keys.
- Anonymous Apply preserves a valid internal return path.
- Candidate Apply uses the existing authenticated mutation.
- Non-Candidate and error states render without submitting data.
- Frontend lint and production build pass.

## Documentation Updates

Before Phase 5 implementation code is started, update the affected documentation files under `docs/`:

- `00_PROJECT_INSTRUCTIONS.md`: current milestone status, Phase 4 manual skills/storage model, and account-required apply behavior.
- `01_TALENTPIPE_PRD_SRS.md`: remove anonymous apply as a supported requirement and describe authenticated candidate application.
- `03_RECRUITMENT_ATS_ARCHITECTURE.md`: make the public careers module read-only and keep application writes in the candidate module.
- `04_ERD_DIAGRAM.md`: reflect candidate-account resume metadata and the current candidate-to-company snapshot relationship.
- `05_DATA_ISOLATION_STRATEGY.md`: document public company-slug reads and candidate-authenticated cross-company writes where applicable.
- `06_ROLE_INTERACTIONS.md`: clarify that public browsing is unauthenticated but applying requires the Candidate role.
- `07_API_ENDPOINT_DOCUMENTATION.md`: document the two public GET endpoints and remove the anonymous POST apply contract.
- `08_FRONTEND_COMPONENT_STRUCTURE.md`: document public careers routes and the safe sign-in return flow.
- `09_IMPLEMENTATION_GUIDE.md`: mark implemented Phase 0-4 behavior accurately and replace the old Phase 5/Redis steps with the approved Phase 5 plan.
- `00b_LOCAL_DEV_BOOTSTRAP.md`: update migration/template and verification notes for the current Phase 4 schema.
- `DATA_MODEL_DEFINITION.md`: remove stale company resume/parsing assumptions and document current candidate profile resume storage.

The documentation pass must not introduce Phase 6 Redis work or restore removed resume parsing behavior.

## Completion Criteria

Phase 5 is complete when:

- Public company-specific listing and detail endpoints work for open jobs.
- Draft and closed jobs are not publicly visible.
- Public careers pages work on desktop and mobile layouts.
- Anonymous Apply redirects to sign-in and safely returns to the job.
- Authenticated Candidates can apply through the existing candidate flow.
- Anonymous and non-Candidate application attempts are blocked.
- Backend and frontend verification commands pass.
- All affected documentation under `docs/` matches the implemented behavior.
- The Phase 5 changes are committed on `feat/phase5-public-careers` and remain ready for review before merging to `dev`.
