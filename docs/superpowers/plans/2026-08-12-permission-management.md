# Permission Management (M18) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permission-preset system where SuperAdmin and CompanyAdmin manage named permission presets (CRUD on a `/permissions` page), assign them to accounts in `/users`, and the backend enforces them on every company-scoped endpoint.

**Architecture:** Presets are rows in a `permission_presets` table (public schema for defaults + SuperAdmin globals, company schema for CompanyAdmin customs). Each user gets an optional `users.preset_id`; a null preset means "the role's default". A global `PermissionsGuard` stacks after `RolesGuard` and resolves effective permissions per request from the DB (one query, plus a public-schema fallback for global presets). The JWT access token carries an effective-permissions claim so the frontend can hide UI.

**Tech Stack:** NestJS 11, Drizzle ORM (pg-core), PostgreSQL 16, Zod 4, React 19 + Mantine 9 + TanStack Query, Jest (unit + e2e).

## Global Constraints

- Backend unit tests: `cd backend && npm test` (Jest, `testRegex: .*\.spec\.ts$`). E2E: `npm run test:e2e`.
- Backend checks: `cd backend && npm run typecheck && npm run lint` (eslint). Frontend: `cd frontend && npm run build` (tsc -b && vite build) + `npm run lint` (oxlint).
- Error shape: `{ error: { code, message } }`; codes `BAD_REQUEST`/`VALIDATION_ERROR`/`FORBIDDEN`/`NOT_FOUND`/`CONFLICT` via Nest `BadRequestException`/`ForbiddenException`/`NotFoundException`/`ConflictException`.
- Cross-company resource reference → 404, never 403.
- Commit tag: `feat(m18): topic`. One commit per task.
- No new dependencies. No comments in code unless `ponytail:`-marked.
- Migrations: canonical DDL lives in the `public` schema; `backend/drizzle/template-schema.sql` syncs the `template` schema; migration DO-blocks patch `template` + `company_%` schemas (see `20260811100000_job_post_metadata`).
- Guards run BEFORE interceptors: `PermissionsGuard` must use `request.user` (JWT), never `getCurrentUser()`/`getSchema()` (AsyncLocalStorage is set only inside `CompanyContextInterceptor`, which runs after guards).
- Spec: `docs/superpowers/specs/2026-08-12-permission-management-design.md` (v2).

---

### Task 1: Permission catalog constants

**Files:**
- Create: `backend/src/common/permissions/permissions.ts`
- Test: `backend/src/common/permissions/permissions.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const INTERNAL_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager', 'Interviewer'] as const;`
  - `export type InternalRole = (typeof INTERNAL_ROLES)[number];`
  - `export type Permission = 'jobs.view' | 'jobs.create_edit' | ...` (all 17 keys)
  - `export const ALL_PERMISSIONS: Permission[]`
  - `export const ROLE_PERMISSIONS: Record<InternalRole, Permission[]>`
  - `export function isInternalRole(role: string): role is InternalRole`
  - `export function isPermission(value: string): value is Permission`
  - `export function defaultPresetFor(role: InternalRole): Permission[]` (returns a copy of `ROLE_PERMISSIONS[role]`)
  - `export function permissionsSubsetOfRole(role: InternalRole, permissions: string[]): permissions is Permission[]`

- [ ] **Step 1: Write the failing test**

`backend/src/common/permissions/permissions.spec.ts`:

```ts
import {
  ALL_PERMISSIONS,
  INTERNAL_ROLES,
  ROLE_PERMISSIONS,
  defaultPresetFor,
  isInternalRole,
  isPermission,
} from './permissions';

describe('permissions catalog', () => {
  it('exposes 17 permissions and 4 roles', () => {
    expect(ALL_PERMISSIONS).toHaveLength(17);
    expect(INTERNAL_ROLES).toEqual([
      'CompanyAdmin',
      'Recruiter',
      'HiringManager',
      'Interviewer',
    ]);
  });

  it('every role preset is a subset of ALL_PERMISSIONS and non-empty', () => {
    for (const role of INTERNAL_ROLES) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(ALL_PERMISSIONS).toContain(perm);
      }
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it('role presets shrink with seniority (CA >= Recruiter >= HM >= Interviewer)', () => {
    const count = (r: (typeof INTERNAL_ROLES)[number]) =>
      ROLE_PERMISSIONS[r].length;
    expect(count('CompanyAdmin')).toBeGreaterThan(count('Recruiter'));
    expect(count('Recruiter')).toBeGreaterThan(count('HiringManager'));
    expect(count('HiringManager')).toBeGreaterThan(count('Interviewer'));
  });

  it('CA default contains the management permissions', () => {
    for (const p of ['users.manage', 'settings.manage', 'permissions.manage', 'stages.manage']) {
      expect(ROLE_PERMISSIONS.CompanyAdmin).toContain(p);
    }
  });

  it('defaultPresetFor returns a fresh copy', () => {
    const a = defaultPresetFor('Recruiter');
    a.push('jobs.delete' as never);
    expect(defaultPresetFor('Recruiter')).not.toContain('jobs.delete');
  });

  it('type guards work', () => {
    expect(isInternalRole('Recruiter')).toBe(true);
    expect(isInternalRole('Candidate')).toBe(false);
    expect(isPermission('jobs.view')).toBe(true);
    expect(isPermission('everything')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/common/permissions/permissions.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the catalog**

`backend/src/common/permissions/permissions.ts`:

```ts
export const INTERNAL_ROLES = [
  'CompanyAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];

export type Permission =
  | 'jobs.view'
  | 'jobs.create_edit'
  | 'jobs.publish_close'
  | 'jobs.delete'
  | 'candidates.view'
  | 'candidates.manage'
  | 'applications.view'
  | 'applications.move'
  | 'applications.note'
  | 'interviews.view'
  | 'interviews.schedule'
  | 'interviews.feedback'
  | 'stages.manage'
  | 'settings.manage'
  | 'users.manage'
  | 'permissions.manage'
  | 'dashboard.view';

export const ALL_PERMISSIONS: Permission[] = [
  'jobs.view',
  'jobs.create_edit',
  'jobs.publish_close',
  'jobs.delete',
  'candidates.view',
  'candidates.manage',
  'applications.view',
  'applications.move',
  'applications.note',
  'interviews.view',
  'interviews.schedule',
  'interviews.feedback',
  'stages.manage',
  'settings.manage',
  'users.manage',
  'permissions.manage',
  'dashboard.view',
];

export const ROLE_PERMISSIONS: Record<InternalRole, Permission[]> = {
  CompanyAdmin: [...ALL_PERMISSIONS],
  Recruiter: [
    'jobs.view',
    'jobs.create_edit',
    'jobs.publish_close',
    'candidates.view',
    'candidates.manage',
    'applications.view',
    'applications.move',
    'applications.note',
    'interviews.view',
    'interviews.schedule',
    'dashboard.view',
  ],
  HiringManager: [
    'jobs.view',
    'candidates.view',
    'applications.view',
    'applications.move',
    'applications.note',
    'interviews.view',
    'interviews.schedule',
    'dashboard.view',
  ],
  Interviewer: ['interviews.view', 'interviews.feedback', 'dashboard.view'],
};

export function isInternalRole(role: string): role is InternalRole {
  return (INTERNAL_ROLES as readonly string[]).includes(role);
}

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export function defaultPresetFor(role: InternalRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function permissionsSubsetOfRole(
  role: InternalRole,
  permissions: string[],
): permissions is Permission[] {
  return permissions.every((p) =>
    ROLE_PERMISSIONS[role].includes(p as Permission),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/common/permissions/permissions.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run full backend checks**

Run: `cd backend && npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/common/permissions
git commit -m "feat(m18): permission catalog constants"
```

---

### Task 2: Schema + migration + template + seed defaults

**Files:**
- Modify: `backend/src/database/schema.ts` (add `permissionPresets` table; add `presetId` to `users`)
- Create: `backend/drizzle/20260812000000_permission_management/migration.sql`
- Modify: `backend/drizzle/template-schema.sql`
- Modify: `backend/scripts/seed.ts` (seed 4 default presets)

**Interfaces:**
- Consumes: Task 1 `INTERNAL_ROLES`, `ROLE_PERMISSIONS`.
- Produces: `export const permissionPresets` Drizzle table (one definition used for BOTH the public schema and company schemas via search_path), `users.presetId: uuid('preset_id')` column. No DB FK on `preset_id` (`ponytail:` app-level integrity; the referenced preset may live in the public schema — a single FK can't span schemas).

- [ ] **Step 1: Write the migration + schema**

Add to `backend/src/database/schema.ts` — the table (place in the "Company Schema Tables" section, after `users`), and add `boolean` to the `drizzle-orm/pg-core` import:

```ts
export const permissionPresets = pgTable('permission_presets', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  permissions: jsonb('permissions').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Add to the `users` table definition (after `role`):

```ts
  presetId: uuid('preset_id'),
```

Create `backend/drizzle/20260812000000_permission_management/migration.sql`:

```sql
-- Permission management migration
-- Creates permission_presets (public: defaults + SuperAdmin globals; company
-- schemas: CompanyAdmin customs) and adds users.preset_id.

CREATE TABLE IF NOT EXISTS public.permission_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL,
  permissions JSONB NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preset_id UUID;

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = 'template' OR nspname LIKE 'company_%'
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.permission_presets (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         name VARCHAR(100) NOT NULL,
         role VARCHAR(50) NOT NULL,
         permissions JSONB NOT NULL,
         is_default BOOLEAN NOT NULL DEFAULT false,
         created_by UUID,
         created_at TIMESTAMP NOT NULL DEFAULT now())',
      schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS preset_id UUID',
      schema_name
    );
  END LOOP;
END $$;
```

- [ ] **Step 2: Update template-schema.sql**

Append to `backend/drizzle/template-schema.sql` (after the final `ALTER TABLE template."notes" ...`):

```sql
CREATE TABLE template."permission_presets" (LIKE public."permission_presets" INCLUDING ALL);
```

- [ ] **Step 3: Add defaults to the seed script**

In `backend/scripts/seed.ts`, add above `main()`:

```ts
const DEFAULT_PRESETS: { name: string; role: string; permissions: string[] }[] = [
  {
    name: 'Company Admin Default',
    role: 'CompanyAdmin',
    permissions: [
      'jobs.view', 'jobs.create_edit', 'jobs.publish_close', 'jobs.delete',
      'candidates.view', 'candidates.manage',
      'applications.view', 'applications.move', 'applications.note',
      'interviews.view', 'interviews.schedule',
      'stages.manage', 'settings.manage', 'users.manage', 'permissions.manage',
      'dashboard.view',
    ],
  },
  {
    name: 'Recruiter Default',
    role: 'Recruiter',
    permissions: [
      'jobs.view', 'jobs.create_edit', 'jobs.publish_close',
      'candidates.view', 'candidates.manage',
      'applications.view', 'applications.move', 'applications.note',
      'interviews.view', 'interviews.schedule',
      'dashboard.view',
    ],
  },
  {
    name: 'Hiring Manager Default',
    role: 'HiringManager',
    permissions: [
      'jobs.view', 'candidates.view',
      'applications.view', 'applications.move', 'applications.note',
      'interviews.view', 'interviews.schedule',
      'dashboard.view',
    ],
  },
  {
    name: 'Interviewer Default',
    role: 'Interviewer',
    permissions: ['interviews.view', 'interviews.feedback', 'dashboard.view'],
  },
];

async function seedPermissionPresets(client: any): Promise<void> {
  for (const preset of DEFAULT_PRESETS) {
    await client.query(
      `INSERT INTO public.permission_presets (id, name, role, permissions, is_default)
       SELECT $1::uuid, $2::varchar, $3::varchar, $4::jsonb, true
       WHERE NOT EXISTS (
         SELECT 1 FROM public.permission_presets WHERE role = $3::varchar AND is_default = true
       )`,
      [randomUUID(), preset.name, preset.role, JSON.stringify(preset.permissions)],
    );
  }
  const count = await client.query(
    'SELECT count(*)::int AS n FROM public.permission_presets',
  );
  console.log(`[OK] Permission presets seeded: ${count.rows[0].n} total`);
}
```

In `main()`, add `await seedPermissionPresets(client);` after `await seedSkills(client);`.

- [ ] **Step 4: Apply and verify the migration locally**

Run:
```bash
docker compose up -d
psql "$env:DATABASE_URL" -f backend/drizzle/20260812000000_permission_management/migration.sql
psql "$env:DATABASE_URL" -f backend/drizzle/template-schema.sql
```
(Adjust the psql invocation to match `docs/00b_LOCAL_DEV_BOOTSTRAP.md`.)

Expected: no errors; then:
```bash
psql "$env:DATABASE_URL" -c "\d public.permission_presets"
psql "$env:DATABASE_URL" -c "\d template.permission_presets"
psql "$env:DATABASE_URL" -c "\d public.users"
```
Expected: `permission_presets` exists in public + template; `users.preset_id` exists.

Run: `cd backend && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/schema.ts backend/drizzle/20260812000000_permission_management backend/drizzle/template-schema.sql backend/scripts/seed.ts
git commit -m "feat(m18): permission_presets table + users.preset_id migration + seed"
```

---

### Task 3: PermissionRepository

**Files:**
- Create: `backend/src/repositories/permission.repository.ts`
- Create: `backend/src/repositories/permission.repository.spec.ts` (pure resolution logic only)
- Modify: `backend/src/repositories/repositories.module.ts` (add to REPOSITORIES)

**Interfaces:**
- Consumes: Task 1 (`ROLE_PERMISSIONS`), Task 2 (`permissionPresets`, `users` tables).
- Produces (all methods take an explicit `schema` string — `'public'`, `'current'`, or `company_<id>`):
  - `async findDefaults(): Promise<PermissionPresetRow[]>` — public rows with `isDefault = true`
  - `async findAll(schema: string): Promise<PermissionPresetRow[]>` — non-default rows in a schema
  - `async findById(id: string, schema: string): Promise<PermissionPresetRow | null>`
  - `async create(data: { name; role; permissions; isDefault?; createdBy? }, schema: string)`
  - `async update(id: string, data: { name?; permissions? }, schema: string)`
  - `async remove(id: string, schema: string)`
  - `async countUsersWithPreset(presetId: string, schema: string): Promise<number>`
  - `async findEffectivePermissions(userId: string, schema: string): Promise<string[]>` — join users→preset in `schema`; if no preset row matches, fall back to the public schema by id; if still nothing, return the role default.
  - `export function resolveEffectivePermissions(params: { presetPermissions: string[] | null; presetGlobalPermissions: string[] | null; role: string }): string[]` — pure function (dedupes).

- [ ] **Step 1: Write the failing unit test (pure resolver)**

`backend/src/repositories/permission.repository.spec.ts`:

```ts
import { resolveEffectivePermissions } from './permission.repository';

describe('resolveEffectivePermissions', () => {
  it('prefers the local (company) preset', () => {
    const result = resolveEffectivePermissions({
      presetPermissions: ['jobs.view'],
      presetGlobalPermissions: ['interviews.view'],
      role: 'Recruiter',
    });
    expect(result).toEqual(['jobs.view']);
  });

  it('falls back to the global (public) preset', () => {
    const result = resolveEffectivePermissions({
      presetPermissions: null,
      presetGlobalPermissions: ['interviews.view', 'interviews.feedback'],
      role: 'Recruiter',
    });
    expect(result).toEqual(['interviews.view', 'interviews.feedback']);
  });

  it('falls back to the role default when no preset exists', () => {
    const result = resolveEffectivePermissions({
      presetPermissions: null,
      presetGlobalPermissions: null,
      role: 'Interviewer',
    });
    expect(result).toEqual([
      'interviews.view',
      'interviews.feedback',
      'dashboard.view',
    ]);
  });

  it('returns [] for unknown roles', () => {
    const result = resolveEffectivePermissions({
      presetPermissions: null,
      presetGlobalPermissions: null,
      role: 'Candidate',
    });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/repositories/permission.repository.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the repository**

`backend/src/repositories/permission.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { permissionPresets, users } from '../database/schema';
import { BaseRepository } from './base.repository';
import { ROLE_PERMISSIONS } from '../common/permissions/permissions';

export interface PermissionPresetRow {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  isDefault: boolean;
  createdBy: string | null;
  createdAt: Date;
}

export interface ResolveParams {
  presetPermissions: string[] | null;
  presetGlobalPermissions: string[] | null;
  role: string;
}

export function resolveEffectivePermissions(params: ResolveParams): string[] {
  const source =
    params.presetPermissions ??
    params.presetGlobalPermissions ??
    ROLE_PERMISSIONS[params.role as keyof typeof ROLE_PERMISSIONS] ??
    [];
  return [...new Set(source)];
}

@Injectable()
export class PermissionRepository extends BaseRepository {
  async findDefaults(): Promise<PermissionPresetRow[]> {
    return this.withDb('public', (db) =>
      db
        .select()
        .from(permissionPresets)
        .where(eq(permissionPresets.isDefault, true))
        .orderBy(permissionPresets.role)
        .execute(),
    );
  }

  async findAll(schema: string): Promise<PermissionPresetRow[]> {
    return this.withDb(schema, (db) =>
      db
        .select()
        .from(permissionPresets)
        .where(eq(permissionPresets.isDefault, false))
        .orderBy(permissionPresets.name)
        .execute(),
    );
  }

  async findById(
    id: string,
    schema: string,
  ): Promise<PermissionPresetRow | null> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(permissionPresets)
        .where(eq(permissionPresets.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(
    data: {
      name: string;
      role: string;
      permissions: string[];
      isDefault?: boolean;
      createdBy?: string;
    },
    schema: string,
  ): Promise<PermissionPresetRow> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(permissionPresets)
        .values({
          name: data.name,
          role: data.role,
          permissions: data.permissions,
          isDefault: data.isDefault ?? false,
          createdBy: data.createdBy ?? null,
        })
        .returning()
        .execute();
      return rows[0];
    });
  }

  async update(
    id: string,
    data: { name?: string; permissions?: string[] },
    schema: string,
  ): Promise<PermissionPresetRow | null> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(permissionPresets)
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.permissions !== undefined
            ? { permissions: data.permissions }
            : {}),
        })
        .where(eq(permissionPresets.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async remove(id: string, schema: string): Promise<void> {
    return this.withDb(schema, (db) =>
      db
        .delete(permissionPresets)
        .where(eq(permissionPresets.id, id))
        .execute(),
    );
  }

  async countUsersWithPreset(presetId: string, schema: string): Promise<number> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.presetId, presetId))
        .execute();
      return rows[0]?.n ?? 0;
    });
  }

  async findEffectivePermissions(
    userId: string,
    schema: string,
  ): Promise<string[]> {
    const row = await this.withDb(schema, async (db) => {
      const rows = await db
        .select({
          presetId: users.presetId,
          role: users.role,
          presetPermissions: permissionPresets.permissions,
        })
        .from(users)
        .leftJoin(permissionPresets, eq(permissionPresets.id, users.presetId))
        .where(eq(users.id, userId))
        .execute();
      return rows[0] ?? null;
    });
    if (!row) return [];

    let globalPermissions: string[] | null = null;
    if (row.presetId && !row.presetPermissions) {
      const global = await this.findById(row.presetId, 'public');
      globalPermissions = global?.permissions ?? null;
    }

    return resolveEffectivePermissions({
      presetPermissions: row.presetPermissions ?? null,
      presetGlobalPermissions: globalPermissions,
      role: row.role,
    });
  }
}
```

Note: `row.presetPermissions` from a leftJoin is typed `string[] | null`; if TS narrows it to `string[] | undefined`, append `?? null` at the return site (already handled).

- [ ] **Step 4: Register the repository**

In `backend/src/repositories/repositories.module.ts`, import `PermissionRepository` and add it to the `REPOSITORIES` array.

- [ ] **Step 5: Run tests + checks**

Run: `cd backend && npx jest src/repositories/permission.repository.spec.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS, typecheck PASS, lint PASS, full unit suite PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/permission.repository.ts backend/src/repositories/permission.repository.spec.ts backend/src/repositories/repositories.module.ts
git commit -m "feat(m18): permission repository with effective-resolution"
```

---

### Task 4: PermissionsGuard + @Permissions decorator

**Files:**
- Create: `backend/src/common/decorators/permissions.decorator.ts`
- Create: `backend/src/common/guards/permissions.guard.ts`
- Create: `backend/src/common/guards/permissions.guard.spec.ts`
- Modify: `backend/src/app.module.ts` (register as global APP_GUARD after RolesGuard)

**Interfaces:**
- Consumes: Task 3 `PermissionRepository.findEffectivePermissions`.
- Produces:
  - `export const PERMISSIONS_KEY = 'permissions';`
  - `export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);`
  - `export class PermissionsGuard implements CanActivate` — global; reads `request.user` (guards run before interceptors, so NO AsyncLocalStorage); bypasses when no metadata / no user / SuperAdmin / Candidate / no companyId; otherwise resolves via `permissionRepo.findEffectivePermissions(userId, `company_${companyId}`)` and throws `ForbiddenException` when any required key is missing.

- [ ] **Step 1: Write the failing unit test**

`backend/src/common/guards/permissions.guard.spec.ts` (modeled on `roles.guard.spec.ts`):

```ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionRepository } from '../../repositories/permission.repository';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let repo: { findEffectivePermissions: jest.Mock };
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    repo = { findEffectivePermissions: jest.fn() };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      repo as unknown as PermissionRepository,
    );
  });

  it('allows when no @Permissions metadata is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('allows SuperAdmin without a DB lookup', async () => {
    reflector.getAllAndOverride.mockReturnValue(['jobs.create_edit']);
    const ctx = makeContext({
      user: { userId: 'sa', companyId: null, role: 'SuperAdmin' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(repo.findEffectivePermissions).not.toHaveBeenCalled();
  });

  it('allows a company user holding the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['jobs.create_edit']);
    repo.findEffectivePermissions.mockResolvedValue([
      'jobs.view',
      'jobs.create_edit',
    ]);
    const ctx = makeContext({
      user: { userId: 'u1', companyId: 'c1', role: 'Recruiter' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(repo.findEffectivePermissions).toHaveBeenCalledWith('u1', 'company_c1');
  });

  it('denies a company user missing the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['jobs.create_edit']);
    repo.findEffectivePermissions.mockResolvedValue(['jobs.view']);
    const ctx = makeContext({
      user: { userId: 'u1', companyId: 'c1', role: 'Recruiter' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('requires ALL listed permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'applications.view',
      'applications.move',
    ]);
    repo.findEffectivePermissions.mockResolvedValue(['applications.view']);
    const ctx = makeContext({
      user: { userId: 'u1', companyId: 'c1', role: 'HiringManager' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/common/guards/permissions.guard.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the decorator + guard**

`backend/src/common/decorators/permissions.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
```

`backend/src/common/guards/permissions.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionRepository } from '../../repositories/permission.repository';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionRepo: PermissionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{
        user?: { userId: string; companyId: string | null; role: string };
      }>();
    const user = request.user;
    if (!user) return true;
    if (user.role === 'SuperAdmin' || user.role === 'Candidate') return true;
    if (!user.companyId) return true;

    const effective = await this.permissionRepo.findEffectivePermissions(
      user.userId,
      `company_${user.companyId}`,
    );
    if (required.every((p) => effective.includes(p))) return true;

    throw new ForbiddenException(
      'You do not have permission to perform this action',
    );
  }
}
```

- [ ] **Step 4: Register the guard globally**

In `backend/src/app.module.ts`, import `PermissionsGuard` and add after the RolesGuard entry:

```ts
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
```

- [ ] **Step 5: Run tests + checks**

Run: `cd backend && npx jest src/common/guards/permissions.guard.spec.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS (no endpoint is tagged yet, so existing tests are unaffected).

- [ ] **Step 6: Commit**

```bash
git add backend/src/common/decorators/permissions.decorator.ts backend/src/common/guards/permissions.guard.ts backend/src/common/guards/permissions.guard.spec.ts backend/src/app.module.ts
git commit -m "feat(m18): global PermissionsGuard + @Permissions decorator"
```

---

### Task 5: Tag company controllers with @Permissions

**Files:**
- Modify: `backend/src/modules/job-postings/job-postings.controller.ts`
- Modify: `backend/src/modules/candidates/candidates.controller.ts`
- Modify: `backend/src/modules/applications/applications.controller.ts`
- Modify: `backend/src/modules/interviews/interviews.controller.ts`
- Modify: `backend/src/modules/pipeline-stages/pipeline-stages.controller.ts`
- Modify: `backend/src/modules/company/company.controller.ts`
- Modify: `backend/src/modules/company/company-users.controller.ts` (mutations only)
- Modify: `backend/src/modules/dashboard/dashboard.controller.ts`
- Modify: `backend/src/modules/resumes/resumes.controller.ts`

**Interfaces:**
- Consumes: Task 4 `Permissions` decorator.
- Produces: every company-scoped endpoint carries `@Permissions(...)`. SuperAdmin, Candidate, and public routes are NOT tagged.

- [ ] **Step 1: Add the import + tag each endpoint**

For each file, add:

```ts
import { Permissions } from '../../common/decorators/permissions.decorator';
```

Then apply `@Permissions(...)` directly **below** the existing `@Roles(...)` on each handler, per this mapping:

| Controller | Route | @Permissions |
|---|---|---|
| job-postings | `GET /`, `GET /export`, `GET /:id` | `jobs.view` |
| job-postings | `POST /`, `PATCH /:id` | `jobs.create_edit` |
| job-postings | `POST /:id/publish`, `POST /:id/close` | `jobs.publish_close` |
| job-postings | `DELETE /:id` | `jobs.delete` |
| candidates | `GET /`, `GET /export`, `GET /:id` | `candidates.view` |
| candidates | `POST /` | `candidates.manage` |
| applications | `GET /`, `GET /:id`, `GET /:id/notes` | `applications.view` |
| applications | `PATCH /:id/stage` | `applications.move` |
| applications | `POST /:id/notes` | `applications.note` |
| interviews | `GET /`, `GET /export`, `GET /:id` | `interviews.view` |
| interviews | `POST /`, `PATCH /:id` | `interviews.schedule` |
| interviews | `POST /:id/feedback` | `interviews.feedback` |
| pipeline-stages | `POST /`, `PATCH /:id`, `DELETE /:id` | `stages.manage` |
| company | `PATCH /settings` (the CompanyAdmin-marked route) | `settings.manage` |
| company-users | `POST /`, `PATCH /:userId/role`, `PATCH /:userId/password`, `PATCH /:userId/suspend`, `PATCH /:userId/reactivate`, `DELETE /:userId` | `users.manage` |
| dashboard | `GET /summary` | `dashboard.view` |
| resumes | both `@Roles(...VIEW_ROLES)` routes | `candidates.view` |

Example (job-postings `POST /`):

```ts
  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  @Permissions('jobs.create_edit')
  create( ... )
```

Do NOT tag: `GET /company/users` + `GET /company/users/export` (PICKER_ROLES — recruiters/HMs need the picker for interviews), `GET /company/pipeline-stages` (INTERNAL_ROLES), `GET /company/settings`, any `/platform/*`, `/candidate/*`, `/public/*` route.

- [ ] **Step 2: Verify no existing tests break**

Run: `cd backend && npm run typecheck && npm run lint && npm test`
Expected: PASS. If a controller spec asserts exact decorator metadata, extend it with the new `@Permissions` expectation.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules
git commit -m "feat(m18): tag company endpoints with @Permissions"
```

---

### Task 6: JWT permissions claim

**Files:**
- Modify: `backend/src/modules/auth/services/token.service.ts`
- Modify: `backend/src/common/auth/jwt.strategy.ts`
- Create: `backend/src/modules/auth/services/token.service.spec.ts` (if absent) or append to it

**Interfaces:**
- Consumes: Task 3 `PermissionRepository.findEffectivePermissions`.
- Produces: access + refresh tokens carry `permissions: string[]`; `request.user` exposes `permissions` via the JWT strategy. SuperAdmin and Candidate get `[]` with no DB lookup. Guard enforcement stays DB-backed (Task 4); this claim is for the frontend.

- [ ] **Step 1: Write the failing test**

`backend/src/modules/auth/services/token.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from '../../../repositories/refresh-token.repository';
import { CompanyRepository } from '../../../repositories/company.repository';
import { UserRepository } from '../../../repositories/user.repository';
import { PermissionRepository } from '../../../repositories/permission.repository';

describe('TokenService permissions claim', () => {
  let service: TokenService;
  const permissionRepo = { findEffectivePermissions: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const jwt = new JwtService({});
    const config = new ConfigService({ JWT_SECRET: 's', JWT_REFRESH_SECRET: 'r' });
    const module = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        {
          provide: RefreshTokenRepository,
          useValue: { deleteByUser: jest.fn(), create: jest.fn() },
        },
        { provide: CompanyRepository, useValue: {} },
        { provide: UserRepository, useValue: {} },
        { provide: PermissionRepository, useValue: permissionRepo },
      ],
    }).compile();
    service = module.get(TokenService);
    jest.spyOn(jwt, 'sign').mockReturnValue('signed-token');
  });

  it('resolves effective permissions for a company user into the payload', async () => {
    permissionRepo.findEffectivePermissions.mockResolvedValue(['jobs.view']);
    await service.issueTokens({ id: 'u1', companyId: 'c1', role: 'Recruiter' });
    expect(permissionRepo.findEffectivePermissions).toHaveBeenCalledWith(
      'u1',
      'company_c1',
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'u1',
        role: 'Recruiter',
        permissions: ['jobs.view'],
      }),
      expect.anything(),
    );
  });

  it('uses an empty permissions array for SuperAdmin (no lookup)', async () => {
    await service.issueTokens({ id: 'sa', companyId: undefined, role: 'SuperAdmin' });
    expect(permissionRepo.findEffectivePermissions).not.toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'SuperAdmin', permissions: [] }),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/auth/services/token.service.spec.ts`
Expected: FAIL — permissions missing from payload.

- [ ] **Step 3: Implement the claim**

In `backend/src/modules/auth/services/token.service.ts`:

1. Import `PermissionRepository`; add to the constructor.
2. Add `permissions?: string[]` to `TokenSubject`.
3. In `issueTokens`, before building the payload:

```ts
    const permissions =
      subject.permissions ??
      (subject.role === 'SuperAdmin' ||
      subject.role === 'Candidate' ||
      !subject.companyId
        ? []
        : await this.permissionRepo.findEffectivePermissions(
            subject.id,
            `company_${subject.companyId}`,
          ));
```

4. Extend `TokenPayload` and the payload object:

```ts
interface TokenPayload {
  sub: string;
  role: string;
  companyId?: string;
  permissions: string[];
}
// ...
const payload: TokenPayload = {
  sub: subject.id,
  role: subject.role,
  companyId: subject.companyId ?? undefined,
  permissions,
};
```

5. In `rotate`, pass the claim through:

```ts
    return this.issueTokens({
      id: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      permissions: payload.permissions ?? [],
    });
```

6. Add `permissions` to the `verifyRefreshToken` return type.

- [ ] **Step 4: Expose permissions on request.user**

In `backend/src/common/auth/jwt.strategy.ts`:

```ts
  validate(payload: {
    sub: string;
    companyId: string | null;
    role: string;
    permissions?: string[];
  }) {
    return {
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      permissions: payload.permissions ?? [],
    };
  }
```

- [ ] **Step 5: Run tests + checks**

Run: `cd backend && npx jest src/modules/auth/services/token.service.spec.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/auth/services/token.service.ts backend/src/modules/auth/services/token.service.spec.ts backend/src/common/auth/jwt.strategy.ts
git commit -m "feat(m18): permissions claim in JWT"
```

---

### Task 7: Company preset endpoints + assignment

**Files:**
- Create: `backend/src/modules/company/dto/create-permission-preset.dto.ts`
- Create: `backend/src/modules/company/dto/update-permission-preset.dto.ts`
- Create: `backend/src/modules/company/dto/assign-preset.dto.ts`
- Create: `backend/src/modules/company/company-permissions.service.ts`
- Create: `backend/src/modules/company/company-permissions.service.spec.ts`
- Create: `backend/src/modules/company/company-permissions.controller.ts`
- Modify: `backend/src/modules/company/company.module.ts`
- Modify: `backend/src/modules/company/company-users.service.ts` (create accepts presetId)
- Modify: `backend/src/modules/company/company-users.controller.ts` (`PATCH /company/users/:userId/preset`)
- Modify: `backend/src/modules/company/dto/invite-user.dto.ts` (optional presetId)
- Modify: `backend/src/repositories/user.repository.ts` (presetId in findAll/create; updateRole resets preset; new `updatePreset`)

**Interfaces:**
- Consumes: Task 1 (`permissionsSubsetOfRole`), Task 3 repo, Task 4 `@Permissions`.
- Produces:
  - `GET /company/permissions` → `{ presets: PresetListItem[] }`, `PresetListItem = { id, name, role, permissions, isDefault, usageCount }` (defaults from public + customs from own schema)
  - `POST /company/permissions` `{ name, role, permissions }` → 400 unless subset of role default; audit `permissions.preset.create`
  - `PATCH /company/permissions/:id` `{ name?, permissions? }` → 400 on subset violation, 404 if missing
  - `DELETE /company/permissions/:id` → 409 if in use; audit `permissions.preset.delete`
  - `PATCH /company/users/:userId/preset` `{ presetId: string | null }` → CA only; target must be non-CA (403); preset must exist (own schema or public) with role match (400); null = role default; audit `permissions.preset.assign`
  - `POST /company/users` accepts optional `presetId`
  - Role change resets `preset_id` to null (in `UserRepository.updateRole`)
  - `GET /company/users` rows include `presetId`

- [ ] **Step 1: Write the failing unit test**

`backend/src/modules/company/company-permissions.service.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { CompanyPermissionsService } from './company-permissions.service';
import { PermissionRepository } from '../../repositories/permission.repository';
import { UserRepository } from '../../repositories/user.repository';
import { AuditService } from '../../common/audit/audit.service';

jest.mock('../../common/context/company-context', () => ({
  getCurrentUser: jest.fn(() => ({
    userId: 'actor',
    companyId: 'c1',
    role: 'CompanyAdmin',
  })),
  getSchema: jest.fn(() => 'company_c1'),
}));

describe('CompanyPermissionsService', () => {
  let service: CompanyPermissionsService;
  const permissionRepo = {
    findDefaults: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    countUsersWithPreset: jest.fn(),
  };
  const userRepo = { findById: jest.fn(), updatePreset: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CompanyPermissionsService(
      permissionRepo as unknown as PermissionRepository,
      userRepo as unknown as UserRepository,
      audit as unknown as AuditService,
    );
  });

  it('rejects a preset with permissions outside the role default', async () => {
    await expect(
      service.create({
        name: 'X',
        role: 'Interviewer',
        permissions: ['jobs.create_edit'],
      }),
    ).rejects.toThrow();
  });

  it('rejects assignment to a CompanyAdmin target', async () => {
    userRepo.findById.mockResolvedValue({ id: 't1', role: 'CompanyAdmin' });
    await expect(
      service.assign('t1', { presetId: null }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('assigning null resets to the role default', async () => {
    userRepo.findById.mockResolvedValue({
      id: 't1',
      role: 'Recruiter',
      email: 'r@acme.com',
    });
    await service.assign('t1', { presetId: null });
    expect(userRepo.updatePreset).toHaveBeenCalledWith('t1', null, 'company_c1');
    expect(audit.log).toHaveBeenCalledWith(
      'permissions.preset.assign',
      't1',
      expect.anything(),
    );
  });

  it('rejects deletion of a preset that is in use', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'p1',
      isDefault: false,
      name: 'X',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    permissionRepo.countUsersWithPreset.mockResolvedValue(2);
    await expect(service.remove('p1')).rejects.toThrow();
    expect(permissionRepo.remove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/company/company-permissions.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the DTOs**

`backend/src/modules/company/dto/create-permission-preset.dto.ts`:

```ts
import { z } from 'zod';
import { INTERNAL_ROLES } from '../../../common/permissions/permissions';

export const CreatePermissionPresetSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(INTERNAL_ROLES),
  permissions: z.array(z.string()).min(0).max(17),
});

export type CreatePermissionPresetDto = z.infer<
  typeof CreatePermissionPresetSchema
>;
```

`backend/src/modules/company/dto/update-permission-preset.dto.ts`:

```ts
import { z } from 'zod';

export const UpdatePermissionPresetSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(z.string()).min(0).max(17).optional(),
  })
  .refine((v) => v.name !== undefined || v.permissions !== undefined, {
    message: 'Provide at least one field to update',
  });

export type UpdatePermissionPresetDto = z.infer<
  typeof UpdatePermissionPresetSchema
>;
```

`backend/src/modules/company/dto/assign-preset.dto.ts`:

```ts
import { z } from 'zod';

export const AssignPresetSchema = z.object({
  presetId: z.string().uuid().nullable(),
});

export type AssignPresetDto = z.infer<typeof AssignPresetSchema>;
```

- [ ] **Step 4: Write the service**

`backend/src/modules/company/company-permissions.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getCurrentUser, getSchema } from '../../common/context/company-context';
import { AuditService } from '../../common/audit/audit.service';
import { PermissionRepository } from '../../repositories/permission.repository';
import { UserRepository } from '../../repositories/user.repository';
import { permissionsSubsetOfRole } from '../../common/permissions/permissions';
import type { CreatePermissionPresetDto } from './dto/create-permission-preset.dto';
import type { UpdatePermissionPresetDto } from './dto/update-permission-preset.dto';
import type { AssignPresetDto } from './dto/assign-preset.dto';

@Injectable()
export class CompanyPermissionsService {
  constructor(
    private readonly permissionRepo: PermissionRepository,
    private readonly userRepo: UserRepository,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    const schema = getSchema();
    const defaults = await this.permissionRepo.findDefaults();
    const customs = await this.permissionRepo.findAll(schema);
    const withUsage = await Promise.all(
      customs.map(async (p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        permissions: p.permissions,
        isDefault: false,
        usageCount: await this.permissionRepo.countUsersWithPreset(p.id, schema),
      })),
    );
    return {
      presets: [
        ...defaults.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          permissions: p.permissions,
          isDefault: true,
          usageCount: 0,
        })),
        ...withUsage,
      ],
    };
  }

  async create(dto: CreatePermissionPresetDto) {
    if (!permissionsSubsetOfRole(dto.role, dto.permissions)) {
      throw new BadRequestException(
        'Permissions must be a subset of the role default',
      );
    }
    const me = getCurrentUser();
    const preset = await this.permissionRepo.create(
      {
        name: dto.name,
        role: dto.role,
        permissions: dto.permissions,
        createdBy: me.userId,
      },
      getSchema(),
    );
    await this.auditService.log('permissions.preset.create', preset.id, {
      name: preset.name,
      role: preset.role,
      permissions: preset.permissions,
    });
    return {
      id: preset.id,
      name: preset.name,
      role: preset.role,
      permissions: preset.permissions,
    };
  }

  async update(id: string, dto: UpdatePermissionPresetDto) {
    const schema = getSchema();
    const existing = await this.permissionRepo.findById(id, schema);
    if (!existing) throw new NotFoundException('Preset not found');
    if (
      dto.permissions !== undefined &&
      !permissionsSubsetOfRole(existing.role, dto.permissions)
    ) {
      throw new BadRequestException(
        'Permissions must be a subset of the role default',
      );
    }
    const updated = await this.permissionRepo.update(id, dto, schema);
    await this.auditService.log('permissions.preset.update', id, {
      name: updated?.name,
      permissions: updated?.permissions,
    });
    return {
      id,
      name: updated?.name,
      role: updated?.role,
      permissions: updated?.permissions,
    };
  }

  async remove(id: string) {
    const schema = getSchema();
    const existing = await this.permissionRepo.findById(id, schema);
    if (!existing) throw new NotFoundException('Preset not found');
    const usage = await this.permissionRepo.countUsersWithPreset(id, schema);
    if (usage > 0) {
      throw new ConflictException(
        'This preset is assigned to users — reassign them before deleting',
      );
    }
    await this.permissionRepo.remove(id, schema);
    await this.auditService.log('permissions.preset.delete', id, {
      name: existing.name,
    });
    return { id };
  }

  async assign(userId: string, dto: AssignPresetDto) {
    const schema = getSchema();
    const target = await this.userRepo.findById(userId);
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'CompanyAdmin') {
      throw new ForbiddenException(
        'Company admins cannot change permissions of admin accounts',
      );
    }

    if (dto.presetId !== null) {
      const local = await this.permissionRepo.findById(dto.presetId, schema);
      const preset = local ?? (await this.permissionRepo.findById(dto.presetId, 'public'));
      if (!preset) throw new NotFoundException('Preset not found');
      if (preset.role !== target.role) {
        throw new BadRequestException('Preset role must match the user role');
      }
    }

    await this.userRepo.updatePreset(userId, dto.presetId, schema);
    await this.auditService.log('permissions.preset.assign', userId, {
      email: target.email,
      presetId: dto.presetId,
      role: target.role,
    });
    return { id: userId, presetId: dto.presetId };
  }
}
```

- [ ] **Step 5: Write the controller**

`backend/src/modules/company/company-permissions.controller.ts`:

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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyPermissionsService } from './company-permissions.service';
import {
  CreatePermissionPresetSchema,
  CreatePermissionPresetDto,
} from './dto/create-permission-preset.dto';
import {
  UpdatePermissionPresetSchema,
  UpdatePermissionPresetDto,
} from './dto/update-permission-preset.dto';

@Controller('company/permissions')
@UseGuards(AuthGuard('jwt'))
@Roles('CompanyAdmin')
@Permissions('permissions.manage')
export class CompanyPermissionsController {
  constructor(
    private readonly permissionsService: CompanyPermissionsService,
  ) {}

  @Get()
  list() {
    return this.permissionsService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreatePermissionPresetSchema))
    dto: CreatePermissionPresetDto,
  ) {
    return this.permissionsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePermissionPresetSchema))
    dto: UpdatePermissionPresetDto,
  ) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.permissionsService.remove(id);
  }
}
```

- [ ] **Step 6: Wire the module**

In `backend/src/modules/company/company.module.ts`, add:

```ts
import { CompanyPermissionsController } from './company-permissions.controller';
import { CompanyPermissionsService } from './company-permissions.service';
// ...
  controllers: [CompanyController, CompanyUsersController, CompanyPermissionsController],
  providers: [CompanyService, CompanyUsersService, CompanyPermissionsService],
```

- [ ] **Step 7: UserRepository + CompanyUsersService + controller**

In `backend/src/repositories/user.repository.ts`:

1. `findAll` select gains `presetId: users.presetId`.
2. `create` data type gains `presetId?: string | null` and passes it through.
3. `updateRole` also resets the preset:

```ts
  async updateRole(id: string, role: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ role, presetId: null })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
```

4. Add:

```ts
  async updatePreset(id: string, presetId: string | null, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ presetId })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
