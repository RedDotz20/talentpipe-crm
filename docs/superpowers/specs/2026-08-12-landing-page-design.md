# Landing Page + Public Jobs Listing — Design (M18)

Date: 2026-08-12 · Status: approved

## Goal

Unauthenticated visitors hitting `/` see a marketing landing page instead of being
redirected to `/auth/signin`. Hero CTAs link to sign-in and to a new public,
platform-wide jobs listing page.

## Routing

`frontend/src/routes/index.tsx`: `beforeLoad` redirects **only authenticated** users
by role (Candidate → `/dashboard`, SuperAdmin → `/admin/dashboard`, else →
`/company/dashboard`). Unauthenticated → renders `LandingPage`.

## Landing page

`frontend/src/features/landing/LandingPage.tsx` — static Mantine page, no data fetching:

- Header: "TalentPipe" wordmark + anchors (Browse Jobs `/jobs`, Sign in `/auth/signin`,
  Register `/auth/signup`, For companies `/auth/company/signup` — mirrors signin page links)
- Hero: title + tagline + two CTAs: "Browse open positions" (primary → `/jobs`),
  "Sign in" (secondary → `/auth/signin`)
- Features grid (3×2 cards, real system capabilities): Job postings, Pipeline kanban,
  Resume + skill match, Interviews & feedback, Analytics dashboards, Multi-company + CSV export
- Minimal footer

## Public jobs listing (new)

Backend:
- `PublicCareersService.listAll(query)` → `JobListingsIndexRepository.findAll()` (already
  filters `status='open'` + active companies), mapped to `PublicJobListing` **including**
  `employmentType/location/workSetup` (per-company mapping drops them; frontend type already has them)
- New `public-jobs.controller.ts`: `@Controller('public/jobs')` + `GET` with `ListQuerySchema`
  + employmentType/workSetup. No conflict with `public/:companySlug/jobs` (segment count).

Frontend:
- `routes/jobs.tsx` (new, no auth guard) → `JobListingPage` with optional `companySlug`
- `publicCareersApi.getAllJobs(params)`; `usePublicJobs` branches on slug presence
- Card detail links use `job.companySlug` (present in both modes) →
  existing `/careers/$companySlug/jobs/$jobId` public detail (apply → signin redirect already works)

## Testing

- Extend `public-careers.service.spec.ts` (listAll mapping)
- New `backend/test/phase18.e2e-spec.ts`: `GET /public/jobs` lists open jobs across
  companies; suspended-company jobs excluded; auth NOT required
- Frontend: oxlint + `npm run build`
- Update AGENTS.md M18 status; commit tag `feat(m18): ...`

## Skipped (YAGNI)

Separate public layout route group, multi-page marketing site, changes to per-company
listing UI beyond the link fix.
