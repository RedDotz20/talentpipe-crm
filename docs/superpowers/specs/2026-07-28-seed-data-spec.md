# Seed Data — SuperAdmin, Sample Company & Candidate

## Overview

Create a standalone seed script (`backend/scripts/seed.ts`) that populates the database with three default accounts:

- **SuperAdmin** — platform-level admin (new `super_admins` table, public schema)
- **CompanyAdmin** — sample company with default pipeline stages (replicates company signup flow)
- **Candidate** — global candidate account (inserts into existing `candidate_accounts` table)

## What Needs to Change

### 1. New Migration — `super_admins` Table

Add a `super_admins` table to the **public schema** with the same shape as `candidate_accounts`:

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `email` | `varchar(255)` | NOT NULL, UNIQUE |
| `password_hash` | `varchar(255)` | NOT NULL |
| `name` | `varchar(100)` | nullable |
| `created_at` | `timestamp` | NOT NULL, default `now()` |

No foreign keys to company tables.

The template schema (used to clone per-company tables on signup) does **not** need this table — SuperAdmin is platform-level, not company-scoped.

### 2. Seed Script — `backend/scripts/seed.ts`

A standalone script (not a NestJS module) that:

1. Connects directly to PostgreSQL using a `pg` Pool with the same `DATABASE_URL`
2. Checks for existing records (idempotent — skips if already seeded)
3. Hashes passwords using argon2 (same `hashPassword` utility from `src/shared/password.ts` — or inline since it's one function)
4. Creates accounts in order:

   **a. SuperAdmin**
   - Table: `public.super_admins`
   - Values: `email = 'superadmin@talentpipe.com'`, `password = 'SuperAdmin123!'`, `name = 'Super Admin'`

   **b. Company Company + CompanyAdmin**
   - Replicates the signup logic from `AuthService.signup()`:
     1. Generate company UUID
     2. Insert into `public.companies` (name: `'Acme Corp'`, slug: `'acme-corp'`)
     3. `CREATE SCHEMA "company_<id>"`
     4. Clone template tables (`CREATE TABLE ... LIKE template."<table>" INCLUDING ALL`)
     5. Insert CompanyAdmin user into company's `users` table (email: `'admin@acme.com'`, role: `'CompanyAdmin'`, password: `'Admin123!'`)
     6. Insert 6 default pipeline stages
     7. Insert into `public.user_emails` for login lookup
     8. Create a refresh token entry so the admin can log in immediately

   **c. Candidate**
   - Table: `public.candidate_accounts`
   - Values: `email = 'candidate@test.com'`, `password = 'Candidate123!'`, `first_name = 'Jane'`, `last_name = 'Doe'`

5. Logs what it created (or skips if already exists)

### 3. `backend/package.json` — Add Script

```json
"seed": "npx ts-node -r tsconfig-paths/register scripts/seed.ts"
```

### 4. Drizzle Schema — Add `super_admins` Table

Add the table definition to `backend/src/database/schema.ts` in the public schema section, following the same pattern as `candidateAccounts`.

### 5. Optional: Seed Config File

Inline defaults in the script. If the file grows complex later, extract to `backend/scripts/seed-config.ts`.

## Default Values

| Account | Email | Password | Extra |
|---------|-------|----------|-------|
| SuperAdmin | `superadmin@talentpipe.com` | `SuperAdmin123!` | name: `Super Admin` |
| Company Admin | `admin@acme.com` | `Admin123!` | company: `Acme Corp`, slug: `acme-corp` |
| Candidate | `candidate@test.com` | `Candidate123!` | first: `Jane`, last: `Doe` |

## Script Behavior

- **Idempotent:** Check by email before inserting. If any account already exists, skip it with a log message.
- **Fast:** Single connection, no server needed.
- **Safe:** Runs inside a transaction where possible. Uses the same argon2 + pg dependencies already in `package.json`.

## Files Changed

| File | Change |
|------|--------|
| `backend/src/database/schema.ts` | Add `superAdmins` table definition |
| `backend/drizzle/<timestamp>_seed_super_admins.ts` | New migration for `super_admins` |
| `backend/scripts/seed.ts` | New — seed script |
| `backend/package.json` | Add `"seed"` script |

## Non-Goals

- No new API endpoints (SuperAdmin has no signup)
- No frontend changes
- No changes to existing auth flow
- No changes to template schema
