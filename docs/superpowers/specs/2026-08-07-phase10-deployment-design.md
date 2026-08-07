# Phase 10 — Self-Hosted Docker Deployment (Design)

**Date:** 2026-08-07
**Milestone:** M10 — Deploy
**Done when:** Live URL on the user's Ubuntu server; public apply works in prod.

## Decisions

- **Target:** self-hosted Ubuntu server running a `docker compose` prod stack. Host-level nginx (user-managed) terminates TLS/domain and proxies to the frontend container port 80. No cloud platform.
- **Resume upload:** keep the existing backend-proxied upload (browser → NestJS → MinIO). Nginx `client_max_body_size` bumped above the 10MB multer limit (15m). Presigned uploads deferred.
- **Resume viewing fix (included):** the org candidate profile links `href={fileUrl}` where `fileUrl` is a bare S3 key — a dead relative URL. Add a backend streaming endpoint and blob-fetch on the frontend so reviewers can actually view resumes in prod.
- **Secrets:** all via a root `.env` file (compose auto-loads it; `env_file` for backend). `.env.prod.example` committed with placeholders; `.env` gitignored.
- **Migrations:** one-shot `migrate` compose service (postgres:16-alpine image, bind-mounted `backend/drizzle/` + `scripts/prod-migrate.sh`). Idempotent guard: skips when `public.tenants` exists. `backend` waits on `service_completed_successfully`.
- **No seed in prod** — org signup provisions everything.
- **YAGNI:** no CI docker builds, no presigned uploads, no HTTPS config (host nginx), no backup automation (documented `pg_dump` one-liner), no monitoring.

## Deliverables

1. `backend/Dockerfile` — 3-stage node:20-alpine: `deps` (npm ci --omit=dev) → `build` (npm ci, nest build) → `runtime` (copy node_modules + dist, `node dist/main.js`, port 3000). `backend/.dockerignore`.
2. `frontend/Dockerfile` — build stage (npm ci, `VITE_API_URL` ARG default `/api`, vite build) → `nginx:alpine` runtime. `frontend/nginx.conf`: SPA `try_files`, `/api/` proxy to `http://backend:3000`, `client_max_body_size 15m`. `frontend/.dockerignore`.
3. `docker-compose.prod.yml` — internal `backend` network; only `frontend` publishes ports (`80:80`). Services: postgres:16-alpine (+healthcheck), migrate (one-shot), redis:7-alpine (+healthcheck), minio (+healthcheck), backend (depends_on all healthy + migrate done), frontend (depends_on backend). Named volumes `pgdata`, `miniodata`. `restart: unless-stopped`.
4. `.env.prod.example` + `.gitignore` entry for `.env` + `.gitattributes` (`*.sh text eol=lf`).
5. `scripts/prod-migrate.sh` — applies `drizzle/*/migration.sql` chronologically + `template-schema.sql` via psql; exits 0 early if `public.tenants` exists.
6. Resume view fix:
   - Backend `GET /candidates/:candidateId/resume/file` (OA/R/HM) — streams `storage.get(key)`, content-type + inline disposition derived from key extension. `ResumesService.getFile(candidateAccountId)`.
   - Frontend `resumesApi.download(candidateId)` → blob via apiClient (Bearer attached) → object URL; `CandidateProfile` uses it (revoke on cleanup).
7. Docs — `09_IMPLEMENTATION_GUIDE.md` Phase 10 marked with the actual implementation + deploy runbook (clone → `.env` → `docker compose -f docker-compose.prod.yml up -d --build` → host nginx site → verify checklist → `pg_dump` backup one-liner).

## Verification

Local before handoff: `docker compose -f docker-compose.prod.yml config` → `build` → full stack up → curl smoke (health, org signup, signin, publish job, public careers, resume upload + view). Then user deploys to the server.
