# Phase 5b Audit and Phase 6 Redis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing Phase 5b candidate account/dashboard implementation and add Redis-backed login limiting plus a tenant-scoped cached organization dashboard summary.

**Architecture:** Preserve the existing NestJS controller -> service -> repository layering and PostgreSQL schema-per-tenant isolation. Candidate cross-tenant discovery continues through public index tables and explicit tenant repository calls, while internal dashboard queries use the current tenant context only. Redis is isolated behind a provider, low-level service, and application-facing cache service; Redis failures do not make authentication or dashboard reads unavailable.

**Tech Stack:** NestJS 11, TypeScript, Drizzle ORM rc4, PostgreSQL 16, Redis 7, `ioredis`, Jest 30, React 19, Mantine 9, TanStack Query 5, TanStack Router, Vite 8.

## Global Constraints

- Use `feat/phase5b-phase6-redis`; do not modify `dev` during implementation.
- Keep the Phase 4 baseline commit `d80dc9e` separate from this work.
- All database access must remain in repositories; services and controllers must not use Drizzle directly.
- Candidate route `tenantId` is allowed only for validated public-index discovery/apply operations; it must not alter internal tenant context.
- Internal organization tenant identity must come only from the verified JWT and `AsyncLocalStorage` context.
- Candidate cross-tenant or missing resources return `404 NOT_FOUND`, never a tenant-mismatch error.
- Login limiting applies only to `POST /auth/signin`: five attempts per normalized email/IP key per 900 seconds.
- Dashboard cache key is `tenant:{tenantId}:dashboard:summary:v1` with a 60-second TTL.
- Redis cache and limiter failures fail open and are logged; PostgreSQL remains the dashboard fallback.
- Do not add anonymous apply, public-write rate limiting, BullMQ, or unrelated refactors.
- Follow existing response envelopes: success `{ data, message }`; errors `{ error: { code, message } }`.
- Use ASCII in new source and documentation unless an existing file requires otherwise.

---

## File Map

### Phase 5b audit and data integrity

- Modify `backend/src/modules/candidate-account/candidate-account.controller.ts` for candidate guards and application detail routing.
- Modify `backend/src/modules/candidate-account/candidate-account.service.ts` for open-job checks, application detail ownership, skill validation, and coordinated index writes.
- Modify `backend/src/modules/candidate-account/dto/apply.dto.ts` to bound the documented cover-letter input.
- Modify `backend/src/repositories/candidate-applications-index.repository.ts` for ownership/detail lookup and tenant-scoped status updates.
- Modify `backend/src/repositories/application.repository.ts` for cover-letter persistence, candidate-safe detail reads, and compensating application deletion.
- Modify `backend/src/database/schema.ts` and `backend/drizzle/template-schema.sql` for the application cover letter and unique application-index constraint.
- Create the Drizzle-generated migration for the Phase 5b integrity changes under `backend/drizzle/`.
- Modify `backend/src/modules/applications/applications.service.ts` and its spec for tenant-aware index status synchronization and dashboard invalidation integration.
- Modify `backend/src/modules/candidates/candidates.service.ts` and its spec for dashboard invalidation after manual candidate creation.
- Modify `backend/src/modules/job-postings/job-postings.service.ts` and its spec for dashboard invalidation after posting writes.
- Modify `backend/src/modules/pipeline-stages/pipeline-stages.service.ts` and its spec for dashboard invalidation after stage writes.

### Redis and rate limiting

- Modify `backend/package.json` and `backend/package-lock.json` to add `ioredis`.
- Create `backend/src/common/redis/redis.constants.ts` for the provider token.
- Create `backend/src/common/redis/redis.provider.ts` for the `ConfigService`-based Redis client.
- Create `backend/src/common/redis/redis.service.ts` for safe Redis primitives.
- Create `backend/src/common/redis/redis.module.ts` for provider/export wiring and shutdown.
- Create `backend/src/common/cache/cache.service.ts` for JSON cache operations.
- Create `backend/src/common/cache/cache.module.ts` for cache provider/export wiring.
- Create `backend/src/common/middlewares/login-rate-limiter.guard.ts` for the sign-in guard.
- Modify `backend/src/modules/auth/auth.controller.ts` and `backend/src/modules/auth/auth.module.ts` to wire the guard and Redis modules.
- Create `backend/src/common/redis/redis.service.spec.ts`, `backend/src/common/cache/cache.service.spec.ts`, and `backend/src/common/middlewares/login-rate-limiter.guard.spec.ts`.

### Dashboard

- Create `backend/src/repositories/dashboard.repository.ts` for current-tenant aggregate queries.
- Modify `backend/src/repositories/repositories.module.ts` to export `DashboardRepository`.
- Create `backend/src/modules/dashboard/dashboard.module.ts`.
- Create `backend/src/modules/dashboard/dashboard.controller.ts`.
- Create `backend/src/modules/dashboard/dashboard.service.ts`.
- Create `backend/src/modules/dashboard/dashboard.service.spec.ts`.
- Modify `backend/src/app.module.ts` to import `RedisModule`, `CacheModule`, and `DashboardModule`.

