# M11 — Platform Control + Candidate Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SuperAdmin full cross-tenant control (account CRUD, per-user suspend, application stage moves, interview reschedule/cancel), seed all five internal roles, and give candidates a real job detail page plus a manageable applications page with withdraw.

**Architecture:** No new repos — the existing repositories already accept an explicit schema parameter (`UserRepository.findAll('tenant_<id>')`, `ApplicationRepository.findAll({}, 'tenant_<id>')`, …), so two new platform services orchestrate them against explicit schemas (the sanctioned M9 cross-schema pattern). One migration adds `users.status`. The candidate detail page reuses a shared `JobDetailsView` extracted from the public careers page.

**Tech Stack:** NestJS 11, Drizzle ORM (pg), Zod 4 DTOs, Jest (unit + supertest e2e), React 19 + Mantine 9 + TanStack Router/Query.

**Spec:** `docs/superpowers/specs/2026-08-08-m11-platform-control-candidate-ux-design.md`

---

### Task 1: Migration — `users.status` column

**Files:**
- Create: `backend/drizzle/20260808090000_platform_user_suspend/migration.sql`
- Modify: `backend/src/database/schema.ts:83-89`

- [ ] **Step 1: Write the migration**

Create `backend/drizzle/20260808090000_platform_user_suspend/migration.sql`:

```sql
-- Per-user suspension for platform management
-- Adds a status column to the master users table (public), the signup template,
-- and all already-provisioned tenant schemas (same shape as scheduled_at_timezone).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = 'template' OR nspname LIKE 'tenant_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT %L',
      schema_name, 'active'
    );
  END LOOP;
END $$;
```

- [ ] **Step 2: Add the column to the Drizzle schema**

In `backend/src/database/schema.ts`, the `users` table (lines 83-89) becomes:

```ts
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('OrgAdmin').notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

- [ ] **Step 3: Apply the migration**

Run the same one-liner pattern as the bootstrap runbook (`docs/00b_LOCAL_DEV_BOOTSTRAP.md`):

```sh
docker compose exec -T postgres psql -U devuser -d talentpipe -f - < backend/drizzle/20260808090000_platform_user_suspend/migration.sql
```

Expected: `ALTER TABLE` + `DO` output, no errors.

- [ ] **Step 4: Verify in all schema groups**

```sh
docker compose exec -T postgres psql -U devuser -d talentpipe -c "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' OR nspname = 'template'"
docker compose exec -T postgres psql -U devuser -d talentpipe -c "SELECT count(*) FROM information_schema.columns WHERE table_name='users' AND column_name='status'"
```

Expected: second query returns a count ≥ 2 (public + template), and every tenant schema has the column (query information_schema per schema via the migration itself; the count covers public+template).

- [ ] **Step 5: Typecheck + commit**

```sh
cd backend && npm run typecheck
git add backend/drizzle/20260808090000_platform_user_suspend backend/src/database/schema.ts
git commit -m "feat(m11): users.status column for per-user suspension"
```

Expected: typecheck passes (schema change is additive).

---

### Task 2: Seed — HiringManager + Recruiter accounts

**Files:**
- Modify: `backend/scripts/seed.ts` (mirror `seedInterviewer`, lines 133-164)

- [ ] **Step 1: Add the two seed functions**

Insert after `seedInterviewer` (after line 164):

```ts
async function seedHiringManager(client: any): Promise<void> {
  const tenant = await client.query(
    `SELECT id FROM public.tenants WHERE slug = $1`,
    ['acme-corp'],
  );
  if (tenant.rows.length === 0) {
    console.log('[SKIP] Hiring Manager: no Acme tenant found');
    return;
  }
  const tenantId = tenant.rows[0].id;
  const existing = await client.query(
    `SELECT id FROM "tenant_${tenantId}"."users" WHERE email = $1`,
    ['hiring.manager@acme.com'],
  );
  if (existing.rows.length > 0) {
    console.log('[SKIP] Hiring Manager already exists');
    return;
  }
  const userId = randomUUID();
  const passwordHash = await hash('HiringManager123!');
  await client.query(
    `INSERT INTO "tenant_${tenantId}"."users" (id, email, password_hash, role)
     VALUES ($1, $2, $3, 'HiringManager')`,
    [userId, 'hiring.manager@acme.com', passwordHash],
  );
  await client.query(
    `INSERT INTO public.user_emails (id, email, tenant_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'hiring.manager@acme.com', tenantId, userId],
  );
  console.log('[OK] Hiring Manager created: hiring.manager@acme.com');
}

async function seedRecruiter(client: any): Promise<void> {
  const tenant = await client.query(
    `SELECT id FROM public.tenants WHERE slug = $1`,
    ['acme-corp'],
  );
  if (tenant.rows.length === 0) {
    console.log('[SKIP] Recruiter: no Acme tenant found');
    return;
  }
  const tenantId = tenant.rows[0].id;
  const existing = await client.query(
    `SELECT id FROM "tenant_${tenantId}"."users" WHERE email = $1`,
    ['recruiter@acme.com'],
  );
  if (existing.rows.length > 0) {
    console.log('[SKIP] Recruiter already exists');
    return;
  }
  const userId = randomUUID();
  const passwordHash = await hash('Recruiter123!');
  await client.query(
    `INSERT INTO "tenant_${tenantId}"."users" (id, email, password_hash, role)
     VALUES ($1, $2, $3, 'Recruiter')`,
    [userId, 'recruiter@acme.com', passwordHash],
  );
  await client.query(
    `INSERT INTO public.user_emails (id, email, tenant_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'recruiter@acme.com', tenantId, userId],
  );
  console.log('[OK] Recruiter created: recruiter@acme.com');
}
```

- [ ] **Step 2: Call them from `main()`**

In `main()` (lines 244-263) change:

```ts
    await seedInterviewer(client);
```

to:

```ts
    await seedInterviewer(client);
    await seedHiringManager(client);
    await seedRecruiter(client);
```

- [ ] **Step 3: Run the seed and verify sign-in for all five roles**

```sh
cd backend && npm run seed
```

Expected output includes `[OK] Hiring Manager created: hiring.manager@acme.com` and `[OK] Recruiter created: recruiter@acme.com` (on first run; `[SKIP]` on re-runs).

Then verify each account can obtain tokens:

```sh
curl -s -X POST http://localhost:3000/api/auth/signin -H "Content-Type: application/json" -d '{"email":"hiring.manager@acme.com","password":"HiringManager123!"}'
curl -s -X POST http://localhost:3000/api/auth/signin -H "Content-Type: application/json" -d '{"email":"recruiter@acme.com","password":"Recruiter123!"}'
```

Expected: each returns `{ "data": { "accessToken": "...", "refreshToken": "..." }, "message": "Signed in" }`.

- [ ] **Step 4: Commit**

```sh
git add backend/scripts/seed.ts
git commit -m "feat(m11): seed hiring manager and recruiter accounts"
```

---

### Task 3: Repository additions

**Files:**
- Modify: `backend/src/repositories/user.repository.ts`
- Modify: `backend/src/repositories/candidate-account.repository.ts`
- Modify: `backend/src/repositories/candidate-applications-index.repository.ts`

- [ ] **Step 1: `UserRepository` — expose status, add `updateStatus` + `resetPassword`**

In `backend/src/repositories/user.repository.ts`, change `findAll`'s select (lines 10-18) to include status:

```ts
  async findAll(schema = 'current') {
    return this.withDb(schema, async (db) => {
      return db
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(users.email)
        .execute();
    });
  }
