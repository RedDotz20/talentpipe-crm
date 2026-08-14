# Local Dev Bootstrap & Daily Runbook

> **Read this first.** Step-by-step instructions to go from a fresh checkout to a working backend with login-able accounts. Use it whenever you're not sure of the next command, after pulling, or when something "doesn't work anymore".

---

## One-shot bootstrap (fresh machine / fresh DB)

Run these in order from the **project root** (`talentpipe-crm/`). Each block has a *check* line so you know it succeeded before moving on.

### 1. Start infra (postgres + redis + minio)

```sh
docker compose up -d
```

**Check:**
```sh
docker ps
# Expect 3 containers: talentpipe-crm-postgres-1, talentpipe-crm-redis-1, talentpipe-crm-minio-1
# All STATUS = Up
```

If any container exits or restarts, check `docker compose logs <service>` before continuing.

---

### 2. Verify Postgres is reachable

```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "SELECT current_database();"
```

**Check:** returns `talentpipe`. If it says "database does not exist", the postgres container didn't init — wipe the volume: `docker compose down -v && docker compose up -d`.

---

### 3. Apply Drizzle migrations (creates `public` schema tables)

The migrations live in `backend/drizzle/`. Run them in chronological order. **Skip any that error with `already exists` — re-runs are safe.**

```sh
# First migration — creates 16 public tables (users, user_emails, companies, etc.)
Get-Content backend/drizzle/20260722095156_bright_iron_fist/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\dt public.*"
```
Must list at least: `users`, `user_emails`, `companies`, `refresh_tokens`, `super_admins`.

> **PowerShell note:** use `Get-Content ... | docker exec -i ...`. In bash/zsh use `docker exec -i ... psql ... < file.sql`.

---

### 4. Apply the second & third migrations

```sh
Get-Content backend/drizzle/20260723191416_fresh_blindfold/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe

Get-Content backend/drizzle/20260727163000_smooth_spitfire/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\dt public.*"
```
Now expect **21 tables** including `candidate_accounts`, `super_admins`, `job_listings_index`.

---

### 5. Apply the candidate-skills migration

Apply this migration before the Phase 4 redesign migration so a fresh database
replays the schema changes chronologically.

```sh
Get-Content backend/drizzle/20260803085856_redundant_tyrannus/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\d public.candidate_skills"
# Expect the unique_candidate_skill index and candidate-account/skill foreign keys.
```

The public schema now has **22 tables**, including `candidate_skills`.

### 6. Apply the Phase 4 candidate-profile migration

The current Phase 4 redesign stores resume metadata on `public.candidate_accounts`, links company candidates to accounts, stores application snapshots, and removes company `resumes`/`resume_skills` tables. Apply it after the public migrations and before recreating the template:

```sh
Get-Content backend/drizzle/20260804101500_candidate_profile_redesign/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:** existing company schemas and `template` no longer contain `resumes` or `resume_skills`; `public.candidate_accounts` contains `resume_file_url` and `resume_uploaded_at`.

### 7. Apply the candidate application integrity migration

This migration adds the nullable `cover_letter` column to the public, template, and existing company application tables. It reconciles duplicate company candidate links and duplicate candidate/job index rows (retaining the earliest application) before creating the database-enforced unique indexes.

```sh
Get-Content backend/drizzle/20260805090000_candidate_application_integrity/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\d public.applications"
# Expect a nullable cover_letter column.
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\d public.candidate_applications_index"
# Expect the unique_candidate_application unique index.
```

### 8. Apply the company status migration

Adds `public.companies.status` (`varchar(20)`, default `active`) for platform-level suspend/reactivate (Phase 9). Existing companies default to `active`.

```sh
Get-Content backend/drizzle/20260806191320_superb_king_cobra/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "SELECT id, slug, status FROM public.companies;"
# Expect every company to have status = 'active'.
```

### 8b. Apply the interviews scheduled_at timezone migration

Converts `interviews.scheduled_at` from a naive timestamp to `TIMESTAMP WITH TIME ZONE` in `public`, `template`, and all existing company schemas.

```sh
Get-Content backend/drizzle/20260807090000_scheduled_at_timezone/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\d public.interviews"
# Expect scheduled_at as timestamp with time zone.
```

### 8c. Apply the per-user suspension migration

Adds `users.status` (`varchar(20)`, default `active`) to `public.users`, the `template` schema, and every existing `company_<id>.users` (M11 — SuperAdmin suspend/reactivate of individual company users).

```sh
Get-Content backend/drizzle/20260808090000_platform_user_suspend/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\d public.users"
# Expect a status column with default 'active'.
```

### 8d. Apply the platform account cascades migration

Re-creates FK constraints with delete behavior for platform account management (M11): `candidate_bookmarks → candidate_accounts` (CASCADE), `interview_feedbacks → interviews` (CASCADE), `interviews → applications` (CASCADE), `notes → applications` (CASCADE), `notes → users` (CASCADE), `job_postings → users` (SET NULL) — in `public`, `template`, and every `company_%` schema.

```sh
Get-Content backend/drizzle/20260808100000_platform_account_cascades/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\d public.interviews"
# Expect applications FK with ON DELETE CASCADE.
```

### 9. Apply the `template` schema (used by company signup)

The template schema is what every new company's `company_<uuid>` schema gets cloned from at signup time. It's a hand-written SQL file.

```sh
Get-Content backend/drizzle/template-schema.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\dn"
```
Expect: `public`, `template`. Then:
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\dt template.*"
```
Expect **9 tables** (`users`, `job_postings`, `candidates`, `pipeline_stages`, `applications`, `job_required_skills`, `interviews`, `interview_feedbacks`, `notes`).
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\d template.applications"
```
Expect the nullable `cover_letter` column inherited from `public.applications`.

---

### 10. Seed the accounts + demo data

```sh
cd backend
npm run seed
```

The seed is idempotent — safe to re-run. It creates:
- **2 SuperAdmins**, **5 companies** (each with 7 users: CompanyAdmin + 2 HiringManagers + 2 Interviewers + 2 Recruiters), **10 candidate accounts**, plus the skills taxonomy and permission presets.
- **Operational demo data per company:** 6 job postings (5 open, 1 closed) with required skills and metadata, 10 company candidates with 10 applications spread across all pipeline stages, and 3 interviews (2 upcoming, 1 past with feedback) — all synced into `job_listings_index` / `candidate_applications_index`.

**Expected output (abbreviated):**
```
[OK] SuperAdmin created: superadmin@talentpipe.com
[OK] SuperAdmin created: platform@talentpipe.com
[OK] Candidate created: candidate1@test.com
...
[OK] Company created: Acme Corp (admin@acme.com, tenant: <uuid>) — 7 users, 6 jobs, 10 candidates, 10 applications, 3 interviews
[OK] Company created: Globex (admin@globex.com, tenant: <uuid>) — ...
... (5 companies total)
[OK] Skills seeded: 42 total
[OK] Permission presets seeded: 4 total
Seed complete.
```

**Check** (returns 1 row for each):
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe \
  -c "SELECT email FROM public.super_admins; SELECT email FROM public.user_emails; SELECT email FROM public.candidate_accounts;"
```

Verify the same column exists on at least one existing company schema:
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "SELECT c.table_schema, c.table_name, c.column_name, c.is_nullable FROM information_schema.columns c WHERE c.table_schema = (SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'company_%' ORDER BY schema_name LIMIT 1) AND c.table_name = 'applications' AND c.column_name = 'cover_letter';"
```
**Check:** returns one row for the discovered `company_<uuid>.applications` table with `column_name = cover_letter`.

---

### 11. Start the backend

```sh
cd backend
npm run start:dev
```

**Check:** the log should print something like `Nest application successfully started` and `Mapped {/api/health, GET}`. Then from another terminal:
```sh
curl http://localhost:3000/api/health
# → {"data":{"status":"ok","timestamp":"..."},"message":"OK"}
```

If you see `relation "users" does not exist` or any DrizzleQueryError on login → you skipped step 3 through 9.

---

### 12. Start the frontend

```sh
cd frontend
npm run dev
```

**Check:** open `http://localhost:5173` in a browser. You should see the login page.