### Frontend and documentation

- Modify `frontend/src/features/candidate-portal/api/candidateApi.ts` and `frontend/src/features/candidate-portal/types/index.ts` for the candidate application/profile contract.
- Modify `frontend/src/features/candidate-portal/applications/ApplicationsPage.tsx` for application detail consumption.
- Modify `frontend/src/api/queryKeys.ts` for the dashboard key.
- Create `frontend/src/api/dashboardApi.ts`.
- Create `frontend/src/features/org/dashboard/hooks/useDashboardSummary.ts`.
- Create `frontend/src/features/org/dashboard/OrgDashboardPage.tsx`.
- Modify `frontend/src/routes/org/dashboard.tsx` to render the dashboard page.
- Modify `docs/09_IMPLEMENTATION_GUIDE.md` to mark the verified Phase 5b/6 work and record any final contract changes.

---

## Task 1: Lock the Phase 5b Route Boundary

**Files:**
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts:38-49`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts:37-47`
- Modify: `backend/src/repositories/job-listings-index.repository.ts:46-62`
- Test: `backend/src/modules/candidate-account/candidate-account.service.spec.ts`
- Test: `backend/src/common/guards/candidate-auth.guard.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `AuthGuard('jwt')`, `CandidateAuthGuard`, `JobListingsIndexRepository.findOpenByTenantAndJob(tenantId, jobPostingId)`.
- Produces: Candidate job list/detail routes that reject unauthenticated users and candidate detail that returns only open indexed jobs.

- [ ] **Step 1: Add failing service tests for closed and draft candidate jobs.**

Add cases to `candidate-account.service.spec.ts` that configure `jobListingsIndexRepo.findOpenByTenantAndJob` to return `null` for a closed or draft row and assert `service.getJobDetail('t1', 'j1')` rejects with `NotFoundException`. Add a case asserting an open row is returned.

```ts
it('hides non-open jobs from candidate detail', async () => {
  jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue(null);

  await expect(service.getJobDetail('t1', 'j1')).rejects.toThrow(
    NotFoundException,
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts
```

Expected: FAIL because `getJobDetail` currently uses `findById` without requiring `status = 'open'`.

- [ ] **Step 3: Implement the open-job lookup.**

Use the existing repository method:

```ts
async findOpenByTenantAndJob(tenantId: string, jobPostingId: string) {
  return this.withDb('public', async (db) => {
    const rows = await db
      .select()
      .from(jobListingsIndex)
      .where(
        and(
          eq(jobListingsIndex.tenantId, tenantId),
          eq(jobListingsIndex.jobPostingId, jobPostingId),
          eq(jobListingsIndex.status, 'open'),
        ),
      )
      .limit(1)
      .execute();
    return rows[0] ?? null;
  });
}
```

Change `getJobDetail` to call `findOpenByTenantAndJob` and throw `NotFoundException('Job posting not found')` for `null`. Use the same open lookup in bookmark creation and apply rather than relying on a possibly stale non-open index row.

- [ ] **Step 4: Add guards to candidate job list and detail routes.**

Apply both guards to `GET /candidate/jobs` and `GET /candidate/jobs/:tenantId/:jobId`:

```ts
@Get('jobs')
@UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
async listJobs(@Query('search') search?: string) {
  return this.candidateAccountService.getJobs(search);
}
```

Use the same decorator order and guard pattern already used by the protected candidate routes.

- [ ] **Step 5: Run focused tests and commit the boundary fix.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts src/common/guards/candidate-auth.guard.spec.ts
```

Expected: PASS. Commit:

```text
git add backend/src/modules/candidate-account backend/src/repositories/job-listings-index.repository.ts backend/src/common/guards/candidate-auth.guard.spec.ts
git commit -m "fix(m5b): enforce candidate job visibility boundary"
```

---

## Task 2: Complete Candidate Application Integrity and Detail

**Files:**
- Modify: `backend/src/database/schema.ts:281-326` and tenant `applications` definition
- Modify: `backend/drizzle/template-schema.sql:7`
- Create: generated migration under `backend/drizzle/` from `npx drizzle-kit generate`
- Modify: `backend/src/modules/candidate-account/dto/apply.dto.ts`
- Modify: `backend/src/repositories/application.repository.ts`
- Modify: `backend/src/repositories/candidate-applications-index.repository.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts`
- Test: `backend/src/modules/candidate-account/candidate-account.service.spec.ts`
- Test: `backend/src/repositories/candidate-applications-index.repository.spec.ts` (create if absent)

**Interfaces:**
- Consumes: Open indexed job lookup and explicit tenant repository calls.
- Produces: `GET /candidate/applications/:id`, validated application overrides, persisted cover letters, candidate ownership checks, and a database-enforced duplicate boundary.

- [ ] **Step 1: Add failing unit tests for ownership, skill validation, and cover-letter propagation.**

Add mocks and tests proving:

```ts
it('rejects an application detail not owned by the candidate', async () => {
  candidateApplicationsIndexRepo.findByCandidateAndApplication.mockResolvedValue(null);

  await expect(service.getApplicationDetail('candidate-a', 'app-a')).rejects.toThrow(
    NotFoundException,
  );
});

it('rejects unknown override skills before creating an application', async () => {
  jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
    tenantId: 't1',
    jobPostingId: 'j1',
    status: 'open',
    title: 'Engineer',
    companyName: 'Acme',
  });
  candidateAccountRepo.findById.mockResolvedValue({
    id: 'candidate-a',
    email: 'candidate@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
  });
  candidateApplicationsIndexRepo.findByJob.mockResolvedValue(null);
  skillRepo.findByIds.mockResolvedValue([{ id: 'known-skill' }]);

  await expect(
    service.apply('candidate-a', 't1', 'j1', { skillIds: ['known-skill', 'missing'] }),
  ).rejects.toThrow(BadRequestException);
  expect(applicationRepo.create).not.toHaveBeenCalled();
});
```

Add an apply success assertion that `applicationRepo.create` receives `coverLetter: 'Interested in the role'`.

- [ ] **Step 2: Run the focused tests and verify the new cases fail.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts
```

Expected: FAIL because the detail method, ownership lookup, skill validation, and cover-letter field do not exist yet.

- [ ] **Step 3: Extend the schema and migration inputs.**

Add the tenant application column:

```ts
coverLetter: text('cover_letter'),
```

Add the same column to `backend/drizzle/template-schema.sql` indirectly by keeping the template created with `LIKE public.applications INCLUDING ALL`; the public Drizzle schema must define the column before the template is recreated.

Add a unique index to `candidateApplicationsIndex`:

```ts
uniqueCandidateApplication: uniqueIndex(
  'unique_candidate_application',
).on(
  table.candidateAccountId,
  table.tenantId,
  table.jobPostingId,
),
```

Update `ApplicationRepository.create` input and `selectAppRow` to include `coverLetter`.

Generate the migration:

```text
cd backend && npx drizzle-kit generate
```

Inspect the generated SQL. It must add `cover_letter` to every existing `tenant_%` applications table and `template.applications`, and add the unique public index. Apply it through the local bootstrap procedure before integration tests.

- [ ] **Step 4: Add index ownership and tenant-scoped status methods.**

Add these repository methods:

```ts
async findByCandidateAndApplication(candidateAccountId: string, applicationId: string) {
  return this.withDb('public', async (db) => {
    const rows = await db
      .select()
      .from(candidateApplicationsIndex)
      .where(
        and(
          eq(candidateApplicationsIndex.candidateAccountId, candidateAccountId),
          eq(candidateApplicationsIndex.applicationId, applicationId),
        ),
      )
      .limit(1)
      .execute();
    return rows[0] ?? null;
  });
}

async updateStatus(applicationId: string, tenantId: string, status: string) {
  return this.withDb('public', async (db) => {
    const rows = await db
      .update(candidateApplicationsIndex)
      .set({ status })
      .where(
        and(
          eq(candidateApplicationsIndex.applicationId, applicationId),
          eq(candidateApplicationsIndex.tenantId, tenantId),
        ),
      )
      .returning()
      .execute();
    return rows[0] ?? null;
  });
}
```

Add `findByIdForCandidate(applicationId, schema)` to `ApplicationRepository`, using the existing joined select but returning the cover letter and no notes. The service will supply the schema only after the public ownership lookup succeeds. Add this compensating method for a failed public-index insert:

```ts
async delete(id: string, schema = 'current') {
  return this.withDb(schema, (db) =>
    db.delete(applications).where(eq(applications.id, id)).execute(),
  );
}
```

- [ ] **Step 5: Implement validated apply and candidate application detail.**

Update `ApplyJobSchema` to bound cover letters:

```ts
export const ApplyJobSchema = z.object({
  phone: z.string().max(50).optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  coverLetter: z.string().max(5000).optional(),
});
```

In `CandidateAccountService.apply`:

1. Resolve the job with `findOpenByTenantAndJob`.
2. Resolve the candidate account.
3. Check `findByJob(candidateAccountId, tenantId, jobPostingId)`.
4. Choose `dto.skillIds` or profile skills.
5. Deduplicate the chosen IDs and call `skillRepo.findByIds`.
6. Throw `BadRequestException('One or more skill IDs are invalid')` unless every ID exists.
7. Create the tenant candidate/application with `coverLetter` and the computed score.
8. Create the public application index row.
9. If the index insert fails after the tenant application is created, delete the created tenant application and rethrow.

Add:

```ts
async getApplicationDetail(candidateAccountId: string, applicationId: string) {
  const indexed = await this.candidateApplicationsIndexRepo.findByCandidateAndApplication(
    candidateAccountId,
    applicationId,
  );
  if (!indexed) throw new NotFoundException('Application not found');

  const application = await this.applicationRepo.findByIdForCandidate(
    applicationId,
    `tenant_${indexed.tenantId}`,
  );
  if (!application) throw new NotFoundException('Application not found');

  return {
    ...indexed,
    matchScore: application.matchScore,
    appliedSkillIds: application.appliedSkillIds,
    coverLetter: application.coverLetter,
  };
}
```

Add `@Get('applications/:id')` with the same candidate guards as the collection endpoint and pass `user.userId` to the service.

- [ ] **Step 6: Run the focused tests and verify they pass.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts
cd backend && npm run typecheck
```

Expected: all focused tests pass and TypeScript reports no errors. Commit:

```text
git add backend/src/database/schema.ts backend/drizzle/template-schema.sql backend/drizzle backend/src/modules/candidate-account backend/src/repositories/application.repository.ts backend/src/repositories/candidate-applications-index.repository.ts
git commit -m "feat(m5b): harden candidate applications and ownership"
```

---

## Task 3: Add the Redis Provider and Safe Primitive Services

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`
- Create: `backend/src/common/redis/redis.constants.ts`
- Create: `backend/src/common/redis/redis.provider.ts`
- Create: `backend/src/common/redis/redis.service.ts`
- Create: `backend/src/common/redis/redis.module.ts`
- Create: `backend/src/common/cache/cache.constants.ts`
- Create: `backend/src/common/cache/cache.service.ts`
- Create: `backend/src/common/cache/cache.module.ts`
- Test: `backend/src/common/redis/redis.service.spec.ts`
- Test: `backend/src/common/cache/cache.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService.getOrThrow<string>('REDIS_URL')`.
- Produces: `RedisService.incrementWithWindow`, `RedisService.get`, `RedisService.set`, `RedisService.del`, `RedisService.invalidate`, `CacheService.get`, `CacheService.set`, and `CacheService.invalidateTenantDashboard`.

- [ ] **Step 1: Install the Redis client.**

Run:

```text
cd backend && npm install ioredis
```

Expected: `ioredis` is added to `dependencies` and `package-lock.json` changes only for this installation.

- [ ] **Step 2: Write failing unit tests for Redis primitives and cache fallback.**

Mock an ioredis-compatible client with `incr`, `expire`, `get`, `set`, `del`, `scan`, and `quit`. Test:

```ts
it('sets the expiry only for the first increment', async () => {
  redis.incr.mockResolvedValue(1);
  await service.incrementWithWindow('key', 900);
  expect(redis.expire).toHaveBeenCalledWith('key', 900);
});

it('does not set a second expiry for an existing counter', async () => {
  redis.incr.mockResolvedValue(2);
  await service.incrementWithWindow('key', 900);
  expect(redis.expire).not.toHaveBeenCalled();
});

it('returns null when cache reads fail', async () => {
  redis.get.mockRejectedValue(new Error('redis down'));
  await expect(cache.get('key')).resolves.toBeNull();
});
```

Add a test that `invalidate(pattern)` uses `SCAN` and `DEL`, never `KEYS`.

- [ ] **Step 3: Run the focused tests and verify they fail.**

Run:

```text
cd backend && npm test -- --runInBand src/common/redis/redis.service.spec.ts src/common/cache/cache.service.spec.ts
```

Expected: FAIL because the providers and services do not exist.

- [ ] **Step 4: Implement the Redis provider and module.**

Create the token:

```ts
export const REDIS_PROVIDER = Symbol('REDIS_PROVIDER');
```

Create the provider using `ConfigService`:

```ts
export const redisProvider = {
  provide: REDIS_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    }),
};
```

`RedisModule` must provide/export the token and `RedisService`, and implement `OnModuleDestroy` to call `quit()` on the injected client. `CacheModule` imports/exports `RedisModule` and `CacheService`.

- [ ] **Step 5: Implement safe Redis primitives.**

Use these service signatures:

```ts
incrementWithWindow(key: string, windowSeconds: number): Promise<number | null>;
get(key: string): Promise<string | null>;
set(key: string, value: string, ttlSeconds: number): Promise<void>;
del(key: string): Promise<void>;
invalidate(pattern: string): Promise<void>;
```

`incrementWithWindow` calls `INCR`, calls `EXPIRE` only when the returned count is `1`, and returns `null` after logging a Redis error. `invalidate` loops with `scan(cursor, 'MATCH', pattern, 'COUNT', 100)`, deletes returned keys, and stops at cursor `0`. Never use `KEYS`.

- [ ] **Step 6: Implement JSON cache operations.**

Create the shared dashboard key helper before implementing the tenant-specific cache method:

```ts
export const dashboardSummaryKey = (tenantId: string) =>
  `tenant:${tenantId}:dashboard:summary:v1`;
```

Use these signatures:

```ts
get<T>(key: string): Promise<T | null>;
set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
invalidate(pattern: string): Promise<void>;
invalidateTenantDashboard(tenantId: string): Promise<void>;
```

Serialize with `JSON.stringify` and parse with `JSON.parse`. On get/set/invalidate failure, log with Nest `Logger` and return the fallback behavior. `invalidateTenantDashboard` calls `del(dashboardSummaryKey(tenantId))`.

- [ ] **Step 7: Run tests and commit the Redis foundation.**

Run:

```text
cd backend && npm test -- --runInBand src/common/redis/redis.service.spec.ts src/common/cache/cache.service.spec.ts
cd backend && npm run typecheck
```

Expected: PASS and no type errors. Commit:

```text
git add backend/package.json backend/package-lock.json backend/src/common/redis backend/src/common/cache
git commit -m "feat(m6): add resilient redis and cache services"
```

---

## Task 4: Protect Unified Sign-In with the Redis Rate Limiter

**Files:**
- Create: `backend/src/common/middlewares/login-rate-limiter.guard.ts`
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.module.ts`
- Test: `backend/src/common/middlewares/login-rate-limiter.guard.spec.ts`
- Test: `backend/src/modules/auth/auth.controller.spec.ts`

**Interfaces:**
- Consumes: `RedisService.incrementWithWindow(key, 900)` and `AuthController.signin` request body.
- Produces: `LoginRateLimiterGuard` that throws `TooManyRequestsException` after five attempts and sets `Retry-After`.

- [ ] **Step 1: Write failing guard tests.**

Use an execution-context mock with request body `{ email: ' User@Example.com ' }`, IP `127.0.0.1`, and a response object with `setHeader`. Test:

```ts
it('allows the fifth attempt', async () => {
  redis.incrementWithWindow.mockResolvedValue(5);
  await expect(guard.canActivate(context)).resolves.toBe(true);
});

it('rejects the sixth attempt with retry metadata', async () => {
  redis.incrementWithWindow.mockResolvedValue(6);
  await expect(guard.canActivate(context)).rejects.toThrow(TooManyRequestsException);
  expect(response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
});

it('normalizes the email before hashing the key', async () => {
  redis.incrementWithWindow.mockResolvedValue(1);
  await guard.canActivate(context);
  expect(redis.incrementWithWindow.mock.calls[0][0]).toMatch(
    /^ratelimit:login:[a-f0-9]{64}:127\.0\.0\.1$/,
  );
});
```

Add a Redis outage test asserting `canActivate` resolves `true` when the primitive returns `null`.

- [ ] **Step 2: Run the focused guard tests and verify they fail.**

Run:

```text
cd backend && npm test -- --runInBand src/common/middlewares/login-rate-limiter.guard.spec.ts
```

Expected: FAIL because the guard does not exist.

- [ ] **Step 3: Implement the guard.**

Use `crypto.createHash('sha256')` over `email.trim().toLowerCase()`. Read `request.ip ?? 'unknown'`, call:

```ts
const count = await this.redis.incrementWithWindow(key, 900);
if (count === null) return true;
if (count > 5) {
  response.setHeader('Retry-After', 900);
  throw new TooManyRequestsException('Too many sign-in attempts');
}
return true;
```

Keep the guard route-specific rather than registering it globally.

- [ ] **Step 4: Wire the guard to sign-in.**

Import `RedisModule` into `AuthModule`, add `LoginRateLimiterGuard` to its providers, and decorate only the sign-in handler:

```ts
@Post('signin')
@HttpCode(HttpStatus.OK)
@UseGuards(LoginRateLimiterGuard)
async signin(@Body(new ZodValidationPipe(SigninSchema)) dto: SigninDto) {
  return this.authService.signin(dto);
}
```

Do not add it to signup, refresh, logout, public careers, or candidate routes.

- [ ] **Step 5: Run auth tests and commit.**

Run:

```text
cd backend && npm test -- --runInBand src/common/middlewares/login-rate-limiter.guard.spec.ts src/modules/auth/auth.controller.spec.ts src/modules/auth/auth.service.spec.ts
cd backend && npm run typecheck
```

Expected: PASS. Commit:

```text
git add backend/src/common/middlewares/login-rate-limiter.guard.ts backend/src/modules/auth
git commit -m "feat(m6): rate limit unified sign in"
```

---

## Task 5: Add the Tenant Dashboard Summary API

**Files:**
- Create: `backend/src/repositories/dashboard.repository.ts`
- Modify: `backend/src/repositories/repositories.module.ts`
- Create: `backend/src/modules/dashboard/dashboard.module.ts`
- Create: `backend/src/modules/dashboard/dashboard.controller.ts`
- Create: `backend/src/modules/dashboard/dashboard.service.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/modules/dashboard/dashboard.service.spec.ts`
- Test: `backend/src/repositories/dashboard.repository.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `CacheService.get<DashboardSummary>`, `CacheService.set`, `getTenantId()`, and `DashboardRepository.findSummary()`.
- Produces: `GET /api/dashboard/summary` with the approved summary contract and internal-role protection.

- [ ] **Step 1: Write the dashboard service tests.**

Define the test type:

```ts
type DashboardSummary = {
  totalApplications: number;
  totalCandidates: number;
  openJobPostings: number;
  applicationsByStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
  }>;
};
```

Test cache miss, cache hit, and cache fallback:

```ts
it('queries and caches on a miss', async () => {
  cache.get.mockResolvedValue(null);
  repository.findSummary.mockResolvedValue(summary);
  await expect(runInTenant(() => service.getSummary())).resolves.toEqual(summary);
  expect(cache.set).toHaveBeenCalledWith(
    'tenant:t1:dashboard:summary:v1',
    summary,
    60,
  );
});

