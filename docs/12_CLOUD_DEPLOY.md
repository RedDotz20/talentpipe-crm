# 10b — Free Cloud Deployment (Neon + Upstash + R2 + Render + Cloudflare Pages)

> Companion to `10_CI_CD_DEPLOYMENT.md`. Full $0/month stack for TalentPipe: no
> VPS, no Docker required — the backend self-provisions its schema and demo data
> on first boot, so there is no manual migration step.

## Architecture mapping

| Self-hosted (`docker-compose.prod.yml`) | Free managed replacement | Env vars |
|---|---|---|
| postgres:16 | **Neon** (managed Postgres 16) | `DATABASE_URL` |
| redis:7 | **Upstash Redis** | `REDIS_URL` |
| minio | **Cloudflare R2** (S3-compatible) | `S3_*` |
| backend container | **Render** free web service | `PORT` (auto) |
| frontend (nginx) | **Cloudflare Pages** | `VITE_API_URL` (build-time) |

The BullMQ notifications worker runs in-process with the backend, so one Render
service covers everything. The backend applies migrations + optional demo seed
at boot (`initDatabase` in `backend/src/database/database-init.ts`), so an
empty database provisions itself on first boot — no psql, no SQL editor.

## Free tier limits at a glance (Aug 2026)

| Provider | Limit | Gotcha |
|---|---|---|
| Neon | 0.5 GB, 100 CU-h/month | Compute scale-to-zero after 5 min idle → first query after idle has latency |
| Upstash | 256 MB, 500K commands/month | TLS only (`rediss://`); idle free DBs may be reclaimed |
| R2 | 10 GB, 1M Class A + 10M Class B ops/month | Zero egress fees |
| Render | 750 instance-hours/month | **One** free web service; spins down after 15 min idle (~1 min cold start); instance may restart anytime (app is stateless — fine) |
| Cloudflare Pages | Unlimited sites/requests, 500 builds/month | `VITE_API_URL` is baked at build time |

## Step 0 — Prerequisites

1. Create free accounts: Neon, Upstash, Cloudflare, Render.
2. Push the repo to GitHub (Render + Pages connect to it).
3. Generate two random secrets:
   ```powershell
   -join ((48..122) | Get-Random -Count 64 | % {[char]$_})   # run twice
   ```

## Step 1 — Neon (database)

1. Console → **New Project** → name `talentpipe`, region nearest you.
2. **Connect** → copy the **pooled** connection string (host has `-pooler`,
   ends in `?sslmode=require`). The app's `pg` driver parses `sslmode=require`
   into SSL — no code change. Use the pooled string: the app opens a 10-conn
   pool and Neon's free compute has limited slots.

## Step 2 — Upstash (redis)

1. Console → **Create Database** → name `talentpipe`, same region, TLS on.
2. Copy the **Redis protocol** connection string — `rediss://default:<token>@<region>-<id>.upstash.io:6379`.
   - ioredis (limiter/cache + BullMQ connections) enables TLS from the
     `rediss://` scheme automatically — no code change.

## Step 3 — Cloudflare R2 (storage)

1. Dashboard → **R2** → create buckets **`resumes`** and **`avatars`**.
   (Pre-creating them lets the API token stay object-scoped.)
2. R2 → **Manage R2 API Tokens** → create token: **Object Read & Write**,
   scoped to both buckets. Copy Access Key ID + Secret.
3. Note your **Account ID** (R2 overview page).

S3 env values (the backend already uses `forcePathStyle: true`, which R2
supports; `StorageService` auto-creates missing buckets at boot, so only
object-level token permission is required):
```
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY=<Access Key ID>
S3_SECRET_KEY=<Secret Access Key>
S3_BUCKET=resumes
S3_AVATAR_BUCKET=avatars
```

## Step 4 — Render (backend)

1. Dashboard → **New** → **Web Service** → connect repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Node (buildpack)
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `node dist/main.js`
   - **Instance Type:** Free, same region as Neon/Upstash.
3. **Environment variables**:
   ```
   DATABASE_URL=<Neon pooled URL>
   REDIS_URL=<Upstash rediss:// URL>
   JWT_SECRET=<random 1>
   JWT_REFRESH_SECRET=<random 2>
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_ACCESS_KEY=<R2 key>
   S3_SECRET_KEY=<R2 secret>
   S3_BUCKET=resumes
   S3_AVATAR_BUCKET=avatars
   CORS_ORIGIN=https://<project>.pages.dev      # after Step 5
   SEED_ON_BOOT=true                            # first boot: schema + demo accounts
   ```
   (Render sets `PORT` and `NODE_ENV=production` itself; `main.ts` listens on
   `0.0.0.0:PORT`.)
4. Deploy. First boot on the empty Neon DB logs `Schema missing — applying
   migrations...` × 16, `Migrations complete.`, then `Seed complete.` (if
   `SEED_ON_BOOT=true`). Later boots log `Schema already present` and skip
   the seed (guarded by `public.companies` row count — a failed seed rolls
   back and retries next boot).
5. Verify: `curl https://<service>.onrender.com/api/health` → 200; logs show
   `Created bucket "resumes"` / `"avatars"` (R2 credentials OK).

**Demo accounts created by the seed** (change or remove them for anything
public): `superadmin@talentpipe.com` / `platform@talentpipe.com`
(`SuperAdmin123!`), `admin@acme.com` (`Admin123!`), 4 more companies,
10 candidates (`Candidate123!`). `SEED_ON_BOOT` can be turned off after first
boot — migrations always run; only the seed is gated.

## Step 5 — Cloudflare Pages (frontend)

1. Dashboard → **Workers & Pages** → **Create** → **Pages** → connect repo.
2. Settings:
   - **Root directory:** `frontend`
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variable:** `VITE_API_URL=https://<service>.onrender.com/api`
3. **Save and Deploy** → `https://<project>.pages.dev`.
   - SPA fallback is automatic: the build ships no top-level `404.html`, so
     Pages serves `index.html` for every unmatched path (200). Do **not** add
     a `_redirects` SPA rule — the current Pages engine rejects
     `/* /index.html 200` as an infinite loop (error 100324).

## Step 6 — Finish wiring + verify

1. Back on Render, set `CORS_ORIGIN=https://<project>.pages.dev` → **Manual
   Deploy → Deploy latest** (CORS is read at boot).
2. Checklist:
   - [ ] Landing page loads at the Pages URL
   - [ ] Sign in as `superadmin@talentpipe.com` → admin dashboard
   - [ ] Sign in as `admin@acme.com` → create a job posting
   - [ ] Apply as a candidate with a resume (exercises R2)
   - [ ] Move a candidate's stage → audit_logs row appears (exercises Upstash/BullMQ)
   - [ ] 5 wrong passwords → 429 (exercises the Upstash rate limiter)

## Notes

- **No code changes were required** for this stack — every knob is env-driven
  (`S3_REGION`/`forcePathStyle`, `sslmode=require`, `rediss://`, `PORT`).
- **Future migrations:** `cd backend; $env:DATABASE_URL="<neon>"; npx drizzle-kit generate`,
  then apply the new `drizzle/<name>/migration.sql` via the Neon SQL Editor.
  (Boot auto-migration only runs when the schema is missing.)
- **First-request latency** after idle is expected: Render cold start (~1 min)
  + Neon compute wake.
- Self-hosted flow (`docker-compose.prod.yml`) is unaffected; its `migrate`
  service remains the migration path for containers that don't ship `drizzle/`.