---

### 13. Log in with a sample account

The seed script creates 47 accounts following this convention (`<slug>` = company slug):

| Role | Emails | Password |
|------|--------|----------|
| SuperAdmin (platform-wide) ×2 | `superadmin@talentpipe.com`, `platform@talentpipe.com` | `SuperAdmin123!` |
| CompanyAdmin ×5 (one per company) | `admin@<slug>.com` (Acme keeps `admin@acme.com`) | `Admin123!` |
| HiringManager ×2 per company | `hm1@<slug>.com`, `hm2@<slug>.com` | `HiringManager123!` |
| Interviewer ×2 per company | `iv1@<slug>.com`, `iv2@<slug>.com` | `Interviewer123!` |
| Recruiter ×2 per company | `rec1@<slug>.com`, `rec2@<slug>.com` | `Recruiter123!` |
| Candidate ×10 (cross-company) | `candidate1@test.com` … `candidate10@test.com` | `Candidate123!` |

Companies: **Acme Corp** (`acme-corp`), **Globex** (`globex`), **Initech** (`initech`), **Umbrella Corp** (`umbrella-corp`), **Stark Industries** (`stark-industries`).

Login at `http://localhost:5173/auth/signin`. SuperAdmin and CompanyAdmin land in their company dashboard; Candidate lands in the candidate portal.

**Sanity test from curl:**
```sh
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"Admin123!"}'
# → {"data":{"accessToken":"eyJ...","refreshToken":"eyJ..."},"message":"Signed in"}
```

---

## Daily loop (everything already running)

After the first bootstrap, your normal day is just:

```sh
# 1. Make sure infra is up
docker compose up -d

# 2. Start backend (auto-reloads on file changes)
cd backend && npm run start:dev

# 3. Start frontend in another terminal
cd frontend && npm run dev

# 4. Open http://localhost:5173
```

If login suddenly breaks with `relation "..." does not exist` — the Postgres volume was wiped. Re-run steps 3 → 9.

---

## Nuke & restart (DB is broken, schema drift, weird state)

When in doubt, **drop everything** and re-bootstrap:

```sh
# 1. Stop infra and delete the postgres volume
docker compose down -v

# 2. Restart infra
docker compose up -d

# 3. Re-run steps 3 → 9 above (migrations + template), then seed with step 10
```

This is the fastest way to a known-good state. Drizzle migrations and the seed script are all idempotent (use `IF NOT EXISTS` / skip-on-existing checks).

---

## Creating a new company

Two ways:

**A. Via API** (mirrors what frontend signup does):
```sh
curl -X POST http://localhost:3000/api/auth/company/signup \
  -H "Content-Type: application/json" \
  -d '{
    "companyName":"Globex",
    "slug":"globex",
    "email":"admin@globex.com",
    "password":"SomePass123!"
  }'
```
Note: `POST /api/auth/signup` (without `company/`) is the **candidate** signup — body is `email`, `password`, `firstName`, `lastName`.

**B. By editing `backend/scripts/seed.ts`** — add another `seedCompany(...)` block. Use this when you want a pre-baked company for manual testing.