it('returns a cache hit without querying the repository', async () => {
  cache.get.mockResolvedValue(summary);
  await expect(runInTenant(() => service.getSummary())).resolves.toEqual(summary);
  expect(repository.findSummary).not.toHaveBeenCalled();
});

it('falls back to the repository when the cache returns no value', async () => {
  cache.get.mockResolvedValue(null);
  repository.findSummary.mockResolvedValue(summary);
  await expect(runInTenant(() => service.getSummary())).resolves.toEqual(summary);
});
```

- [ ] **Step 2: Run dashboard tests and verify they fail.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/dashboard/dashboard.service.spec.ts
```

Expected: FAIL because the dashboard module, service, and repository do not exist.

- [ ] **Step 3: Implement the repository aggregate query.**

Create `DashboardRepository.findSummary()` using `withDb('current', ...)`. It must return the exact four-field contract. Implement the aggregate with the existing Drizzle schema tables and `sql` expressions:

```ts
const [applicationTotal] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(applications)
  .execute();
const [candidateTotal] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(candidates)
  .execute();
const [openJobTotal] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(jobPostings)
  .where(eq(jobPostings.status, 'open'))
  .execute();
const byStage = await db
  .select({
    stageId: pipelineStages.id,
    stageName: pipelineStages.name,
    count: sql<number>`count(${applications.id})::int`,
  })
  .from(applications)
  .leftJoin(
    pipelineStages,
    eq(applications.currentStageId, pipelineStages.id),
  )
  .groupBy(pipelineStages.id, pipelineStages.name)
  .orderBy(pipelineStages.order)
  .execute();

return {
  totalApplications: applicationTotal.count,
  totalCandidates: candidateTotal.count,
  openJobPostings: openJobTotal.count,
  applicationsByStage: byStage.map((stage) => ({
    stageId: stage.stageId ?? 'unassigned',
    stageName: stage.stageName ?? 'Unassigned',
    count: stage.count,
  })),
};
```