```

Add after `updateRole` (after line 65):

```ts
  async updateStatus(
    id: string,
    status: 'active' | 'suspended',
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ status })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async resetPassword(id: string, passwordHash: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
```

- [ ] **Step 2: `CandidateAccountRepository` — add `findAll`**

In `backend/src/repositories/candidate-account.repository.ts`, add after `findByEmail`:

```ts
  async findAll() {
    return this.withDb('public', async (db) => {
      return db
        .select()
        .from(candidateAccounts)
        .orderBy(desc(candidateAccounts.createdAt))
        .execute();
    });
  }
```

Update the import on line 1 to: `import { desc, eq } from 'drizzle-orm';`

- [ ] **Step 3: `CandidateApplicationsIndexRepository` — add `findByApplication` + `deleteById`**

In `backend/src/repositories/candidate-applications-index.repository.ts`, add after `findByCandidateAndApplication` (after line 67):

```ts
  async findByApplication(applicationId: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateApplicationsIndex)
        .where(eq(candidateApplicationsIndex.applicationId, applicationId))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async deleteById(id: string) {
    return this.withDb('public', (db) =>
      db
        .delete(candidateApplicationsIndex)
        .where(eq(candidateApplicationsIndex.id, id))
        .execute(),
    );
  }
```

- [ ] **Step 4: Typecheck + commit**

```sh
cd backend && npm run typecheck && npm run lint
git add backend/src/repositories/user.repository.ts backend/src/repositories/candidate-account.repository.ts backend/src/repositories/candidate-applications-index.repository.ts
git commit -m "feat(m11): repo methods for platform management and withdraw"
```

Expected: typecheck and lint pass.

---

### Task 4: Enforce user suspension at sign-in and refresh

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts:43-65`
- Modify: `backend/src/modules/auth/services/token.service.ts`
- Modify: `backend/src/modules/auth/auth.service.spec.ts`
- Modify: `backend/src/modules/auth/services/token.service.spec.ts`

- [ ] **Step 1: Write the failing unit tests**

In `backend/src/modules/auth/auth.service.spec.ts`, in the signin describe block, add after the tenant-suspended test (around line 129):

```ts
    it('throws ForbiddenException when the user is suspended', async () => {
      userEmailRepo.findByEmail.mockResolvedValue({
        tenantId: 'tenant-a',
      });
      userRepo.findByEmail.mockResolvedValue({
        id: 'user-a',
        passwordHash: 'hash',
        role: 'OrgAdmin',
        status: 'suspended',
      });
      (verifyPassword as jest.Mock).mockResolvedValue(true);
      tenantRepo.findById.mockResolvedValue({ id: 'tenant-a', status: 'active' });

      await expect(
        service.signin({ email: 'a@b.com', password: 'password' }),
      ).rejects.toThrow(ForbiddenException);
    });
```

Check the existing spec's mock structure first and match it (the spec already mocks `tenantRepo` and `verifyPassword`). If `userRepo.findByEmail` mock needs `status`, set it as above.

In `backend/src/modules/auth/services/token.service.spec.ts`, in the rotation describe block, add after the suspended-tenant test (around line 129):

```ts
    it('rejects rotation for a suspended user', async () => {
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() + 1000 * 60).toISOString(),
        tokenHash: 'stored-hash',
      });
      jest.spyOn(argon2, 'verify').mockResolvedValue(true);
      (jwtService.verify as jest.Mock).mockReturnValue({
        sub: 'user-a',
        tenantId: 'tenant-a',
        role: 'OrgAdmin',
      });
      tenantRepo.findById.mockResolvedValue({ id: 'tenant-a', status: 'active' });
      userRepo.findById.mockResolvedValue({
        id: 'user-a',
        status: 'suspended',
      });

      await expect(service.rotate('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
```

Match the existing spec's mocking style (it may mock `verifyRefreshToken` instead — read the spec first and adapt).

- [ ] **Step 2: Run tests to verify they fail**

```sh
cd backend && npm test -- auth.service.spec token.service.spec
```

Expected: both new tests FAIL (no user-status check exists yet).

- [ ] **Step 3: Implement the checks**

In `backend/src/modules/auth/auth.service.ts`, in `signin`, after the tenant check (after line 57):

```ts
      if (user.status === 'suspended') {
        throw new ForbiddenException('This account is suspended');
      }
```

In `backend/src/modules/auth/services/token.service.ts`:
1. Add `UserRepository` to the constructor (import from `../../../repositories/user.repository`), alongside `TenantRepository`.
2. In `rotate`, inside the existing `if (payload.tenantId)` block, after the tenant check:

```ts
      const user = await this.userRepo.findById(
        payload.sub,
        `tenant_${payload.tenantId}`,
      );
      if (user?.status === 'suspended') {
        throw new UnauthorizedException('This account is suspended');
      }
```

- [ ] **Step 4: Run tests to verify they pass**

```sh
cd backend && npm test -- auth.service.spec token.service.spec
```

Expected: all pass (existing + new).

- [ ] **Step 5: Typecheck, lint, commit**

```sh
cd backend && npm run typecheck && npm run lint
git add backend/src/modules/auth/auth.service.ts backend/src/modules/auth/services/token.service.ts backend/src/modules/auth/auth.service.spec.ts backend/src/modules/auth/services/token.service.spec.ts
git commit -m "feat(m11): block sign-in and refresh for suspended users"
```

Expected: typecheck + lint pass.

---

### Task 5: Platform accounts — tenant users + candidates backend

**Files:**
- Create: `backend/src/modules/platform/dto/create-tenant-user.dto.ts`
- Create: `backend/src/modules/platform/dto/update-tenant-user.dto.ts`
- Create: `backend/src/modules/platform/dto/create-candidate.dto.ts`
- Create: `backend/src/modules/platform/dto/update-candidate.dto.ts`
- Create: `backend/src/modules/platform/platform-accounts.service.ts`
- Create: `backend/src/modules/platform/platform-accounts.service.spec.ts`
- Create: `backend/src/modules/platform/platform-accounts.controller.ts`
- Modify: `backend/src/modules/platform/platform.module.ts`

- [ ] **Step 1: Write DTOs**

Create `backend/src/modules/platform/dto/create-tenant-user.dto.ts`:

```ts
import { z } from 'zod';
import { INTERNAL_USER_ROLES } from '../../org/dto/invite-user.dto';

export const CreateTenantUserSchema = z.object({
  email: z.string().email('Invalid email').max(255),
  role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});

export type CreateTenantUserDto = z.infer<typeof CreateTenantUserSchema>;
```

Create `backend/src/modules/platform/dto/update-tenant-user.dto.ts`:

```ts
import { z } from 'zod';
import { INTERNAL_USER_ROLES } from '../../org/dto/invite-user.dto';

export const UpdateTenantUserSchema = z
  .object({
    role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }).optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .optional(),
  })
  .refine(
    (value) => value.role !== undefined || value.password !== undefined,
    { message: 'At least one of role or password is required' },
  );

export type UpdateTenantUserDto = z.infer<typeof UpdateTenantUserSchema>;
```

Create `backend/src/modules/platform/dto/create-candidate.dto.ts`:

```ts
import { z } from 'zod';

export const CreateCandidateSchema = z.object({
  email: z.string().email('Invalid email').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(50).optional().or(z.literal('')),
});

export type CreateCandidateDto = z.infer<typeof CreateCandidateSchema>;
```

Create `backend/src/modules/platform/dto/update-candidate.dto.ts`:

```ts
import { z } from 'zod';

export const UpdateCandidateSchema = z
  .object({
    email: z.string().email('Invalid email').max(255).optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().max(50).nullable().optional(),
  })
  .refine(
    (value) =>
      value.email !== undefined ||
      value.password !== undefined ||
      value.firstName !== undefined ||
      value.lastName !== undefined ||
      value.phone !== undefined,
    { message: 'At least one field is required' },
  );

export type UpdateCandidateDto = z.infer<typeof UpdateCandidateSchema>;
```

- [ ] **Step 2: Write the failing service spec**

Create `backend/src/modules/platform/platform-accounts.service.spec.ts` (mock repos, mirror the mocking style of `platform.service.spec.ts`):

```ts
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlatformAccountsService } from './platform-accounts.service';

const auditService = { log: jest.fn() };

const makeService = (overrides: Record<string, unknown> = {}) =>
  new PlatformAccountsService(
    {
      findById: jest.fn().mockResolvedValue({ id: 'tenant-a', status: 'active' }),
      findAll: jest.fn().mockResolvedValue([]),
      ...(overrides.tenantRepo as object),
    } as never,
    {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findById: jest.fn(),
      updateRole: jest.fn(),
      resetPassword: jest.fn(),
      updateStatus: jest.fn(),
      remove: jest.fn(),
      ...(overrides.userRepo as object),
    } as never,
    { findByEmail: jest.fn(), create: jest.fn(), deleteByUserId: jest.fn() } as never,
    { deleteByUser: jest.fn() } as never,
    { deleteByInterviewer: jest.fn() } as never,
    {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findById: jest.fn(),
      updateProfile: jest.fn(),
      remove: jest.fn(),
      ...(overrides.candidateAccountRepo as object),
    } as never,
    { findByAccountId: jest.fn().mockResolvedValue(null), delete: jest.fn() } as never,
    { findByCandidate: jest.fn().mockResolvedValue([]), deleteById: jest.fn() } as never,
    { findAll: jest.fn().mockResolvedValue([]) } as never,
    auditService as never,
  );

describe('PlatformAccountsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists tenant users through the explicit schema', async () => {
    const userRepo = { findAll: jest.fn().mockResolvedValue([{ id: 'u1', role: 'OrgAdmin' }]) };
    const service = makeService({ userRepo });
    await expect(service.listTenantUsers('tenant-a')).resolves.toEqual([
      { id: 'u1', role: 'OrgAdmin' },
    ]);
    expect(userRepo.findAll).toHaveBeenCalledWith('tenant_tenant-a');
  });

  it('404s when the tenant is missing', async () => {
    const tenantRepo = { findById: jest.fn().mockResolvedValue(null) };
    const service = makeService({ tenantRepo });
    await expect(service.listTenantUsers('nope')).rejects.toThrow(NotFoundException);
  });

  it('409s when creating a user whose email already exists', async () => {
    const userEmailRepo = { findByEmail: jest.fn().mockResolvedValue({ email: 'x@y.com' }) };
    const service = makeService({ userEmailRepo });
    await expect(
      service.createTenantUser('tenant-a', {
        email: 'x@y.com',
        role: 'Recruiter',
        password: 'Password123!',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates a tenant user and its email bridge', async () => {
    const userEmailRepo = { findByEmail: jest.fn().mockResolvedValue(null), create: jest.fn() };
    const userRepo = {
      create: jest.fn().mockResolvedValue({ id: 'u1', email: 'r@acme.com', role: 'Recruiter' }),
    };
    const service = makeService({ userRepo, userEmailRepo });
    const result = await service.createTenantUser('tenant-a', {
      email: 'r@acme.com',
      role: 'Recruiter',
      password: 'Password123!',
    });
    expect(result.id).toBe('u1');
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'Recruiter' }),
      'tenant_tenant-a',
    );
    expect(userEmailRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
  });

  it('rejects a second suspension state change with 409', async () => {
    const userRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'u1', status: 'suspended' }),
      updateStatus: jest.fn(),
    };
    const service = makeService({ userRepo });
    await expect(
      service.setTenantUserStatus('tenant-a', 'u1', 'suspended'),
    ).rejects.toThrow(ConflictException);
  });

  it('suspends a user and deletes their refresh tokens', async () => {
    const userRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'u1', status: 'active' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'u1', status: 'suspended' }),
    };
    const refreshTokenRepo = { deleteByUser: jest.fn() };
    const service = makeService({ userRepo, refreshTokenRepo });
    await service.setTenantUserStatus('tenant-a', 'u1', 'suspended');
    expect(userRepo.updateStatus).toHaveBeenCalledWith('u1', 'suspended', 'tenant_tenant-a');
    expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
    expect(auditService.log).toHaveBeenCalled();
  });

  it('removes a tenant user and cleans up bridges', async () => {
    const userRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'u1', email: 'r@acme.com' }),
      remove: jest.fn(),
    };
    const userEmailRepo = { deleteByUserId: jest.fn() };
    const refreshTokenRepo = { deleteByUser: jest.fn() };
    const interviewRepo = { deleteByInterviewer: jest.fn() };
    const service = makeService({ userRepo, userEmailRepo, refreshTokenRepo, interviewRepo });
    await service.removeTenantUser('tenant-a', 'u1');
    expect(interviewRepo.deleteByInterviewer).toHaveBeenCalledWith('u1', 'tenant_tenant-a');
    expect(userEmailRepo.deleteByUserId).toHaveBeenCalledWith('u1');
  });

  it('lists candidates from the public schema', async () => {
    const candidateAccountRepo = { findAll: jest.fn().mockResolvedValue([{ id: 'c1' }]) };
    const service = makeService({ candidateAccountRepo });
    await expect(service.listCandidates()).resolves.toEqual([{ id: 'c1' }]);
  });

  it('removes a candidate and cascades to applications, index, skills, and bookmarks', async () => {
    const candidateAccountRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'c1', email: 'c@x.com' }),
      remove: jest.fn(),
    };
    const candidateIndexRepo = {
      findByCandidate: jest.fn().mockResolvedValue([
        { id: 'idx1', applicationId: 'app1', tenantId: 'tenant-a' },
      ]),
      deleteById: jest.fn(),
    };
    const candidateRepo = {
      findByAccountId: jest.fn().mockResolvedValue({ id: 'tc1' }),
      delete: jest.fn(),
    };
    const applicationRepo = { delete: jest.fn() };
    const tenantRepo = { findAll: jest.fn().mockResolvedValue([{ id: 'tenant-a' }]) };
    const service = makeService({ candidateAccountRepo, candidateIndexRepo, candidateRepo, applicationRepo, tenantRepo });
    await service.removeCandidate('c1');
    expect(applicationRepo.delete).toHaveBeenCalledWith('app1', 'tenant_tenant-a');
    expect(candidateIndexRepo.deleteById).toHaveBeenCalledWith('idx1');
    expect(candidateRepo.delete).toHaveBeenCalledWith('tc1', 'tenant_tenant-a');
  });
});
```

Note: the constructor is positional — keep the parameter order identical to the implementation in Step 4. Adjust the `makeService` order to match your final constructor exactly.

- [ ] **Step 3: Run the spec to verify it fails**

```sh
cd backend && npm test -- platform-accounts.service.spec
```

Expected: FAIL — service file does not exist.

- [ ] **Step 4: Implement `PlatformAccountsService`**

Create `backend/src/modules/platform/platform-accounts.service.ts`:

```ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../common/password';
import { AuditService } from '../../common/audit/audit.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { UpdateTenantUserDto } from './dto/update-tenant-user.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class PlatformAccountsService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly userRepo: UserRepository,
    private readonly userEmailRepo: UserEmailRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly interviewRepo: InterviewRepository,
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly candidateRepo: CandidateRepository,
    private readonly candidateIndexRepo: CandidateApplicationsIndexRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly auditService: AuditService,
  ) {}

  private schemaOf(tenantId: string): string {
    return `tenant_${tenantId}`;
  }

  private async requireTenant(tenantId: string) {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async listTenantUsers(tenantId: string) {
    await this.requireTenant(tenantId);
    return this.userRepo.findAll(this.schemaOf(tenantId));
  }

  async createTenantUser(tenantId: string, dto: CreateTenantUserDto) {
    await this.requireTenant(tenantId);
    const existing = await this.userEmailRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await hashPassword(dto.password);
    const id = randomUUID();
    await this.userRepo.create(
      { id, email: dto.email, passwordHash, role: dto.role },
      this.schemaOf(tenantId),
    );
    await this.userEmailRepo.create({
      email: dto.email,
      tenantId,
      userId: id,
    });
    await this.auditService.log('platform.user.create', id, { email: dto.email, role: dto.role }, tenantId);
    return { id, email: dto.email, role: dto.role };
  }

  async updateTenantUser(tenantId: string, userId: string, dto: UpdateTenantUserDto) {
    const schema = this.schemaOf(tenantId);
    const user = await this.userRepo.findById(userId, schema);
    if (!user) throw new NotFoundException('User not found');
    const updates: { role?: string; passwordHash?: string } = {};
    if (dto.role !== undefined) updates.role = dto.role;
    if (dto.password !== undefined) {
      updates.passwordHash = await hashPassword(dto.password);
    }
    if (updates.role !== undefined) {
      await this.userRepo.updateRole(userId, updates.role, schema);
    }
    if (updates.passwordHash !== undefined) {
      await this.userRepo.resetPassword(userId, updates.passwordHash, schema);
    }
    await this.refreshTokenRepo.deleteByUser(userId);
    await this.auditService.log('platform.user.update', userId, dto as unknown as Record<string, unknown>, tenantId);
    return { id: userId, email: user.email, role: updates.role ?? user.role };
  }

  async setTenantUserStatus(
    tenantId: string,
    userId: string,
    status: 'active' | 'suspended',
  ) {
    const schema = this.schemaOf(tenantId);
    const user = await this.userRepo.findById(userId, schema);
    if (!user) throw new NotFoundException('User not found');
    if (user.status === status) {
      throw new ConflictException(
        `User is already ${status === 'active' ? 'active' : 'suspended'}`,
      );
    }
    const updated = await this.userRepo.updateStatus(userId, status, schema);
    if (status === 'suspended') {
      await this.refreshTokenRepo.deleteByUser(userId);
    }
    await this.auditService.log(
      status === 'suspended' ? 'platform.user.suspend' : 'platform.user.reactivate',
      userId,
      { email: user.email },
      tenantId,
    );
    return updated;
  }

  async removeTenantUser(tenantId: string, userId: string) {
    const schema = this.schemaOf(tenantId);
    const user = await this.userRepo.findById(userId, schema);
    if (!user) throw new NotFoundException('User not found');
    await this.interviewRepo.deleteByInterviewer(userId, schema);
    await this.userRepo.remove(userId, schema);
    await this.userEmailRepo.deleteByUserId(userId);
    await this.refreshTokenRepo.deleteByUser(userId);
    await this.auditService.log('platform.user.remove', userId, { email: user.email }, tenantId);
    return { id: userId };
  }

  async listCandidates() {
    return this.candidateAccountRepo.findAll();
  }

  async createCandidate(dto: CreateCandidateDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.candidateAccountRepo.findByEmail(email);
    if (existing) throw new ConflictException('Email already in use');
    const orgOwner = await this.userEmailRepo.findByEmail(email);
    if (orgOwner) throw new ConflictException('Email already in use');
    const passwordHash = await hashPassword(dto.password);
    const account = await this.candidateAccountRepo.create({
      email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone || undefined,
    });
    await this.auditService.log('platform.candidate.create', account.id, { email });
    return {
      id: account.id,
      email,
      firstName: account.firstName,
      lastName: account.lastName,
      phone: account.phone,
      createdAt: account.createdAt,
    };
  }

  async updateCandidate(id: string, dto: UpdateCandidateDto) {
    const account = await this.candidateAccountRepo.findById(id);
    if (!account) throw new NotFoundException('Candidate not found');
    if (dto.email) {
      const existing = await this.candidateAccountRepo.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException('Email already in use');
      }
      const orgOwner = await this.userEmailRepo.findByEmail(dto.email);
      if (orgOwner) throw new ConflictException('Email already in use');
    }
    const data: { firstName?: string; lastName?: string; email?: string; phone?: string | null } = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
    };
    if (dto.password) {
      data.passwordHash = await hashPassword(dto.password);
    }
    const updated = await this.candidateAccountRepo.updateProfile(id, data);
    await this.auditService.log('platform.candidate.update', id, dto as unknown as Record<string, unknown>);
    return updated;
  }

  async removeCandidate(id: string) {
    const account = await this.candidateAccountRepo.findById(id);
    if (!account) throw new NotFoundException('Candidate not found');
    const tenants = await this.tenantRepo.findAll();
    const indexed = await this.candidateIndexRepo.findByCandidate(id);
    for (const row of indexed) {
      await this.applicationRepo.delete(row.applicationId, this.schemaOf(row.tenantId));
      await this.candidateIndexRepo.deleteById(row.id);
    }
    for (const tenant of tenants) {
      const candidate = await this.candidateRepo.findByAccountId(id, this.schemaOf(tenant.id));
      if (candidate) {
        await this.candidateRepo.delete(candidate.id, this.schemaOf(tenant.id));
      }
    }
    await this.candidateAccountRepo.remove(id);
    await this.auditService.log('platform.candidate.remove', id, { email: account.email });
    return { id };
  }
}
```

Note: `CandidateAccountRepository.updateProfile` currently types `data` without `passwordHash`. Add `passwordHash?: string` to its `data` parameter type in `backend/src/repositories/candidate-account.repository.ts` (Step 4 of this task's implementation), and add a `remove(id)` method:

```ts
  async remove(id: string) {
    return this.withDb('public', (db) =>
      db.delete(candidateAccounts).where(eq(candidateAccounts.id, id)).execute(),
    );
  }
```

- [ ] **Step 5: Write the controller**

Create `backend/src/modules/platform/platform-accounts.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAccountsService } from './platform-accounts.service';
import { CreateTenantUserSchema, CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { UpdateTenantUserSchema, UpdateTenantUserDto } from './dto/update-tenant-user.dto';
import { CreateCandidateSchema, CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateSchema, UpdateCandidateDto } from './dto/update-candidate.dto';

@Controller('platform')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformAccountsController {
  constructor(private readonly accountsService: PlatformAccountsService) {}

  @Get('tenants/:id/users')
  listTenantUsers(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.listTenantUsers(id);
  }

  @Post('tenants/:id/users')
  createTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateTenantUserSchema)) body: CreateTenantUserDto,
  ) {
    return this.accountsService.createTenantUser(id, body);
  }

  @Patch('tenants/:id/users/:userId')
  updateTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(UpdateTenantUserSchema)) body: UpdateTenantUserDto,
  ) {
    return this.accountsService.updateTenantUser(id, userId, body);
  }

  @Patch('tenants/:id/users/:userId/suspend')
  suspendTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accountsService.setTenantUserStatus(id, userId, 'suspended');
  }

  @Patch('tenants/:id/users/:userId/reactivate')
  reactivateTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accountsService.setTenantUserStatus(id, userId, 'active');
  }

  @Delete('tenants/:id/users/:userId')
  removeTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accountsService.removeTenantUser(id, userId);
  }

  @Get('candidates')
  listCandidates() {
    return this.accountsService.listCandidates();
  }

  @Post('candidates')
  createCandidate(
    @Body(new ZodValidationPipe(CreateCandidateSchema)) body: CreateCandidateDto,
  ) {
    return this.accountsService.createCandidate(body);
  }

  @Patch('candidates/:id')
  updateCandidate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateCandidateSchema)) body: UpdateCandidateDto,
  ) {
    return this.accountsService.updateCandidate(id, body);
  }

  @Delete('candidates/:id')
  removeCandidate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.removeCandidate(id);
  }
}
```

- [ ] **Step 6: Register in the platform module**

In `backend/src/modules/platform/platform.module.ts`, add the controller and provider:

```ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { AuditModule } from '../../common/audit/audit.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformAccountsController } from './platform-accounts.controller';
import { PlatformAccountsService } from './platform-accounts.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, AuditModule],
  controllers: [PlatformController, PlatformAccountsController],
  providers: [PlatformService, PlatformAccountsService],
})
export class PlatformModule {}
```

- [ ] **Step 7: Run unit tests + typecheck**

```sh
cd backend && npm test -- platform-accounts.service.spec && npm run typecheck && npm run lint
```

Expected: new spec passes; typecheck + lint clean.

- [ ] **Step 8: Commit**

```sh
git add backend/src/modules/platform backend/src/repositories/candidate-account.repository.ts
git commit -m "feat(m11): platform account management (users + candidates)"
```

---

### Task 6: Platform data — applications + interviews backend

**Files:**
- Create: `backend/src/modules/platform/dto/move-application-stage.dto.ts`
- Create: `backend/src/modules/platform/dto/reschedule-interview.dto.ts`
- Create: `backend/src/modules/platform/platform-data.service.ts`
- Create: `backend/src/modules/platform/platform-data.service.spec.ts`
- Create: `backend/src/modules/platform/platform-data.controller.ts`
- Modify: `backend/src/modules/platform/platform.module.ts`

- [ ] **Step 1: Write DTOs**

Create `backend/src/modules/platform/dto/move-application-stage.dto.ts`:

```ts
import { z } from 'zod';

export const MoveApplicationStageSchema = z.object({
  stageId: z.string().uuid('Invalid stage id'),
});

export type MoveApplicationStageDto = z.infer<typeof MoveApplicationStageSchema>;
```

Create `backend/src/modules/platform/dto/reschedule-interview.dto.ts`:

```ts
import { z } from 'zod';

export const RescheduleInterviewSchema = z
  .object({
    scheduledAt: z.string().datetime().optional(),
    status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
  })
  .refine(
    (value) => value.scheduledAt !== undefined || value.status !== undefined,
    { message: 'At least one of scheduledAt or status is required' },
  );

export type RescheduleInterviewDto = z.infer<typeof RescheduleInterviewSchema>;
```

- [ ] **Step 2: Write the failing service spec**

Create `backend/src/modules/platform/platform-data.service.spec.ts`:

```ts
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PlatformDataService } from './platform-data.service';

const auditService = { log: jest.fn() };
const cacheService = { invalidateTenantDashboard: jest.fn() };

const makeService = (overrides: Record<string, unknown> = {}) =>
  new PlatformDataService(
    {
      findAll: jest.fn().mockResolvedValue([{ id: 'tenant-a', name: 'Acme' }]),
      findById: jest.fn().mockResolvedValue({ id: 'tenant-a', name: 'Acme' }),
      ...(overrides.tenantRepo as object),
    } as never,
    {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      updateStage: jest.fn(),
      delete: jest.fn(),
      ...(overrides.applicationRepo as object),
    } as never,
    { findById: jest.fn(), findAll: jest.fn() } as never,
    {
      findByApplication: jest.fn().mockResolvedValue({ id: 'idx1', tenantId: 'tenant-a' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'idx1' }),
      ...(overrides.candidateIndexRepo as object),
    } as never,
    { findAll: jest.fn().mockResolvedValue([]), findById: jest.fn(), update: jest.fn() } as never,
    auditService as never,
    cacheService as never,
  );

describe('PlatformDataService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists applications tagged with the tenant name', async () => {
    const applicationRepo = {
      findAll: jest.fn().mockResolvedValue([{ id: 'app1', stageName: 'Screening' }]),
    };
    const service = makeService({ applicationRepo });
    const result = await service.listApplications({});
    expect(result).toEqual([{ id: 'app1', stageName: 'Screening', tenantName: 'Acme' }]);
    expect(applicationRepo.findAll).toHaveBeenCalledWith(undefined, 'tenant_tenant-a');
  });

  it('filters applications by tenant id', async () => {
    const applicationRepo = { findAll: jest.fn().mockResolvedValue([]) };
    const service = makeService({ applicationRepo });
    await service.listApplications({ tenantId: 'tenant-a' });
    expect(applicationRepo.findAll).toHaveBeenCalledWith(undefined, 'tenant_tenant-a');
  });

  it('filters applications by status after the fetch', async () => {
    const applicationRepo = {
      findAll: jest.fn().mockResolvedValue([
        { id: 'app1', stageName: 'Screening' },
        { id: 'app2', stageName: 'Applied' },
      ]),
    };
    const service = makeService({ applicationRepo });
    const result = await service.listApplications({ status: 'Screening' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('app1');
  });

  it('404s when moving the stage of an unknown application', async () => {
    const candidateIndexRepo = { findByApplication: jest.fn().mockResolvedValue(null) };
    const service = makeService({ candidateIndexRepo });
    await expect(service.moveApplicationStage('app1', { stageId: 's1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('moves an application stage and syncs the candidate index', async () => {
    const applicationRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'app1', jobPostingId: 'j1' }),
      updateStage: jest.fn().mockResolvedValue({ id: 'app1' }),
    };
    const pipelineStageRepo = {
      findById: jest.fn().mockResolvedValue({ id: 's2', name: 'Interview' }),
    };
    const candidateIndexRepo = {
      findByApplication: jest.fn().mockResolvedValue({ id: 'idx1', tenantId: 'tenant-a' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'idx1' }),
    };
    const service = makeService({ applicationRepo, pipelineStageRepo, candidateIndexRepo });
    await service.moveApplicationStage('app1', { stageId: 's2' });
    expect(applicationRepo.updateStage).toHaveBeenCalledWith('app1', 's2', 'tenant_tenant-a');
    expect(candidateIndexRepo.updateStatus).toHaveBeenCalledWith('app1', 'tenant-a', 'Interview');
  });

  it('rolls back and 503s when the index sync fails', async () => {
    const applicationRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'app1', candidateAccountId: 'c1', currentStageId: 's1' }),
      updateStage: jest.fn().mockResolvedValue({ id: 'app1' }),
    };
    const pipelineStageRepo = {
      findById: jest.fn().mockResolvedValue({ id: 's2', name: 'Interview' }),
    };
    const candidateIndexRepo = {
      findByApplication: jest.fn().mockResolvedValue({ id: 'idx1', tenantId: 'tenant-a' }),
      updateStatus: jest.fn().mockResolvedValue(null),
    };
    const service = makeService({ applicationRepo, pipelineStageRepo, candidateIndexRepo });
    await expect(service.moveApplicationStage('app1', { stageId: 's2' })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('lists interviews tagged with the tenant name', async () => {
    const interviewRepo = {
      findAll: jest.fn().mockResolvedValue([{ id: 'iv1', status: 'scheduled' }]),
    };
    const service = makeService({ interviewRepo: interviewRepo as never });
    const result = await service.listInterviews({});
    expect(result).toEqual([{ id: 'iv1', status: 'scheduled', tenantName: 'Acme' }]);
  });

  it('reschedules an interview in the tenant that owns it', async () => {
    const interviewRepo = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'iv1',
        scheduledAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue({ id: 'iv1' }),
    };
    const service = makeService({ interviewRepo: interviewRepo as never });
    await service.rescheduleInterview('iv1', { status: 'cancelled' });
    expect(interviewRepo.update).toHaveBeenCalledWith(
      'iv1',
      { status: 'cancelled' },
      'tenant_tenant-a',
    );
  });

  it('404s when an interview exists in no tenant', async () => {
    const interviewRepo = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const service = makeService({ interviewRepo: interviewRepo as never });
    await expect(service.rescheduleInterview('iv1', { status: 'cancelled' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 3: Run the spec to verify it fails**

```sh
cd backend && npm test -- platform-data.service.spec
```

Expected: FAIL — service file does not exist.

- [ ] **Step 4: Implement `PlatformDataService`**

Create `backend/src/modules/platform/platform-data.service.ts`:

```ts
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CacheService } from '../../common/cache/cache.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { MoveApplicationStageDto } from './dto/move-application-stage.dto';
import { RescheduleInterviewDto } from './dto/reschedule-interview.dto';

interface PlatformFilters {
  tenantId?: string;
  status?: string;
}

@Injectable()
export class PlatformDataService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly candidateIndexRepo: CandidateApplicationsIndexRepository,
    private readonly interviewRepo: InterviewRepository,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService,
  ) {}

  private schemaOf(tenantId: string): string {
    return `tenant_${tenantId}`;
  }

  async listApplications(filters: PlatformFilters) {
    const tenants = await this.tenantRepo.findAll();
    const target = filters.tenantId
      ? tenants.filter((t) => t.id === filters.tenantId)
      : tenants;
    const rows: Array<Record<string, unknown> & { tenantName: string }> = [];
    for (const tenant of target) {
      const apps = await this.applicationRepo.findAll(undefined, this.schemaOf(tenant.id));
      for (const app of apps) {
        rows.push({ ...app, tenantName: tenant.name, tenantId: tenant.id });
      }
    }
    if (filters.status) {
      return rows.filter((row) => row.stageName === filters.status);
    }
    return rows;
  }

  async moveApplicationStage(
    applicationId: string,
    dto: MoveApplicationStageDto,
  ) {
    const indexed = await this.candidateIndexRepo.findByApplication(applicationId);
    if (!indexed) throw new NotFoundException('Application not found');
    const schema = this.schemaOf(indexed.tenantId);

    const application = await this.applicationRepo.findById(applicationId, schema);
    if (!application) throw new NotFoundException('Application not found');
    const stage = await this.pipelineStageRepo.findById(dto.stageId, schema);
    if (!stage) throw new NotFoundException('Pipeline stage not found');

    const updated = await this.applicationRepo.updateStage(applicationId, dto.stageId, schema);
    if (!updated) throw new NotFoundException('Application not found');

    const indexRow = await this.candidateIndexRepo.updateStatus(
      applicationId,
      indexed.tenantId,
      stage.name,
    );
    if (application.candidateAccountId && !indexRow) {
      await this.applicationRepo.updateStage(
        applicationId,
        application.currentStageId,
        schema,
        dto.stageId,
      );
      throw new ServiceUnavailableException(
        'Candidate application status could not be synchronized',
      );
    }
    await this.cacheService.invalidateTenantDashboard(indexed.tenantId);
    await this.auditService.log(
      'platform.application.stage_move',
      applicationId,
      { fromStage: application.currentStageId, toStage: stage.name },
      indexed.tenantId,
    );
    return this.applicationRepo.findById(applicationId, schema);
  }

  async listInterviews(filters: PlatformFilters) {
    const tenants = await this.tenantRepo.findAll();
    const target = filters.tenantId
      ? tenants.filter((t) => t.id === filters.tenantId)
      : tenants;
    const rows: Array<Record<string, unknown> & { tenantName: string }> = [];
    for (const tenant of target) {
      const interviews = await this.interviewRepo.findAll(undefined, this.schemaOf(tenant.id));
      for (const interview of interviews) {
        rows.push({ ...interview, tenantName: tenant.name, tenantId: tenant.id });
      }
    }
    if (filters.status) {
      return rows.filter((row) => row.status === filters.status);
    }
    return rows;
  }

  async rescheduleInterview(
    interviewId: string,
    dto: RescheduleInterviewDto,
  ) {
    const tenants = await this.tenantRepo.findAll();
    for (const tenant of tenants) {
      const schema = this.schemaOf(tenant.id);
      const interview = await this.interviewRepo.findById(interviewId, schema);
      if (interview) {
        const data: { scheduledAt?: Date; status?: string } = {};
        if (dto.scheduledAt !== undefined) {
          data.scheduledAt = new Date(dto.scheduledAt);
        }
        if (dto.status !== undefined) data.status = dto.status;
        const updated = await this.interviewRepo.update(interviewId, data, schema);
        await this.auditService.log(
          'platform.interview.update',
          interviewId,
          dto as unknown as Record<string, unknown>,
          tenant.id,
        );
        return updated;
      }
    }
    throw new NotFoundException('Interview not found');
  }
}
```

- [ ] **Step 5: Write the controller**

Create `backend/src/modules/platform/platform-data.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformDataService } from './platform-data.service';
import {
  MoveApplicationStageSchema,
  MoveApplicationStageDto,
} from './dto/move-application-stage.dto';
import {
  RescheduleInterviewSchema,
  RescheduleInterviewDto,
} from './dto/reschedule-interview.dto';

