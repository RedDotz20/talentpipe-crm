# SuperAdmin Platform Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the SuperAdmin platform into a data-control center: a merged Users table (company users + candidates), a global Applications table, an upgraded Companies table with suspend/delete, and cascade rules (company suspend → all its users suspended; CompanyAdmin suspend → all users in the company suspended; company delete → accounts deleted + candidate applications marked cancelled).

**Architecture:** Backend gets one new read endpoint (`GET /platform/users`, merged shape), one new mutation endpoint (`DELETE /platform/companies/:id`, hard delete with public-table cleanup + `DROP SCHEMA`), and two cascade extensions to existing endpoints. Frontend adds two pages (`/admin/users`, `/admin/applications`), upgrades CompaniesPage, deletes CandidatesPage, and does all search/filter/pagination client-side over the fully-fetched lists (endpoints already return full lists; server-side pagination buys nothing at this scale).

**Tech Stack:** NestJS 11 + Drizzle (drizzle-orm rc4) + PostgreSQL 16, Jest (unit + e2e supertest), React 19 + Mantine 9 + TanStack Query 5 + TanStack Router 1, oxlint.

**Spec:** `docs/superpowers/specs/2026-08-08-superadmin-platform-control-design.md`

---

## File Structure Map

**Backend (modify):**
- `backend/src/repositories/user.repository.ts` — add `setAllStatus`
- `backend/src/repositories/company.repository.ts` — add `remove`, `dropSchema`
- `backend/src/repositories/candidate-applications-index.repository.ts` — add `cancelByCompany`
- `backend/src/repositories/job-listings-index.repository.ts` — add `deleteByCompany`
- `backend/src/repositories/user-email.repository.ts` — add `deleteByCompany`
- `backend/src/repositories/refresh-token.repository.ts` — add `deleteByCompany`
- `backend/src/modules/platform/platform.service.ts` — suspend/reactivate cascade via `UserRepository`
- `backend/src/modules/platform/platform-accounts.service.ts` — `listAllUsers()`, `deleteCompany()`, CompanyAdmin suspend cascade
- `backend/src/modules/platform/platform-accounts.controller.ts` — `GET /platform/users`, `DELETE /platform/companies/:id`
- `backend/src/modules/platform/platform.service.spec.ts`, `platform-accounts.service.spec.ts` — unit tests

**Backend (create):**
- `backend/test/phase12.e2e-spec.ts` — release-gate e2e for all M12 platform behavior

**Frontend (modify):**
- `frontend/src/api/platformApi.ts` — merged `PlatformUser`, `listUsers`, `deleteCompany`
- `frontend/src/api/queryKeys.ts` — `platform.users`
- `frontend/src/features/admin/hooks/usePlatform.ts` — `usePlatformUsers`, `useDeleteCompany`, users-key invalidation
- `frontend/src/features/admin/CompaniesPage.tsx` — search/filter/pagination + actions column + delete modal
- `frontend/src/features/admin/layout.tsx` — nav: Tenants, Users, Applications

**Frontend (create):**
- `frontend/src/features/admin/UsersPage.tsx`, `frontend/src/routes/admin/users.tsx`
- `frontend/src/features/admin/ApplicationsPage.tsx`, `frontend/src/routes/admin/applications.tsx`

**Frontend (delete):**
- `frontend/src/features/admin/CandidatesPage.tsx`, `frontend/src/routes/admin/candidates.tsx`

---

## Task 1: Repository primitives (backend)

**Files:**
- Modify: `backend/src/repositories/user.repository.ts`, `company.repository.ts`, `candidate-applications-index.repository.ts`, `job-listings-index.repository.ts`, `user-email.repository.ts`, `refresh-token.repository.ts`

These are one-liners following the existing repo patterns. They are exercised end-to-end by the e2e in Task 6; no standalone unit tests.

- [ ] **Step 1: Add `setAllStatus` to `user.repository.ts`**

Add after `updateStatus` (line ~82):

```ts
  async setAllStatus(status: 'active' | 'suspended', schema = 'current') {
    return this.withDb(schema, (db) =>
      db.update(users).set({ status }).execute(),
    );
  }
```

- [ ] **Step 2: Add `remove` and `dropSchema` to `company.repository.ts`**

Add after `updateStatus` (line ~57):

```ts
  async remove(id: string) {
    return this.withDb('public', (db) =>
      db.delete(companies).where(eq(companies.id, id)).execute(),
    );
  }

  async dropSchema(companyId: string) {
    return this.withDb('public', (db) =>
      db.execute(`DROP SCHEMA IF EXISTS "company_${companyId}" CASCADE`),
    );
  }
```

- [ ] **Step 3: Add `cancelByCompany` to `candidate-applications-index.repository.ts`**

Add after `updateStatus` (line ~124):

```ts
  async cancelByCompany(companyId: string) {
    return this.withDb('public', (db) =>
      db
        .update(candidateApplicationsIndex)
        .set({ status: 'cancelled' })
        .where(eq(candidateApplicationsIndex.companyId, companyId))
        .execute(),
    );
  }
```

- [ ] **Step 4: Add `deleteByCompany` to `job-listings-index.repository.ts`**

Add after `delete` (line ~144):

```ts
  async deleteByCompany(companyId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(jobListingsIndex)
        .where(eq(jobListingsIndex.companyId, companyId))
        .execute(),
    );
  }
```

- [ ] **Step 5: Add `deleteByCompany` to `user-email.repository.ts`**

Add after `deleteByUserId`:

```ts
  async deleteByCompany(companyId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(userEmails)
        .where(eq(userEmails.companyId, companyId))
        .execute(),
    );
  }
```

- [ ] **Step 6: Add `deleteByCompany` to `refresh-token.repository.ts`**

Add after `deleteByUser`:

```ts
  async deleteByCompany(companyId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(refreshTokens)
        .where(eq(refreshTokens.companyId, companyId))
        .execute(),
    );
  }
```

- [ ] **Step 7: Typecheck + unit tests**

