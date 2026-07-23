# Task 1 Report: Add public schema tables to Drizzle schema

## Status
DONE

## Commits
- `2128021b7985dd12b4f20fc16e24f3b3b7f64765` — `feat: add candidate_accounts, candidate_bookmarks, candidate_applications_index, job_listings_index tables`

## Test Verification Output

All 4 tables verified in PostgreSQL (`public` schema) via `\d`:

### `candidate_accounts`
- id (uuid PK, default gen_random_uuid())
- email (varchar 255, NOT NULL, UNIQUE)
- password_hash (varchar 255, NOT NULL)
- first_name (varchar 100, NOT NULL)
- last_name (varchar 100, NOT NULL)
- phone (varchar 50, nullable)
- created_at (timestamp, default now(), NOT NULL)
- Indexes: PK on id, UNIQUE on email
- Referenced by: candidate_bookmarks, candidate_applications_index

### `candidate_bookmarks`
- id (uuid PK), candidate_account_id (uuid NOT NULL FK), tenant_id (varchar 36), job_posting_id (uuid), job_title (varchar 255), company_name (varchar 255), created_at (timestamp)
- Indexes: `idx_candidate_bookmarks_account` on candidate_account_id, `idx_candidate_bookmarks_tenant_job` on (tenant_id, job_posting_id)

### `candidate_applications_index`
- id (uuid PK), candidate_account_id (uuid NOT NULL FK), tenant_id (varchar 36), job_posting_id (uuid), application_id (uuid), job_title (varchar 255), company_name (varchar 255), status (varchar 50), applied_at (timestamp)
- Indexes: `idx_candidate_applications_account` on candidate_account_id, `idx_candidate_applications_tenant_job` on (tenant_id, job_posting_id)

### `job_listings_index`
- id (uuid PK), tenant_id (varchar 36), job_posting_id (uuid NOT NULL UNIQUE), title (varchar 255), description (text nullable), company_name (varchar 255), company_slug (varchar 100), status (varchar 50), created_at (timestamp), updated_at (timestamp)
- Indexes: `idx_job_listings_status` on status, `idx_job_listings_company` on company_name, `idx_job_listings_tenant` on tenant_id

## Concerns
- The schema.ts file had unrelated changes from other tasks already present (these were not staged or committed as part of this task). Only schema.ts changes plus the drizzle migration files were committed.
- The working directory has many other uncommitted changes from pre-existing work — this is expected for a dev branch.