Map database count strings to numbers if the configured pg driver returns strings.

The repository must not accept a tenant ID. The schema is resolved by `BaseRepository` from the current `AsyncLocalStorage` context.

- [ ] **Step 4: Implement the dashboard service.**

Add:

```ts
const SUMMARY_TTL_SECONDS = 60;

async getSummary(): Promise<DashboardSummary> {
  const tenantId = getTenantId();
  const key = dashboardSummaryKey(tenantId);
  const cached = await this.cache.get<DashboardSummary>(key);
  if (cached) return cached;

  const summary = await this.dashboardRepo.findSummary();
  await this.cache.set(key, summary, SUMMARY_TTL_SECONDS);
  return summary;
}
```

`CacheService` already absorbs Redis failures, so this service always falls back to the repository on a cache miss or unavailable Redis.

- [ ] **Step 5: Add the controller and module.**

Use the existing internal role list:

```ts
const INTERNAL_ROLES = [
  'OrgAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...INTERNAL_ROLES)
  getSummary() {
    return this.dashboardService.getSummary();
  }
}
```

Import `AuthCoreModule`, `RepositoriesModule`, and `CacheModule` into `DashboardModule`. Register `DashboardModule` and `CacheModule` in `AppModule`; `RedisModule` is imported by `CacheModule` and `AuthModule`.