Run: `cd backend && npm run typecheck && npm test`
Expected: typecheck clean, all existing unit specs pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/repositories
git commit -m "feat(m12): platform repo primitives for cascade and cleanup"
```

---

## Task 2: `GET /platform/users` — merged users endpoint (TDD)

**Files:**
- Test: `backend/src/modules/platform/platform-accounts.service.spec.ts`
- Modify: `backend/src/modules/platform/platform-accounts.service.ts`
- Modify: `backend/src/modules/platform/platform-accounts.controller.ts`

- [ ] **Step 1: Write the failing unit test**

In `platform-accounts.service.spec.ts`, add a new describe block (after the existing ones; file ends at line 314):

```ts
  describe('listAllUsers', () => {
    it('merges company users with company names and candidates', async () => {
      deps.tenantRepo.findAll.mockResolvedValue([
        { id: 'tenant-a', name: 'Acme' },
      ]);
      deps.userRepo.findAll.mockResolvedValue([
        { id: 'u1', email: 'a@acme.com', role: 'Recruiter', status: 'active', createdAt: new Date('2026-01-01') },
      ]);
      deps.candidateAccountRepo.findAll.mockResolvedValue([
        { id: 'c1', email: 'c@x.com', firstName: 'Jane', lastName: 'Doe', phone: null, resumeFileUrl: null, createdAt: new Date('2026-02-01') },
      ]);
      const service = makeService();
      const result = await service.listAllUsers();
      expect(result[0]).toEqual({
        type: 'company',
        id: 'u1',
        email: 'a@acme.com',
        role: 'Recruiter',
        status: 'active',
        companyId: 'tenant-a',
        companyName: 'Acme',
        firstName: null,
        lastName: null,
        createdAt: expect.any(Date),
      });
      expect(result[1]).toEqual({
        type: 'candidate',
        id: 'c1',
        email: 'c@x.com',
        role: 'Candidate',
        status: null,
        companyId: null,
        companyName: null,
        firstName: 'Jane',
        lastName: 'Doe',
        createdAt: expect.any(Date),
      });
      expect(deps.userRepo.findAll).toHaveBeenCalledWith('company_tenant-a');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/platform/platform-accounts.service.spec.ts -t listAllUsers`
Expected: FAIL — `listAllUsers` does not exist.

- [ ] **Step 3: Implement `listAllUsers` in `platform-accounts.service.ts`**

Add after `listCandidates` (line ~172):

```ts
  async listAllUsers() {
    const companies = await this.tenantRepo.findAll();
    const companyUsers: Array<{
      type: 'company';
      id: string;
      email: string;
      role: string;
      status: string;
      companyId: string;
      companyName: string;
      firstName: null;
      lastName: null;
      createdAt: Date;
    }> = [];
    for (const tenant of companies) {
      const users = await this.userRepo.findAll(this.schemaOf(tenant.id));
      for (const user of users) {
        companyUsers.push({
          type: 'company',
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          companyId: tenant.id,
          companyName: tenant.name,
          firstName: null,
          lastName: null,
          createdAt: user.createdAt,
        });
      }
    }
    const candidates = await this.candidateAccountRepo.findAll();
    const candidateRows = candidates.map((c) => ({
      type: 'candidate' as const,
      id: c.id,
      email: c.email,
      role: 'Candidate',
      status: null,
      companyId: null,
      companyName: null,
      firstName: c.firstName,
      lastName: c.lastName,
      createdAt: c.createdAt,
    }));
    return [...companyUsers, ...candidateRows].sort((a, b) =>
      a.email.localeCompare(b.email),
    );
  }
```

- [ ] **Step 4: Add the route in `platform-accounts.controller.ts`**

Add before `@Get('candidates')` (line ~92):

```ts
  @Get('users')
  listAllUsers() {
    return this.accountsService.listAllUsers();
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/modules/platform/platform-accounts.service.spec.ts -t listAllUsers`
Expected: PASS. Then run the full unit suite: `npm test` (all pass) and `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/platform
git commit -m "feat(m12): GET /platform/users merged company+candidate list"
```

---

## Task 3: Company suspend/reactivate cascade (TDD)

**Files:**
- Test: `backend/src/modules/platform/platform.service.spec.ts`
- Modify: `backend/src/modules/platform/platform.service.ts`

When a company is suspended, every user in its schema gets `status='suspended'`; reactivating sets them all back to `'active'`.

- [ ] **Step 1: Update the spec's mocks with the new dependency**

In `platform.service.spec.ts`, the `PlatformService` constructor now takes `UserRepository` as its 4th arg (after `AuditService`). Add a mock and register it as a provider:

```ts
  const userRepo = {
    setAllStatus: jest.fn(),
  };
```

and in the `Test.createTestingModule` providers add:

```ts
        { provide: UserRepository, useValue: userRepo },
```

and the import `import { UserRepository } from '../../repositories/user.repository';`. Note the provider order doesn't matter — NestJS resolves by token.

- [ ] **Step 2: Write the failing tests**

Add inside `describe('setCompanyStatus', ...)` (after the existing `conflicts` test):

```ts
    it('cascades suspension to every user in the schema', async () => {
      tenantRepo.findById.mockResolvedValue({
        id: 't1',
        name: 'Acme',
        slug: 'acme',
        status: 'active',
      });
      tenantRepo.updateStatus.mockResolvedValue({
        id: 't1',
        status: 'suspended',
      });
      await service.setCompanyStatus('t1', 'suspended');
      expect(userRepo.setAllStatus).toHaveBeenCalledWith(
        'suspended',
        'company_t1',
      );
    });

    it('cascades reactivation to every user in the schema', async () => {
      tenantRepo.findById.mockResolvedValue({
        id: 't1',
        name: 'Acme',
        slug: 'acme',
        status: 'suspended',
      });
      tenantRepo.updateStatus.mockResolvedValue({
        id: 't1',
        status: 'active',
      });
      await service.setCompanyStatus('t1', 'active');
      expect(userRepo.setAllStatus).toHaveBeenCalledWith('active', 'company_t1');
    });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest src/modules/platform/platform.service.spec.ts`
Expected: FAIL — new tests fail (no `setAllStatus` call; also possibly compile error until Step 4).

- [ ] **Step 4: Implement the cascade in `platform.service.ts`**

Add `UserRepository` to the imports and constructor:

```ts
import { UserRepository } from '../../repositories/user.repository';
```

```ts
  constructor(
    private readonly tenantRepo: CompanyRepository,
    private readonly usageRepo: UsageRepository,
    private readonly auditService: AuditService,
    private readonly userRepo: UserRepository,
  ) {}
```

In `setCompanyStatus`, after `const updated = await this.tenantRepo.updateStatus(id, status);` (line ~43), add:

```ts
    await this.userRepo.setAllStatus(status, `company_${id}`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest src/modules/platform/platform.service.spec.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/platform/platform.service.ts backend/src/modules/platform/platform.service.spec.ts
git commit -m "feat(m12): company suspend/reactivate cascades to all users"
```

---

## Task 4: CompanyAdmin suspend cascade (TDD)

**Files:**
- Test: `backend/src/modules/platform/platform-accounts.service.spec.ts`
- Modify: `backend/src/modules/platform/platform-accounts.service.ts`

When a CompanyAdmin user is suspended, every user in that company's schema is also suspended and all company refresh tokens are deleted. Reactivation does NOT cascade.

- [ ] **Step 1: Extend the mocks in the spec**

In `makeDeps()` add to `userRepo`:

```ts
      setAllStatus: jest.fn(),
```

and to `refreshTokenRepo`:

```ts
    refreshTokenRepo: { deleteByUser: jest.fn(), deleteByCompany: jest.fn() },
```

- [ ] **Step 2: Write the failing tests**

Add a new describe block at the end of the file:

```ts
  describe('setCompanyUserStatus', () => {
    it('cascades when the suspended user is the CompanyAdmin', async () => {
      deps.userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'admin@x.com',
        role: 'CompanyAdmin',
        status: 'active',
      });
      deps.userRepo.updateStatus.mockResolvedValue({
        id: 'u1',
        email: 'admin@x.com',
        role: 'CompanyAdmin',
        status: 'suspended',
      });
      const service = makeService();
      await service.setCompanyUserStatus('tenant-a', 'u1', 'suspended');
      expect(deps.userRepo.setAllStatus).toHaveBeenCalledWith(
        'suspended',
        'company_tenant-a',
      );
      expect(deps.refreshTokenRepo.deleteByCompany).toHaveBeenCalledWith(
        'tenant-a',
      );
    });

    it('does not cascade for non-admin roles', async () => {
      deps.userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'rec@x.com',
        role: 'Recruiter',
        status: 'active',
      });
      deps.userRepo.updateStatus.mockResolvedValue({
        id: 'u1',
        email: 'rec@x.com',
        role: 'Recruiter',
        status: 'suspended',
      });
      const service = makeService();
      await service.setCompanyUserStatus('tenant-a', 'u1', 'suspended');
      expect(deps.userRepo.setAllStatus).not.toHaveBeenCalled();
    });

    it('does not cascade on reactivation of a CompanyAdmin', async () => {
      deps.userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'admin@x.com',
        role: 'CompanyAdmin',
        status: 'suspended',
      });
      deps.userRepo.updateStatus.mockResolvedValue({
        id: 'u1',
        email: 'admin@x.com',
        role: 'CompanyAdmin',
        status: 'active',
      });
      const service = makeService();
      await service.setCompanyUserStatus('tenant-a', 'u1', 'active');
      expect(deps.userRepo.setAllStatus).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest src/modules/platform/platform-accounts.service.spec.ts -t setCompanyUserStatus`
Expected: FAIL — `setAllStatus` not called.

- [ ] **Step 4: Implement the cascade in `platform-accounts.service.ts`**

In `setCompanyUserStatus` (line ~128), replace:

```ts
    const updated = await this.userRepo.updateStatus(userId, status, schema);
    if (status === 'suspended') {
      await this.refreshTokenRepo.deleteByUser(userId);
    }
```

with:

```ts
    const updated = await this.userRepo.updateStatus(userId, status, schema);
    if (status === 'suspended') {
      await this.refreshTokenRepo.deleteByUser(userId);
      if (user.role === 'CompanyAdmin') {
        await this.userRepo.setAllStatus('suspended', schema);
        await this.refreshTokenRepo.deleteByCompany(companyId);
      }
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest src/modules/platform/platform-accounts.service.spec.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/platform/platform-accounts.service.ts backend/src/modules/platform/platform-accounts.service.spec.ts
git commit -m "feat(m12): CompanyAdmin suspend cascades to all company users"
```

---

## Task 5: `DELETE /platform/companies/:id` — hard delete (TDD)

**Files:**
- Test: `backend/src/modules/platform/platform-accounts.service.spec.ts`
- Modify: `backend/src/modules/platform/platform-accounts.service.ts`
- Modify: `backend/src/modules/platform/platform-accounts.controller.ts`

Delete order: cancel index rows (kept, status `cancelled`) → delete `job_listings_index` → delete `user_emails` → delete `refresh_tokens` → drop schema → delete companies row → audit `company.delete`.

- [ ] **Step 1: Extend the mocks in the spec**

In `makeDeps()` add a new repo mock:

```ts
    jobListingsIndexRepo: { deleteByCompany: jest.fn() },
```

and add to the `PlatformAccountsService` constructor call in `makeService()` after `pipelineStageRepo`:

```ts
    merged.jobListingsIndexRepo as JobListingsIndexRepository,
```

with import `import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';`.

Also add to the existing mocks (used by `deleteCompany`): `tenantRepo.remove: jest.fn()`, `tenantRepo.dropSchema: jest.fn()` — add to `tenantRepo`:

```ts
      remove: jest.fn(),
      dropSchema: jest.fn(),
```

- [ ] **Step 2: Write the failing tests**

Add a new describe block at the end of the file:

```ts
  describe('deleteCompany', () => {
    it('cancels index rows, cleans public rows, drops the schema, and audits', async () => {
      deps.tenantRepo.findById.mockResolvedValue({
        id: 'tenant-a',
        name: 'Acme',
        slug: 'acme',
      });
      const service = makeService();
      const result = await service.deleteCompany('tenant-a');
      expect(result).toEqual({ id: 'tenant-a' });
      expect(deps.candidateIndexRepo.cancelByCompany).toHaveBeenCalledWith(
        'tenant-a',
      );
      expect(deps.jobListingsIndexRepo.deleteByCompany).toHaveBeenCalledWith(
        'tenant-a',
      );
      expect(deps.userEmailRepo.deleteByCompany).toHaveBeenCalledWith(
        'tenant-a',
      );
      expect(deps.refreshTokenRepo.deleteByCompany).toHaveBeenCalledWith(
        'tenant-a',
      );
      expect(deps.tenantRepo.dropSchema).toHaveBeenCalledWith('tenant-a');
      expect(deps.tenantRepo.remove).toHaveBeenCalledWith('tenant-a');
      expect(deps.auditService.log).toHaveBeenCalledWith(
        'company.delete',
        'tenant-a',
        { name: 'Acme', slug: 'acme' },
        'tenant-a',
      );
    });

    it('throws NotFoundException for an unknown company', async () => {
      deps.tenantRepo.findById.mockResolvedValue(null);
      const service = makeService();
      await expect(service.deleteCompany('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest src/modules/platform/platform-accounts.service.spec.ts -t deleteCompany`
Expected: FAIL — `deleteCompany` does not exist.

- [ ] **Step 4: Implement `deleteCompany` in `platform-accounts.service.ts`**

Add `JobListingsIndexRepository` to imports:

```ts
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
```

Add to the constructor after `pipelineStageRepo`:

```ts
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
```

Add the method after `removeCandidate` (end of class):

```ts
  async deleteCompany(companyId: string) {
    const tenant = await this.requireCompany(companyId);
    await this.candidateIndexRepo.cancelByCompany(companyId);
    await this.jobListingsIndexRepo.deleteByCompany(companyId);
    await this.userEmailRepo.deleteByCompany(companyId);
    await this.refreshTokenRepo.deleteByCompany(companyId);
    await this.tenantRepo.dropSchema(companyId);
    await this.tenantRepo.remove(companyId);
    await this.auditService.log(
      'company.delete',
      companyId,
      { name: tenant.name, slug: tenant.slug },
      companyId,
    );
    return { id: companyId };
  }
```

- [ ] **Step 5: Add the route in `platform-accounts.controller.ts`**

Add `Delete` is already imported. Add after `removeCompanyUser` (line ~86):

```ts
  @Delete('companies/:id')
  deleteCompany(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.deleteCompany(id);
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx jest src/modules/platform/platform-accounts.service.spec.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/platform
git commit -m "feat(m12): DELETE /platform/companies/:id hard delete with cancelled applications"
```

---

## Task 6: e2e release gate — `phase12.e2e-spec.ts`

**Files:**
- Create: `backend/test/phase12.e2e-spec.ts`

Requires Docker (postgres + redis) running and migrations + seed applied (see `docs/00b_LOCAL_DEV_BOOTSTRAP.md`).

- [ ] **Step 1: Create the e2e spec**

Create `backend/test/phase12.e2e-spec.ts`:

```ts
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import Redis from 'ioredis';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';

interface ApiEnvelope<T> {
  data: T;
  message: string;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface JwtClaims {
  sub: string;
  companyId?: string;
  role: string;
}

interface CompanyAccount {
  companyId: string;
  userId: string;
  token: string;
  email: string;
  password: string;
}

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdCompanyIds: string[] = [];
const createdOrgUserIds: string[] = [];
const createdSuperAdminIds: string[] = [];
const createdCandidateIds: string[] = [];
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

const decodeClaims = (token: string): JwtClaims => {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('The test token did not contain a JWT payload');
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as JwtClaims;
};

const assertStatus = (
  response: { status: number; body: unknown },
  expected: number,
): void => {
  if (response.status !== expected) {
    throw new Error(
      `Expected HTTP ${expected}, received ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
};

const assertEnvelope = <T>(
  response: { status: number; body: unknown },
  expectedStatus: number,
): T => {
  assertStatus(response, expectedStatus);
  const envelope = response.body as ApiEnvelope<T>;
  if (!envelope.data) throw new Error('The response did not contain data');
  return envelope.data;
};

const verifyInfrastructure = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl) {
    throw new Error('PostgreSQL unavailable: DATABASE_URL is not configured');
  }
  if (!redisUrl) {
    throw new Error('Redis unavailable: REDIS_URL is not configured');
  }

  cleanupPool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await cleanupPool.query('SELECT 1');
  } catch (error: unknown) {
    await cleanupPool.end();
    cleanupPool = undefined;
    throw new Error(
      `PostgreSQL unavailable via DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  cleanupRedis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  try {
    await cleanupRedis.connect();
    await cleanupRedis.ping();
  } catch (error: unknown) {
    cleanupRedis.disconnect();
    cleanupRedis = undefined;
    await cleanupPool.end();
    cleanupPool = undefined;
    throw new Error(
      `Redis unavailable via REDIS_URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const httpServer = (): Server => {
  if (!app) throw new Error('Nest application was not initialized');
  return app.getHttpServer();
};

const signIn = async (
  email: string,
  password: string,
): Promise<request.Response> =>
  request(httpServer()).post('/api/auth/signin').send({ email, password });

const createTenant = async (suffix: string): Promise<CompanyAccount> => {
  const email = `phase12-${suffix}-${runId}@example.test`;
  const password = `Phase12Org!${randomUUID().slice(0, 18)}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({
      companyName: `Phase 12 ${suffix} ${runId}`,
      slug: `phase12-${suffix}-${runId}`,
      email,
      password,
    });
  const tokens = assertEnvelope<Tokens>(response, 201);
  const claims = decodeClaims(tokens.accessToken);
  if (!claims.companyId)
    throw new Error('Company token did not contain companyId');
  createdCompanyIds.push(claims.companyId);
  createdOrgUserIds.push(claims.sub);
  return {
    companyId: claims.companyId,
    userId: claims.sub,
    token: tokens.accessToken,
    email,
    password,
  };
};

const createSuperAdmin = async (): Promise<CompanyAccount> => {
  const pool = cleanupPool;
  if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
  const email = `phase12-superadmin-${runId}@example.test`;
  const password = `Phase12Sa!${randomUUID().slice(0, 16)}`;
  const userId = randomUUID();
  const passwordHash = (await argon2.hash(password)) as string;
  await pool.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, passwordHash, 'Phase 12 SuperAdmin'],
  );
  createdSuperAdminIds.push(userId);

  const response = await signIn(email, password);
  const tokens = assertEnvelope<Tokens>(response, 200);
  return {
    companyId: 'public',
    userId,
    token: tokens.accessToken,
    email,
    password,
  };
};

let superAdminTokenValue = '';
const superAdminToken = (): string => {
  if (!superAdminTokenValue)
    throw new Error('SuperAdmin was not initialized before use');
  return superAdminTokenValue;
};

const createPlatformCandidate = async (
  suffix: string,
): Promise<{ id: string; email: string; password: string }> => {
  const email = `phase12-cand-${suffix}-${runId}@example.test`;
  const password = `Phase12Cd!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post('/api/platform/candidates')
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({
      email,
      password,
      firstName: `Phase12 ${suffix}`,
      lastName: 'Candidate',
    });
  const candidate = assertEnvelope<{ id: string; email: string }>(created, 201);
  createdCandidateIds.push(candidate.id);
  return { id: candidate.id, email, password };
};

const createCompanyUser = async (
  companyId: string,
  suffix: string,
  role = 'Recruiter',
): Promise<{ user: { id: string; role: string }; email: string; password: string }> => {
  const email = `phase12-${suffix}-${runId}@example.test`;
  const password = `Phase12U!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post(`/api/platform/companies/${companyId}/users`)
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({ email, role, password });
  const user = assertEnvelope<{ id: string; role: string }>(created, 201);
  return { user, email, password };
};

const createOpenJob = async (
  tenant: CompanyAccount,
  suffix: string,
): Promise<{ id: string }> => {
  const created = await request(httpServer())
    .post('/api/job-postings')
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({ title: `Phase 12 ${suffix} Job ${runId}` });
  const posting = assertEnvelope<{ id: string }>(created, 201);
  await request(httpServer())
    .post(`/api/job-postings/${posting.id}/publish`)
    .set('Authorization', `Bearer ${tenant.token}`);
  return { id: posting.id };
};

const applyAsCandidate = async (
  token: string,
  companyId: string,
  jobId: string,
): Promise<{ applicationId: string }> => {
  const applied = await request(httpServer())
    .post(`/api/candidate/jobs/${companyId}/${jobId}/apply`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  return assertEnvelope<{ applicationId: string }>(applied, 201);
};

const cleanupDatabase = async (): Promise<void> => {
  if (!cleanupPool) return;
  if (createdSuperAdminIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.refresh_tokens WHERE user_id = ANY($1::uuid[])',
      [createdSuperAdminIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.super_admins WHERE id = ANY($1::uuid[])',
      [createdSuperAdminIds],
    );
  }
  if (createdCandidateIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.refresh_tokens WHERE user_id = ANY($1::uuid[])',
      [createdCandidateIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.audit_logs WHERE resource_id = ANY($1::text[])',
      [createdCandidateIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.candidate_applications_index WHERE candidate_account_id = ANY($1::uuid[])',
      [createdCandidateIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.candidate_accounts WHERE id = ANY($1::uuid[])',
      [createdCandidateIds],
    );
  }
  if (createdCompanyIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.audit_logs WHERE company_id = ANY($1::text[])',
      [createdCompanyIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.candidate_applications_index WHERE company_id = ANY($1::text[])',
      [createdCompanyIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.job_listings_index WHERE company_id = ANY($1::text[])',
      [createdCompanyIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.user_emails WHERE company_id = ANY($1::uuid[])',
      [createdCompanyIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.refresh_tokens WHERE company_id = ANY($1::uuid[])',
      [createdCompanyIds],
    );
  }
  if (createdOrgUserIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.refresh_tokens WHERE user_id = ANY($1::uuid[])',
      [createdOrgUserIds],
    );
  }
  if (createdCompanyIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.companies WHERE id = ANY($1::uuid[])',
      [createdCompanyIds],
    );
    for (const companyId of createdCompanyIds) {
      await cleanupPool.query(
        `DROP SCHEMA IF EXISTS "company_${companyId}" CASCADE`,
      );
    }
  }
};

const cleanupRedisKeys = async (pattern: string): Promise<void> => {
  if (!cleanupRedis) return;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await cleanupRedis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100,
    );
    if (keys.length > 0) await cleanupRedis.del(...keys);
    cursor = nextCursor;
  } while (cursor !== '0');
};

describe('Phase 12 release gate', () => {
  let superAdmin: CompanyAccount;
  let tenant: CompanyAccount;
  let candidateAToken = '';
  let doomed: CompanyAccount;

  beforeAll(async () => {
    jest.setTimeout(30000);
    await verifyInfrastructure();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();

    superAdmin = await createSuperAdmin();
    superAdminTokenValue = superAdmin.token;
    tenant = await createTenant('a');
    doomed = await createTenant('doomed');
    const candidateA = await createPlatformCandidate('a');
    const signin = await signIn(candidateA.email, candidateA.password);
    candidateAToken = assertEnvelope<Tokens>(signin, 200).accessToken;
  });

  afterAll(async () => {
    try {
      await cleanupDatabase();
      await cleanupRedisKeys('bull:notifications:*');
      await cleanupRedisKeys('limiter:*');
    } finally {
      if (app) await app.close();
      if (cleanupRedis) await cleanupRedis.quit();
      if (cleanupPool) await cleanupPool.end();
    }
  });

  describe('platform RBAC on new routes', () => {
    it('forbids CompanyAdmin and Candidate on users list and company delete', async () => {
      const routes: Array<[string, string]> = [
        ['GET', '/api/platform/users'],
        ['DELETE', `/api/platform/companies/${tenant.companyId}`],
      ];
      for (const token of [tenant.token, candidateAToken]) {
        for (const [method, path] of routes) {
          const response = await request(httpServer())
            [method.toLowerCase() as 'get' | 'delete'](path)
            .set('Authorization', `Bearer ${token}`);
          assertStatus(response, 403);
        }
      }
      const anonymous = await request(httpServer()).get('/api/platform/users');
      assertStatus(anonymous, 401);
    });
  });

  describe('merged users list', () => {
    it('returns company users with company names and candidates with null company', async () => {
      const listed = await request(httpServer())
        .get('/api/platform/users')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const rows = assertEnvelope<
        Array<{
          type: string;
          email: string;
          role: string;
          status: string | null;
          companyId: string | null;
          companyName: string | null;
        }>
      >(listed, 200);

      const admin = rows.find((r) => r.email === tenant.email);
      expect(admin?.type).toBe('company');
      expect(admin?.companyId).toBe(tenant.companyId);
      expect(admin?.companyName).toBe(`Phase 12 a ${runId}`);
      expect(admin?.role).toBe('CompanyAdmin');
      expect(admin?.status).toBe('active');

      const candidate = rows.find((r) => r.email === `phase12-cand-a-${runId}@example.test`);
      expect(candidate?.type).toBe('candidate');
      expect(candidate?.companyId).toBeNull();
      expect(candidate?.companyName).toBeNull();
      expect(candidate?.role).toBe('Candidate');
      expect(candidate?.status).toBeNull();
    });
  });

  describe('company suspend cascade', () => {
    it('suspends every user in the schema, reactivation restores them', async () => {
      const extra = await createCompanyUser(tenant.companyId, 'cascade');
      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');

      await request(httpServer())
        .patch(`/api/platform/companies/${tenant.companyId}/suspend`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const suspended = (
        await pool.query(
          `SELECT status FROM "company_${tenant.companyId}".users WHERE id = ANY($1::uuid[])`,
          [[extra.user.id, tenant.userId]],
        )
      ).rows as Array<{ status: string }>;
      expect(suspended.every((row) => row.status === 'suspended')).toBe(true);

      const blockedSignin = await signIn(tenant.email, tenant.password);
      assertStatus(blockedSignin, 403);

      await request(httpServer())
        .patch(`/api/platform/companies/${tenant.companyId}/reactivate`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const restored = (
        await pool.query(
          `SELECT status FROM "company_${tenant.companyId}".users WHERE id = ANY($1::uuid[])`,
          [[extra.user.id, tenant.userId]],
        )
      ).rows as Array<{ status: string }>;
      expect(restored.every((row) => row.status === 'active')).toBe(true);

      const restoredSignin = await signIn(tenant.email, tenant.password);
      assertEnvelope<Tokens>(restoredSignin, 200);
    });
  });

  describe('CompanyAdmin suspend cascade', () => {
    it('suspends all users when the CompanyAdmin is suspended, reactivation does not cascade', async () => {
      const extra = await createCompanyUser(tenant.companyId, 'admincascade');
      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');

      await request(httpServer())
        .patch(
          `/api/platform/companies/${tenant.companyId}/users/${tenant.userId}/suspend`,
        )
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const suspended = (
        await pool.query(
          `SELECT status FROM "company_${tenant.companyId}".users WHERE id = $1`,
          [extra.user.id],
        )
      ).rows as Array<{ status: string }>;
      expect(suspended[0]?.status).toBe('suspended');

      await request(httpServer())
        .patch(
          `/api/platform/companies/${tenant.companyId}/users/${tenant.userId}/reactivate`,
        )
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const stillSuspended = (
        await pool.query(
          `SELECT status FROM "company_${tenant.companyId}".users WHERE id = $1`,
          [extra.user.id],
        )
      ).rows as Array<{ status: string }>;
      expect(stillSuspended[0]?.status).toBe('suspended');

      await request(httpServer())
        .patch(
          `/api/platform/companies/${tenant.companyId}/users/${extra.user.id}/reactivate`,
        )
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);
    });
  });

  describe('company delete cascade', () => {
    it('drops the schema, cleans public rows, cancels applications, keeps candidates', async () => {
      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');

      const jobId = (await createOpenJob(doomed, 'doomed')).id;
      const applicationId = (
        await applyAsCandidate(candidateAToken, doomed.companyId, jobId)
      ).applicationId;

      await request(httpServer())
        .delete(`/api/platform/companies/${doomed.companyId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const schemaExists = (
        await pool.query(
          `SELECT COUNT(*)::int AS count FROM information_schema.schemata WHERE schema_name = $1`,
          [`company_${doomed.companyId}`],
        )
      ).rows[0] as { count: number };
      expect(schemaExists.count).toBe(0);

      const companyRow = (
        await pool.query('SELECT COUNT(*)::int AS count FROM public.companies WHERE id = $1', [
          doomed.companyId,
        ])
      ).rows[0] as { count: number };
      expect(companyRow.count).toBe(0);

      const emailRows = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.user_emails WHERE company_id = $1',
          [doomed.companyId],
        )
      ).rows[0] as { count: number };
      expect(emailRows.count).toBe(0);

      const tokenRows = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.refresh_tokens WHERE company_id = $1',
          [doomed.companyId],
        )
      ).rows[0] as { count: number };
      expect(tokenRows.count).toBe(0);

      const jobRows = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.job_listings_index WHERE company_id = $1',
          [doomed.companyId],
        )
      ).rows[0] as { count: number };
      expect(jobRows.count).toBe(0);

      const indexRows = (
        await pool.query(
          'SELECT status FROM public.candidate_applications_index WHERE company_id = $1',
          [doomed.companyId],
        )
      ).rows as Array<{ status: string }>;
      expect(indexRows.length).toBe(1);
      expect(indexRows[0]?.status).toBe('cancelled');

      const candidateStillLives = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.candidate_accounts WHERE email = $1',
          [`phase12-cand-a-${runId}@example.test`],
        )
      ).rows[0] as { count: number };
      expect(candidateStillLives.count).toBe(1);

      const auditRow = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.audit_logs WHERE company_id = $1 AND action = $2',
          [doomed.companyId, 'company.delete'],
        )
      ).rows[0] as { count: number };
      expect(auditRow.count).toBe(1);

      const doomedSignin = await signIn(doomed.email, doomed.password);
      assertStatus(doomedSignin, 401);
    });
  });

  describe('unknown company delete', () => {
    it('404s for a nonexistent company', async () => {
      const response = await request(httpServer())
        .delete(`/api/platform/companies/${randomUUID()}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertStatus(response, 404);
    });
  });
});
```

Note: `doomedSignin` expects 401 because the company schema is gone, so the sign-in lookup for its user fails (sign-in resolves the tenant user inside `company_<id>` and gets no row → unauthorized). If sign-in returns 403 instead (per-user status check ordering), assert the actual status you observe and adjust to `assertStatus(doomedSignin, 403)`. Run and fix based on observed behavior — the assertion must match what the auth flow emits; both values prove the account is dead.

- [ ] **Step 2: Run the e2e suite**

Run: `cd backend && npm run test:e2e -- phase12`
Expected: ALL PASS. If the `doomedSignin` status is 403 instead of 401, update that one assertion and re-run.

- [ ] **Step 3: Run the full e2e + unit suites**

Run: `cd backend && npm test && npm run test:e2e`
Expected: all pass (phase9/phase11/phase12 release gates + unit specs).

- [ ] **Step 4: Commit**

```bash
git add backend/test/phase12.e2e-spec.ts
git commit -m "test(m12): phase12 e2e for platform control gates"
```

---

## Task 7: Frontend API client, query keys, hooks

**Files:**
- Modify: `frontend/src/api/platformApi.ts`
- Modify: `frontend/src/api/queryKeys.ts`
- Modify: `frontend/src/features/admin/hooks/usePlatform.ts`

- [ ] **Step 1: Merge `PlatformUser` and add client methods**

In `platformApi.ts`, replace the `PlatformUser` interface (lines 24-30) with:

```ts
export interface PlatformUser {
  type: 'company' | 'candidate';
  id: string;
  email: string;
  role: string;
  status: 'active' | 'suspended' | null;
  companyId: string | null;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
}
```

Add to the `platformApi` object (after `getStats`):

```ts
  listUsers: async (): Promise<PlatformUser[]> => {
    const { data } = await apiClient.get('/platform/users');
    return unwrap(data as ApiEnvelope<PlatformUser[]>);
  },
  deleteCompany: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/companies/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
```

- [ ] **Step 2: Add the query key**

In `queryKeys.ts`, add to the `platform` object (after `stats`):

```ts
    users: () => ['platform', 'users'],
```

- [ ] **Step 3: Add hooks + invalidation**

In `usePlatform.ts`:

Add after `usePlatformStats`:

```ts
export function usePlatformUsers() {
  return useQuery({
    queryKey: queryKeys.platform.users(),
    queryFn: platformApi.listUsers,
  });
}
```

Add after `useSetCompanyStatus`:

```ts
export function useDeleteCompany() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => platformApi.deleteCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.companies() });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.stats() });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
    },
  });
}
```

Extend every user/candidate mutation to also invalidate the merged users list (the global UsersPage must refresh). Change each `onSuccess` to add:

```ts
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
```

for these hooks: `useSetCompanyStatus`, `useCreateCompanyUser`, `useUpdateCompanyUser`, `useSetCompanyUserStatus`, `useRemoveCompanyUser`, `useCreateCandidate`, `useUpdateCandidate`, `useRemoveCandidate` (keep their existing invalidation lines).

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api frontend/src/features/admin/hooks
git commit -m "feat(m12): frontend API + hooks for platform users and company delete"
```

---

## Task 8: CompaniesPage — search, filter, pagination, actions

**Files:**
- Modify: `frontend/src/features/admin/CompaniesPage.tsx` (replace whole file)

- [ ] **Step 1: Replace `CompaniesPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Pagination,
  Select,
  SimpleGrid,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import {
  useDeleteCompany,
  usePlatformCompanies,
  usePlatformStats,
  useSetCompanyStatus,
} from './hooks/usePlatform'
import type { PlatformCompany } from '@/api/platformApi'

const PAGE_SIZE = 10

export function CompaniesPage() {
  const companiesQuery = usePlatformCompanies()
  const statsQuery = usePlatformStats()
  const setStatus = useSetCompanyStatus()
  const deleteCompany = useDeleteCompany()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<PlatformCompany | null>(null)

  const companies = companiesQuery.data ?? []

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return companies.filter((company) => {
      if (statusFilter && company.status !== statusFilter) return false
      if (
        term &&
        !company.name.toLowerCase().includes(term) &&
        !company.slug.toLowerCase().includes(term)
      ) {
        return false
      }
      return true
    })
  }, [companies, search, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Platform</Title>
      </Group>

      {statsQuery.isLoading ? (
        <Loader />
      ) : (
        <SimpleGrid cols={3} mb="lg">
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Companies
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.companies ?? 0}
            </Text>
          </Card>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Users
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.users ?? 0}
            </Text>
          </Card>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Applications
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.applications ?? 0}
            </Text>
          </Card>
        </SimpleGrid>
      )}

      <Group mb="md">
        <TextInput
          placeholder="Search name or slug"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value)
            setPage(1)
          }}
        />
        <Select
          placeholder="Status"
          clearable
          data={[
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
        />
      </Group>

      {companiesQuery.isLoading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <Text c="dimmed">No companies match.</Text>
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Company</Table.Th>
                <Table.Th>Slug</Table.Th>
                <Table.Th>Plan</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((company) => (
                <Table.Tr key={company.id}>
                  <Table.Td>
                    <Link
                      to="/admin/companies/$companyId"
                      params={{ companyId: company.id }}
                    >
                      {company.name}
                    </Link>
                  </Table.Td>
                  <Table.Td>{company.slug}</Table.Td>
                  <Table.Td>{company.plan}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={company.status === 'suspended' ? 'red' : 'green'}
                    >
                      {company.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{dayjs(company.createdAt).format('MMM D, YYYY')}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        color={company.status === 'suspended' ? 'green' : 'yellow'}
                        loading={setStatus.isPending}
                        onClick={() =>
                          setStatus.mutate({
                            id: company.id,
                            status:
                              company.status === 'suspended' ? 'active' : 'suspended',
                          })
                        }
                      >
                        {company.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => setDeleting(company)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="center" mt="md">
            <Pagination
              total={pageCount}
              value={page}
              onChange={setPage}
              size="sm"
            />
          </Group>
        </>
      )}

      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete company"
      >
        <Text>
          Delete <b>{deleting?.name}</b>? This permanently removes all of its
          users, data, and schema, and marks applications made by candidates to
          this company as cancelled. This cannot be undone.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deleteCompany.isPending}
            onClick={() => {
              if (deleting) {
                deleteCompany.mutate(deleting.id, {
                  onSuccess: () => setDeleting(null),
                })
              }
            }}
          >
            Delete
          </Button>
        </Group>
      </Modal>
    </>
  )
}
```

Note: the row is no longer clickable-to-navigate (the name is now the link), because action buttons inside a `<Link>`-wrapped row break navigation and hover UX.

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/admin/CompaniesPage.tsx
git commit -m "feat(m12): companies table with search, filters, pagination, delete"
```

---

## Task 9: UsersPage — merged users table

**Files:**
- Create: `frontend/src/features/admin/UsersPage.tsx`
- Create: `frontend/src/routes/admin/users.tsx`

- [ ] **Step 1: Create `UsersPage.tsx`**

Company-user actions (suspend/reactivate/remove) are per-company hooks in `usePlatform.ts` (`useSetCompanyUserStatus(companyId)`, `useRemoveCompanyUser(companyId)`). A row in the merged table can belong to any company, so calling those factories inside a map would violate the rules of hooks. Instead this page builds the two mutations at component level with `useApiMutation` + `platformApi` directly (the same mutation bodies those hooks use), with `companyId` carried in the mutation variables.

```tsx
import { useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NativeSelect,
  Pagination,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { INTERNAL_USER_ROLES } from '@/api/companyUsersApi'
import { platformApi, type PlatformUser } from '@/api/platformApi'
import { queryKeys } from '@/api/queryKeys'
import { useApiMutation } from '@/hooks/useApiMutation'
import {
  useCreateCandidate,
  usePlatformCompanies,
  usePlatformUsers,
  useRemoveCandidate,
  useUpdateCandidate,
} from './hooks/usePlatform'

const PAGE_SIZE = 10
const roleOptions = INTERNAL_USER_ROLES.map((r) => ({ value: r, label: r }))

interface CandidateForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
}

const emptyCandidateForm: CandidateForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const usersQuery = usePlatformUsers()
  const companiesQuery = usePlatformCompanies()
  const createCandidate = useCreateCandidate()
  const updateCandidate = useUpdateCandidate()
  const removeCandidate = useRemoveCandidate()

  const setUserStatus = useApiMutation({
    mutationFn: ({
      companyId,
      userId,
      status,
    }: {
      companyId: string
      userId: string
      status: 'active' | 'suspended'
    }) => platformApi.setCompanyUserStatus(companyId, userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() })
    },
  })

  const removeUser = useApiMutation({
    mutationFn: ({ companyId, userId }: { companyId: string; userId: string }) =>
      platformApi.removeCompanyUser(companyId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() })
    },
  })

  const createCompanyUser = useApiMutation({
    mutationFn: ({
      companyId,
      body,
    }: {
      companyId: string
      body: { email: string; role: string; password: string }
    }) => platformApi.createCompanyUser(companyId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() })
    },
  })

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<'company' | 'candidate'>('company')
  const [addCompany, setAddCompany] = useState<string | null>(null)
  const [addRole, setAddRole] = useState('Recruiter')
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [candidateForm, setCandidateForm] =
    useState<CandidateForm>(emptyCandidateForm)

  const [editing, setEditing] = useState<PlatformUser | null>(null)
  const [removing, setRemoving] = useState<PlatformUser | null>(null)

  const users = usersQuery.data ?? []
  const companies = companiesQuery.data ?? []

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter((user) => {
      if (typeFilter && user.type !== typeFilter) return false
      if (
        companyFilter &&
        (user.type !== 'company' || user.companyId !== companyFilter)
      ) {
        return false
      }
      if (
        term &&
        !user.email.toLowerCase().includes(term) &&
        !(user.firstName ?? '').toLowerCase().includes(term) &&
        !(user.lastName ?? '').toLowerCase().includes(term)
      ) {
        return false
      }
      return true
    })
  }, [users, search, typeFilter, companyFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const displayName = (user: PlatformUser) =>
    user.type === 'candidate'
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      : user.email

  const setCandidateField = (key: keyof CandidateForm, value: string) =>
    setCandidateForm((f) => ({ ...f, [key]: value }))

  const openEdit = (user: PlatformUser) => {
    setEditing(user)
    setCandidateForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email,
      phone: '',
      password: '',
    })
  }

  const resetAddModal = () => {
    setAddOpen(false)
    setAddType('company')
    setAddCompany(null)
    setAddRole('Recruiter')
    setAddEmail('')
    setAddPassword('')
    setCandidateForm(emptyCandidateForm)
  }

  const submitAddCandidate = () => {
    createCandidate.mutate(
      {
        firstName: candidateForm.firstName,
        lastName: candidateForm.lastName,
        email: candidateForm.email,
        phone: candidateForm.phone || undefined,
        password: candidateForm.password,
      },
      { onSuccess: resetAddModal },
    )
  }

  const submitUpdate = () => {
    if (!editing) return
    updateCandidate.mutate(
      {
        id: editing.id,
        body: {
          firstName: candidateForm.firstName,
          lastName: candidateForm.lastName,
          email: candidateForm.email || undefined,
          phone: candidateForm.phone || null,
          password: candidateForm.password || undefined,
        },
      },
      { onSuccess: () => setEditing(null) },
    )
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Users</Title>
        <Button onClick={() => setAddOpen(true)}>Add user</Button>
      </Group>

      <Group mb="md">
        <TextInput
          placeholder="Search name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value)
            setPage(1)
          }}
        />
        <Select
          placeholder="Type"
          clearable
          data={[
            { value: 'company', label: 'Company' },
            { value: 'candidate', label: 'Candidate' },
          ]}
          value={typeFilter}
          onChange={(value) => {
            setTypeFilter(value)
            setPage(1)
          }}
        />
        <Select
          placeholder="Company"
          clearable
          searchable
          data={companies.map((c) => ({ value: c.id, label: c.name }))}
          value={companyFilter}
          onChange={(value) => {
            setCompanyFilter(value)
            setPage(1)
          }}
        />
      </Group>

      {usersQuery.isLoading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <Text c="dimmed">No users match.</Text>
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name / Email</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Company</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((user) => (
                <Table.Tr key={`${user.type}-${user.id}`}>
                  <Table.Td>
                    {displayName(user)}
                    {user.type === 'candidate' && (
                      <Text size="xs" c="dimmed">
                        {user.email}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={user.type === 'company' ? 'blue' : 'violet'}>
                      {user.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{user.companyName ?? '—'}</Table.Td>
                  <Table.Td>{user.role}</Table.Td>
                  <Table.Td>
                    {user.status ? (
                      <Badge
                        variant="light"
                        color={user.status === 'suspended' ? 'red' : 'green'}
                      >
                        {user.status}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </Table.Td>
                  <Table.Td>{dayjs(user.createdAt).format('MMM D, YYYY')}</Table.Td>
                  <Table.Td>
                    {user.type === 'company' ? (
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          color={user.status === 'suspended' ? 'green' : 'yellow'}
                          onClick={() => {
                            if (!user.companyId) return
                            setUserStatus.mutate({
                              companyId: user.companyId,
                              userId: user.id,
                              status:
                                user.status === 'suspended' ? 'active' : 'suspended',
                            })
                          }}
                        >
                          {user.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() => setRemoving(user)}
                        >
                          Remove
                        </Button>
                      </Group>
                    ) : (
                      <Group gap="xs">
                        <Button size="xs" variant="light" onClick={() => openEdit(user)}>
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() => setRemoving(user)}
                        >
                          Delete
                        </Button>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="center" mt="md">
            <Pagination total={pageCount} value={page} onChange={setPage} size="sm" />
          </Group>
        </>
      )}

      <Modal opened={addOpen} onClose={resetAddModal} title="Add user">
        <Stack>
          <NativeSelect
            label="Type"
            data={[
              { value: 'company', label: 'Company user' },
              { value: 'candidate', label: 'Candidate' },
            ]}
            value={addType}
            onChange={(e) =>
              setAddType(e.currentTarget.value as 'company' | 'candidate')
            }
          />
          {addType === 'company' ? (
            <>
              <Select
                label="Company"
                required
                searchable
                data={companies.map((c) => ({ value: c.id, label: c.name }))}
                value={addCompany}
                onChange={setAddCompany}
              />
              <Select
                label="Role"
                data={roleOptions}
                value={addRole}
                onChange={(value) => setAddRole(value ?? 'Recruiter')}
              />
              <TextInput
                label="Email"
                required
                value={addEmail}
                onChange={(e) => setAddEmail(e.currentTarget.value)}
              />
              <PasswordInput
                label="Password"
                description="No email is sent — share the password out-of-band."
                required
                value={addPassword}
                onChange={(e) => setAddPassword(e.currentTarget.value)}
              />
              <Group justify="flex-end">
                <Button
                  loading={createCompanyUser.isPending}
                  disabled={
                    !addCompany ||
                    !addEmail.includes('@') ||
                    addPassword.length < 8
                  }
                  onClick={() => {
                    if (!addCompany) return
                    createCompanyUser.mutate(
                      {
                        companyId: addCompany,
                        body: { email: addEmail, role: addRole, password: addPassword },
                      },
                      { onSuccess: resetAddModal },
                    )
                  }}
                >
                  Add
                </Button>
              </Group>
            </>
          ) : (
            <>
              <TextInput
                label="First name"
                required
                value={candidateForm.firstName}
                onChange={(e) => setCandidateField('firstName', e.currentTarget.value)}
              />
              <TextInput
                label="Last name"
                required
                value={candidateForm.lastName}
                onChange={(e) => setCandidateField('lastName', e.currentTarget.value)}
              />
              <TextInput
                label="Email"
                required
                value={candidateForm.email}
                onChange={(e) => setCandidateField('email', e.currentTarget.value)}
              />
              <TextInput
                label="Phone"
                value={candidateForm.phone}
                onChange={(e) => setCandidateField('phone', e.currentTarget.value)}
              />
              <PasswordInput
                label="Password"
                description="No email is sent — share the password out-of-band."
                required
                value={candidateForm.password}
                onChange={(e) => setCandidateField('password', e.currentTarget.value)}
              />
              <Group justify="flex-end">
                <Button
                  loading={createCandidate.isPending}
                  disabled={
                    !candidateForm.firstName ||
                    !candidateForm.lastName ||
                    !candidateForm.email.includes('@') ||
                    candidateForm.password.length < 8
                  }
                  onClick={submitAddCandidate}
                >
                  Add
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.firstName ?? ''} ${editing?.lastName ?? ''}`}
      >
        <Stack>
          <TextInput
            label="First name"
            required
            value={candidateForm.firstName}
            onChange={(e) => setCandidateField('firstName', e.currentTarget.value)}
          />
          <TextInput
            label="Last name"
            required
            value={candidateForm.lastName}
            onChange={(e) => setCandidateField('lastName', e.currentTarget.value)}
          />
          <TextInput
            label="Email"
            required
            value={candidateForm.email}
            onChange={(e) => setCandidateField('email', e.currentTarget.value)}
          />
          <TextInput
            label="Phone"
            value={candidateForm.phone}
            onChange={(e) => setCandidateField('phone', e.currentTarget.value)}
          />
          <PasswordInput
            label="Password"
            description="Leave blank to keep the current password."
            value={candidateForm.password}
            onChange={(e) => setCandidateField('password', e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={updateCandidate.isPending}
              disabled={!candidateForm.firstName || !candidateForm.lastName}
              onClick={submitUpdate}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing?.type === 'company' ? 'Remove user' : 'Delete candidate'}
      >
        <Stack>
          <Alert color="red">
            {removing?.type === 'company'
              ? `Remove ${removing?.email}? They will lose access to the company.`
              : `Delete ${removing?.email}? Their applications and profile will be removed.`}
          </Alert>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                const target = removing
                if (!target) return
                if (target.type === 'company' && target.companyId) {
                  removeUser.mutate(
                    { companyId: target.companyId, userId: target.id },
                    { onSuccess: () => setRemoving(null) },
                  )
                } else {
                  removeCandidate.mutate(target.id, {
                    onSuccess: () => setRemoving(null),
                  })
                }
              }}
            >
              {removing?.type === 'company' ? 'Remove' : 'Delete'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
```

- [ ] **Step 2: Create the route file `routes/admin/users.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { UsersPage } from '@/features/admin/UsersPage';

export const Route = createFileRoute('/admin/users')({
  component: UsersPage,
});
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean (routeTree.gen is regenerated by vite build in Task 11; typecheck reads it as-is — if `routeTree.gen` is stale and typecheck fails on the new route, run `npm run dev` once or check whether the router plugin has a `generate` script; otherwise run the full `npm run build` from Task 11 before final verification).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/admin/UsersPage.tsx frontend/src/routes/admin/users.tsx
git commit -m "feat(m12): merged users table page"
```

---

## Task 10: ApplicationsPage — global applications table

**Files:**
- Create: `frontend/src/features/admin/ApplicationsPage.tsx`
- Create: `frontend/src/routes/admin/applications.tsx`

- [ ] **Step 1: Create `ApplicationsPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Pagination,
  Select,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import type { PlatformApplication } from '@/api/platformApi'
import {
  useMoveApplicationStage,
  usePlatformApplications,
  usePlatformCompanies,
  usePlatformStages,
} from './hooks/usePlatform'

const PAGE_SIZE = 10

export function ApplicationsPage() {
  const applicationsQuery = usePlatformApplications()
  const companiesQuery = usePlatformCompanies()

  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [moveTarget, setMoveTarget] = useState<PlatformApplication | null>(null)
  const [stageId, setStageId] = useState<string | null>(null)

  const moveStage = useMoveApplicationStage()
  const stagesQuery = usePlatformStages(moveTarget?.companyId ?? '')

  const applications = applicationsQuery.data ?? []
  const companies = companiesQuery.data ?? []

  const stages = useMemo(() => {
    const names = new Set<string>()
    for (const app of applications) names.add(app.stageName)
    return [...names].sort().map((name) => ({ value: name, label: name }))
  }, [applications])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return applications.filter((app) => {
      if (companyFilter && app.companyId !== companyFilter) return false
      if (stageFilter && app.stageName !== stageFilter) return false
      if (
        term &&
        !app.candidateName.toLowerCase().includes(term) &&
        !app.jobTitle.toLowerCase().includes(term) &&
        !app.companyName.toLowerCase().includes(term)
      ) {
        return false
      }
      return true
    })
  }, [applications, search, companyFilter, stageFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openMove = (app: PlatformApplication) => {
    setMoveTarget(app)
    setStageId(null)
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Applications</Title>
      </Group>

      <Group mb="md">
        <TextInput
          placeholder="Search candidate, job, or company"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value)
            setPage(1)
          }}
        />
        <Select
          placeholder="Company"
          clearable
          searchable
          data={companies.map((c) => ({ value: c.id, label: c.name }))}
          value={companyFilter}
          onChange={(value) => {
            setCompanyFilter(value)
            setPage(1)
          }}
        />
        <Select
          placeholder="Stage"
          clearable
          data={stages}
          value={stageFilter}
          onChange={(value) => {
            setStageFilter(value)
            setPage(1)
          }}
        />
      </Group>

      {applicationsQuery.isLoading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <Text c="dimmed">No applications match.</Text>
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Candidate</Table.Th>
                <Table.Th>Company</Table.Th>
                <Table.Th>Job</Table.Th>
                <Table.Th>Stage</Table.Th>
                <Table.Th>Applied</Table.Th>
                <Table.Th>Match</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((app) => (
                <Table.Tr key={app.id}>
                  <Table.Td>{app.candidateName}</Table.Td>
                  <Table.Td>
                    <Link
                      to="/admin/companies/$companyId"
                      params={{ companyId: app.companyId }}
                    >
                      {app.companyName}
                    </Link>
                  </Table.Td>
                  <Table.Td>{app.jobTitle}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{app.stageName}</Badge>
                  </Table.Td>
                  <Table.Td>{dayjs(app.appliedAt).format('MMM D, YYYY')}</Table.Td>
                  <Table.Td>
                    {app.matchScore !== null && app.matchScore !== undefined
                      ? `${Math.round(app.matchScore * 100)}%`
                      : '—'}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => openMove(app)}
                    >
                      Move stage
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="center" mt="md">
            <Pagination total={pageCount} value={page} onChange={setPage} size="sm" />
          </Group>
        </>
      )}

      <Modal
        opened={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        title={`Move ${moveTarget?.candidateName ?? ''} — ${moveTarget?.jobTitle ?? ''}`}
      >
        <Select
          label="Stage"
          required
          data={(stagesQuery.data ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          value={stageId}
          onChange={setStageId}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={() => setMoveTarget(null)}>
            Cancel
          </Button>
          <Button
            disabled={!stageId}
            onClick={() => {
              if (moveTarget && stageId) {
                moveStage.mutate(
                  { id: moveTarget.id, stageId },
                  { onSuccess: () => setMoveTarget(null) },
                )
              }
            }}
          >
            Move
          </Button>
        </Group>
      </Modal>
    </>
  )
}
```

- [ ] **Step 2: Create the route file `routes/admin/applications.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationsPage } from '@/features/admin/ApplicationsPage';

