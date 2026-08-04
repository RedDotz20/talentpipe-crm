# Phase 5b Audit and Phase 6 Redis Design

**Date:** 2026-08-05
**Branch:** `feat/phase5b-phase6-redis`
**Status:** Approved design

## Context

Phase 5b candidate accounts and the candidate portal were implemented early alongside the Phase 1 restructure. The current system already includes candidate authentication, cross-tenant job discovery, authenticated apply, application history, bookmarks, profile editing, declared skills, and storage-only resume handling.

The current `dev` branch also contained uncommitted Phase 4 candidate-profile changes. Those changes are committed separately as `d80dc9e` (`feat(m4): candidate profile resume and manual skills`) before this branch is created. The generated `backend/tsconfig.tsbuildinfo` is preserved outside the branch and is not part of the Phase 4 commit.

This work therefore audits and completes the existing Phase 5b behavior instead of rebuilding it, then adds the selected Phase 6 Redis capabilities:

- Login rate limiting on `POST /auth/signin`.
- A tenant-scoped organization dashboard summary cached for 60 seconds.

## Goals

- Preserve the existing schema-per-tenant architecture and repository-only database access.
- Close Phase 5b authorization, data-integrity, API-contract, and cross-tenant consistency gaps.
- Ensure candidate discovery and application operations can reference a selected tenant only through validated public index records.
- Add Redis without coupling core authentication or dashboard availability to Redis uptime.
- Provide a useful organization dashboard summary with explicit tenant cache namespacing.
- Verify the result with unit, integration, build, lint, and manual API checks before merging to `dev`.

## Non-Goals

- Rebuilding the existing candidate portal.
- Anonymous applications or public-write rate limiting.
- BullMQ, notification workers, or other Phase 7 queue work.
- Platform administration, billing, or unrelated refactoring.
- A distributed transaction or outbox system for cross-schema index synchronization; that remains a future reliability enhancement.

## Existing System Baseline

### Backend

- NestJS controller -> service -> repository layering.
- PostgreSQL schema-per-tenant routing through `AsyncLocalStorage` and `search_path`.
- Public candidate tables for accounts, skills, bookmarks, applications index, and job listings index.
- Tenant tables for candidates, job postings, applications, stages, notes, and related ATS data.
- `CandidateAccountModule` currently owns `/candidate/*` endpoints.
- Public careers remains unauthenticated and read-only.
- No Redis provider, cache service, or rate limiter currently exists.

### Frontend

- React, Mantine, TanStack Query, TanStack Router, and Zustand.
- Candidate routes use the `_candidate` layout and role guard.
- `/org/dashboard` currently renders a placeholder.
- Existing query keys, API client, and `useApiMutation` patterns will be reused.

### Existing Phase 5b surfaces

```text
POST /auth/signup
POST /auth/signin
GET  /candidate/jobs
GET  /candidate/jobs/:tenantId/:jobId
POST /candidate/jobs/:tenantId/:jobId/apply
GET  /candidate/applications
POST /candidate/bookmarks
DELETE /candidate/bookmarks/:id
GET  /candidate/bookmarks
GET  /candidate/profile
PUT  /candidate/profile
POST /candidate/resume
DELETE /candidate/resume
GET  /candidate/skills
PUT  /candidate/skills
```

## Phase 5b Audit and Completion

### Authorization and tenant boundaries

Every `/candidate/*` route, including job list and job detail, will use both `AuthGuard('jwt')` and `CandidateAuthGuard`.

The `tenantId` in candidate job URLs is an intentional cross-tenant discovery exception. It is not used to change the request tenant context. Candidate services will:

1. Query `public.job_listings_index` using the supplied tenant and job IDs.
2. Require the indexed record to be `open` for candidate detail, bookmarks, and apply.
3. Use the resolved tenant only for explicit repository operations against `tenant_<id>`.
4. Never accept a tenant ID for internal organization routes or merge it into the JWT tenant context.