- [ ] **Step 6: Run dashboard tests and commit the API.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/dashboard/dashboard.service.spec.ts src/repositories/dashboard.repository.spec.ts
cd backend && npm run typecheck
```

Expected: PASS and no type errors. Commit:

```text
git add backend/src/repositories/dashboard.repository.ts backend/src/repositories/repositories.module.ts backend/src/modules/dashboard backend/src/app.module.ts
git commit -m "feat(m6): add cached tenant dashboard summary api"
```

---

## Task 6: Synchronize Existing Tenant Writes with the Dashboard Cache Contract

**Files:**
- Modify: `backend/src/modules/job-postings/job-postings.service.ts`
- Modify: `backend/src/modules/applications/applications.service.ts`
- Modify: `backend/src/modules/candidates/candidates.service.ts`
- Modify: `backend/src/modules/pipeline-stages/pipeline-stages.service.ts`
- Modify: corresponding module files and service specs

**Interfaces:**
- Consumes: `CacheService.invalidateTenantDashboard(tenantId)` from Task 3.
- Produces: Explicit invalidation calls after successful writes, with current tenant IDs obtained from `getTenantId()` or the authenticated context.

Keep the helper free of request context so candidate apply can invalidate the explicitly selected tenant while internal services use `getTenantId()`.

- [ ] **Step 1: Add failing invalidation assertions to existing service specs.**

Import `CacheModule` in each affected feature module and inject a `CacheService` mock with `invalidateTenantDashboard: jest.fn()` into each service test. Add assertions after successful writes:

```ts
expect(cacheService.invalidateTenantDashboard).toHaveBeenCalledWith('t1');
```

Cover job posting publish/close/delete, application stage update, manual candidate creation, candidate apply, and pipeline stage create/update/delete.

- [ ] **Step 2: Implement invalidation after successful writes only.**

Call invalidation after the database/index write has succeeded. Do not invalidate before validation or after a failed write. Use:

```ts
await this.cacheService.invalidateTenantDashboard(getTenantId());
```

for current-tenant services, and:

```ts
await this.cacheService.invalidateTenantDashboard(tenantId);
```

for candidate apply, where `tenantId` is the already validated open-job target.

For dashboard cache failures, `CacheService.invalidateTenantDashboard` must swallow/log the Redis error so the business mutation still succeeds.

- [ ] **Step 3: Run focused service tests.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/job-postings/job-postings.service.spec.ts src/modules/applications/applications.service.spec.ts src/modules/candidates/candidates.service.spec.ts src/modules/pipeline-stages/pipeline-stages.service.spec.ts src/modules/candidate-account/candidate-account.service.spec.ts
```

