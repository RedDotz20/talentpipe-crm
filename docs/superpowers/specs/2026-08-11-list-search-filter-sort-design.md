# M15 — Backend-Driven Search, Filter, Sort & Pagination

**Date:** 2026-08-11
**Status:** Approved design

## Problem

Candidate-facing pages (job search, applications, bookmarks) have no search/filter/sort. The only existing search is a naive in-memory `.includes()` on `GET /candidate/jobs` after fetching all open jobs. No list endpoint in the backend supports limit/offset. SuperAdmin pages filter/sort/paginate entirely client-side after fetch-all.

## Goal

Backend-driven search, filter, sorting and server-side pagination on every list page across all four roles. One shared contract and one shared implementation path.

## Non-Goals

- URL query-param sync (local state only, consistent with existing pages)
- New columns or migrations (all needed columns already exist)
- Text-search indexes (ilike `%term%` can't use btree anyway; pg_trgm is YAGNI at this scale)
- Client-side filtering anywhere new

## Architecture

### 1. Shared DTO — `backend/src/common/dto/list-query.dto.ts`

```ts
export const ListQuerySchema = z.object({
  search:   z.string().trim().max(100).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sortBy:   z.string().optional(),
  sortDir:  z.enum(['asc', 'desc']).default('desc'),
});
export type ListQueryDto = z.infer<typeof ListQuerySchema>;
```

Applied via the existing `ZodValidationPipe` on `@Query()` in every upgraded controller.

### 2. Shared repo helper — `backend/src/repositories/list-query.helper.ts`

One function applied by single-schema repository methods:

- `ilike` search (`%term%`) on the searchable columns configured for that method
- `orderBy` from a per-method whitelist map `{ [sortBy]: drizzleColumn }` — unknown `sortBy` falls back to the method's default. **Never** raw user strings into `orderBy` (SQL-injection guard)
- `limit/offset` from `page`/`pageSize`
- `count()` query sharing the same `where`
- Returns `{ data, total }`

Controllers return `{ data, total, page, pageSize }`.

### 3. Where the work happens

| List type | Implementation location |
|---|---|
| Company-scoped (single schema) | SQL in repository via helper |
| Platform (aggregates N schemas, merged users) | In-memory in the service on the merged array (per-company loop stays) — still backend-driven |
| Pipeline board / InterviewScheduler `GET /applications` | Search + stage/job filters, **no pagination** (kanban needs full board) — explicit exception |

### 4. Suspended-company exclusion (candidate jobs)

The JS post-filter (`jobs.filter(valid && !suspended)`) moves into SQL — `notInArray(companyId, subquery on companies where status = 'suspended')` — so pagination `total` is correct.

## Endpoint Matrix

| Endpoint | Search | Filters | Sortable | Default |
|---|---|---|---|---|
| `GET /candidate/jobs` | title, company, location | employmentType, workSetup | createdAt, title, company | createdAt desc |
| `GET /candidate/applications` | jobTitle, company | status (stage) | appliedAt, jobTitle, company | appliedAt desc |
| `GET /candidate/bookmarks` | jobTitle, company | — | createdAt, jobTitle, company | createdAt desc |
| `GET /job-postings` | title | status | createdAt, title | createdAt desc |
| `GET /candidates` | name, email | — | name, createdAt | createdAt desc |
| `GET /interviews` | candidate, jobTitle | status, assignedToMe | scheduledAt, candidate | scheduledAt asc |
| `GET /applications` (company) | candidate, jobTitle | stageId, jobPostingId, status | appliedAt, candidate | appliedAt desc |
| `GET /platform/companies` | name, slug | status | name, createdAt | createdAt desc |
| `GET /platform/users` | name, email | type, companyId, role | name, createdAt | createdAt desc |
| `GET /platform/applications` | jobTitle, company, candidate | companyId, status | appliedAt, jobTitle | appliedAt desc |
| `GET /platform/jobs` | title, company | companyId, status | createdAt, title | createdAt desc |
| `GET /platform/interviews` | candidate, jobTitle, company | companyId, status | scheduledAt | scheduledAt asc |
| `GET /public/:slug/jobs` | title | employmentType, workSetup | createdAt, title | createdAt desc |

## Frontend

### New shared pieces

- `frontend/src/shared/hooks/useListQuery.ts` — state hook: `{ search, filters, sortBy, sortDir, page }`; resets `page` to 1 on any control change
- `frontend/src/shared/components/ListControls.tsx` — debounced search `TextInput` (Mantine `useDebouncedValue`), optional filter `Select`s, `Select` for "Sort by", direction toggle. Props: `searchPlaceholder`, `filters[]`, `sortOptions[]`. Pagination remains the existing per-page Mantine `Pagination` pattern

### Hook changes

Every list hook gains a `params` object arg; query keys include the params; responses unwrap `{ data, total, page, pageSize }` and hooks expose `total`. Invalidations keep the param-less prefix key (existing pattern).

### Pages

- Candidate: `JobSearchPage` (controls above card grid), `ApplicationsPage` (above table), `BookmarksPage` (above cards)
- Company: `JobPostingList`, `CandidateList`, `InterviewListView`, `PipelineBoard` (search + stage/job filters only, no pagination)
- Admin: `CompaniesPage`, `UsersPage`, `ApplicationsPage`, `JobsPage` — remove client-side `filtered`/`slice`; server-driven `Pagination` via `total`. No admin `InterviewsPage` exists; `CompanyDetailPage` renders interviews via `usePlatformInterviews({ companyId })` — it keeps passing `companyId` plus `pageSize: 50` and unwraps the new envelope (no pagination UI there)
- Public careers: `JobListingPage` (controls + pagination)

Breaking shape change is contained: all consumers updated in the same milestone.

## Testing

**Unit:** `list-query.helper.spec.ts` (defaults, clamping, unknown sortBy fallback, ilike, count parity); candidate service wiring; platform merged-list pagination; per-endpoint whitelists.

**E2E (`phase14.e2e-spec.ts`):** per role — search match, filter, sort asc/desc, pagination slice + `total`, empty results, pageSize cap, injection attempt (`sortBy=1;DROP...` falls back cleanly), suspended-company exclusion with pagination totals.

## Sequencing

1. Shared DTO + repo helper
2. Candidate endpoints (jobs / applications / bookmarks)
3. Company endpoints (job-postings / candidates / interviews / applications)
4. Platform endpoints + public careers
5. Frontend `useListQuery` + `ListControls`
6. Candidate pages → company pages → admin pages → public careers
7. Unit tests + e2e + lint / typecheck / build
