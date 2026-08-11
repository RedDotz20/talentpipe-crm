# Job Post Metadata (Type, Location, Setup) — Design

Date: 2026-08-11
Status: Approved

## Problem

Job posts on the candidate jobs page, public careers pages, and admin platform
jobs page only show title + company name. Recruiters cannot express employment
type (full-time / part-time / contract / intern), work location, or work setup
(on-site / hybrid / work-from-home), and candidates cannot see them.

## Data model

Three nullable columns added to both `job_postings` (per-company schema) and
`job_listings_index` (public schema — the source for all candidate-facing
reads):

| Column | Type | Values |
|--------|------|--------|
| `employment_type` | varchar(30) | `full-time` \| `part-time` \| `contract` \| `intern` |
| `location` | varchar(150) | free text, e.g. "Makati City" |
| `work_setup` | varchar(30) | `on-site` \| `hybrid` \| `work-from-home` |

- Nullable in DB; required in create forms (Zod). Legacy rows display
  "Not specified".
- Values stored as lowercase strings, not DB enums (matches existing
  status-as-varchar pattern).

## Migration

New drizzle migration dir `drizzle/<ts>_job_post_metadata/migration.sql`:

1. `ALTER TABLE public.job_listings_index ADD COLUMN ...` (3 columns)
2. `DO $$` loop over `template` + `company_%` schemas:
   `ALTER TABLE %I.job_postings ADD COLUMN ...`
3. `drizzle/template-schema.sql` updated for future companies.
4. `backend/src/database/schema.ts` updated.

## Backend changes

- `CreateJobPostingSchema` / `UpdateJobPostingSchema` (company module):
  new fields, required on create.
- `CreatePlatformJobSchema` / `UpdatePlatformJobSchema` (platform module):
  same.
- `JobPostingsService` and `PlatformDataService`: persist fields on
  create/update; `syncListing` (both) + `JobListingsIndexRepository.upsert`
  carry them into the index.
- No other repo changes — repos pass data objects through.

## Frontend changes

- Company `JobPostingForm` (create + edit): `Select` (type), `Select`
  (setup), `TextInput` (location) — required.
- Admin `JobsPage` modal: same three inputs; table gains a compact
  "Type · Location · Setup" cell.
- Candidate `JobSearchPage` cards + `JobDetailsView`: badge row
  (e.g. "Full-time · Makati City · On-site"), "Not specified" fallback.
- Public careers `JobListingPage` + `JobDetailPage`: same badge row.

## Testing

- Unit: `job-postings.service.spec.ts`, `platform-data.service.spec.ts` —
  create/update persist + sync metadata; bad enum values rejected.
- E2E: extend `phase13.e2e-spec.ts` — platform job with metadata
  round-trips through list + candidate search.
- Frontend: lint + build.

## Out of scope

- Search/filter by type/setup/location (display only).
