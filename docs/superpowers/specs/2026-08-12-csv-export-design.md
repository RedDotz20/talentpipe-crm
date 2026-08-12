# CSV Export for Admin Tables (M16)

**Date:** 2026-08-12
**Status:** Approved

## Goal

SuperAdmin and CompanyAdmin users can export any admin data table to a CSV file, stored locally.

## Scope

11 tables get an Export button:

**SuperAdmin:**
1. Companies (`/admin/companies`)
2. Users (`/admin/users`)
3. Applications (`/admin/applications`)
4. Jobs (`/admin/jobs`)
5. CompanyDetail Users tab
6. CompanyDetail Applications tab
7. CompanyDetail Interviews tab

**CompanyAdmin:**
8. Users (`/company/users`)
9. Job Postings (`/company/job-postings`)
10. Candidates (`/company/candidates`)
11. Interviews (`/company/interviews`)

**Excluded:** kanban pipeline board, dashboard summary (not tables).

## Semantics

- Active search + filters are respected.
- Pagination is ignored — ALL matching rows are exported.
- Sort is ignored — export uses default table order.

## Backend

### `shared/csv.helper.ts` (new)

- `toCsv(headers: string[], rows: Record<string, unknown>[])` → string.
- RFC 4180 escaping: `"` doubled; fields containing `,`/`"`/newline wrapped in quotes.
- `\r\n` line endings, UTF-8 BOM prefix (`\uFEFF`) for Excel.
- In-memory build; `ponytail:` switch to streaming if a table ever exceeds ~100k rows.

### Export variants (reuse list logic, drop pagination)

- SQL repos (companies, candidates, job-postings, interviews): add `findAllFiltered(query, schema)` — same `toWhere`/`toOrderBy` conditions, no `.limit/.offset`.
- Platform services (users/applications/jobs/interviews): add `exportX(filters, search)` — existing in-memory load + `inMemorySearch` + status filter, skip `sortAndPageInMemory`.
- Company users: plain `findAll()` exists; no filters on that page.

### Endpoints (9)

CompanyDetail tabs reuse the platform export endpoints with a `companyId` query param (the platform services already support company-scoped loading).

| Method/Path | Columns (display mirror) |
|---|---|
| `GET /platform/companies/export` | name, slug, plan, status, createdAt |
| `GET /platform/users/export?companyId=` | name, email, type, company, role, status, createdAt |
| `GET /platform/applications/export?companyId=` | candidate, company, job, stage, appliedAt, matchScore |
| `GET /platform/jobs/export?companyId=` | company, title, employmentType, location, workSetup, status, createdAt |
| `GET /platform/interviews/export?companyId=` | candidate, job, interviewer, scheduledAt, status |
| `GET /company/users/export` | email, role, status, createdAt |
| `GET /company/job-postings/export` | title, status, createdAt |
| `GET /company/candidates/export` | name, email, phone, createdAt |
| `GET /company/interviews/export` | candidate, job, date, interviewer, status |

- Same Zod query schema as the list endpoint (search + page filters; no page/pageSize/sortBy/sortDir).
- `@SkipEnvelope()` + `@Header('Content-Type', 'text/csv; charset=utf-8')` + `@Header('Content-Disposition', 'attachment; filename="{resource}-YYYY-MM-DD.csv"')` + `res.send(csv)` — the resume-download pattern (`resumes.controller.ts:37-55`).

## Frontend

### `shared/components/ExportCsvButton.tsx` (new)

- Download-icon button next to `ListControls`, disabled while in-flight.
- Props: `request: () => Promise<Blob>`, `filename`.
- Axios blob download (JWT interceptor applies), object URL + anchor click + revoke — `resumesApi.ts:18-24` pattern.

### Page wiring (11 pages)

Each page passes `listQuery.search` + its filter state as export query params.

## Testing

- Unit: `csv.helper.spec.ts` — escaping (quotes/commas/newlines), BOM, headers.
- E2e (`phase16.e2e-spec.ts`): platform users export, company job-postings export, company users export — content-type, disposition filename, BOM + header row, row count respects filters.

## Non-goals

- No new dependencies.
- No streaming.
- No export of kanban/dashboard.