Expected: PASS with invalidation assertions. Commit:

```text
git add backend/src/modules/job-postings backend/src/modules/applications backend/src/modules/candidates backend/src/modules/pipeline-stages backend/src/modules/candidate-account
git commit -m "feat(m6): invalidate tenant dashboard after writes"
```

---

## Task 7: Complete Candidate and Organization Frontend Consumption

**Files:**
- Modify: `frontend/src/features/candidate-portal/types/index.ts`
- Modify: `frontend/src/features/candidate-portal/api/candidateApi.ts`
- Modify: `frontend/src/features/candidate-portal/applications/ApplicationsPage.tsx`
- Modify: `frontend/src/api/queryKeys.ts`
- Create: `frontend/src/api/dashboardApi.ts`
- Create: `frontend/src/features/org/dashboard/hooks/useDashboardSummary.ts`
- Create: `frontend/src/features/org/dashboard/OrgDashboardPage.tsx`
- Modify: `frontend/src/routes/org/dashboard.tsx`

**Interfaces:**
- Consumes: `GET /candidate/applications/:id`, `GET /dashboard/summary`, and the existing `ApiEnvelope<T>` type.
- Produces: Candidate application detail rendering and a functional `/org/dashboard` page.

- [ ] **Step 1: Align candidate frontend types and API methods.**