```

In `backend/src/modules/company/dto/invite-user.dto.ts`, add:

```ts
presetId: z.string().uuid().nullable().optional(),
```

In `backend/src/modules/company/company-users.service.ts`:

1. Import `PermissionRepository` + inject it.
2. In `create`, accept `dto.presetId`; when provided, validate role match + existence (own schema first, then public), mirroring `CompanyPermissionsService.assign`; pass `presetId` into `userRepo.create`.

In `backend/src/modules/company/company-users.controller.ts`:

1. Inject `CompanyPermissionsService`.
2. Add the assignment route (import `AssignPresetSchema`, `AssignPresetDto`, `Permissions`):

```ts
  @Patch(':userId/preset')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  @Permissions('permissions.manage')
  assignPreset(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(AssignPresetSchema)) dto: AssignPresetDto,
  ) {
    return this.permissionsService.assign(userId, dto);
  }
```

- [ ] **Step 8: Run tests + checks**

Run: `cd backend && npx jest src/modules/company/company-permissions.service.spec.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS. Fix any `company-users.service.spec.ts` expectations broken by the `create` signature change.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/company backend/src/repositories/user.repository.ts
git commit -m "feat(m18): company permission preset CRUD + assignment"
```

---

### Task 8: Platform preset endpoints + assignment

**Files:**
- Create: `backend/src/modules/platform/dto/create-platform-preset.dto.ts`
- Create: `backend/src/modules/platform/dto/update-platform-preset.dto.ts`
- Create: `backend/src/modules/platform/platform-permissions.service.ts`
- Create: `backend/src/modules/platform/platform-permissions.service.spec.ts`
- Create: `backend/src/modules/platform/platform-permissions.controller.ts`
- Modify: `backend/src/modules/platform/platform.module.ts`
- Modify: `backend/src/modules/platform/platform-accounts.service.ts` (createCompanyUser presetId; updateCompanyUser role-change resets; listCompanyUsers + collectAllUsers include presetId; assignPreset)
- Modify: `backend/src/modules/platform/platform-accounts.controller.ts` (assignment route)

**Interfaces:**
- Consumes: Task 1, Task 3, Task 4, Task 7 DTO patterns.
- Produces:
  - `GET /platform/permissions` → `{ presets: [{ id, name, role, permissions, isDefault, companyId, companyName, usageCount }] }` — defaults + globals (companyId/companyName null) + every company's customs (with companyName + usage count)
  - `POST /platform/permissions` `{ name, role, permissions }` — global; subset-validated; audit `platform.permissions.preset.create`
  - `PATCH /platform/permissions/:id` — global only (company-scoped → 404); defaults → 400; subset-validated; audit `platform.permissions.preset.update`
  - `DELETE /platform/permissions/:id` — global only; 409 if any company has users on it; audit `platform.permissions.preset.delete`
  - `PATCH /platform/companies/:id/users/:userId/preset` `{ presetId: string | null }` — any user incl. CA; preset must exist (global or that company's schema) with role match; audit `platform.permissions.preset.assign`

- [ ] **Step 1: Write the failing unit test**

`backend/src/modules/platform/platform-permissions.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlatformPermissionsService } from './platform-permissions.service';
import { PermissionRepository } from '../../repositories/permission.repository';
import { CompanyRepository } from '../../repositories/company.repository';
import { UserRepository } from '../../repositories/user.repository';
import { AuditService } from '../../common/audit/audit.service';

