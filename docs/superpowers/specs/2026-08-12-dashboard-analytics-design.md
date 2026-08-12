# M17 — Dashboard Analytics Design

Date: 2026-08-12
Status: Approved

## Problem

The CompanyAdmin dashboard (`/company/dashboard`) is three stat cards plus a plain
stage table. The SuperAdmin role has no dashboard at all — login redirects to the
tenants table. Both need useful charts built on data that already exists.

## Decisions (from brainstorming)

- SuperAdmin gets a **new `/admin` dashboard route**; login redirects there. Tenants
  table stays a separate page.
- Chart library: **`@mantine/charts` + `recharts`** (official Mantine wrapper,
  matches existing theme).
- Rejection rate uses a **name-based heuristic**: applications whose current stage
  name matches `rejected` (case-insensitive) over total applications. Works with the
  seeded `Applied → Screening → Interview → Offer → Hired → Rejected` stages.
- Time aggregation (day/week/month) is **pre-bucketed server-side** in a single
  payload: `day` = last 30 days, `week` = last 12 weeks, `month` = last 12 months.
  Frontend `SegmentedControl` slices pre-computed series — no refetch, no query
  params, no extra cache keys.

## Backend

### A. Company dashboard — extend `GET /dashboard/summary`

Single cached payload (existing Redis key + generation invalidation, same 60s TTL,
still one fetch). New fields on `DashboardSummary`:

| Field | Shape | Query |
|---|---|---|
| `applicationsOverTime` | `{ day: [{label,count}×30], week: [×12], month: [×12] }` | `date_trunc('day'/'week'/'month', applied_at)` with bounded `now() - interval` windows |
| `topJobsByApplications` | `[{title, count}]` top 8 | join applications→job_postings, group by title |
| `interviewStatusBreakdown` | `[{status, count}]` | count `interviews.status` (scheduled/completed/cancelled) |
| `jobsByStatus` | `[{status, count}]` | count `job_postings.status` (draft/open/closed) |
| `jobsByEmploymentType` | `[{type, count}]` | count `job_postings.employmentType` |
| `rejectionRate` | `{ rejected: number, total: number }` | stage-name heuristic |

`applicationsByStage` stays. Implementation in `DashboardRepository.findSummary()`
plus new repo methods.

### B. Platform dashboard — new `GET /platform/dashboard` (SuperAdmin only)

New `PlatformService.getDashboard()` following the existing schema-loop pattern
(`getStats`). Un-cached for now.

| Field | Shape | Query |
|---|---|---|
| stat cards | `companies, users, applications, jobs, activeCompanies, suspendedCompanies` | `companies` table + per-schema counts |
| `companiesOverTime` | `{ day, week, month }` | `date_trunc` on `companies.createdAt` |
| `applicationsPerCompany` | top 10 `[{companyName, count}]` | schema loop |
| `usersPerCompany` | top 10 `[{companyName, count}]` | schema loop |
| `jobsByStatusPerCompany` | top 10 `[{companyName, draft, open, closed}]` | new `UsageRepository.countJobsByStatus(schema)` |

## Frontend

### New `/admin` route

- `PlatformDashboardPage` under `features/admin/`.
- Nav item "Dashboard" (`IconLayoutDashboard`) first in the admin nav.
- Redirect updates to `/admin` (was `/admin/companies`): `SignInPage.tsx`,
  `routes/index.tsx`, `routes/_candidate.tsx`, `routes/auth/signin.tsx`,
  `routes/auth/company/signup.tsx`, `routes/company.tsx`.
- Charts: stat card row; Companies over time **AreaChart + SegmentedControl**;
  applications per company horizontal bar; users per company bar; tenant status
  donut; jobs by status per company stacked bar. Empty-series guard per chart.

### Company dashboard

- Keep 3 stat cards.
- Applications over time **AreaChart + SegmentedControl**.
- Stage distribution **donut** (replaces the plain table).
- Top jobs horizontal bar; interview status donut; jobs-by-status bar;
  jobs-by-employment-type donut; rejection-rate stat card.

## Testing

- Backend unit: extend `dashboard.repository.spec`/`dashboard.service.spec`,
  `platform.service.spec`, `usage.repository.spec`.
- E2e: new `backend/test/phase17.e2e-spec.ts` asserting both payload shapes.
- Frontend: `typecheck` + `lint` + `build` (no JS test framework in repo).

## Docs

- AGENTS.md milestone status → M17 Dashboard Analytics.
- `docs/07_API_ENDPOINT_DOCUMENTATION.md` — new/changed endpoint shapes.

## Skipped (deliberate)

- Platform dashboard Redis caching — add when tenant count grows.
- Richer seed data — charts look sparse on the 1-tenant demo DB; bump seed only if
  requested.
- Range selector beyond fixed 30d/12w/12m windows.
- `stage_type` column — rejection stays name-based until stage management exists.