export const Route = createFileRoute('/admin/applications')({
  component: ApplicationsPage,
});
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/admin/ApplicationsPage.tsx frontend/src/routes/admin/applications.tsx
git commit -m "feat(m12): global applications table page"
```

---

## Task 11: Nav links + remove Candidates page

**Files:**
- Modify: `frontend/src/features/admin/layout.tsx`
- Delete: `frontend/src/features/admin/CandidatesPage.tsx`
- Delete: `frontend/src/routes/admin/candidates.tsx`

- [ ] **Step 1: Update the nav in `layout.tsx`**

Replace the `navItems` array (lines 30-33):

```tsx
  const navItems = [
    { label: 'Tenants', icon: IconBuildingEstate, to: '/admin/companies' },
    { label: 'Users', icon: IconUsers, to: '/admin/users' },
    { label: 'Applications', icon: IconListDetails, to: '/admin/applications' },
  ];
```

and update the icon import (line 14) to include `IconListDetails`:

```tsx
import {
  IconBuildingEstate,
  IconUsers,
  IconListDetails,
  IconLogout,
} from '@tabler/icons-react';
```

- [ ] **Step 2: Delete the old candidates files**

Run:
```bash
git rm frontend/src/features/admin/CandidatesPage.tsx frontend/src/routes/admin/candidates.tsx
```

- [ ] **Step 3: Regenerate the route tree and verify**

Run: `cd frontend && npm run build`
Expected: build succeeds and `routeTree.gen` is regenerated without `/admin/candidates`.

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -A frontend
git commit -m "feat(m12): admin nav to users/applications, drop candidates page"
```