describe('PlatformPermissionsService', () => {
  let service: PlatformPermissionsService;
  const permissionRepo = {
    findDefaults: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    countUsersWithPreset: jest.fn(),
  };
  const tenantRepo = { findAll: jest.fn() };
  const userRepo = { findById: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlatformPermissionsService(
      permissionRepo as unknown as PermissionRepository,
      tenantRepo as unknown as CompanyRepository,
      userRepo as unknown as UserRepository,
      audit as unknown as AuditService,
    );
  });

  it('rejects editing a default preset', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'd1',
      isDefault: true,
      name: 'Recruiter Default',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(
      service.update('d1', { name: 'Hacked' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects editing a company-scoped preset (404)', async () => {
    permissionRepo.findById.mockResolvedValue(null);
    await expect(service.update('p1', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a global with permissions outside the role default', async () => {
    await expect(
      service.create({
        name: 'G',
        role: 'Interviewer',
        permissions: ['jobs.create_edit'],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/platform/platform-permissions.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the DTOs**

`backend/src/modules/platform/dto/create-platform-preset.dto.ts`:

```ts
import { z } from 'zod';
import { INTERNAL_ROLES } from '../../../common/permissions/permissions';

export const CreatePlatformPresetSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(INTERNAL_ROLES),
  permissions: z.array(z.string()).min(0).max(17),
});

export type CreatePlatformPresetDto = z.infer<
  typeof CreatePlatformPresetSchema
>;
```

`backend/src/modules/platform/dto/update-platform-preset.dto.ts`:

```ts
import { z } from 'zod';

export const UpdatePlatformPresetSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(z.string()).min(0).max(17).optional(),
  })
  .refine((v) => v.name !== undefined || v.permissions !== undefined, {
    message: 'Provide at least one field to update',
  });

export type UpdatePlatformPresetDto = z.infer<
  typeof UpdatePlatformPresetSchema
>;
```

- [ ] **Step 4: Write the service**

`backend/src/modules/platform/platform-permissions.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PermissionRepository } from '../../repositories/permission.repository';
import { CompanyRepository } from '../../repositories/company.repository';
import { UserRepository } from '../../repositories/user.repository';
import { permissionsSubsetOfRole } from '../../common/permissions/permissions';
import type { CreatePlatformPresetDto } from './dto/create-platform-preset.dto';
import type { UpdatePlatformPresetDto } from './dto/update-platform-preset.dto';

@Injectable()
export class PlatformPermissionsService {
  constructor(
    private readonly permissionRepo: PermissionRepository,
    private readonly tenantRepo: CompanyRepository,
    private readonly userRepo: UserRepository,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    const defaults = await this.permissionRepo.findDefaults();
    const globals = await this.permissionRepo.findAll('public');
    const companies = await this.tenantRepo.findAll();
    const companyPresets: unknown[] = [];
    for (const tenant of companies) {
      const schema = `company_${tenant.id}`;
      for (const p of await this.permissionRepo.findAll(schema)) {
        companyPresets.push({
          id: p.id,
          name: p.name,
          role: p.role,
          permissions: p.permissions,
          isDefault: false,
          companyId: tenant.id,
          companyName: tenant.name,
          usageCount: await this.permissionRepo.countUsersWithPreset(
            p.id,
            schema,
          ),
        });
      }
    }
    return {
      presets: [
        ...defaults.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          permissions: p.permissions,
          isDefault: true,
          companyId: null,
          companyName: null,
          usageCount: 0,
        })),
        ...globals.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          permissions: p.permissions,
          isDefault: false,
          companyId: null,
          companyName: null,
          usageCount: 0,
        })),
        ...companyPresets,
      ],
    };
  }

  async create(dto: CreatePlatformPresetDto) {
    if (!permissionsSubsetOfRole(dto.role, dto.permissions)) {
      throw new BadRequestException(
        'Permissions must be a subset of the role default',
      );
    }
    const preset = await this.permissionRepo.create(
      { name: dto.name, role: dto.role, permissions: dto.permissions },
      'public',
    );
    await this.auditService.log('platform.permissions.preset.create', preset.id, {
      name: preset.name,
      role: preset.role,
    });
    return {
      id: preset.id,
      name: preset.name,
      role: preset.role,
      permissions: preset.permissions,
    };
  }

  async update(id: string, dto: UpdatePlatformPresetDto) {
    const existing = await this.permissionRepo.findById(id, 'public');
    if (!existing) throw new NotFoundException('Preset not found');
    if (existing.isDefault) {
      throw new BadRequestException('Default presets cannot be modified');
    }
    if (
      dto.permissions !== undefined &&
      !permissionsSubsetOfRole(existing.role, dto.permissions)
    ) {
      throw new BadRequestException(
        'Permissions must be a subset of the role default',
      );
    }
    const updated = await this.permissionRepo.update(id, dto, 'public');
    await this.auditService.log('platform.permissions.preset.update', id, {
      name: updated?.name,
      permissions: updated?.permissions,
    });
    return {
      id,
      name: updated?.name,
      role: updated?.role,
      permissions: updated?.permissions,
    };
  }

  async remove(id: string) {
    const existing = await this.permissionRepo.findById(id, 'public');
    if (!existing) throw new NotFoundException('Preset not found');
    if (existing.isDefault) {
      throw new BadRequestException('Default presets cannot be deleted');
    }
    const companies = await this.tenantRepo.findAll();
    for (const tenant of companies) {
      const usage = await this.permissionRepo.countUsersWithPreset(
        id,
        `company_${tenant.id}`,
      );
      if (usage > 0) {
        throw new ConflictException(
          'This preset is assigned to users — reassign them before deleting',
        );
      }
    }
    await this.permissionRepo.remove(id, 'public');
    await this.auditService.log('platform.permissions.preset.delete', id, {
      name: existing.name,
    });
    return { id };
  }

  async assign(companyId: string, userId: string, presetId: string | null) {
    const schema = `company_${companyId}`;
    const target = await this.userRepo.findById(userId, schema);
    if (!target) throw new NotFoundException('User not found');

    if (presetId !== null) {
      const local = await this.permissionRepo.findById(presetId, schema);
      const preset =
        local ?? (await this.permissionRepo.findById(presetId, 'public'));
      if (!preset) throw new NotFoundException('Preset not found');
      if (preset.role !== target.role) {
        throw new BadRequestException('Preset role must match the user role');
      }
    }

    await this.userRepo.updatePreset(userId, presetId, schema);
    await this.auditService.log(
      'platform.permissions.preset.assign',
      userId,
      { email: target.email, presetId, role: target.role },
      companyId,
    );
    return { id: userId, presetId };
  }
}
```

- [ ] **Step 5: Write the controller**

`backend/src/modules/platform/platform-permissions.controller.ts`:

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
import { PlatformPermissionsService } from './platform-permissions.service';
import {
  CreatePlatformPresetSchema,
  CreatePlatformPresetDto,
} from './dto/create-platform-preset.dto';
import {
  UpdatePlatformPresetSchema,
  UpdatePlatformPresetDto,
} from './dto/update-platform-preset.dto';

@Controller('platform/permissions')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformPermissionsController {
  constructor(
    private readonly permissionsService: PlatformPermissionsService,
  ) {}

  @Get()
  list() {
    return this.permissionsService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreatePlatformPresetSchema))
    dto: CreatePlatformPresetDto,
  ) {
    return this.permissionsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePlatformPresetSchema))
    dto: UpdatePlatformPresetDto,
  ) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.permissionsService.remove(id);
  }
}
```

- [ ] **Step 6: Wire the module + assignment route**

In `backend/src/modules/platform/platform.module.ts`, add the controller + service (mirror `platform-accounts.controller/service` entries).

In `backend/src/modules/platform/platform-accounts.controller.ts`, add (import `AssignPresetSchema` from `../company/dto/assign-preset.dto`):

```ts
  @Patch('companies/:id/users/:userId/preset')
  assignPreset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(AssignPresetSchema)) body: AssignPresetDto,
  ) {
    return this.permissionsService.assign(id, userId, body.presetId);
  }
```

Inject `PlatformPermissionsService` into `PlatformAccountsController`.

- [ ] **Step 7: PlatformAccountsService preset handling**

In `backend/src/modules/platform/platform-accounts.service.ts`:

1. `createCompanyUser` — accept `dto.presetId?: string | null`; validate role match + existence (company schema first, then public); pass to `userRepo.create`.
2. `updateCompanyUser` — when `dto.role` changes, the repo's `updateRole` now resets `presetId` to null automatically (Task 7).
3. `listCompanyUsers` / `collectAllUsers` — presetId flows through `userRepo.findAll` automatically.
4. `CreateCompanyUserDto` gains `presetId: z.string().uuid().nullable().optional()`.

- [ ] **Step 8: Run tests + checks**

Run: `cd backend && npx jest src/modules/platform/platform-permissions.service.spec.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS. Fix any `platform-accounts.service.spec.ts` expectations broken by the `createCompanyUser` signature change.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/platform
git commit -m "feat(m18): platform permission preset CRUD + assignment"
```

---

### Task 9: E2E release gate — phase18

**Files:**
- Create: `backend/test/phase18.e2e-spec.ts`
- Modify: `backend/package.json` — nothing (jest picks up `backend/test/*.e2e-spec.ts` via the existing e2e config; verify with `npm run test:e2e`).

**Interfaces:**
- Consumes: all of Tasks 1–8. Requires Docker infra (postgres + redis) and the migration from Task 2 applied (or run the migration SQL in `beforeAll` — see Step 2).
- Produces: the M18 release gate asserting the spec's acceptance criteria (§10 of the spec).

- [ ] **Step 1: Scaffold the spec with helpers**

`backend/test/phase18.e2e-spec.ts` (modeled on `phase17.e2e-spec.ts`):

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
  permissions?: string[];
}

interface CompanyAccount {
  companyId: string;
  userId: string;
  token: string;
  email: string;
  password: string;
}

interface PresetItem {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  isDefault: boolean;
  usageCount: number;
}

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdCompanyIds: string[] = [];
const createdOrgUserIds: string[] = [];
const createdSuperAdminIds: string[] = [];
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

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
  if (!databaseUrl || !redisUrl) {
    throw new Error('DATABASE_URL / REDIS_URL must be configured');
  }
  cleanupPool = new Pool({ connectionString: databaseUrl, max: 2 });
  await cleanupPool.query('SELECT 1');
  cleanupRedis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  await cleanupRedis.connect();
  await cleanupRedis.ping();
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
  const email = `phase18-${suffix}-${runId}@example.test`;
  const password = `Phase18Org!${randomUUID().slice(0, 18)}`;
  const slug = `phase18-${suffix}-${runId}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({ companyName: `Phase 18 ${suffix} ${runId}`, slug, email, password });
  const tokens = assertEnvelope<Tokens>(response, 201);
  const claims = JSON.parse(
    Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString('utf8'),
  ) as JwtClaims;
  if (!claims.companyId) throw new Error('Company token lacked companyId');
  createdCompanyIds.push(claims.companyId);
  createdOrgUserIds.push(claims.sub);
  return { companyId: claims.companyId, userId: claims.sub, token: tokens.accessToken, email, password };
};

const createSuperAdmin = async (): Promise<CompanyAccount> => {
  const email = `phase18-sa-${runId}@example.test`;
  const password = `Phase18SA!${randomUUID().slice(0, 18)}`;
  const passwordHash = await argon2.hash(password);
  const id = randomUUID();
  await cleanupPool!.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name) VALUES ($1, $2, $3, $4)`,
    [id, email, passwordHash, 'Phase 18 SA'],
  );
  createdSuperAdminIds.push(id);
  const response = await signIn(email, password);
  const tokens = assertEnvelope<Tokens>(response, 201);
  return { companyId: '', userId: id, token: tokens.accessToken, email, password };
};

const createCompanyUser = async (
  token: string,
  body: { email: string; role: string; password: string; presetId?: string | null },
): Promise<{ id: string }> => {
  const response = await request(httpServer())
    .post('/api/company/users')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return assertEnvelope<{ id: string }>(response, 201);
};

const listPresets = async (token: string): Promise<PresetItem[]> => {
  const response = await request(httpServer())
    .get('/api/company/permissions')
    .set('Authorization', `Bearer ${token}`);
  const data = assertEnvelope<{ presets: PresetItem[] }>(response, 200);
  return data.presets;
};
```

- [ ] **Step 2: Seed defaults + apply migration in beforeAll**

Add the `beforeAll` block (place the default preset JSON in a const above the hooks). The defaults are inserted into `public.permission_presets` with fixed UUIDs so the tests can reference them:

```ts
const DEFAULT_PRESETS: { id: string; name: string; role: string; permissions: string[] }[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Company Admin Default',
    role: 'CompanyAdmin',
    permissions: [
      'jobs.view', 'jobs.create_edit', 'jobs.publish_close', 'jobs.delete',
      'candidates.view', 'candidates.manage',
      'applications.view', 'applications.move', 'applications.note',
      'interviews.view', 'interviews.schedule',
      'stages.manage', 'settings.manage', 'users.manage', 'permissions.manage',
      'dashboard.view',
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Recruiter Default',
    role: 'Recruiter',
    permissions: [
      'jobs.view', 'jobs.create_edit', 'jobs.publish_close',
      'candidates.view', 'candidates.manage',
      'applications.view', 'applications.move', 'applications.note',
      'interviews.view', 'interviews.schedule',
      'dashboard.view',
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Hiring Manager Default',
    role: 'HiringManager',
    permissions: [
      'jobs.view', 'candidates.view',
      'applications.view', 'applications.move', 'applications.note',
      'interviews.view', 'interviews.schedule',
      'dashboard.view',
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Interviewer Default',
    role: 'Interviewer',
    permissions: ['interviews.view', 'interviews.feedback', 'dashboard.view'],
  },
];

let tenantA: CompanyAccount;
let tenantB: CompanyAccount;
let superAdmin: CompanyAccount;

beforeAll(async () => {
  await verifyInfrastructure();
  await cleanupPool!.query(`
    CREATE TABLE IF NOT EXISTS public.permission_presets (
      id UUID PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      role VARCHAR(50) NOT NULL,
      permissions JSONB NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_by UUID,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preset_id UUID;
  `);
  for (const p of DEFAULT_PRESETS) {
    await cleanupPool!.query(
      `INSERT INTO public.permission_presets (id, name, role, permissions, is_default)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.role, JSON.stringify(p.permissions)],
    );
  }

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();

  tenantA = await createTenant('a');
  tenantB = await createTenant('b');
  superAdmin = await createSuperAdmin();
});
```

Note: if the Task 2 migration was already applied to the local DB, the `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` are no-ops — keep them so the gate runs on a fresh CI database too.

- [ ] **Step 3: Write the test suites**

Append the tests (same file):

```ts
afterAll(async () => {
  for (const companyId of createdCompanyIds) {
    await cleanupPool!.query(`DROP SCHEMA IF EXISTS "company_${companyId}" CASCADE`);
    await cleanupPool!.query('DELETE FROM public.companies WHERE id = $1', [companyId]);
  }
  for (const userId of createdOrgUserIds) {
    await cleanupPool!.query('DELETE FROM public.user_emails WHERE user_id = $1', [userId]);
  }
  for (const id of createdSuperAdminIds) {
    await cleanupPool!.query('DELETE FROM public.super_admins WHERE id = $1', [id]);
  }
  await cleanupPool!.query(
    'DELETE FROM public.permission_presets WHERE is_default = false',
  );
  if (cleanupRedis) await cleanupRedis.disconnect();
  if (cleanupPool) await cleanupPool.end();
  if (app) await app.close();
});

describe('phase18: permission presets', () => {
  it('seeds 4 read-only defaults visible to a CompanyAdmin', async () => {
    const presets = await listPresets(tenantA.token);
    expect(presets.filter((p) => p.isDefault)).toHaveLength(4);
    expect(
      presets.find((p) => p.role === 'Recruiter')?.permissions,
    ).toContain('jobs.create_edit');
  });

  it('platform cannot edit or delete a default preset', async () => {
    const defaultId = DEFAULT_PRESETS[1].id;
    const patch = await request(httpServer())
      .patch(`/api/platform/permissions/${defaultId}`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ name: 'Hacked' });
    assertStatus(patch, 400);
    const del = await request(httpServer())
      .delete(`/api/platform/permissions/${defaultId}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    assertStatus(del, 400);
  });

  it('company admin creates a custom preset scoped to own company', async () => {
    const create = await request(httpServer())
      .post('/api/company/permissions')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({
        name: 'Recruiter No Jobs',
        role: 'Recruiter',
        permissions: [
          'jobs.view',
          'candidates.view',
          'candidates.manage',
          'applications.view',
          'applications.move',
          'applications.note',
          'interviews.view',
          'interviews.schedule',
          'dashboard.view',
        ],
      });
    const created = assertEnvelope<{ id: string }>(create, 201);
    expect(created.id).toBeTruthy();

    const inA = await listPresets(tenantA.token);
    expect(inA.find((p) => p.id === created.id)?.name).toBe('Recruiter No Jobs');

    const inB = await listPresets(tenantB.token);
    expect(inB.find((p) => p.id === created.id)).toBeUndefined();
  });

  it('rejects a preset with permissions outside the role default', async () => {
    const response = await request(httpServer())
      .post('/api/company/permissions')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({
        name: 'Interviewer Superpowers',
        role: 'Interviewer',
        permissions: ['jobs.create_edit'],
      });
    assertStatus(response, 400);
  });

  it('superadmin creates a global preset visible to every company', async () => {
    const create = await request(httpServer())
      .post('/api/platform/permissions')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({
        name: 'Global Recruiter Light',
        role: 'Recruiter',
        permissions: ['jobs.view', 'applications.view', 'dashboard.view'],
      });
    const created = assertEnvelope<{ id: string }>(create, 201);
    const inA = await listPresets(tenantA.token);
    expect(inA.find((p) => p.id === created.id)).toBeTruthy();
    const inB = await listPresets(tenantB.token);
    expect(inB.find((p) => p.id === created.id)).toBeTruthy();
  });

  it('assigning a preset narrows the account and the backend enforces it', async () => {
    const recruiter = await createCompanyUser(tenantA.token, {
      email: `rec1-${runId}@acme.test`,
      role: 'Recruiter',
      password: 'Recruiter123!',
    });
    createdOrgUserIds.push(recruiter.id);
    const signInResponse = await signIn(`rec1-${runId}@acme.test`, 'Recruiter123!');
    const tokens = assertEnvelope<Tokens>(signInResponse, 201);
    const claims = JSON.parse(
      Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString('utf8'),
    ) as JwtClaims;
    expect(claims.permissions).toContain('jobs.create_edit');

    const preset = (await listPresets(tenantA.token)).find(
      (p) => p.name === 'Recruiter No Jobs',
    );
    if (!preset) throw new Error('Expected Recruiter No Jobs preset');
    const assign = await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: preset.id });
    assertEnvelope<{ id: string }>(assign, 200);

    const blocked = await request(httpServer())
      .post('/api/job-postings')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        title: 'Blocked Job',
        description: 'x',
        employmentType: 'full-time',
        location: 'Remote',
        workSetup: 'work-from-home',
      });
    assertStatus(blocked, 403);

    const allowed = await request(httpServer())
      .get('/api/job-postings')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    assertStatus(allowed, 200);

    const reset = await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: null });
    assertEnvelope<{ id: string }>(reset, 200);
  });

  it('company admin cannot assign a preset to a CompanyAdmin account', async () => {
    const response = await request(httpServer())
      .patch(`/api/company/users/${tenantA.userId}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: null });
    assertStatus(response, 403);
  });

  it('company admin cannot reach another company user (404)', async () => {
    const response = await request(httpServer())
      .patch(`/api/company/users/${tenantB.userId}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: null });
    assertStatus(response, 404);
  });

  it('rejects assignment with a role mismatch (400)', async () => {
    const interviewer = await createCompanyUser(tenantA.token, {
      email: `iv1-${runId}@acme.test`,
      role: 'Interviewer',
      password: 'Interviewer123!',
    });
    createdOrgUserIds.push(interviewer.id);
    const preset = (await listPresets(tenantA.token)).find(
      (p) => p.name === 'Recruiter No Jobs',
    );
    if (!preset) throw new Error('Expected Recruiter No Jobs preset');
    const response = await request(httpServer())
      .patch(`/api/company/users/${interviewer.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: preset.id });
    assertStatus(response, 400);
  });

  it('role change resets the preset to the role default', async () => {
    const recruiter = await createCompanyUser(tenantA.token, {
      email: `rec2-${runId}@acme.test`,
      role: 'Recruiter',
      password: 'Recruiter123!',
    });
    createdOrgUserIds.push(recruiter.id);
    const preset = (await listPresets(tenantA.token)).find(
      (p) => p.name === 'Recruiter No Jobs',
    );
    if (!preset) throw new Error('Expected Recruiter No Jobs preset');
    await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: preset.id });

    const roleChange = await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/role`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ role: 'HiringManager' });
    assertEnvelope<{ id: string }>(roleChange, 200);

    const users = assertEnvelope<
      Array<{ id: string; presetId: string | null }>
    >(
      await request(httpServer())
        .get('/api/company/users')
        .set('Authorization', `Bearer ${tenantA.token}`),
      200,
    );
    expect(users.find((u) => u.id === recruiter.id)?.presetId).toBeNull();
  });

  it('cannot delete a preset that is in use (409)', async () => {
    const recruiter = await createCompanyUser(tenantA.token, {
      email: `rec3-${runId}@acme.test`,
      role: 'Recruiter',
      password: 'Recruiter123!',
    });
    createdOrgUserIds.push(recruiter.id);
    const preset = (await listPresets(tenantA.token)).find(
      (p) => p.name === 'Recruiter No Jobs',
    );
    if (!preset) throw new Error('Expected Recruiter No Jobs preset');
    await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: preset.id });

    const response = await request(httpServer())
      .delete(`/api/company/permissions/${preset.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    assertStatus(response, 409);

    await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: null });
    const after = await request(httpServer())
      .delete(`/api/company/permissions/${preset.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    assertStatus(after, 200);
  });

  it('superadmin can restrict a CompanyAdmin via a global preset', async () => {
    const globalLight = assertEnvelope<{ id: string }>(
      await request(httpServer())
        .post('/api/platform/permissions')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({
          name: 'Global CA Settings-Less',
          role: 'CompanyAdmin',
          permissions: [
            'jobs.view', 'jobs.create_edit', 'jobs.publish_close', 'jobs.delete',
            'candidates.view', 'candidates.manage',
            'applications.view', 'applications.move', 'applications.note',
            'interviews.view', 'interviews.schedule',
            'stages.manage', 'users.manage', 'permissions.manage',
            'dashboard.view',
          ],
        }),
      201,
    );

    const assign = await request(httpServer())
      .patch(`/api/platform/companies/${tenantB.companyId}/users/${tenantB.userId}/preset`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ presetId: globalLight.id });
    assertEnvelope<{ id: string }>(assign, 200);

    const settingsPatch = await request(httpServer())
      .patch('/api/company/settings')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Hacked Name' });
    assertStatus(settingsPatch, 403);

    const settingsGet = await request(httpServer())
      .get('/api/company/settings')
      .set('Authorization', `Bearer ${tenantB.token}`);
    assertStatus(settingsGet, 200);

    await request(httpServer())
      .patch(`/api/platform/companies/${tenantB.companyId}/users/${tenantB.userId}/preset`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ presetId: null });
  });
});
```

- [ ] **Step 4: Verify the JWT claim test matches token expiry behavior**

The recruiter's access token is issued BEFORE the assignment (used only for the claim assertion). The `blocked`/`allowed` calls use the same pre-assignment token — the guard is DB-backed so the 403 comes from the DB state, not the claim. If the token is somehow rejected instead, re-sign-in after assignment before the blocked call. Expected: `blocked` → 403, `allowed` → 200.

- [ ] **Step 5: Run the e2e gate**

Run: `cd backend && npm run test:e2e -- phase18`
Expected: all phase18 tests PASS.

Then run the FULL e2e suite to confirm no regressions from the guard tagging:

Run: `cd backend && npm run test:e2e`
Expected: all phase gates PASS (phases 1–18). If an older phase asserts a 200 on an endpoint now requiring a permission, that account already holds the permission via its role default — investigate any failure before changing older specs.

- [ ] **Step 6: Commit**

```bash
git add backend/test/phase18.e2e-spec.ts
git commit -m "feat(m18): phase18 e2e gate for permission management"
```

---

### Task 10: Frontend auth store + usePermission hook

**Files:**
- Modify: `frontend/src/api/useAuth.ts` (permissions state, decoded from JWT claim)
- Create: `frontend/src/hooks/usePermission.ts`

**Interfaces:**
- Consumes: backend JWT claim `permissions: string[]` (Task 6).
- Produces:
  - `useAuthStore` state gains `permissions: string[]` (persisted in localStorage under `'permissions'`), set in `setTokens` from `payload.permissions ?? []`, cleared in `clearTokens`.
  - `export function usePermission(...keys: string[]): boolean` — true if any key is in the store's permissions.

- [ ] **Step 1: Modify the store**

In `frontend/src/api/useAuth.ts`:

1. Add to `AuthState`: `permissions: string[];`
2. Init: `permissions: JSON.parse(localStorage.getItem('permissions') ?? '[]')`
3. In `setTokens`, after `localStorage.setItem('role', payload.role)`:

```ts
    const permissions: string[] = payload.permissions ?? [];
    localStorage.setItem('permissions', JSON.stringify(permissions));
```

4. In the `set(...)` call add `permissions`.
5. In `clearTokens`, remove the key + add `permissions: []` to the state reset.

- [ ] **Step 2: Write the hook**

`frontend/src/hooks/usePermission.ts`:

```ts
import { useAuthStore } from '@/api/useAuth';

export function usePermission(...keys: string[]): boolean {
  const permissions = useAuthStore((s) => s.permissions);
  if (keys.length === 0) return true;
  return keys.some((key) => permissions.includes(key));
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS (no existing code uses the new field yet).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/useAuth.ts frontend/src/hooks/usePermission.ts
git commit -m "feat(m18): auth store permissions + usePermission hook"
```

---

### Task 11: Frontend permissions API layer

**Files:**
- Create: `frontend/src/api/permissionsApi.ts` (catalog + company endpoints)
- Modify: `frontend/src/api/platformApi.ts` (platform preset endpoints + PlatformUser.presetId)
- Modify: `frontend/src/api/companyUsersApi.ts` (CompanyUser.presetId)
- Modify: `frontend/src/api/queryKeys.ts`

**Interfaces:**
- Consumes: backend endpoints from Tasks 7–8.
- Produces:
  - `PERMISSION_GROUPS: { label: string; keys: string[] }[]` (for the toggle grid UI)
  - `ROLE_PERMISSIONS: Record<string, string[]>` (frontend mirror for subset + toggle rendering)
  - `interface PermissionPreset { id: string; name: string; role: string; permissions: string[]; isDefault: boolean; usageCount: number }`
  - `companyPermissionsApi = { list, create, update, remove }` + `assignPreset(userId, presetId: string | null)` (in `companyUsersApi`)
  - `platformApi.listPermissions / createPermissionPreset / updatePermissionPreset / deletePermissionPreset / assignUserPreset(companyId, userId, presetId)`
  - `queryKeys.company.permissionPresets()` + `queryKeys.platform.permissions()`

- [ ] **Step 1: Write the catalog + company API**

`frontend/src/api/permissionsApi.ts`:

```ts
import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export const PERMISSION_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Jobs', keys: ['jobs.view', 'jobs.create_edit', 'jobs.publish_close', 'jobs.delete'] },
  { label: 'Candidates', keys: ['candidates.view', 'candidates.manage'] },
  { label: 'Applications', keys: ['applications.view', 'applications.move', 'applications.note'] },
  { label: 'Interviews', keys: ['interviews.view', 'interviews.schedule', 'interviews.feedback'] },
  { label: 'Pipeline stages', keys: ['stages.manage'] },
  { label: 'Company settings', keys: ['settings.manage'] },
  { label: 'Team management', keys: ['users.manage'] },
  { label: 'Permissions', keys: ['permissions.manage'] },
  { label: 'Dashboard', keys: ['dashboard.view'] },
];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  CompanyAdmin: PERMISSION_GROUPS.flatMap((g) => g.keys),
  Recruiter: [
    'jobs.view', 'jobs.create_edit', 'jobs.publish_close',
    'candidates.view', 'candidates.manage',
    'applications.view', 'applications.move', 'applications.note',
    'interviews.view', 'interviews.schedule',
    'dashboard.view',
  ],
  HiringManager: [
    'jobs.view', 'candidates.view',
    'applications.view', 'applications.move', 'applications.note',
    'interviews.view', 'interviews.schedule',
    'dashboard.view',
  ],
  Interviewer: ['interviews.view', 'interviews.feedback', 'dashboard.view'],
};

export interface PermissionPreset {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  isDefault: boolean;
  usageCount: number;
}

export interface PermissionPresetsResponse {
  presets: PermissionPreset[];
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const companyPermissionsApi = {
  list: async (): Promise<PermissionPresetsResponse> => {
    const { data } = await apiClient.get('/company/permissions');
    return unwrap(data as ApiEnvelope<PermissionPresetsResponse>);
  },
  create: async (body: { name: string; role: string; permissions: string[] }): Promise<ApiEnvelope<PermissionPreset>> => {
    const { data } = await apiClient.post('/company/permissions', body);
    return data as ApiEnvelope<PermissionPreset>;
  },
  update: async (id: string, body: { name?: string; permissions?: string[] }): Promise<ApiEnvelope<PermissionPreset>> => {
    const { data } = await apiClient.patch(`/company/permissions/${id}`, body);
    return data as ApiEnvelope<PermissionPreset>;
  },
  remove: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/company/permissions/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
};
```

In `frontend/src/api/companyUsersApi.ts`:

1. Add `presetId: string | null;` to `CompanyUser`.
2. Add:

```ts
  assignPreset: async (
    userId: string,
    presetId: string | null,
  ): Promise<ApiEnvelope<{ id: string; presetId: string | null }>> => {
    const { data } = await apiClient.patch(`/company/users/${userId}/preset`, {
      presetId,
    });
    return data as ApiEnvelope<{ id: string; presetId: string | null }>;
  },
```

- [ ] **Step 2: Extend platformApi**

In `frontend/src/api/platformApi.ts`:

1. Add `presetId: string | null;` to `PlatformUser`.
2. Add:

```ts
  listPermissions: async (): Promise<{ presets: Array<PermissionPreset & { companyId: string | null; companyName: string | null }> }> => {
    const { data } = await apiClient.get('/platform/permissions');
    return unwrap(data as ApiEnvelope<{ presets: Array<PermissionPreset & { companyId: string | null; companyName: string | null }> }>);
  },
  createPermissionPreset: async (body: { name: string; role: string; permissions: string[] }): Promise<ApiEnvelope<PermissionPreset>> => {
    const { data } = await apiClient.post('/platform/permissions', body);
    return data as ApiEnvelope<PermissionPreset>;
  },
  updatePermissionPreset: async (id: string, body: { name?: string; permissions?: string[] }): Promise<ApiEnvelope<PermissionPreset>> => {
    const { data } = await apiClient.patch(`/platform/permissions/${id}`, body);
    return data as ApiEnvelope<PermissionPreset>;
  },
  deletePermissionPreset: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/permissions/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  assignUserPreset: async (
    companyId: string,
    userId: string,
    presetId: string | null,
  ): Promise<ApiEnvelope<{ id: string; presetId: string | null }>> => {
    const { data } = await apiClient.patch(
      `/platform/companies/${companyId}/users/${userId}/preset`,
      { presetId },
    );
    return data as ApiEnvelope<{ id: string; presetId: string | null }>;
  },
```

Import `PermissionPreset` from `./permissionsApi`.

- [ ] **Step 3: Extend queryKeys**

In `frontend/src/api/queryKeys.ts`, add:

```ts
    permissionPresets: () => ['company', 'permissions'],
```

under `company`, and

```ts
    permissions: () => ['platform', 'permissions'],
```

under `platform`.

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "feat(m18): frontend permissions api layer"
```

---

### Task 12: Company /permissions page

**Files:**
- Create: `frontend/src/routes/company/permissions.tsx`
- Create: `frontend/src/features/company/permissions/PermissionPresetsPage.tsx`
- Create: `frontend/src/shared/components/PresetEditorModal.tsx`
- Create: `frontend/src/features/company/permissions/hooks/useCompanyPermissions.ts`
- Modify: `frontend/src/features/company/layout.tsx` (nav item)

**Interfaces:**
- Consumes: Task 10 `usePermission`, Task 11 API + catalog, `INTERNAL_USER_ROLES` from `companyUsersApi`.
- Produces: `/company/permissions` — table of defaults (read-only, Duplicate) + customs (Edit/Delete), Create button, PresetEditorModal for create/edit/duplicate. Delete disabled when `usageCount > 0` (client-side; server returns 409 regardless).

- [ ] **Step 1: Write the hooks**

`frontend/src/features/company/permissions/hooks/useCompanyPermissions.ts`:

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companyPermissionsApi } from '@/api/permissionsApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useCompanyPermissionPresets() {
  return useQuery({
    queryKey: queryKeys.company.permissionPresets(),
    queryFn: companyPermissionsApi.list,
  });
}

export function useCreatePreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: companyPermissionsApi.create,
    successMessage: 'Preset created',
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company.permissionPresets(),
      });
    },
  });
}

export function useUpdatePreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; permissions?: string[] } }) =>
      companyPermissionsApi.update(id, body),
    successMessage: 'Preset updated',
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company.permissionPresets(),
      });
    },
  });
}

export function useDeletePreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: companyPermissionsApi.remove,
    successMessage: 'Preset deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company.permissionPresets(),
      });
    },
  });
}
```

- [ ] **Step 2: Write the shared editor modal**

`frontend/src/shared/components/PresetEditorModal.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { PERMISSION_GROUPS, ROLE_PERMISSIONS } from '@/api/permissionsApi';

export interface PresetEditorValue {
  name: string;
  role: string;
  permissions: string[];
}

interface Props {
  opened: boolean;
  title: string;
  initial: PresetEditorValue | null;
  roleLocked: boolean;
  onClose: () => void;
  onSave: (value: PresetEditorValue) => void;
  saving: boolean;
}

export function PresetEditorModal({
  opened,
  title,
  initial,
  roleLocked,
  onClose,
  onSave,
  saving,
}: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Recruiter');
  const [checked, setChecked] = useState<string[]>([]);

  useEffect(() => {
    if (!opened) return;
    setName(initial?.name ?? '');
    setRole(initial?.role ?? 'Recruiter');
    setChecked(initial ? initial.permissions : ROLE_PERMISSIONS['Recruiter']);
  }, [opened, initial]);

  const roleKeys = useMemo(() => ROLE_PERMISSIONS[role] ?? [], [role]);

  const toggle = (key: string) => {
    setChecked((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
      <Stack>
        <TextInput
          label="Preset name"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          disabled={roleLocked && initial?.isDefault === undefined ? false : false}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Role
          </Text>
          <select
            value={role}
            disabled={roleLocked}
            onChange={(e) => {
              setRole(e.currentTarget.value);
              setChecked(ROLE_PERMISSIONS[e.currentTarget.value] ?? []);
            }}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--mantine-color-default-border)',
              background: 'var(--mantine-color-default)',
            }}
          >
            {Object.keys(ROLE_PERMISSIONS).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {PERMISSION_GROUPS.map((group) => {
          const visible = group.keys.filter((k) => roleKeys.includes(k));
          if (visible.length === 0) return null;
          return (
            <Stack key={group.label} gap={6}>
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                {group.label}
              </Text>
              {visible.map((key) => (
                <Switch
                  key={key}
                  label={key}
                  checked={checked.includes(key)}
                  onChange={() => toggle(key)}
                />
              ))}
            </Stack>
          );
        })}
        <Group justify="flex-end">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), role, permissions: checked })}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
```

Notes:
- Toggles only render the selected role's default keys, pre-checked — uncheck-only by construction (subset rule). The backend validates regardless.
- The stray `disabled` expression on the name input is a no-op — remove it (`ponytail:` leftover guard while writing; keep the input always editable).
- For create/duplicate, `roleLocked` is false (role selectable); for edit, pass `roleLocked: true`.

- [ ] **Step 3: Write the page**

`frontend/src/features/company/permissions/PermissionPresetsPage.tsx`:

```tsx
import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconCopy, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import type { PermissionPreset } from '@/api/permissionsApi';
import { TableAction } from '@/shared/components/TableAction';
import { TableSkeleton } from '@/shared/components/Skeletons';
import {
  PresetEditorModal,
  type PresetEditorValue,
} from '@/shared/components/PresetEditorModal';
import {
  useCompanyPermissionPresets,
  useCreatePreset,
  useDeletePreset,
  useUpdatePreset,
} from './hooks/useCompanyPermissions';

export function PermissionPresetsPage() {
  const presetsQuery = useCompanyPermissionPresets();
  const createPreset = useCreatePreset();
  const updatePreset = useUpdatePreset();
  const deletePreset = useDeletePreset();

  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    preset: PermissionPreset | null;
  } | null>(null);

  const presets = presetsQuery.data?.presets ?? [];
  const anySaving = createPreset.isPending || updatePreset.isPending;

  const openCreate = () => setEditor({ mode: 'create', preset: null });
  const openDuplicate = (preset: PermissionPreset) =>
    setEditor({ mode: 'duplicate', preset });
  const openEdit = (preset: PermissionPreset) =>
    setEditor({ mode: 'edit', preset });

  const handleSave = (value: PresetEditorValue) => {
    if (!editor) return;
    if (editor.mode === 'edit' && editor.preset) {
      updatePreset.mutate(
        { id: editor.preset.id, body: { name: value.name, permissions: value.permissions } },
        { onSuccess: () => setEditor(null) },
      );
    } else {
      createPreset.mutate(value, { onSuccess: () => setEditor(null) });
    }
  };

  return (
    <>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>Permission presets</Title>
          <Text size="sm" c="dimmed">
            Default presets are read-only. Duplicate one to customize; custom presets
            are scoped to this company.
          </Text>
        </div>
        <Button leftSection={<IconPlus size="1rem" />} onClick={openCreate}>
          Create preset
        </Button>
      </Group>

      {presetsQuery.isLoading ? (
        <TableSkeleton headers={['Name', 'Role', 'Permissions', 'In use', 'Actions']} />
      ) : presets.length === 0 ? (
        <Text c="dimmed">No presets yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Permissions</Table.Th>
              <Table.Th>In use</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {presets.map((preset) => (
              <Table.Tr key={preset.id}>
                <Table.Td>
                  {preset.name}
                  {preset.isDefault && (
                    <Badge size="xs" variant="light" color="gray" ml="xs">
                      default
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{preset.role}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {preset.permissions.length === 0
                      ? 'No permissions'
                      : preset.permissions.join(', ')}
                  </Text>
                </Table.Td>
                <Table.Td>{preset.usageCount}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <TableAction
                      label="Duplicate"
                      color="blue"
                      onClick={() => openDuplicate(preset)}
                    >
                      <IconCopy size="1rem" />
                    </TableAction>
                    {!preset.isDefault && (
                      <>
                        <TableAction label="Edit" onClick={() => openEdit(preset)}>
                          <IconPencil size="1rem" />
                        </TableAction>
                        <Tooltip
                          label="Reassign users before deleting"
                          disabled={preset.usageCount === 0}
                        >
                          <span>
                            <TableAction
                              label="Delete"
                              color="red"
                              disabled={preset.usageCount > 0}
                              loading={deletePreset.isPending}
                              onClick={() => deletePreset.mutate(preset.id)}
                            >
                              <IconTrash size="1rem" />
                            </TableAction>
                          </span>
                        </Tooltip>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <PresetEditorModal
        opened={editor !== null}
        title={
          editor?.mode === 'edit'
            ? 'Edit preset'
            : editor?.mode === 'duplicate'
              ? 'Duplicate preset'
              : 'Create preset'
        }
        initial={
          editor?.preset
            ? {
                name:
                  editor.mode === 'duplicate'
                    ? `${editor.preset.name} (copy)`
                    : editor.preset.name,
                role: editor.preset.role,
                permissions: editor.preset.permissions,
              }
            : null
        }
        roleLocked={editor?.mode === 'edit'}
        onClose={() => setEditor(null)}
        onSave={handleSave}
        saving={anySaving}
      />
    </>
  );
}
```

- [ ] **Step 4: Create the route + nav item**

`frontend/src/routes/company/permissions.tsx`:

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { PermissionPresetsPage } from '../../features/company/permissions/PermissionPresetsPage';
import { useAuthStore } from '../../api/useAuth';

export const Route = createFileRoute('/company/permissions')({
  beforeLoad: () => {
    if (useAuthStore.getState().role !== 'CompanyAdmin') {
      throw redirect({ to: '/company/dashboard' });
    }
  },
  component: PermissionPresetsPage,
});
```

In `frontend/src/features/company/layout.tsx`, add to `adminItems` (import `IconShieldLock`):

```ts
          { label: 'Permissions', icon: IconShieldLock, to: '/company/permissions' },
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS. (TanStack Router file-based routing regenerates `routeTree.gen.ts` on build.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/company/permissions.tsx frontend/src/features/company/permissions frontend/src/shared/components/PresetEditorModal.tsx frontend/src/features/company/layout.tsx
git commit -m "feat(m18): company permissions page"
```

---

### Task 13: Admin /permissions page

**Files:**
- Create: `frontend/src/routes/admin/permissions.tsx`
- Create: `frontend/src/features/admin/PermissionsPage.tsx`
- Create: `frontend/src/features/admin/hooks/usePlatformPermissions.ts`
- Modify: `frontend/src/features/admin/layout.tsx` (nav item)

**Interfaces:**
- Consumes: Task 11 `platformApi` + catalog, Task 12 `PresetEditorModal`.
- Produces: `/admin/permissions` — defaults (read-only, Duplicate) + global presets (Edit/Delete) + a read-only section listing every company's presets.

- [ ] **Step 1: Write the hooks**

`frontend/src/features/admin/hooks/usePlatformPermissions.ts`:

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '@/api/platformApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function usePlatformPermissions() {
  return useQuery({
    queryKey: queryKeys.platform.permissions(),
    queryFn: platformApi.listPermissions,
  });
}

export function useCreatePlatformPreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: platformApi.createPermissionPreset,
    successMessage: 'Global preset created',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.permissions() });
    },
  });
}

export function useUpdatePlatformPreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; permissions?: string[] } }) =>
      platformApi.updatePermissionPreset(id, body),
    successMessage: 'Global preset updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.permissions() });
    },
  });
}

export function useDeletePlatformPreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: platformApi.deletePermissionPreset,
    successMessage: 'Global preset deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.permissions() });
    },
  });
}
```

- [ ] **Step 2: Write the page**

`frontend/src/features/admin/PermissionsPage.tsx`:

```tsx
import { useState } from 'react';
import {
  Badge,
  Button,
  Divider,
  Group,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconCopy, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import type { PermissionPreset } from '@/api/permissionsApi';
import { TableAction } from '@/shared/components/TableAction';
import { TableSkeleton } from '@/shared/components/Skeletons';
import {
  PresetEditorModal,
  type PresetEditorValue,
} from '@/shared/components/PresetEditorModal';
import {
  useCreatePlatformPreset,
  useDeletePlatformPreset,
  usePlatformPermissions,
  useUpdatePlatformPreset,
} from './hooks/usePlatformPermissions';

interface PlatformPreset extends PermissionPreset {
  companyId: string | null;
  companyName: string | null;
}

export function PermissionsPage() {
  const presetsQuery = usePlatformPermissions();
  const createPreset = useCreatePlatformPreset();
  const updatePreset = useUpdatePlatformPreset();
  const deletePreset = useDeletePlatformPreset();

  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    preset: PlatformPreset | null;
  } | null>(null);

  const presets = presetsQuery.data?.presets ?? [];
  const globals = presets.filter((p) => !p.isDefault && p.companyId === null);
  const companyPresets = presets.filter((p) => p.companyId !== null);
  const anySaving = createPreset.isPending || updatePreset.isPending;

  const handleSave = (value: PresetEditorValue) => {
    if (!editor) return;
    if (editor.mode === 'edit' && editor.preset) {
      updatePreset.mutate(
        { id: editor.preset.id, body: { name: value.name, permissions: value.permissions } },
        { onSuccess: () => setEditor(null) },
      );
    } else {
      createPreset.mutate(value, { onSuccess: () => setEditor(null) });
    }
  };

  const actionRow = (preset: PlatformPreset) => (
    <Group gap="xs">
      <TableAction label="Duplicate" color="blue" onClick={() => setEditor({ mode: 'duplicate', preset })}>
        <IconCopy size="1rem" />
      </TableAction>
      {!preset.isDefault && (
        <>
          <TableAction label="Edit" onClick={() => setEditor({ mode: 'edit', preset })}>
            <IconPencil size="1rem" />
          </TableAction>
          <Tooltip label="Reassign users before deleting" disabled={preset.usageCount === 0}>
            <span>
              <TableAction
                label="Delete"
                color="red"
                disabled={preset.usageCount > 0}
                loading={deletePreset.isPending}
                onClick={() => deletePreset.mutate(preset.id)}
              >
                <IconTrash size="1rem" />
              </TableAction>
            </span>
          </Tooltip>
        </>
      )}
    </Group>
  );

  if (presetsQuery.isLoading) {
    return <TableSkeleton headers={['Name', 'Role', 'Permissions', 'Actions']} />;
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>Permission presets</Title>
          <Text size="sm" c="dimmed">
            Global presets are available to every company. Default presets are read-only.
          </Text>
        </div>
        <Button leftSection={<IconPlus size="1rem" />} onClick={() => setEditor({ mode: 'create', preset: null })}>
          Create global preset
        </Button>
      </Group>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Scope</Table.Th>
            <Table.Th>Permissions</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {presets
            .filter((p) => p.isDefault || p.companyId === null)
            .map((preset) => (
              <Table.Tr key={preset.id}>
                <Table.Td>
                  {preset.name}
                  {preset.isDefault && (
                    <Badge size="xs" variant="light" color="gray" ml="xs">
                      default
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{preset.role}</Table.Td>
                <Table.Td>
                  <Badge size="xs" variant="light" color={preset.isDefault ? 'gray' : 'indigo'}>
                    {preset.isDefault ? 'System' : 'Global'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {preset.permissions.join(', ') || 'No permissions'}
                  </Text>
                </Table.Td>
                <Table.Td>{actionRow(preset)}</Table.Td>
              </Table.Tr>
            ))}
        </Table.Tbody>
      </Table>

      {companyPresets.length > 0 && (
        <>
          <Divider my="lg" />
          <Title order={4} mb="md">
            Company presets
          </Title>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Company</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>In use</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {companyPresets.map((preset) => (
                <Table.Tr key={preset.id}>
                  <Table.Td>{preset.name}</Table.Td>
                  <Table.Td>{preset.companyName ?? '—'}</Table.Td>
                  <Table.Td>{preset.role}</Table.Td>
                  <Table.Td>{preset.usageCount}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}

      <PresetEditorModal
        opened={editor !== null}
        title={
          editor?.mode === 'edit'
            ? 'Edit global preset'
            : editor?.mode === 'duplicate'
              ? 'Duplicate preset'
              : 'Create global preset'
        }
        initial={
          editor?.preset
            ? {
                name:
                  editor.mode === 'duplicate'
                    ? `${editor.preset.name} (copy)`
                    : editor.preset.name,
                role: editor.preset.role,
                permissions: editor.preset.permissions,
              }
            : null
        }
        roleLocked={editor?.mode === 'edit'}
        onClose={() => setEditor(null)}
        onSave={handleSave}
        saving={anySaving}
      />
    </>
  );
}
```

- [ ] **Step 3: Create the route + nav item**

`frontend/src/routes/admin/permissions.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { PermissionsPage } from '@/features/admin/PermissionsPage';

export const Route = createFileRoute('/admin/permissions')({
  component: PermissionsPage,
});
```

(The `/admin` layout already guards SuperAdmin — check `frontend/src/routes/admin.tsx` beforeLoad; if it only checks auth, add the same `role !== 'SuperAdmin'` redirect as `routes/admin/index.tsx` uses.)

In `frontend/src/features/admin/layout.tsx`, add a nav item (import `IconShieldLock`):

```ts
    { label: 'Permissions', icon: IconShieldLock, to: '/admin/permissions' },
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/admin/permissions.tsx frontend/src/features/admin/PermissionsPage.tsx frontend/src/features/admin/hooks/usePlatformPermissions.ts frontend/src/features/admin/layout.tsx
git commit -m "feat(m18): admin permissions page"
```

---

### Task 14: Users pages — preset select + assign action

**Files:**
- Modify: `frontend/src/features/company/users/UserManagementPage.tsx` (create modal preset Select; per-row Preset action)
- Modify: `frontend/src/features/company/users/hooks/useCompanyUsers.ts` (useAssignPreset)
- Modify: `frontend/src/features/admin/UsersPage.tsx` (add-user modal preset Select; per-row Preset action incl. CA)

**Interfaces:**
- Consumes: Task 11 `companyPermissionsApi`/`platformApi` + `ROLE_PERMISSIONS` filtering.
- Produces: preset assignment from both users pages; preset options filtered by the user's role; a "Role default" option maps to `presetId: null`.

- [ ] **Step 1: Company users page**

In `frontend/src/features/company/users/hooks/useCompanyUsers.ts`, add:

```ts
export function useAssignPreset() {
  const queryClient = useQueryClient();
  return useApiMutation<
    unknown,
    { userId: string; presetId: string | null }
  >({
    mutationFn: ({ userId, presetId }) =>
      companyUsersApi.assignPreset(userId, presetId),
    successMessage: 'Preset assigned',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.companyUsers() });
    },
  });
}
```

In `frontend/src/features/company/users/UserManagementPage.tsx`:

1. Imports: `useCompanyPermissionPresets` from the permissions hooks, `useAssignPreset`, `IconShieldLock`.
2. Add state: `const [assigning, setAssigning] = useState<CompanyUser | null>(null);` and `const [assignValue, setAssignValue] = useState<string | null>('default');`
3. Compute presets: `const presetsQuery = useCompanyPermissionPresets();` and

```ts
  const presetsForRole = (role: string) =>
    (presetsQuery.data?.presets ?? []).filter((p) => p.role === role);
```

4. Create modal — after the Role `Select`, add a preset `Select` (only when `form.values.role`):

```tsx
            <Select
              label="Permission preset"
              data={[
                { value: 'default', label: 'Role default' },
                ...presetsForRole(form.values.role).map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.isDefault ? ' (default)' : ''}`,
                })),
              ]}
              defaultValue="default"
              key={`${form.values.role}-${createOpen}`}
              {...form.getInputProps('presetId')}
            />
```

(add `presetId: 'default'` to the form `initialValues`; on submit map `presetId === 'default' ? undefined : presetId` into the create payload — `companyUsersApi.create` passes it through when set.)

5. In the user table actions `Group`, add (for non-self, non-CA rows — CA rows already can't be targeted server-side, so render for any row where `user.role !== 'CompanyAdmin'`):

```tsx
                    <TableAction
                      label="Permissions"
                      color="violet"
                      onClick={() => {
                        setAssignValue(
                          (usersQuery.data?.find((u) => u.id === user.id)?.presetId) ?? 'default',
                        );
                        setAssigning(user);
                      }}
                    >
                      <IconShieldLock size="1rem" />
                    </TableAction>
```

6. Add the assign modal:

```tsx
      <Modal
        opened={assigning !== null}
        onClose={() => setAssigning(null)}
        title={`Permissions — ${assigning?.email ?? ''}`}
      >
        <Stack>
          <Select
            label="Permission preset"
            data={[
              { value: 'default', label: 'Role default' },
              ...(assigning ? presetsForRole(assigning.role) : []).map((p) => ({
                value: p.id,
                label: p.name,
              })),
            ]}
            value={assignValue}
            onChange={setAssignValue}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button
              loading={assignPreset.isPending}
              onClick={() => {
                if (assigning) {
                  assignPreset.mutate(
                    {
                      userId: assigning.id,
                      presetId: assignValue === 'default' ? null : assignValue,
                    },
                    { onSuccess: () => setAssigning(null) },
                  );
                }
              }}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
```

- [ ] **Step 2: Admin users page**

In `frontend/src/features/admin/UsersPage.tsx`:

1. Imports: `usePlatformPermissions` from `./hooks/usePlatformPermissions`, `IconShieldLock`.
2. `const presetsQuery = usePlatformPermissions();` and

```ts
  const presetsForRole = (role: string) =>
    (presetsQuery.data?.presets ?? []).filter(
      (p) => p.role === role && (p.isDefault || p.companyId === null),
    )
```

3. Add-user modal (company type) — after the Role `Select`, add:

```tsx
              <Select
                label="Permission preset"
                data={[
                  { value: 'default', label: 'Role default' },
                  ...presetsForRole(addRole).map((p) => ({
                    value: p.id,
                    label: p.name,
                  })),
                ]}
                value={addPreset}
                onChange={setAddPreset}
              />
```

(add `const [addPreset, setAddPreset] = useState('default')`; reset it in `resetAddModal`; on submit map `addPreset === 'default' ? undefined : addPreset` into the create body.)

4. Per-row Preset action for `user.type === 'company'` rows (all, incl. CA — SuperAdmin may assign to admins):

```tsx
                        <TableAction
                          label="Permissions"
                          color="violet"
                          onClick={() => {
                            setAssignPresetTarget(user)
                            setAssignPresetValue(user.presetId ?? 'default')
                          }}
                        >
                          <IconShieldLock size="1rem" />
                        </TableAction>
```

5. Assignment state + modal (same shape as Step 1.6, but calling `platformApi.assignUserPreset(target.companyId, target.id, value === 'default' ? null : value)` through a `useApiMutation` that invalidates `queryKeys.platform.users()`).

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/company/users frontend/src/features/admin/UsersPage.tsx
git commit -m "feat(m18): preset selection in users pages"
```

---

### Task 15: Docs + project metadata

**Files:**
- Modify: `AGENTS.md` (M18 status, migration list, current state)
- Modify: `docs/06_ROLE_INTERACTIONS.md` (permission-preset section)
- Modify: `docs/07_API_ENDPOINT_DOCUMENTATION.md` (new endpoints)

- [ ] **Step 1: Update AGENTS.md**

1. Status line: change `**Status:** M17 (Dashboard Analytics) — implemented on top of M16 (CSV Export).` to `**Status:** M18 (Permission Management) — implemented on top of M17 (Dashboard Analytics).`
2. Add a `- **M18:** Permission management — ...` bullet summarizing the preset model (defaults read-only, SuperAdmin globals, CompanyAdmin company-scoped customs, `users.preset_id`, `@Permissions` guard, JWT claim, `/permissions` pages both platforms, users-page preset assignment, phase18 e2e). Reference the design spec.
3. Add `20260812000000_permission_management` to the applied migration list.
4. Add the milestone row to the Build Order table: `| M18 | Permission Management | Presets CRUD + assignment + enforcement — done ✅ |`

- [ ] **Step 2: Update docs/06**

Add a "Permission Presets (M18)" section: the 17-permission catalog table, the ceiling rule, the hierarchy rules (SuperAdmin global, CompanyAdmin company-scoped, null = role default, role change resets), and the note that `@Permissions` narrows `@Roles` at the guard layer.

- [ ] **Step 3: Update docs/07**

Add the endpoints: company + platform preset CRUD and both preset-assignment routes, with request/response shapes from Tasks 7–8.

- [ ] **Step 4: Final verification**

Run:
```bash
cd backend && npm run typecheck && npm run lint && npm test && npm run test:e2e
cd frontend && npm run build && npm run lint
```
Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/06_ROLE_INTERACTIONS.md docs/07_API_ENDPOINT_DOCUMENTATION.md
git commit -m "docs(m18): permission management documentation"
```

---

## Self-Review

**Spec coverage check (against `docs/superpowers/specs/2026-08-12-permission-management-design.md`):**
- §2 catalog → Task 1 (backend constants) + Task 11 (frontend mirror) ✅
- §3 presets (defaults/global/company, null fallback, ceiling) → Tasks 2, 7, 8 ✅
- §4 hierarchy rules → Tasks 7 (CA scope, self/admin guard, lockout) + 8 (SA any account) ✅
- §5 data model → Task 2 ✅
- §6 enforcement (@Permissions guard, tagging, DB-backed) → Tasks 4 + 5 ✅
- §7 API endpoints (company + platform CRUD, assignment, users presetId, JWT claim) → Tasks 6, 7, 8 ✅
- §8 frontend (auth store, hook, /permissions pages, users integration, guards) → Tasks 10–14 ✅
- §9 audit → Tasks 7 + 8 ✅
- §10 testing (unit + phase18 e2e) → Tasks 3, 4, 7, 8, 9 ✅
- §11 out of scope → honored (no candidate permissions, no editable defaults, no per-user toggles, no Redis cache) ✅

**Placeholder scan:** no TBD/TODO left; every step carries real code or an exact command. ✅
**Type consistency:** `PermissionRepository` methods, `resolveEffectivePermissions`, `PresetListItem`, `PermissionPreset` (frontend), `AssignPresetSchema` — consistent across tasks. ✅

**Notes for the implementer:**
- Run `npm run dev` (backend) and the frontend dev server to smoke-test the pages end-to-end against a seeded local DB (`npm run seed` seeds the 4 defaults).
- The `PresetEditorModal` uses a plain `<select>` instead of Mantine `Select` to avoid remount churn on role change — swap if styling demands it.
- `backend/test/phase18.e2e-spec.ts` self-heals on a DB where the Task 2 migration was already applied (IF NOT EXISTS everywhere).