Update `Profile` to exactly match the backend response shape:

```ts
export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  skills: Skill[];
  resumeFileUrl: string | null;
  resumeUploadedAt: string | null;
  createdAt: string;
}

export interface CandidateApplicationDetail extends Application {
  tenantId: string;
  applicationId: string;
  matchScore: number | null;
  appliedSkillIds: string[] | null;
  coverLetter: string | null;
}
```

Add:

```ts
getApplication: async (applicationId: string): Promise<CandidateApplicationDetail> => {
  const { data } = await apiClient.get(`/candidate/applications/${applicationId}`);
  return unwrap(data as ApiEnvelope<CandidateApplicationDetail>);
},
```

Update `SettingsPage.tsx` to read `profile.resumeFileUrl` and `profile.resumeUploadedAt`; remove all reads of `profile.resume`.

- [ ] **Step 2: Add application detail query and UI.**

Add `candidate.application(applicationId)` to `queryKeys`. Create a `useApplicationDetail` hook under the candidate feature. Make each application row open a Mantine `Drawer`, load the detail by ID, and render status, company, job title, applied date, match score, and cover letter. Do not render recruiter notes.

- [ ] **Step 3: Add dashboard API and query hook.**

Create:

```ts
export interface DashboardSummary {
  totalApplications: number;
  totalCandidates: number;
  openJobPostings: number;
  applicationsByStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
  }>;
}

export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const { data } = await apiClient.get('/dashboard/summary');
    return (data as ApiEnvelope<DashboardSummary>).data;
  },
};
```

Add:

```ts
dashboardSummary: () => ['org', 'dashboard', 'summary'],
```

to `queryKeys.org`, then create `useDashboardSummary` using `useQuery` and the new query key.

- [ ] **Step 4: Replace the dashboard placeholder.**

Create `OrgDashboardPage.tsx` with:

- A loading state using `Loader`.
- An error state using `Alert color="red"`.
- Three summary cards for applications, candidates, and open jobs.
- A stage-count table or list using `applicationsByStage`.

Keep layout responsive with Mantine `SimpleGrid`, `Card`, `Stack`, and `Table`. Render the existing `/org/dashboard` route component as `<OrgDashboardPage />`.

- [ ] **Step 5: Run frontend verification and commit.**

Run:

```text
cd frontend && npm run build
cd frontend && npm run lint
```

Expected: PASS. Commit:

```text
git add frontend/src/api frontend/src/features/candidate-portal frontend/src/features/org/dashboard frontend/src/routes/org/dashboard.tsx
git commit -m "feat(m6): add candidate detail and organization dashboard ui"
```

---

## Task 8: Add Integration Coverage and Update Milestone Documentation

**Files:**
- Modify: `backend/test/app.e2e-spec.ts`
- Create: `backend/test/phase5b-phase6.e2e-spec.ts`
- Modify: `docs/09_IMPLEMENTATION_GUIDE.md`
- Modify: `docs/00_PROJECT_INSTRUCTIONS.md` only if its status text is stale after verification

**Interfaces:**
- Consumes: running PostgreSQL and Redis services, migrated public/template schemas, seeded accounts, and the implemented HTTP endpoints.
- Produces: Release-gate coverage for candidate boundaries, Redis limiting, dashboard cache isolation, and accurate milestone status.

- [ ] **Step 1: Add an e2e test bootstrap that fails clearly when infrastructure is unavailable.**

Use the existing Jest e2e configuration. The test setup must use `DATABASE_URL` and `REDIS_URL` from the environment, create uniquely named test tenants, and clean created rows/schemas in `afterAll`. Do not hard-code production or seed credentials into the test file. If PostgreSQL or Redis cannot be reached, fail in `beforeAll` with an error naming the missing service; do not silently skip the release-gate tests.

- [ ] **Step 2: Add the candidate cross-tenant flow test.**

The test must:

1. Create or locate two tenants with open jobs.
2. Sign up one candidate.
3. Fetch candidate jobs and assert only open index rows are returned.
4. Apply to Tenant A's job and assert a successful application ID.
5. Apply again and assert `409`.
6. Request the application detail as the owner and assert success.
7. Request the same detail using a different candidate token and assert `404`.
8. Move the application stage as an organization user and assert candidate history status changes.

- [ ] **Step 3: Add the login limiter e2e test.**

Send six sign-in requests with the same email and IP through Supertest. Assert the sixth response is `429`, has a numeric `Retry-After` header, and returns:

```json
{ "error": { "code": "RATE_LIMITED", "message": "..." } }
```

Use a unique normalized email per test so rate-limit keys do not affect one another.

- [ ] **Step 4: Add dashboard cache/isolation e2e coverage.**

Authenticate organization users in Tenant A and Tenant B. Assert each receives its own counts. Call Tenant A twice and verify the second request is served from Redis by checking the repository spy in an application-level test or inspecting the Redis key in an integration test. Create/update a Tenant A application and assert the Tenant A key is invalidated while Tenant B's key remains available.

- [ ] **Step 5: Update milestone documentation.**

Update Phase 5b and Phase 6 in `docs/09_IMPLEMENTATION_GUIDE.md` to reflect the verified implementation, including:

- Candidate routes are authenticated, with public careers remaining read-only.
- The missing candidate application-detail route now exists.
- Login limiter is sign-in-only with five attempts per 15 minutes.
- `GET /dashboard/summary` and its 60-second tenant cache exist.
- Anonymous apply and BullMQ remain out of scope.

- [ ] **Step 6: Run the complete verification suite.**

Run:

```text
docker compose up -d
cd backend && npm run typecheck
cd backend && npm test -- --runInBand
cd backend && npm run test:e2e
cd backend && npm run build
cd backend && npm run lint
cd frontend && npm run build
cd frontend && npm run lint
git diff --check dev...HEAD
git status --short --branch
```

Expected: all checks pass, the final status contains only intentionally uncommitted files, and no generated `tsconfig.tsbuildinfo` is committed.

- [ ] **Step 7: Review the branch before merge.**

Run:

```text
git log --oneline --decorate dev..HEAD
git diff --stat dev...HEAD
git diff --name-only dev...HEAD
```

Confirm every changed file belongs to Phase 5b/6, then merge the branch into `dev` only after the user approves the verified result.

---

## Plan Self-Review

- **Spec coverage:** Phase 5b route guards, open-job enforcement, application detail, duplicate constraint, skill validation, cover-letter persistence, index synchronization, frontend response alignment, Redis provider, cache fallback, login limiter, dashboard API, invalidation, frontend dashboard, tests, and merge gates each have explicit tasks.
- **Placeholder scan:** No `TBD`, `TODO`, or unspecified implementation step is required. Generated migration output is explicitly created by the repository's existing `drizzle-kit generate` workflow and must be inspected before application.
- **Type consistency:** `DashboardSummary`, `CacheService`, `RedisService`, `dashboardSummaryKey`, and candidate application detail signatures are defined before their consumers. The plan uses the existing `ApiEnvelope<T>`, `getTenantId()`, `withDb('current', ...)`, and guard patterns.
- **Scope check:** Phase 5b audit and Phase 6 Redis/cache are intentionally delivered as one branch because dashboard invalidation crosses the existing candidate, job, application, candidate, and pipeline services. BullMQ and anonymous public writes remain explicitly excluded.
