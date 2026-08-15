# 10 — CI/CD & Deployment

Two deployment paths for TalentPipe, sharing one CI gate. Local (dev + self-hosted) and Cloud (free managed tiers).

| Path | Use when | Cost |
|------|----------|------|
| A — Local | Daily dev, offline work, self-hosting on your own machine/VM | $0 |
| B — Cloud | Always-on demo/live URL for a personal project | $0 (free tiers) |

---

## 1. CI Pipeline (shared gate)

`.github/workflows/ci.yml` runs on push/PR to `main`:

- **Backend** (postgres:16 + redis:7 + minio as service containers, migrations applied): lint → typecheck → unit tests → e2e release gates → build
- **Frontend**: lint (oxlint) → build (vite build; `npm run typecheck` is a separate gate)

No changes needed — this gate protects both paths.

---

## 2. Path A — Local

### A1. Dev (hot reload)

```sh
docker compose up -d                 # postgres:16 + redis:7 + minio
# bootstrap (fresh DB only): migrations + template schema + seed
#   -> docs/00b_LOCAL_DEV_BOOTSTRAP.md
cd backend && npm run start:dev      # :3000
cd frontend && npm run dev           # :5173
```

### A2. Self-hosted prod (Ubuntu VM)

Full runbook: `docs/09_IMPLEMENTATION_GUIDE.md` §Phase 10. In short:

```sh
git clone <repo> && cd talentpipe-crm
cp .env.prod.example .env            # fill every value
docker compose -f docker-compose.prod.yml up -d --build
```

- Stack: `postgres:16-alpine`, `redis:7-alpine`, `minio`, one-shot `migrate` service, `backend`, `frontend` (nginx, port 80, proxies `/api` same-origin)
- TLS/domain: host-level nginx + certbot; or serve port 80 directly
- Migrations: automatic via `migrate` service (`scripts/prod-migrate.sh`, skips when `public.tenants` exists)

**Update:** `git pull && docker compose -f docker-compose.prod.yml up -d --build`
**Backup:**
```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup-$(date +%F).sql
```

---

## 3. Path B — Cloud (free managed tiers)

| Component | Service | Free tier | Why this one |
|-----------|---------|-----------|--------------|
| Backend (NestJS) | Render web service (Docker runtime) | 512 MB RAM, spins down after 15 min idle | Runs `backend/Dockerfile` as-is; TLS included |
| PostgreSQL 16 | Neon | 0.5 GB, auto-sleeps | Avoid Render's free Postgres (expires after 90 days) |
| Redis (rate-limit, cache, BullMQ) | Upstash | 5k commands/day | No card; ioredis handles `rediss://` TLS |
| Resume storage (S3) | Cloudflare R2 | 10 GB, free egress | S3 path-style compatible — pure env swap |
| Frontend (Vite SPA) | Cloudflare Pages | Unlimited requests | Static build + SPA fallback via `_redirects` |

BullMQ worker runs in-process (`onModuleInit`) → one Render service suffices; no separate worker.

### Required code changes (none — already committed)

- `frontend/public/_redirects` with `/* /index.html 200` (Pages SPA fallback — there is no nginx proxy here) is already in the repo.

Storage needs **no code change**: `storage.provider.ts` is generic `@aws-sdk/client-s3` with `forcePathStyle: true`, which R2 accepts.

### Setup steps

1. **Sign up** (no card anywhere): Neon, Upstash, Cloudflare, Render (via GitHub).
2. **Neon:** create project → copy the **direct** connection string, NOT the `-pooler` one (the app runs `SET search_path` per request; transaction pooling would break schema-per-company). `DATABASE_URL=postgresql://...neon.tech/talentpipe`.
3. **Run migrations** (one-shot, reuses the existing script — no compose needed):
   ```sh
   docker run --rm -v "$PWD/backend/drizzle:/migrations:ro" -v "$PWD/scripts:/scripts:ro" \
     -e PGHOST=<neon-host> -e PGUSER=<user> -e PGPASSWORD=<pw> -e PGDATABASE=talentpipe \
     postgres:16-alpine sh /scripts/prod-migrate.sh
   ```
   Caveat: the script's idempotency guard checks `public.tenants` (stale since the rename migration) — harmless for a one-shot run, just don't re-run it.