The missing `GET /candidate/applications/:id` endpoint will be added. It will first find an application-index row owned by the authenticated candidate, then read the corresponding application from the explicit tenant schema. A candidate will receive candidate-safe fields only and will not receive internal recruiter notes or unrelated tenant data.

### Data integrity and API contracts

- Add a unique database constraint for `(candidate_account_id, tenant_id, job_posting_id)` in `candidate_applications_index` so concurrent apply requests cannot create duplicates.
- Validate application skill overrides against `public.skills` and deduplicate IDs. If no override is supplied, use the candidate's declared profile skills.
- Include `tenantId` when updating application-index status rows so synchronization is explicitly tenant-scoped.
- Persist the documented `coverLetter` field in the tenant application record rather than accepting and discarding it. Update the Drizzle schema, template schema, migration, repository, apply flow, and candidate detail response together.
- Keep tenant application writes and public index writes coordinated with idempotency checks and compensating cleanup on a failed second write. A future outbox or distributed transaction is outside this milestone.
- Preserve the current behavior that resume files are storage-only and candidate skills are manually declared.

### Frontend alignment

- Add candidate application-detail API support and consume it from the application history UI with the smallest useful interaction, such as a detail drawer or linked detail view.
- Reconcile the profile response types with the current backend fields. The backend currently exposes `resumeFileUrl` and `resumeUploadedAt`, while the frontend type expects a nested `resume` object.
- Preserve the existing candidate shell, public-careers return-to flow, and authenticated apply modal.
- Keep frontend route guards as UX protection; backend guards remain authoritative.

### Phase 5b verification

The audit must cover:

- Candidate-only authorization on every candidate route.
- Draft and closed jobs rejected by candidate detail, bookmark, and apply operations.
- Duplicate application rejection under normal and concurrent request conditions.
- Invalid skill override rejection and profile-skill fallback.
- Candidate ownership enforcement for application detail.
- Application status synchronization from tenant stage changes to the public application index.
- Cross-tenant application-detail access returning `404`.
- Profile and resume response shape consistency.
- A candidate flow spanning at least two tenants.

## Phase 6 Redis Architecture

### Redis foundation

Add a Redis module with:

- An `ioredis` provider configured through `ConfigService` and `REDIS_URL`.
- A low-level `RedisService` for atomic increment, expiration, get, set, delete, and scan-based invalidation.
- A `CacheService` that serializes JSON values and provides `get`, `set`, and `invalidate` operations to application services.
- Module shutdown handling that closes the Redis connection.

Redis errors will fail open for this milestone:

- Dashboard reads fall back to PostgreSQL when cache access fails.
- Dashboard cache writes and invalidation failures are logged but do not fail the business mutation.
- Login requests are allowed when Redis is unavailable, with a warning logged. This preserves authentication availability while making Redis health observable in tests and logs.

### Login rate limiter

Apply a guard only to `POST /auth/signin`.

- Normalize the submitted email by trimming and lowercasing it.
- Read the client IP from the request.
- Hash the normalized email before placing it in the Redis key so the key does not expose the login email.
- Use the logical key format `ratelimit:login:{emailHash}:{ip}`.
- Allow five attempts in a 900-second window.
- Use an atomic increment plus first-write expiration so concurrent requests cannot bypass the threshold.
- Reject requests beyond the threshold with HTTP `429`, a `Retry-After` header, and the existing normalized error envelope with code `RATE_LIMITED`.

The guard counts sign-in attempts before authentication. It does not reveal whether the email belongs to an organization, candidate, or SuperAdmin account.

### Organization dashboard summary

Add a tenant-scoped `DashboardModule` and `GET /dashboard/summary` endpoint for internal organization roles. The service will use the current tenant context and will not accept a tenant ID from the request.

The response contract is:

```json
{
  "totalApplications": 12,
  "totalCandidates": 8,
  "openJobPostings": 4,
  "applicationsByStage": [
    { "stageId": "uuid", "stageName": "Screening", "count": 5 }
  ]
}
```

The aggregate query will live in a repository and will run against the current tenant schema. It will not query another tenant schema or read public candidate indexes for organization metrics.

Cache behavior:

- Key: `tenant:{tenantId}:dashboard:summary:v1`.
- TTL: 60 seconds.
- Cache hit: return the decoded summary without querying PostgreSQL.
- Cache miss: query the repository, store the result, and return it.
- Cache failure: query PostgreSQL and return the result.

Invalidate the affected tenant's summary key after:

- Job posting create, update, publish, close, or delete.
- Manual candidate creation.
- Candidate application creation.
- Application stage changes.
- Pipeline stage create, update, or delete.

Invalidation will use the exact tenant key for the dashboard. The generic cache invalidation method will use Redis `SCAN`, not the blocking `KEYS` command.

### Dashboard frontend

- Replace the `/org/dashboard` placeholder with a Mantine dashboard containing summary cards and application-by-stage counts.
- Add `dashboardApi`, a `useDashboardSummary` query hook, and an `org.dashboardSummary` query key using existing frontend conventions.
- Use the existing API client and response envelope handling.
- Keep dashboard query freshness aligned with the 60-second server cache; no optimistic update is required.

## Error Handling

- Candidate cross-tenant or missing resources return `404 NOT_FOUND`.
- Invalid skill IDs return `400 VALIDATION_ERROR`.
- Duplicate applications return `409 CONFLICT`.
- Login rate limit returns `429 RATE_LIMITED` with `Retry-After`.
- Redis outages do not surface as application errors for cache or authentication paths.
- Existing `ResponseInterceptor` and `ApiExceptionFilter` remain the single response/error normalization layer.

## Testing Strategy

### Backend unit tests

- Candidate controller guard coverage.
- Candidate service validation, duplicate prevention, open-job checks, application ownership, and index synchronization.
- Redis service atomic operations and failure behavior.
- Cache service serialization, TTL, cache miss, cache hit, and invalidation.
- Login limiter threshold, window, key normalization, `Retry-After`, and Redis fallback.
- Dashboard service cache hit/miss/fallback and repository calls.

### Backend integration and end-to-end tests

- Candidate flow across two tenant schemas.
- Candidate access to only open indexed jobs.
- Application ownership and cross-tenant `404` behavior.
- Public index status updates after internal pipeline changes.
- Dashboard isolation between two tenant users.
- Real Redis limiter behavior using the Docker Compose Redis service.

### Frontend verification

- Candidate API/type alignment and application detail rendering.
- Dashboard loading, error, and populated states.
- `npm run build` and `npm run lint`.

### Required commands before merge

```text
cd backend && npm run typecheck
cd backend && npm test
cd backend && npm run build
cd backend && npm run lint
cd frontend && npm run build
cd frontend && npm run lint
```

## Delivery Workflow

1. Verify and commit the pre-existing Phase 4 changes on `dev`.
2. Create `feat/phase5b-phase6-redis` from the clean Phase 4 commit.
3. Commit this design document on the feature branch.
4. Create the implementation plan after the user reviews this spec.
5. Implement Phase 5b audit fixes and Phase 6 in small, verifiable commits.
6. Review the complete branch diff and run all required checks.
7. Merge the feature branch back to `dev` only after verification succeeds.

## References

- `docs/00_PROJECT_INSTRUCTIONS.md`
- `docs/04_ERD_DIAGRAM.md`
- `docs/05_DATA_ISOLATION_STRATEGY.md`
- `docs/07_API_ENDPOINT_DOCUMENTATION.md`
- `docs/08_FRONTEND_COMPONENT_STRUCTURE.md`
- `docs/09_IMPLEMENTATION_GUIDE.md`
- `docs/DATA_MODEL_DEFINITION.md`