@Controller('platform')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformDataController {
  constructor(private readonly dataService: PlatformDataService) {}

  @Get('applications')
  listApplications(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
  ) {
    return this.dataService.listApplications({
      tenantId: tenantId || undefined,
      status: status || undefined,
    });
  }

  @Patch('applications/:id/stage')
  moveApplicationStage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(MoveApplicationStageSchema))
    body: MoveApplicationStageDto,
  ) {
    return this.dataService.moveApplicationStage(id, body);
  }

  @Get('interviews')
  listInterviews(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
  ) {
    return this.dataService.listInterviews({
      tenantId: tenantId || undefined,
      status: status || undefined,
    });
  }

  @Patch('interviews/:id')
  rescheduleInterview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RescheduleInterviewSchema))
    body: RescheduleInterviewDto,
  ) {
    return this.dataService.rescheduleInterview(id, body);
  }
}
```

- [ ] **Step 6: Register in the platform module**

In `backend/src/modules/platform/platform.module.ts`, add:

```ts
import { PlatformDataController } from './platform-data.controller';
import { PlatformDataService } from './platform-data.service';
```

and:

```ts
  controllers: [PlatformController, PlatformAccountsController, PlatformDataController],
  providers: [PlatformService, PlatformAccountsService, PlatformDataService],
