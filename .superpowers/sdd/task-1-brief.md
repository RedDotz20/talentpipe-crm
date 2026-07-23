# Task 1: Add public schema tables to Drizzle schema

## Context
This is the first task for adding candidate accounts. We need 4 new public-schema tables that live alongside the existing tables in `schema.ts`. These are NOT cloned into tenant schemas — they live only in `public`.

## Files
- Modify: `backend/src/database/schema.ts`

## Requirements
Append these 4 table definitions after the existing `notes` table at the end of `schema.ts`. Use the same drizzle-orm/pg-core imports already at the top of the file.

1. `candidate_accounts` — `id` (uuid pk defaultRandom), `email` (varchar 255 notNull unique), `passwordHash` (varchar 255 notNull), `firstName` (varchar 100 notNull), `lastName` (varchar 100 notNull), `phone` (varchar 50), `createdAt` (timestamp defaultNow notNull). Unique index on email.

2. `candidate_bookmarks` — `id` (uuid pk defaultRandom), `candidateAccountId` (uuid notNull FK → candidateAccounts.id), `tenantId` (varchar 36 notNull), `jobPostingId` (uuid notNull), `jobTitle` (varchar 255 notNull), `companyName` (varchar 255 notNull), `createdAt` (timestamp defaultNow notNull). Indexes on candidateAccountId, and on (tenantId, jobPostingId).

3. `candidate_applications_index` — `id` (uuid pk defaultRandom), `candidateAccountId` (uuid notNull FK → candidateAccounts.id), `tenantId` (varchar 36 notNull), `jobPostingId` (uuid notNull), `applicationId` (uuid notNull), `jobTitle` (varchar 255 notNull), `companyName` (varchar 255 notNull), `status` (varchar 50 notNull), `appliedAt` (timestamp defaultNow notNull). Indexes on candidateAccountId, and on (tenantId, jobPostingId).

4. `job_listings_index` — `id` (uuid pk defaultRandom), `tenantId` (varchar 36 notNull), `jobPostingId` (uuid notNull unique), `title` (varchar 255 notNull), `description` (text), `companyName` (varchar 255 notNull), `companySlug` (varchar 100 notNull), `status` (varchar 50 notNull), `createdAt` (timestamp defaultNow notNull), `updatedAt` (timestamp defaultNow notNull). Indexes on status, companyName, tenantId.

Table name strings should be snake_case plural as shown. Follow the exact naming pattern used by existing tables (e.g., `'candidate_accounts'` not `'candidateAccount'`).

## Deliverables
1. Modified `backend/src/database/schema.ts` with the 4 new table definitions appended
2. Run `npx drizzle-kit generate && npx drizzle-kit migrate` to create the migration
3. Commit with message: `feat: add candidate_accounts, candidate_bookmarks, candidate_applications_index, job_listings_index tables`

## Report file
Write your report to `.superpowers/sdd/task-1-report.md` containing:
- Status (DONE / NEEDS_CONTEXT / BLOCKED)
- Commits made (full SHAs)
- Test verification output
- Any concerns