4. **Upstash:** create DB → `REDIS_URL=rediss://default:<token>@<db>.upstash.io:6379`.
5. **Cloudflare R2:** two buckets are needed — `resumes` and `avatars`. The backend auto-creates them on boot (`ensureBucket`), so the R2 API token needs bucket-create permission — or pre-create both buckets manually and use a read/write-only token. Token creds: `S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_ACCESS_KEY`/`S3_SECRET_KEY`, `S3_BUCKET=resumes`, `S3_AVATAR_BUCKET=avatars`.
6. **Render backend:** New Web Service → GitHub repo → root dir `backend` → Docker runtime → free instance. Env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (generate: `openssl rand -base64 48`), the 4 R2 vars, `S3_BUCKET`, `S3_AVATAR_BUCKET`, `CORS_ORIGIN=https://<project>.pages.dev`. Health check path `/api/health` (`main.ts` reads `process.env.PORT` ✓).
7. **Cloudflare Pages:** connect repo → build `npm run build`, output `dist`, env `VITE_API_URL=https://<backend>.onrender.com` (absolute — no same-origin proxy), Node 20.
8. **Verify:** `/api/health` → signup → post + publish a job → apply → resume upload + "View Resume" → 6 bad logins → 429 → move a candidate stage → confirm an `audit_logs` row appears (proves BullMQ works on Upstash).

### Free-tier realities

- **Cold starts:** Render wakes in ~1 min after idle; Neon wakes in seconds. A keep-alive cron fixes both — `ponytail:` skip until it annoys you.
- **Upstash + BullMQ is the only real risk:** blocking commands (`BZPOPMIN`) may misbehave. The step-8 stage-move test proves it. Fallback: **Redis Cloud free** (30 MB, real Redis, no card) — same `REDIS_URL` swap.
- **5k Upstash commands/day:** fine at personal-project traffic.

### Maintenance

- **Backup:** `pg_dump` against the Neon connection string, or Neon's built-in point-in-time restore (free tier).
- **Update:** `git push` → Pages + Render auto-deploy → re-run step 3 only if migrations changed (script re-run is a no-op via the `tenants` guard — or run it blindly once).

---

## 4. Environment variable matrix

### 4.1 Dev (local, committed values — `backend/.env`, frontend defaults)

| Var | Value |
|-----|-------|
| `DATABASE_URL` | `postgres://devuser:devpassword@localhost:5432/talentpipe` |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | dev values |
| `S3_ENDPOINT` | `localhost:9000` |
| `S3_REGION` | default (`us-east-1`) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `minioadmin` |
| `S3_BUCKET` | `resumes` |
| `CORS_ORIGIN` | localhost (allowed by regex in `main.ts`) |
| `VITE_API_URL` | `/api` (default) |

### 4.2 Self-hosted prod (`docker-compose.prod.yml` — root `.env`, gitignored, from `.env.prod.example`)

| Var | Value |
|-----|-------|
| `DATABASE_URL` | `postgres://<user>:<password>@postgres:5432/talentpipe` |
| `REDIS_URL` | `redis://redis:6379` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | random (e.g. `openssl rand -base64 48`) |
| `S3_ENDPOINT` | `http://minio:9000` |
| `S3_REGION` | default (`us-east-1`) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `.env`, must match `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` |
| `S3_BUCKET` | `resumes` |
| `CORS_ORIGIN` | your domain |
| `VITE_API_URL` | `/api` (nginx proxy, build arg `VITE_API_URL=/api`) |

### 4.3 Cloud (B) — Render env vars / Pages build env

| Var | Value |
|-----|-------|
| `DATABASE_URL` | Neon **direct** URL (not `-pooler`) |
| `REDIS_URL` | `rediss://default:<token>@<db>.upstash.io:6379` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | random (`openssl rand -base64 48`) |
| `S3_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | R2 API token |
| `S3_BUCKET` | `resumes` |
| `S3_AVATAR_BUCKET` | `avatars` |
| `CORS_ORIGIN` | `https://<project>.pages.dev` |
| `VITE_API_URL` | `https://<backend>.onrender.com` (absolute — no nginx proxy) |

## 5. Migrations & backups (shared)

- Single source: `backend/drizzle/*/migration.sql` + `backend/drizzle/template-schema.sql`, applied by `scripts/prod-migrate.sh` (psql, chronological, `ON_ERROR_STOP`).
- Local: `migrate` compose service (self-hosted) or `npm run seed` bootstrap (dev).
- Cloud: one-shot `docker run` (step 3 above).
- Backup everywhere: `pg_dump` one-liner; Neon additionally has PITR.