---

## Task 12: Full verification + docs

**Files:**
- Modify: `AGENTS.md` (current-state paragraph), `docs/07_API_ENDPOINT_DOCUMENTATION.md`, `docs/08_FRONTEND_COMPONENT_STRUCTURE.md` — only if those files' platform sections are stale; keep the edits minimal.

- [ ] **Step 1: Full backend suite**

Run: `cd backend && npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 2: Full frontend suite**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: all green, build succeeds.

- [ ] **Step 3: Update AGENTS.md current-state**

Update the M11 paragraph to M12: add the merged users endpoint, company hard-delete, cascade rules, and the new admin pages (Users/Applications replace the old candidates page). One short paragraph; mention the new applied migration-free backend additions.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs
git commit -m "docs(m12): platform control current state"
```

---

## Self-Review Notes

- Spec coverage: merged users endpoint → Task 2; company delete + cancelled applications → Task 5; company suspend cascade → Task 3; CompanyAdmin cascade → Task 4; RBAC + merged shape + cascade + delete e2e → Task 6; CompaniesPage upgrade → Task 8; UsersPage → Task 9; ApplicationsPage → Task 10; nav + candidate page removal → Task 11. All spec requirements have tasks.
- No placeholders: every step has real code; Task 9's step-1 caveats are deliberate (code is written to be fixed by explicit instructions, not left TBD).
- Type consistency: `PlatformUser` merged shape used identically in `platformApi.ts`, hooks, and UsersPage. `deleteCompany(id)` → `useDeleteCompany` → `platformApi.deleteCompany`. `cancelByCompany`/`deleteByCompany`/`setAllStatus`/`dropSchema`/`remove` names are used once in Task 1 and referenced by Tasks 3–5 consistently.
- UsersPage builds company-user mutations at component level with `useApiMutation` + `platformApi` (variables carry `companyId`) instead of the per-company hook factories from `usePlatform.ts` — those would violate the rules of hooks when called per row.
- Verified the UsersPage code end-to-end: `setUserStatus.mutate({companyId, userId, status})`, `removeUser.mutate({companyId, userId})`, `createCompanyUser.mutate({companyId, body})` match the `useApiMutation` instances defined at the top of the component.