```

- [ ] **Step 7: Run unit tests + typecheck**

```sh
cd backend && npm test -- platform-data.service.spec && npm run typecheck && npm run lint
```

Expected: new spec passes; typecheck + lint clean.

- [ ] **Step 8: Commit**

```sh
git add backend/src/modules/platform
git commit -m "feat(m11): platform applications and interviews management"
```

---

### Task 7: Candidate withdraw

**Files:**
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.spec.ts` (if present — check first)

- [ ] **Step 1: Implement `withdraw` in the service**

In `backend/src/modules/candidate-account/candidate-account.service.ts`, add after `getApplicationDetail` (after line 285):

```ts
  async withdraw(candidateAccountId: string, applicationId: string) {
    const indexed =
      await this.candidateApplicationsIndexRepo.findByCandidateAndApplication(
        candidateAccountId,
        applicationId,
      );
    if (!indexed) throw new NotFoundException('Application not found');

    const schemaName = `tenant_${indexed.tenantId}`;
    await this.applicationRepo.delete(indexed.applicationId, schemaName);
    await this.candidateApplicationsIndexRepo.deleteById(indexed.id);
    await this.cacheService.invalidateTenantDashboard(indexed.tenantId);
    return { applicationId };
  }
```

- [ ] **Step 2: Add the route**