After signup, verify the new schema exists:
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\dn"
# Expect: company_<uuid>
```

---

## Editing the schema (the most common gotcha)

**The single source of truth is `backend/src/database/schema.ts`.** The `backend/drizzle/*/migration.sql` files are generated outputs. If you edit the schema and don't regenerate + reapply the migration, the running Postgres will be **out of sync** with what the code expects — and you'll get `column "..." does not exist` or `relation "..." does not exist` errors at runtime even though the backend compiles cleanly.

### Decision tree — what did I edit?

| You edited... | What you must run | Company schemas affected? |
|---------------|-------------------|--------------------------|
| `backend/src/database/schema.ts` (public table like `users`, `companies`) | Regenerate migration + apply to `public` | **No** — existing companies already have their own cloned copy |
| `backend/src/database/schema.ts` (company table like `job_postings`, `applications`) | Regenerate migration + apply to `public` **AND** update `template.*` | **Yes for NEW companies only** — existing companies are frozen at signup |
| `backend/src/database/schema.ts` (company table) AND there are existing companies | Same as above, **plus** migrate existing `company_<uuid>` schemas (see §C below) | **Yes for ALL companies** |
| `backend/drizzle/template-schema.sql` only | Apply it directly to DB | **Yes for NEW companies only** |

### A. Regenerate the Drizzle migration (after editing schema.ts)

```sh
cd backend
npx drizzle-kit generate
```

This creates a new directory under `backend/drizzle/<timestamp>_<name>/` containing `migration.sql` and `snapshot.json`.

> **Naming tip:** give it a descriptive name: `npx drizzle-kit generate --name add_interview_feedback_score`.

### B. Apply the new migration to the running DB

```sh
# (Replace <timestamp>_<name> with the directory drizzle-kit just created)
Get-Content backend/drizzle/<timestamp>_<name>/migration.sql `
  | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe
```

**Check** the SQL output ends in `ALTER TABLE` / `CREATE INDEX` lines, not `ERROR`.

### C. If you added/changed a company table — update the `template` schema

Every new company's `company_<uuid>` schema is cloned from `template.*` at signup time. If you change a company table in `schema.ts` and add a NEW column/table, you must also update `template.*` so future companies get it.

```sh
# 1. Edit backend/drizzle/template-schema.sql — add a matching entry for the
#    new/changed company table. Because the file uses CREATE TABLE (LIKE template."..." 
#    INCLUDING ALL), for *new columns* you need an ALTER TABLE instead:

# Example: adding "score integer" to template.interview_feedbacks
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c \
  'ALTER TABLE template."interview_feedbacks" ADD COLUMN "score" integer;'
```

**Check:**
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c "\d template.<table>"
```
Expect the new column visible.

### D. Migrate EXISTING company schemas (most often skipped, but it's a trap)

New signups from this point forward will get your change via the template. **But existing companies won't** — they were cloned before you edited anything. Three options:

**Option 1 — Nuke all companies (dev only).** Fastest. Re-seed via `npm run seed`. Every company schema gets the latest template.

```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c \
  "SELECT 'DROP SCHEMA \"' || schema_name || '\" CASCADE;' \
   FROM information_schema.schemata \
   WHERE schema_name LIKE 'company_%';"
# Copy the output, run it, then:
cd backend && npm run seed
```

**Option 2 — Apply the same ALTER to each existing company schema.** A short loop:
```sh
docker exec talentpipe-crm-postgres-1 psql -U devuser -d talentpipe -c \
  "SELECT string_agg('ALTER SCHEMA \"' || schema_name || '\" SET search_path = \"' || schema_name || ', public\";', E'\n') \
   FROM information_schema.schemata WHERE schema_name LIKE 'company_%';"
# Then for each company schema, run the same ALTER TABLE you ran on public/template.
```

**Option 3 — Document the gap and fix in code.** If the new column is nullable or has a default, the app can fall back gracefully. Document it in the PR description; add the column later when convenient.

### E. The full "I edited the schema" checklist

Use this whenever you touch `schema.ts`:

- [ ] Edited `backend/src/database/schema.ts`
- [ ] Ran `npx drizzle-kit generate` — new migration dir created
- [ ] Applied the new migration SQL to the running `public` schema (PowerShell: `Get-Content ... | docker exec -i ... psql ...`)
- [ ] If it's a company table: also ran the matching ALTER on `template.*`
- [ ] Restarted the backend (`npm run start:dev` auto-reloads, but for migrations of existing tables restart manually)
- [ ] Decided what to do about existing companies (options D1/D2/D3 above)
- [ ] Tested login + one company-scoped endpoint to confirm no `column does not exist` errors
- [ ] Committed: `git add backend/drizzle backend/src/database/schema.ts && git commit -m "feat(<milestone>): migrate <table> add <column>"`

### Common mistakes

- **Edit `schema.ts` and forget `drizzle-kit generate`.** Code compiles, runtime fails with `column "..." does not exist`.
- **Run `drizzle-kit generate` and forget to apply the SQL.** Drizzle never auto-applies — it only writes files.
- **Edit a company table but forget `template.*`.** New signups work, but they won't have your column. Confusing because existing companies also don't have it but for a different reason.
- **Forget existing companies.** They have whatever schema they were born with. The seed script is dev-only; real production companies need a backfill plan.
- **Forget to restart the backend.** Drizzle reads `schema.ts` on each query, but a long-running `start:dev` session may have cached the old metadata for some edge cases. Ctrl-C and re-run if weirdness hits.

---

## Troubleshooting quick-reference

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `relation "user_emails" does not exist` on login | Migrations not applied | Re-run steps 3 → 9 |
| `relation "template.users" does not exist` on signup | Template schema not applied | Re-run step 9 |
| Backend boots but every query 500s | DB container down | `docker ps` + `docker compose up -d` |
| `ECONNREFUSED 5432` on backend start | Postgres not up yet | Wait a few seconds after `docker compose up -d`, then retry |
| `EADDRINUSE :3000` | Old backend still running | `Get-Process node` → kill it |
| Frontend shows "Network Error" on login | Backend not running OR CORS | Backend on `:3000`, `CORS_ORIGIN=http://localhost:5173` in `backend/.env` |
| `password authentication failed for user "devuser"` | Wrong DB password | `backend/.env` `DATABASE_URL` must match `docker-compose.yml` |
| `column "..." does not exist` after editing `schema.ts` | Forgot to regenerate or apply migration | See "Editing the schema" §A + §B — run `drizzle-kit generate` then apply the SQL |
| New company signup succeeds but the new company's API 500s | `template.*` not updated for the new column/table | See "Editing the schema" §C — `ALTER TABLE template."<table>" ADD COLUMN ...` |
| Existing company still throws `column "..." does not exist` after schema change | Existing `company_<uuid>` schemas weren't migrated | See "Editing the schema" §D — nuke and re-seed (dev) or backfill per-company |

---

## File map (where things live)

| What | Path |
|------|------|
| Drizzle source of truth (TS) — **edit this** | `backend/src/database/schema.ts` |
| Drizzle migrations (generated — `npx drizzle-kit generate`) | `backend/drizzle/<timestamp>_<name>/migration.sql` |
| Drizzle config | `backend/drizzle.config.ts` |
| Template schema (manual SQL — edit alongside company-table changes) | `backend/drizzle/template-schema.sql` |
| Seed script | `backend/scripts/seed.ts` |
| Env vars | `backend/.env` |
| Docker services | `docker-compose.yml` (project root) |
| Sample accounts table | this file, step 13 |
| "Editing the schema" workflow | this file, "Editing the schema" |

---

## Related docs

- `docs/00_PROJECT_INSTRUCTIONS.md` — canonical spec
- `docs/05_DATA_ISOLATION_STRATEGY.md` — how schema-per-company works
- `docs/07_API_ENDPOINT_DOCUMENTATION.md` — full REST reference
- `docs/09_IMPLEMENTATION_GUIDE.md` — build-from-scratch (M0 → M1)
- `AGENTS.md` (root) — quick command reference