In `backend/src/modules/candidate-account/candidate-account.controller.ts`, after `getApplicationDetail` (after line 82):

```ts
  @Delete('applications/:id')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async withdrawApplication(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: TenantContext,
  ) {
    return this.candidateAccountService.withdraw(user.userId, id);
  }
```

- [ ] **Step 3: Typecheck + lint**

```sh
cd backend && npm run typecheck && npm run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```sh
git add backend/src/modules/candidate-account
git commit -m "feat(m11): candidate withdraw application"
```

---

### Task 8: Admin frontend — API layer + hooks

**Files:**
- Modify: `frontend/src/api/platformApi.ts`
- Modify: `frontend/src/api/queryKeys.ts`
- Modify: `frontend/src/features/admin/hooks/usePlatform.ts`

- [ ] **Step 1: Extend `platformApi`**

In `frontend/src/api/platformApi.ts`, add interfaces and methods:

```ts
export interface PlatformUser {
  id: string;
  email: string;
  role: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface PlatformCandidate {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: string;
}

export interface PlatformApplication {
  id: string;
  tenantId: string;
  tenantName: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  stageName: string;
  appliedAt: string;
  matchScore: number | null;
}

export interface PlatformInterview {
  id: string;
  tenantId: string;
  tenantName: string;
  candidateName: string;
  jobTitle: string;
  interviewerEmail: string;
  scheduledAt: string;
  status: string;
}
```

Add methods to the `platformApi` object:

```ts
  listTenantUsers: async (tenantId: string): Promise<PlatformUser[]> => {
    const { data } = await apiClient.get(`/platform/tenants/${tenantId}/users`);
    return unwrap(data as ApiEnvelope<PlatformUser[]>);
  },
  createTenantUser: async (
    tenantId: string,
    body: { email: string; role: string; password: string },
  ): Promise<ApiEnvelope<PlatformUser>> => {
    const { data } = await apiClient.post(`/platform/tenants/${tenantId}/users`, body);
    return data as ApiEnvelope<PlatformUser>;
  },
  updateTenantUser: async (
    tenantId: string,
    userId: string,
    body: { role?: string; password?: string },
  ): Promise<ApiEnvelope<PlatformUser>> => {
    const { data } = await apiClient.patch(`/platform/tenants/${tenantId}/users/${userId}`, body);
    return data as ApiEnvelope<PlatformUser>;
  },
  setTenantUserStatus: async (
    tenantId: string,
    userId: string,
    status: 'active' | 'suspended',
  ): Promise<ApiEnvelope<PlatformUser>> => {
    const { data } = await apiClient.patch(
      `/platform/tenants/${tenantId}/users/${userId}/${status === 'suspended' ? 'suspend' : 'reactivate'}`,
    );
    return data as ApiEnvelope<PlatformUser>;
  },
  removeTenantUser: async (tenantId: string, userId: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/tenants/${tenantId}/users/${userId}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  listCandidates: async (): Promise<PlatformCandidate[]> => {
    const { data } = await apiClient.get('/platform/candidates');
    return unwrap(data as ApiEnvelope<PlatformCandidate[]>);
  },
  createCandidate: async (
    body: { email: string; password: string; firstName: string; lastName: string; phone?: string },
  ): Promise<ApiEnvelope<PlatformCandidate>> => {
    const { data } = await apiClient.post('/platform/candidates', body);
    return data as ApiEnvelope<PlatformCandidate>;
  },
  updateCandidate: async (
    id: string,
    body: { email?: string; password?: string; firstName?: string; lastName?: string; phone?: string | null },
  ): Promise<ApiEnvelope<PlatformCandidate>> => {
    const { data } = await apiClient.patch(`/platform/candidates/${id}`, body);
    return data as ApiEnvelope<PlatformCandidate>;
  },
  removeCandidate: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/candidates/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  listApplications: async (filters?: { tenantId?: string; status?: string }): Promise<PlatformApplication[]> => {
    const { data } = await apiClient.get('/platform/applications', { params: filters });
    return unwrap(data as ApiEnvelope<PlatformApplication[]>);
  },
  moveApplicationStage: async (
    id: string,
    stageId: string,
  ): Promise<ApiEnvelope<PlatformApplication>> => {
    const { data } = await apiClient.patch(`/platform/applications/${id}/stage`, { stageId });
    return data as ApiEnvelope<PlatformApplication>;
  },
  listInterviews: async (filters?: { tenantId?: string; status?: string }): Promise<PlatformInterview[]> => {
    const { data } = await apiClient.get('/platform/interviews', { params: filters });
    return unwrap(data as ApiEnvelope<PlatformInterview[]>);
  },
  rescheduleInterview: async (
    id: string,
    body: { scheduledAt?: string; status?: string },
  ): Promise<ApiEnvelope<PlatformInterview>> => {
    const { data } = await apiClient.patch(`/platform/interviews/${id}`, body);
    return data as ApiEnvelope<PlatformInterview>;
  },
```

- [ ] **Step 2: Extend `queryKeys`**

In `frontend/src/api/queryKeys.ts`, extend the `platform` block:

```ts
  platform: {
    tenants: () => ['platform', 'tenants'],
    tenant: (id: string) => ['platform', 'tenants', id],
    tenantUsers: (tenantId: string) => ['platform', 'tenants', tenantId, 'users'],
    candidates: () => ['platform', 'candidates'],
    applications: (filters?: { tenantId?: string; status?: string }) => [
      'platform',
      'applications',
      filters,
    ],
    interviews: (filters?: { tenantId?: string; status?: string }) => [
      'platform',
      'interviews',
      filters,
    ],
    stats: () => ['platform', 'stats'],
  },
```

- [ ] **Step 3: Add hooks**

Append to `frontend/src/features/admin/hooks/usePlatform.ts`:

```ts
export function useTenantUsers(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.platform.tenantUsers(tenantId),
    queryFn: () => platformApi.listTenantUsers(tenantId),
    enabled: !!tenantId,
  });
}

export function usePlatformCandidates() {
  return useQuery({
    queryKey: queryKeys.platform.candidates(),
    queryFn: platformApi.listCandidates,
  });
}

export function usePlatformApplications(filters?: { tenantId?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.platform.applications(filters),
    queryFn: () => platformApi.listApplications(filters),
  });
}

export function usePlatformInterviews(filters?: { tenantId?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.platform.interviews(filters),
    queryFn: () => platformApi.listInterviews(filters),
  });
}

export function useCreateTenantUser(tenantId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (body: { email: string; role: string; password: string }) =>
      platformApi.createTenantUser(tenantId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.tenantUsers(tenantId) });
    },
  });
}

export function useUpdateTenantUser(tenantId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ userId, body }: { userId: string; body: { role?: string; password?: string } }) =>
      platformApi.updateTenantUser(tenantId, userId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.tenantUsers(tenantId) });
    },
  });
}

export function useSetTenantUserStatus(tenantId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'suspended' }) =>
      platformApi.setTenantUserStatus(tenantId, userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.tenantUsers(tenantId) });
    },
  });
}

export function useRemoveTenantUser(tenantId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (userId: string) => platformApi.removeTenantUser(tenantId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.tenantUsers(tenantId) });
    },
  });
}

export function useCreateCandidate() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (body: { email: string; password: string; firstName: string; lastName: string; phone?: string }) =>
      platformApi.createCandidate(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.candidates() });
    },
  });
}

export function useUpdateCandidate() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: { email?: string; password?: string; firstName?: string; lastName?: string; phone?: string | null } }) =>
      platformApi.updateCandidate(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.candidates() });
    },
  });
}

export function useRemoveCandidate() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => platformApi.removeCandidate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.candidates() });
    },
  });
}

export function useMoveApplicationStage() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) =>
      platformApi.moveApplicationStage(id, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.applications() });
    },
  });
}

export function useRescheduleInterview() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: { scheduledAt?: string; status?: string } }) =>
      platformApi.rescheduleInterview(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.interviews() });
    },
  });
}
```

- [ ] **Step 4: Build + lint**

```sh
cd frontend && npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 5: Commit**

```sh
git add frontend/src/api/platformApi.ts frontend/src/api/queryKeys.ts frontend/src/features/admin/hooks/usePlatform.ts
git commit -m "feat(m11): admin platform API layer and hooks"
```

---

### Task 9: Admin frontend — tenant detail tabs + candidates page

**Files:**
- Modify: `frontend/src/features/admin/TenantDetailPage.tsx`
- Create: `frontend/src/features/admin/CandidatesPage.tsx`
- Modify: `frontend/src/features/admin/layout.tsx`
- Create: `frontend/src/routes/admin/candidates.tsx`

- [ ] **Step 1: Rewrite `TenantDetailPage` with tabs**

Replace the contents of `frontend/src/features/admin/TenantDetailPage.tsx`:

```tsx
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NativeSelect,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useNavigate } from '@tanstack/react-router';
import {
  useCreateTenantUser,
  useMoveApplicationStage,
  usePlatformApplications,
  usePlatformInterviews,
  useRemoveTenantUser,
  useRescheduleInterview,
  useSetTenantStatus,
  useSetTenantUserStatus,
  useTenantDetail,
  useTenantUsers,
  useUpdateTenantUser,
} from './hooks/usePlatform';

const INTERNAL_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager', 'Interviewer'];

export function TenantDetailPage({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { data: tenant, isLoading, error } = useTenantDetail(tenantId);
  const setStatus = useSetTenantStatus();
  const { data: users = [], isLoading: usersLoading } = useTenantUsers(tenantId);
  const { data: applications = [] } = usePlatformApplications({ tenantId });
  const { data: interviews = [] } = usePlatformInterviews({ tenantId });

  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [newUser, setNewUser] = useState({ email: '', role: 'Recruiter', password: '' });
  const [stageFor, setStageFor] = useState<{ id: string; stageId: string } | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<{ id: string; scheduledAt: string } | null>(null);

  const createUser = useCreateTenantUser(tenantId);
  const updateUser = useUpdateTenantUser(tenantId);
  const setUserStatus = useSetTenantUserStatus(tenantId);
  const removeUser = useRemoveTenantUser(tenantId);
  const moveStage = useMoveApplicationStage();
  const reschedule = useRescheduleInterview();

  if (isLoading) return <Loader />;
  if (error || !tenant) {
    return <Alert color="red">Tenant not found.</Alert>;
  }

  const isSuspended = tenant.status === 'suspended';

  const handleCreateUser = () => {
    createUser.mutate(
      { email: newUser.email, role: newUser.role, password: newUser.password },
      { onSuccess: () => { closeCreate(); setNewUser({ email: '', role: 'Recruiter', password: '' }); } },
    );
  };

  const handleResetPassword = () => {
    if (resetUserId) {
      updateUser.mutate(
        { userId: resetUserId, body: { password } },
        { onSuccess: () => { setResetUserId(null); setPassword(''); } },
      );
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{tenant.name}</Title>
        <Badge variant="light" color={isSuspended ? 'red' : 'green'}>
          {tenant.status}
        </Badge>
      </Group>

      <Card withBorder>
        <Stack gap="xs">
          <Text size="sm">
            Slug: <b>{tenant.slug}</b>
          </Text>
          <SimpleGrid cols={2}>
            <Text size="sm">
              Users: <b>{tenant.users}</b>
            </Text>
            <Text size="sm">
              Applications: <b>{tenant.applications}</b>
            </Text>
          </SimpleGrid>
        </Stack>
      </Card>

      <Group>
        <Button
          color={isSuspended ? 'green' : 'red'}
          loading={setStatus.isPending}
          onClick={() =>
            setStatus.mutate(
              { id: tenant.id, status: isSuspended ? 'active' : 'suspended' },
              { onSuccess: () => navigate({ to: '/admin/tenants' }) },
            )
          }
        >
          {isSuspended ? 'Reactivate' : 'Suspend'}
        </Button>
        <Button variant="light" onClick={() => navigate({ to: '/admin/tenants' })}>
          Back
        </Button>
      </Group>

      <Tabs defaultValue="users">
        <Tabs.List>
          <Tabs.Tab value="users">Users</Tabs.Tab>
          <Tabs.Tab value="applications">Applications</Tabs.Tab>
          <Tabs.Tab value="interviews">Interviews</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users" pt="md">
          {usersLoading ? (
            <Loader />
          ) : (
            <Stack>
              <Group justify="space-between">
                <Title order={4}>Team</Title>
                <Button onClick={openCreate}>Add user</Button>
              </Group>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Email</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {users.map((user) => (
                    <Table.Tr key={user.id}>
                      <Table.Td>{user.email}</Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          value={user.role}
                          data={INTERNAL_ROLES}
                          allowDeselect={false}
                          onChange={(role) => {
                            if (role) {
                              updateUser.mutate({ userId: user.id, body: { role } });
                            }
                          }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={user.status === 'suspended' ? 'red' : 'green'}>
                          {user.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => setResetUserId(user.id)}
                          >
                            Reset password
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            color={user.status === 'suspended' ? 'green' : 'orange'}
                            loading={setUserStatus.isPending}
                            onClick={() =>
                              setUserStatus.mutate({
                                userId: user.id,
                                status: user.status === 'suspended' ? 'active' : 'suspended',
                              })
                            }
                          >
                            {user.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            color="red"
                            onClick={() => setRemoveUserId(user.id)}
                          >
                            Remove
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="applications" pt="md">
          {applications.length === 0 ? (
            <Text c="dimmed">No applications in this tenant.</Text>
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Candidate</Table.Th>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Stage</Table.Th>
                  <Table.Th>Applied</Table.Th>
                  <Table.Th>Match</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {applications.map((app) => (
                  <Table.Tr key={app.id}>
                    <Table.Td>{app.candidateName}</Table.Td>
                    <Table.Td>{app.jobTitle}</Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() =>
                          setStageFor({ id: app.id, stageId: app.stageName ?? '' })
                        }
                      >
                        {app.stageName ?? '—'}
                      </Button>
                    </Table.Td>
                    <Table.Td>{new Date(app.appliedAt).toLocaleDateString()}</Table.Td>
                    <Table.Td>
                      {app.matchScore === null || app.matchScore === undefined
                        ? '—'
                        : `${Math.round(app.matchScore * 100)}%`}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="interviews" pt="md">
          {interviews.length === 0 ? (
            <Text c="dimmed">No interviews in this tenant.</Text>
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Candidate</Table.Th>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Interviewer</Table.Th>
                  <Table.Th>Scheduled</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {interviews.map((interview) => (
                  <Table.Tr key={interview.id}>
                    <Table.Td>{interview.candidateName}</Table.Td>
                    <Table.Td>{interview.jobTitle}</Table.Td>
                    <Table.Td>{interview.interviewerEmail}</Table.Td>
                    <Table.Td>
                      {new Date(interview.scheduledAt).toLocaleString()}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light">{interview.status}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() =>
                            setRescheduleFor({
                              id: interview.id,
                              scheduledAt: new Date(interview.scheduledAt).toISOString().slice(0, 16),
                            })
                          }
                        >
                          Reschedule
                        </Button>
                        {interview.status === 'scheduled' && (
                          <Button
                            size="xs"
                            variant="outline"
                            color="red"
                            onClick={() =>
                              reschedule.mutate({ id: interview.id, body: { status: 'cancelled' } })
                            }
                          >
                            Cancel
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>
      </Tabs>

      <Modal opened={createOpened} onClose={closeCreate} title="Add user">
        <Stack>
          <TextInput
            label="Email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.currentTarget.value })}
          />
          <NativeSelect
            label="Role"
            value={newUser.role}
            data={INTERNAL_ROLES}
            onChange={(e) => setNewUser({ ...newUser, role: e.currentTarget.value })}
          />
          <PasswordInput
            label="Password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.currentTarget.value })}
          />
          <Button loading={createUser.isPending} onClick={handleCreateUser}>
            Create
          </Button>
        </Stack>
      </Modal>

      <Modal opened={resetUserId !== null} onClose={() => setResetUserId(null)} title="Reset password">
        <Stack>
          <PasswordInput
            label="New password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <Button loading={updateUser.isPending} onClick={handleResetPassword}>
            Save
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={removeUserId !== null}
        onClose={() => setRemoveUserId(null)}
        title="Remove user"
      >
        <Stack>
          <Text>Remove this user from the tenant? This cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setRemoveUserId(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={removeUser.isPending}
              onClick={() =>
                removeUser.mutate(removeUserId!, { onSuccess: () => setRemoveUserId(null) })
              }
            >
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={stageFor !== null}
        onClose={() => setStageFor(null)}
        title="Move application stage"
      >
        <Stack>
          <TextInput
            label="Stage name (from tenant pipeline)"
            placeholder="Screening"
            value={stageFor?.stageId ?? ''}
            onChange={(e) => setStageFor((s) => (s ? { ...s, stageId: e.currentTarget.value } : s))}
          />
          <Text size="xs" c="dimmed">
            Enter the exact stage name used by this tenant (e.g. Screening, Interview, Offer).
          </Text>
          <Button
            loading={moveStage.isPending}
            onClick={() =>
              stageFor &&
              moveStage.mutate(
                { id: stageFor.id, stageId: stageFor.stageId },
                { onSuccess: () => setStageFor(null) },
              )
            }
          >
            Move
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={rescheduleFor !== null}
        onClose={() => setRescheduleFor(null)}
        title="Reschedule interview"
      >
        <Stack>
          <TextInput
            label="Scheduled at"
            type="datetime-local"
            value={rescheduleFor?.scheduledAt ?? ''}
            onChange={(e) =>
              setRescheduleFor((r) => (r ? { ...r, scheduledAt: e.currentTarget.value } : r))
            }
          />
          <Button
            loading={reschedule.isPending}
            onClick={() =>
              rescheduleFor &&
              reschedule.mutate(
                {
                  id: rescheduleFor.id,
                  body: { scheduledAt: new Date(rescheduleFor.scheduledAt).toISOString() },
                },
                { onSuccess: () => setRescheduleFor(null) },
              )
            }
          >
            Save
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
```

Note: `moveApplicationStage` expects a `stageId` (UUID), not a stage name. To keep the UI honest, add a backend `GET /platform/tenants/:id/pipeline-stages` endpoint (below, Step 2) and swap the stage modal to a `Select` fed by that endpoint. The TextInput above is a stopgap for the first build; replace it with the Select in Step 2.

- [ ] **Step 2: Add pipeline-stages endpoint for the stage picker**

In `backend/src/modules/platform/platform-accounts.controller.ts`, add:

```ts
  @Get('tenants/:id/pipeline-stages')
  listTenantStages(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.listTenantStages(id);
  }
```

In `PlatformAccountsService`, add:

```ts
  async listTenantStages(tenantId: string) {
    await this.requireTenant(tenantId);
    return this.pipelineStageRepo.findAll(this.schemaOf(tenantId));
  }
```

Add `PipelineStageRepository` to the service constructor (import from `../../repositories/pipeline-stage.repository`), and add the matching mock in the spec's `makeService`.

Backend register + verify:

```sh
cd backend && npm run typecheck && npm test -- platform-accounts.service.spec
```

Then in the frontend `TenantDetailPage`, replace the stage TextInput modal with:

```tsx
import { usePlatformStages } from './hooks/usePlatform';
// inside component:
const { data: stages = [] } = usePlatformStages(tenantId);
// replace the TextInput inside the stage modal with:
<Select
  label="Stage"
  value={stageFor?.stageId ?? ''}
  data={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
  onChange={(stageId) => setStageFor((s) => (s ? { ...s, stageId: stageId ?? '' } : s))}
/>
```

And add to `frontend/src/api/platformApi.ts`:

```ts
export interface PlatformStage {
  id: string;
  name: string;
  order: number;
}
```

with method:

```ts
  listTenantStages: async (tenantId: string): Promise<PlatformStage[]> => {
    const { data } = await apiClient.get(`/platform/tenants/${tenantId}/pipeline-stages`);
    return unwrap(data as ApiEnvelope<PlatformStage[]>);
  },
```

and to `queryKeys`:

```ts
    tenantStages: (tenantId: string) => ['platform', 'tenants', tenantId, 'stages'],
```

and the hook:

```ts
export function usePlatformStages(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.platform.tenantStages(tenantId),
    queryFn: () => platformApi.listTenantStages(tenantId),
    enabled: !!tenantId,
  });
}
```

- [ ] **Step 3: Create `CandidatesPage`**

Create `frontend/src/features/admin/CandidatesPage.tsx`:

```tsx
import { useState } from 'react';
import {
  Button,
  Group,
  Loader,
  Modal,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  useCreateCandidate,
  usePlatformCandidates,
  useRemoveCandidate,
  useUpdateCandidate,
} from './hooks/usePlatform';

const EMPTY = { email: '', password: '', firstName: '', lastName: '', phone: '' };

export function CandidatesPage() {
  const { data: candidates = [], isLoading } = usePlatformCandidates();
  const createCandidate = useCreateCandidate();
  const updateCandidate = useUpdateCandidate();
  const removeCandidate = useRemoveCandidate();

  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const editing = candidates.find((c) => c.id === editTarget);

  const handleCreate = () => {
    createCandidate.mutate(form, {
      onSuccess: () => {
        closeCreate();
        setForm(EMPTY);
      },
    });
  };

  const handleUpdate = () => {
    if (!editing) return;
    updateCandidate.mutate(
      {
        id: editing.id,
        body: {
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          phone: form.phone || undefined,
          password: form.password || undefined,
        },
      },
      { onSuccess: () => setEditTarget(null) },
    );
  };

  if (isLoading) return <Loader />;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Candidates</Title>
        <Button onClick={openCreate}>Add candidate</Button>
      </Group>
      {candidates.length === 0 ? (
        <Text c="dimmed">No candidate accounts yet.</Text>
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Phone</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {candidates.map((candidate) => (
              <Table.Tr key={candidate.id}>
                <Table.Td>
                  {candidate.firstName} {candidate.lastName}
                </Table.Td>
                <Table.Td>{candidate.email}</Table.Td>
                <Table.Td>{candidate.phone ?? '—'}</Table.Td>
                <Table.Td>{new Date(candidate.createdAt).toLocaleDateString()}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => {
                        setEditTarget(candidate.id);
                        setForm({
                          email: candidate.email,
                          password: '',
                          firstName: candidate.firstName,
                          lastName: candidate.lastName,
                          phone: candidate.phone ?? '',
                        });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      color="red"
                      onClick={() => setRemoveTarget(candidate.id)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpened} onClose={closeCreate} title="Add candidate">
        <Stack>
          <TextInput
            label="First name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.currentTarget.value })}
          />
          <TextInput
            label="Last name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.currentTarget.value })}
          />
          <TextInput
            label="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.currentTarget.value })}
          />
          <TextInput
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })}
          />
          <PasswordInput
            label="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.currentTarget.value })}
          />
          <Button loading={createCandidate.isPending} onClick={handleCreate}>
            Create
          </Button>
        </Stack>
      </Modal>

      <Modal opened={editTarget !== null} onClose={() => setEditTarget(null)} title="Edit candidate">
        <Stack>
          <TextInput
            label="First name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.currentTarget.value })}
          />
          <TextInput
            label="Last name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.currentTarget.value })}
          />
          <TextInput
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })}
          />
          <PasswordInput
            label="New password (leave blank to keep)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.currentTarget.value })}
          />
          <Button loading={updateCandidate.isPending} onClick={handleUpdate}>
            Save
          </Button>
        </Stack>
      </Modal>

      <Modal opened={removeTarget !== null} onClose={() => setRemoveTarget(null)} title="Delete candidate">
        <Stack>
          <Text>
            This deletes the account and all of the candidate's applications and pipeline data.
          </Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={removeCandidate.isPending}
              onClick={() =>
                removeCandidate.mutate(removeTarget!, { onSuccess: () => setRemoveTarget(null) })
              }
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
```

- [ ] **Step 4: Add the route + nav entry**

Create `frontend/src/routes/admin/candidates.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { CandidatesPage } from '@/features/admin/CandidatesPage';

export const Route = createFileRoute('/admin/candidates')({
  component: CandidatesPage,
});
```

In `frontend/src/features/admin/layout.tsx`, add a nav link. Update the imports to include `IconUser` from `@tabler/icons-react` and add after the Tenants `NavLink`:

```tsx
        <NavLink
          label="Candidates"
          leftSection={<IconUser size="1rem" />}
          component={Link}
          to="/admin/candidates"
        />
```

- [ ] **Step 5: Build + lint + commit**

```sh
cd frontend && npm run lint && npm run build
```

Expected: clean. (The route tree regenerates automatically via the file-based router during `npm run dev`/`build`.)

```sh
git add frontend/src/features/admin frontend/src/routes/admin/candidates.tsx
git commit -m "feat(m11): admin tenant tabs and candidates page"
```

---

### Task 10: Candidate job detail page

**Files:**
- Create: `frontend/src/features/candidate-portal/jobs/JobDetailsView.tsx`
- Modify: `frontend/src/features/public-careers/JobDetailPage.tsx` (use the shared view)
- Create: `frontend/src/routes/_candidate/jobs.$jobId.tsx`
- Modify: `frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx`

- [ ] **Step 1: Create the shared `JobDetailsView`**

Create `frontend/src/features/candidate-portal/jobs/JobDetailsView.tsx`:

```tsx
import type { ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import type { Job } from '../types';

interface JobDetailsViewProps {
  job: {
    title: string;
    companyName: string;
    description?: string | null;
    requiredSkills?: { id: string; name: string }[];
  };
  onApply: () => void;
  applyLabel?: string;
  backLink?: ReactNode;
}

export function JobDetailsView({
  job,
  onApply,
  applyLabel = 'Apply now',
  backLink,
}: JobDetailsViewProps) {
  return (
    <Stack gap="xl">
      {backLink}
      <div>
        <Title order={1}>{job.title}</Title>
        <Text c="dimmed" mt="xs">
          {job.companyName}
        </Text>
      </div>
      <Card withBorder padding="xl" radius="md">
        <Stack gap="lg">
          <div>
            <Title order={3}>About the role</Title>
            <Text mt="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {job.description ?? 'No description provided.'}
            </Text>
          </div>
          <div>
            <Title order={3}>Required skills</Title>
            {!job.requiredSkills || job.requiredSkills.length === 0 ? (
              <Text c="dimmed" mt="sm">
                No specific skills listed.
              </Text>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
                {job.requiredSkills.map((skill) => (
                  <Badge key={skill.id} variant="light" size="lg">
                    {skill.name}
                  </Badge>
                ))}
              </SimpleGrid>
            )}
          </div>
          <Button onClick={onApply} size="md">
            {applyLabel}
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
```

- [ ] **Step 2: Refactor the public `JobDetailPage` to use it**

In `frontend/src/features/public-careers/JobDetailPage.tsx`, replace the `Card` block (lines 98-133) with:

```tsx
        <JobDetailsView
          job={job}
          backLink={
            <Link to="/careers/$tenantSlug/jobs" params={{ tenantSlug }}>
              Back to open positions
            </Link>
          }
          onApply={handleApply}
        />
```

Update the imports: keep `Alert, Button, Container, Group, Loader, Stack` (drop `Badge, Card, SimpleGrid, Text, Title` if no longer used elsewhere in the file) and add:

```tsx
import { JobDetailsView } from '@/features/candidate-portal/jobs/JobDetailsView';
```

Keep the `candidateRequired` Alert (render it before the `JobDetailsView` or keep the existing position). Verify the remaining JSX compiles — the Alert stays in the `Stack`:

```tsx
        {candidateRequired && (
          <Alert color="yellow" title="Candidate account required">
            Sign in with a Candidate account to submit an application.
          </Alert>
        )}
        <JobDetailsView ... />
```

- [ ] **Step 3: Create the candidate job detail route**

Create `frontend/src/routes/_candidate/jobs.$jobId.tsx`:

```tsx
import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Alert, Button, Container, Group, Loader, Stack } from '@mantine/core';
import { useAuthStore } from '@/api/useAuth';
import { useJobDetail } from '@/features/candidate-portal/hooks';
import { JobDetailsView } from '@/features/candidate-portal/jobs/JobDetailsView';
import { CandidateApplyModal } from '@/features/candidate-portal/applications/CandidateApplyModal';
import type { NormalizedCandidateJob } from '@/features/candidate-portal/api/candidateApi';

export const Route = createFileRoute('/_candidate/jobs/$jobId')({
  validateSearch: (search: Record<string, unknown>) => ({
    tenantId: typeof search.tenantId === 'string' ? search.tenantId : '',
  }),
  component: CandidateJobDetailRoute,
});

function CandidateJobDetailRoute() {
  const { jobId } = Route.useParams();
  const { tenantId } = Route.useSearch();
  const { role } = useAuthStore();
  const { data: job, isLoading, error } = useJobDetail(tenantId, jobId);
  const [applyOpened, setApplyOpened] = useState(false);

  if (isLoading || !tenantId) {
    return (
      <Container size="md" py="xl">
        <Group justify="center">
          <Loader />
        </Group>
      </Container>
    );
  }

  if (error || !job) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" title="Job not found">
          This position is no longer available or could not be loaded.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <JobDetailsView
        job={job}
        backLink={
          <Link to="/dashboard">Back to job search</Link>
        }
        onApply={() => setApplyOpened(true)}
        applyLabel={role === 'Candidate' ? 'Apply now' : 'Sign in to apply'}
      />
      {applyOpened && (
        <CandidateApplyModal
          opened
          onClose={() => setApplyOpened(false)}
          job={job}
        />
      )}
    </Container>
  );
}
```

Note: `CandidateApplyModal` takes a `Job` — the candidate `NormalizedCandidateJob` satisfies it. If the modal's prop type requires `id`, pass `job` directly (the normalized job has `id`).

- [ ] **Step 4: Link job cards from `JobSearchPage`**

In `frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx`, replace the `Apply` button (line 40) with a details link and drop the inline modal:

```tsx
import { Link } from '@tanstack/react-router';
```

and replace the card body:

```tsx
      {jobs.map((job: Job) => (
        <Card key={job.id} shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <div>
              <Title order={4}>{job.title}</Title>
              <Text size="sm" c="dimmed">{job.companyName}</Text>
            </div>
            <Button
              component={Link}
              to="/_candidate/jobs/$jobId"
              params={{ jobId: job.id }}
              search={{ tenantId: job.tenantId }}
            >
              View details
            </Button>
          </Group>
        </Card>
      ))}
```

Remove the `selectedJobId` state, `selectedJob`, and the trailing `CandidateApplyModal` block (the `useState` import can stay if unused — remove it if the file no longer uses it).

- [ ] **Step 5: Build + lint**

```sh
cd frontend && npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 6: Commit**

```sh
git add frontend/src/features/candidate-portal/jobs frontend/src/routes/_candidate/jobs.$jobId.tsx frontend/src/features/public-careers/JobDetailPage.tsx frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx
git commit -m "feat(m11): candidate job detail page with shared details view"
```

---

### Task 11: Candidate applications page — links, timeline, withdraw

**Files:**
- Modify: `frontend/src/features/candidate-portal/api/candidateApi.ts`
- Modify: `frontend/src/features/candidate-portal/types/index.ts`
- Modify: `frontend/src/api/queryKeys.ts`
- Create: `frontend/src/features/candidate-portal/applications/hooks/useWithdraw.ts`
- Modify: `frontend/src/features/candidate-portal/applications/ApplicationsPage.tsx`
- Modify: `frontend/src/features/candidate-portal/hooks/index.ts`

- [ ] **Step 1: Extend the candidate API + types**

In `frontend/src/features/candidate-portal/types/index.ts`, add `tenantId` and `jobPostingId` to `Application`:

```ts
export interface Application {
  id: string;
  applicationId: string;
  jobTitle: string;
  companyName: string;
  status: string;
  appliedAt: string;
  tenantId: string;
  jobPostingId: string;
}
```

In `frontend/src/features/candidate-portal/api/candidateApi.ts`, add:

```ts
  withdrawApplication: async (applicationId: string): Promise<void> => {
    await apiClient.delete(`/candidate/applications/${applicationId}`);
  },
```

- [ ] **Step 2: Add the withdraw hook**

Create `frontend/src/features/candidate-portal/applications/hooks/useWithdraw.ts`:

```ts
import { useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '../../api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useWithdrawApplication() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (applicationId: string) =>
      candidateApi.withdrawApplication(applicationId),
    successMessage: 'Application withdrawn',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.applications() });
    },
  });
}
```

Export it from `frontend/src/features/candidate-portal/hooks/index.ts`:

```ts
export { useWithdrawApplication } from './applications/hooks/useWithdraw';
```

- [ ] **Step 3: Rewrite `ApplicationsPage`**

Replace the contents of `frontend/src/features/candidate-portal/applications/ApplicationsPage.tsx`:

```tsx
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Modal,
  Stack,
  Stepper,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link } from '@tanstack/react-router';
import { useApplicationDetail, useApplications } from '../hooks';
import { useWithdrawApplication } from './hooks/useWithdraw';
import type { Application } from '../types';

const PIPELINE = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'];
const statusColors: Record<string, string> = {
  Applied: 'blue',
  Screening: 'yellow',
  Interview: 'purple',
  Offer: 'green',
  Hired: 'teal',
  Rejected: 'red',
};

export function ApplicationsPage() {
  const { data: applications = [], isLoading, error } = useApplications();
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const applicationDetail = useApplicationDetail(selectedApplicationId);
  const withdraw = useWithdrawApplication();
  const [withdrawTarget, setWithdrawTarget] = useState<Application | null>(null);
  const [confirmOpened, { close: closeConfirm }] = useDisclosure(false);

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return <Alert color="red">Failed to load applications: {error.message}</Alert>;
  }

  if (applications.length === 0) {
    return <Text>No applications yet</Text>;
  }

  const currentStatus = applicationDetail.data?.status ?? null;
  const currentStep = currentStatus
    ? PIPELINE.includes(currentStatus)
      ? PIPELINE.indexOf(currentStatus)
      : PIPELINE.length - 1
    : 0;

  const rows = applications.map((app: Application) => (
    <Table.Tr key={app.applicationId}>
      <Table.Td>
        <Link
          to="/_candidate/jobs/$jobId"
          params={{ jobId: app.jobPostingId }}
          search={{ tenantId: app.tenantId }}
        >
          {app.jobTitle}
        </Link>
      </Table.Td>
      <Table.Td>{app.companyName}</Table.Td>
      <Table.Td>
        <Badge color={statusColors[app.status] ?? 'gray'}>
          {app.status}
        </Badge>
      </Table.Td>
      <Table.Td>{new Date(app.appliedAt).toLocaleDateString()}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            onClick={() => setSelectedApplicationId(app.applicationId)}
          >
            Details
          </Button>
          <Button
            size="xs"
            variant="outline"
            color="red"
            onClick={() => {
              setWithdrawTarget(app);
              openConfirm();
            }}
          >
            Withdraw
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Title order={2} mb="md">My Applications</Title>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Job Title</Table.Th>
            <Table.Th>Company</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Applied Date</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>

      <Drawer
        opened={!!selectedApplicationId}
        onClose={() => setSelectedApplicationId(null)}
        title={applicationDetail.data?.jobTitle ?? 'Application details'}
        position="right"
        size="md"
      >
        {applicationDetail.isLoading && (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        )}
        {applicationDetail.error && (
          <Alert color="red">
            Failed to load application: {applicationDetail.error.message}
          </Alert>
        )}
        {applicationDetail.data && (
          <Stack gap="md">
            <Text>
              <Text span fw={600}>Company: </Text>
              {applicationDetail.data.companyName}
            </Text>
            <Text>
              <Text span fw={600}>Status: </Text>
              <Badge color={statusColors[applicationDetail.data.status] ?? 'gray'}>
                {applicationDetail.data.status}
              </Badge>
            </Text>
            <Text>
              <Text span fw={600}>Applied: </Text>
              {new Date(applicationDetail.data.appliedAt).toLocaleDateString()}
            </Text>
            <Text>
              <Text span fw={600}>Match score: </Text>
              {applicationDetail.data.matchScore === null
                ? '—'
                : `${Math.round(applicationDetail.data.matchScore * 100)}%`}
            </Text>
            <Stack gap="xs">
              <Text fw={600}>Progress</Text>
              <Stepper active={currentStep} size="xs">
                {PIPELINE.map((stage) => (
                  <Stepper.Step key={stage} label={stage} />
                ))}
              </Stepper>
            </Stack>
            <Stack gap="xs">
              <Text fw={600}>Cover letter</Text>
              <Text style={{ whiteSpace: 'pre-wrap' }}>
                {applicationDetail.data.coverLetter ?? 'No cover letter provided.'}
              </Text>
            </Stack>
            <Button
              color="red"
              variant="outline"
              onClick={() => {
                setWithdrawTarget({
                  id: applicationDetail.data.id,
                  applicationId: applicationDetail.data.applicationId,
                  jobTitle: applicationDetail.data.jobTitle,
                  companyName: applicationDetail.data.companyName,
                  status: applicationDetail.data.status,
                  appliedAt: applicationDetail.data.appliedAt,
                  tenantId: applicationDetail.data.tenantId,
                  jobPostingId: '',
                });
                openConfirm();
              }}
            >
              Withdraw application
            </Button>
          </Stack>
        )}
      </Drawer>

      <Modal opened={confirmOpened} onClose={closeConfirm} title="Withdraw application">
        <Stack>
          <Text>
            Withdraw your application for{' '}
            <b>{withdrawTarget?.jobTitle}</b> at <b>{withdrawTarget?.companyName}</b>?
            This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={withdraw.isPending}
              onClick={() => {
                if (withdrawTarget) {
                  withdraw.mutate(withdrawTarget.applicationId, {
                    onSuccess: () => {
                      setWithdrawTarget(null);
                      setSelectedApplicationId(null);
                      closeConfirm();
                    },
                  });
                }
              }}
            >
              Withdraw
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
```

Note: `useDisclosure` provides `open` — use `const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);` (the snippet above references `openConfirm`; make sure the destructure matches).

- [ ] **Step 4: Build + lint**

```sh
cd frontend && npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 5: Commit**

```sh
git add frontend/src/features/candidate-portal
git commit -m "feat(m11): applications page with job links, timeline, and withdraw"
```

---

### Task 12: E2E release gate

**Files:**
- Create: `backend/test/phase11.e2e-spec.ts`

- [ ] **Step 1: Write the release-gate spec**

Mirror the setup of `backend/test/phase9.e2e-spec.ts` (its `verifyInfrastructure`, `signinAs`-style helpers, `afterAll` cleanup of created tenants/users/refresh rows). Create `backend/test/phase11.e2e-spec.ts` with at least these scenarios:

1. **Platform 403s:** every `/platform/*` route (the new ones: tenant users list/create/update/suspend/reactivate/remove, candidates CRUD, applications list/stage, interviews list/reschedule) returns 403 for an OrgAdmin and for a Candidate token.
2. **Tenant user lifecycle:** SuperAdmin creates a user in the seeded Acme tenant → that user signs in (200) → role change to `Interviewer` → old refresh token rejected (401) → password reset → old password fails (401), new password signs in (200) → delete → sign-in fails (401).
3. **User suspension:** create a user → suspend → sign-in 403 + refresh 401 → double-suspend 409 → reactivate → sign-in 200 → double-reactivate 409.
4. **Candidate lifecycle:** create a candidate via `/platform/candidates` → signs in as Candidate → update name → delete → sign-in fails (401).
5. **Cross-tenant applications:** GET `/platform/applications` returns rows; PATCH `/platform/applications/:id/stage` with a valid stage of that tenant moves the stage (verify via GET detail + candidate index row status via a direct `candidate_applications_index` query).
6. **Interviews:** GET `/platform/interviews` lists; PATCH `/platform/interviews/:id` `{ status: 'cancelled' }` flips status; PATCH with `{ scheduledAt }` changes the datetime (verify via DB).
7. **Withdraw:** candidate applies to a job → withdraw → application row gone from `applications` and `candidate_applications_index`; withdrawing a foreign application → 404; non-candidate token → 403.
8. **Audit rows:** after the above, `audit_logs` contains `platform.user.create`, `platform.user.suspend`, `platform.application.stage_move`, etc.

Use the same helpers (`decodeClaims`, `assertEnvelope`, cleanup in `afterAll`) as phase9, adapted to the new routes. The phase9 spec creates its own tenant via `/auth/org/signup` for isolation; do the same here (create a fresh tenant, add a job + pipeline stages via the tenant API if needed, or reuse the seeded Acme tenant for read-only listings and create a fresh tenant for mutations).

- [ ] **Step 2: Run the full e2e suite**

```sh
cd backend && npm run test:e2e
```

Expected: all suites pass, including the new `phase11.e2e-spec.ts`.

- [ ] **Step 3: Commit**

```sh
git add backend/test/phase11.e2e-spec.ts
git commit -m "test(m11): e2e release gate for platform control and candidate UX"
```

---

### Task 13: Docs + AGENTS.md

**Files:**
- Modify: `docs/00_PROJECT_INSTRUCTIONS.md` (§5 endpoint tables + §9 frontend structure + status line)
- Modify: `docs/06_ROLE_INTERACTIONS.md` (SuperAdmin section — account CRUD + per-user suspend)
- Modify: `docs/07_API_ENDPOINT_DOCUMENTATION.md` (new routes)
- Modify: `docs/08_FRONTEND_COMPONENT_STRUCTURE.md` (new pages/routes)
- Modify: `docs/09_IMPLEMENTATION_GUIDE.md` (M11 phase section)
- Modify: `AGENTS.md` (build-order table: add M11 row; update current state; add the new migration to the applied list)

- [ ] **Step 1: Update the endpoint docs**

In `docs/07_API_ENDPOINT_DOCUMENTATION.md` add the M11 rows (SuperAdmin column, matching the spec):

```
GET    /platform/tenants/:id/users                     SA  list tenant users
POST   /platform/tenants/:id/users                     SA  create tenant user (email/role/password)
PATCH  /platform/tenants/:id/users/:userId             SA  change role / reset password
PATCH  /platform/tenants/:id/users/:userId/suspend     SA  suspend user
PATCH  /platform/tenants/:id/users/:userId/reactivate  SA  reactivate user
DELETE /platform/tenants/:id/users/:userId             SA  remove user
GET    /platform/tenants/:id/pipeline-stages           SA  list tenant stages (stage picker)
GET    /platform/candidates                            SA  list candidates
POST   /platform/candidates                            SA  create candidate
PATCH  /platform/candidates/:id                        SA  update candidate
DELETE /platform/candidates/:id                        SA  delete candidate (cascades)
GET    /platform/applications?tenantId=&status=        SA  list applications across tenants
PATCH  /platform/applications/:id/stage                SA  move stage + sync candidate index
GET    /platform/interviews?tenantId=&status=          SA  list interviews across tenants
PATCH  /platform/interviews/:id                        SA  reschedule / cancel
DELETE /candidate/applications/:id                     C   withdraw application
```

Mirror the same rows in `docs/00_PROJECT_INSTRUCTIONS.md` §5, update the status line at the top (M11 implemented), and note `users.status` in the data-model section.

- [ ] **Step 2: Update role + frontend docs**

- `docs/06_ROLE_INTERACTIONS.md`: in the SuperAdmin section, add "account CRUD across tenants (users by role + candidates), per-user suspend/reactivate, cross-tenant application stage moves, interview reschedule/cancel".
- `docs/08_FRONTEND_COMPONENT_STRUCTURE.md`: add `admin/` CandidatesPage + TenantDetailPage tabs, `candidate-portal/jobs/JobDetailsView`, `_candidate/jobs/$jobId` route, applications withdraw.

- [ ] **Step 3: Update `AGENTS.md`**

- Current State: add the M11 bullet.
- Build-order table: add `| M11 | Platform Control + Candidate Experience | SA CRUD + user suspend + candidate UX |`.
- Applied migration list: append `20260808090000_platform_user_suspend`.
- Seed credentials: mention `hiring.manager@acme.com` / `recruiter@acme.com`.

- [ ] **Step 4: Commit**

```sh
git add AGENTS.md docs/00_PROJECT_INSTRUCTIONS.md docs/06_ROLE_INTERACTIONS.md docs/07_API_ENDPOINT_DOCUMENTATION.md docs/08_FRONTEND_COMPONENT_STRUCTURE.md docs/09_IMPLEMENTATION_GUIDE.md
git commit -m "docs(m11): platform control + candidate experience"
```

---

## Verification checklist (run before declaring done)

```sh
cd backend && npm run typecheck && npm run lint && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build
```

- [ ] All five seeded roles can sign in.
- [ ] SuperAdmin can CRUD tenant users + candidates, suspend/reactivate users, move application stages, reschedule/cancel interviews; non-SuperAdmin gets 403 everywhere.
- [ ] A suspended user cannot sign in or rotate a refresh token; reactivation restores sign-in.
- [ ] Candidate job cards link to a detail page; job detail renders description + skills + apply.
- [ ] Applications page links to the job, shows a progress timeline, and withdraw removes the application + index row.
- [ ] CI passes (`npm run test:e2e` green on a fresh DB per `.github/workflows/ci.yml`).
