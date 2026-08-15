# Profile Avatars & Universal User Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every account (candidate, company user, SuperAdmin) can upload/edit/remove a profile avatar; all three layouts share one top-right avatar menu (Profile + Logout); new profile pages for company users and SuperAdmins; avatars appear in headers, footers, profile pages, and person-lists.

**Architecture:** Backend adds `name`/`avatar_url` columns (company `users` via template clone, `candidate_accounts`, `super_admins`), one shared `AvatarsModule` (S3 store/validate/delete + a generic authed `GET /avatars/file` serve endpoint), a `GET /auth/me`, and per-role profile endpoints in the candidate/company/platform modules. Storage stays one `StorageService`/one S3Client with a second bucket (`avatars`) passed per call. Frontend adds shared `UserAvatar`/`UserMenu` components, `/auth/me` hydration into the zustand store, profile pages, and avatar columns in lists.

**Tech Stack:** NestJS 11 + Drizzle (pg), S3/MinIO, React 19 + Mantine 9 + TanStack Query/Router + Zustand 5, Zod 4.

## Global Constraints

- Tenancy: `companyId` from JWT only; `users` is per-company (cloned via `template-schema.sql`), `candidate_accounts`/`super_admins` are public. No `company_id` columns.
- Error shape `{ error: { code, message } }` via the global filter; multer `LIMIT_FILE_SIZE` → 413 handled already.
- All DB access through repositories (`forCurrentCompany()`/`forPublic()`/`forSchema()`); no direct pool queries outside repositories (e2e cleanup excepted).
- No OOP in frontend; NestJS class shells with functional logic.
- Avatars: PNG/JPEG/WebP only, ≤5MB (multer limit), magic-byte validation server-side; keys `candidate-avatars/<id>/<uuid>.<ext>`, `companies/<companyId>/avatars/<userId>/<uuid>.<ext>`, `platform/avatars/<id>/<uuid>.<ext>`.
- No server-side resize (`ponytail:` browsers scale; add `sharp` only if storage costs matter). No avatar in JWT (`/auth/me` is the source of truth).
- Commit tags `feat(m20): topic`; verify per task with backend `npm run typecheck && npm run lint && npm test` or frontend `npm run lint && npm run build`.
- Migration folder name: `20260816000000_profile_avatars`; append it to the migration-order list in `AGENTS.md` (done in Task 1).

---

### Task 1: Schema columns + migration + template sync

**Files:**
- Modify: `backend/src/database/schema.ts`
- Create: `backend/drizzle/20260816000000_profile_avatars/migration.sql` (via drizzle-kit, contents replaced)
- Modify: `backend/drizzle/template-schema.sql`

**Interfaces:**
- Produces: `users.name: varchar(100) | null`, `users.avatarUrl: varchar(512) | null`, `candidateAccounts.avatarUrl: varchar(512) | null`, `superAdmins.avatarUrl: varchar(512) | null` — consumed by every later task.

- [ ] **Step 1: Add columns to schema.ts**

In `backend/src/database/schema.ts`:

`users` (line 84-92) becomes:
```ts
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('CompanyAdmin').notNull(),
  presetId: uuid('preset_id'),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  name: varchar('name', { length: 100 }),
  avatarUrl: varchar('avatar_url', { length: 512 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

`candidateAccounts` (line 248-258) gains after `resumeUploadedAt`:
```ts
  avatarUrl: varchar('avatar_url', { length: 512 }),
```

`superAdmins` (line 74-80) gains after `name`:
```ts
  avatarUrl: varchar('avatar_url', { length: 512 }),
```

- [ ] **Step 2: Generate the migration**

Run: `cd backend && npx drizzle-kit generate --name=profile_avatars`
Expected: a new folder `backend/drizzle/20260816<timestamp>_profile_avatars/` with `migration.sql` + `snapshot.json`.

- [ ] **Step 3: Replace the generated migration.sql with the schema-loop version**

`users` is a company-scoped table: the master lives in `public`, and every existing company schema plus `template` must get the columns too (same pattern as `20260808090000_platform_user_suspend`). Replace the generated file content with:

```sql
-- Profile avatars & user display names
-- users.name/avatar_url must reach public (master), template, and every
-- provisioned company schema; candidate_accounts and super_admins are public-only.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);

ALTER TABLE public.candidate_accounts
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);

ALTER TABLE public.super_admins
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);

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
      'ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS name VARCHAR(100),
                             ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)',
      schema_name
    );
  END LOOP;
END $$;
```

- [ ] **Step 4: Sync template-schema.sql**

`backend/drizzle/template-schema.sql` — after line 3 (`CREATE TABLE template."users" (LIKE public."users" INCLUDING ALL);`) add the idempotent column lines (belt-and-braces, same style as `candidate_account_id`):

```sql
ALTER TABLE template."users" ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE template."users" ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);
```

- [ ] **Step 5: Append migration to AGENTS.md order**

In `AGENTS.md`, after the `20260815000000_preset_enable_disable` line add:
```text
20260816000000_profile_avatars
```

- [ ] **Step 6: Verify + commit**

Run: `cd backend && npm run typecheck && npm run lint && npm test`
Expected: PASS (no test should reference these columns yet).

```bash
git add backend/src/database/schema.ts backend/drizzle/20260816000000_profile_avatars backend/drizzle/template-schema.sql AGENTS.md
git commit -m "feat(m20): profile avatar columns, migration, template sync"
```

---

### Task 2: StorageService — dual buckets

**Files:**
- Modify: `backend/src/common/storage/storage.service.ts`
- Create: `backend/src/common/storage/storage.service.spec.ts`

**Interfaces:**
- Consumes: existing `STORAGE_PROVIDER` S3Client, `ConfigService`.
- Produces: `upload(key, buffer, contentType, bucket?)`, `get(key, bucket?): Promise<Buffer | null>`, `delete(key, bucket?)` — bucket defaults to the resume bucket, so resume callers are untouched. `S3_AVATAR_BUCKET` env (default `avatars`).

- [ ] **Step 1: Write the failing unit test**

Create `backend/src/common/storage/storage.service.spec.ts`:

```ts
import { StorageService } from './storage.service';

describe('StorageService', () => {
  const sent: Array<{ cmd: string; input: Record<string, unknown> }> = [];
  const client = {
    send: jest.fn(async (cmd: { constructor: { name: string }; input: object }) => {
      if (cmd.constructor.name === 'HeadBucketCommand') throw new Error('NoSuchBucket');
      sent.push({ cmd: cmd.constructor.name, input: cmd.input });
      return {};
    }),
  };
  const config = {
    get: jest.fn((key: string) => (key === 'S3_BUCKET' ? 'resumes' : undefined)),
  };
  let service: StorageService;

  beforeEach(() => {
    sent.length = 0;
    jest.clearAllMocks();
    service = new StorageService(client as never, config as never);
  });

  it('creates both buckets on bootstrap', async () => {
    await service.onApplicationBootstrap();
    const creates = sent.filter((s) => s.cmd === 'CreateBucketCommand');
    expect(creates.map((c) => c.input.Bucket).sort()).toEqual(['avatars', 'resumes']);
  });

  it('routes uploads to the default resume bucket', async () => {
    await service.upload('k', Buffer.from('x'), 'application/pdf');
    const put = sent.find((s) => s.cmd === 'PutObjectCommand');
    expect(put?.input).toMatchObject({ Bucket: 'resumes', Key: 'k' });
  });

  it('routes uploads to the avatar bucket when passed', async () => {
    await service.upload('k', Buffer.from('x'), 'image/png', 'avatars');
    const put = sent.find((s) => s.cmd === 'PutObjectCommand');
    expect(put?.input).toMatchObject({ Bucket: 'avatars', Key: 'k' });
  });

  it('routes get/delete to the avatar bucket when passed', async () => {
    await service.get('k', 'avatars');
    await service.delete('k', 'avatars');
    expect(sent.find((s) => s.cmd === 'GetObjectCommand')?.input).toMatchObject({ Bucket: 'avatars', Key: 'k' });
    expect(sent.find((s) => s.cmd === 'DeleteObjectCommand')?.input).toMatchObject({ Bucket: 'avatars', Key: 'k' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/common/storage/storage.service.spec.ts`
Expected: FAIL — no `S3_AVATAR_BUCKET` handling, `upload` takes 3 args, `onApplicationBootstrap` creates one bucket.

- [ ] **Step 3: Implement dual-bucket StorageService**

Replace the body of `backend/src/common/storage/storage.service.ts` with:

```ts
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { STORAGE_PROVIDER } from './storage.provider';

@Injectable()
export class StorageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly avatarBucket: string;

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly client: S3Client,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'resumes';
    this.avatarBucket = config.get<string>('S3_AVATAR_BUCKET') ?? 'avatars';
  }

  async onApplicationBootstrap() {
    await Promise.all([
      this.ensureBucket(this.bucket),
      this.ensureBucket(this.avatarBucket),
    ]);
  }

  private async ensureBucket(bucket: string) {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      this.logger.log(`Created bucket "${bucket}"`);
    }
  }

  async upload(key: string, buffer: Buffer, contentType: string, bucket = this.bucket) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string, bucket = this.bucket): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async delete(key: string, bucket = this.bucket) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npm test`
Expected: PASS (storage spec + all existing specs).

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/storage
git commit -m "feat(m20): storage service dual buckets (resumes + avatars)"
```

---

### Task 3: AvatarsModule — shared avatar core + serve endpoint

**Files:**
- Create: `backend/src/common/avatars/avatars.service.ts`
- Create: `backend/src/common/avatars/avatars.service.spec.ts`
- Create: `backend/src/common/avatars/avatars.controller.ts`
- Create: `backend/src/common/avatars/avatars.module.ts`

**Interfaces:**
- Consumes: `StorageService` (Task 2), `AuthGuard('jwt')` (AuthCoreModule).
- Produces:
  - `type AvatarActor = { type: 'candidate'; id: string } | { type: 'superAdmin'; id: string } | { type: 'companyUser'; id: string; companyId: string }`
  - `AvatarsService.store(actor, file): Promise<string>` (validates + uploads, returns S3 key)
  - `AvatarsService.get(key): Promise<Buffer | null>`, `AvatarsService.delete(key): Promise<void>`
  - `AvatarsService.isAvatarKey(key): boolean`, `AvatarsService.contentTypeOf(key): string`
  - HTTP `GET /avatars/file?key=...` (authed, `@SkipEnvelope`, raw bytes)

- [ ] **Step 1: Write the failing unit test**

Create `backend/src/common/avatars/avatars.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { AvatarsService } from './avatars.service';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png'),
]);

describe('AvatarsService', () => {
  const storage = { upload: jest.fn(), delete: jest.fn(), get: jest.fn() };
  let service: AvatarsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AvatarsService(storage as never);
  });

  it('stores a png under the candidate key prefix', async () => {
    const key = await service.store({ type: 'candidate', id: 'c1' }, {
      mimetype: 'image/png', buffer: PNG, size: PNG.length,
    } as Express.Multer.File);
    expect(key).toMatch(/^candidate-avatars\/c1\/[0-9a-f-]{36}\.png$/);
    expect(storage.upload).toHaveBeenCalledWith(key, PNG, 'image/png', 'avatars');
  });

  it('stores under the company-user key prefix with the company id', async () => {
    const key = await service.store({ type: 'companyUser', id: 'u1', companyId: 't1' }, {
      mimetype: 'image/png', buffer: PNG, size: PNG.length,
    } as Express.Multer.File);
    expect(key).toMatch(/^companies\/t1\/avatars\/u1\/[0-9a-f-]{36}\.png$/);
  });

  it('stores under the super-admin key prefix', async () => {
    const key = await service.store({ type: 'superAdmin', id: 's1' }, {
      mimetype: 'image/png', buffer: PNG, size: PNG.length,
    } as Express.Multer.File);
    expect(key).toMatch(/^platform\/avatars\/s1\/[0-9a-f-]{36}\.png$/);
  });

  it('rejects an unsupported mime type', async () => {
    await expect(
      service.store({ type: 'candidate', id: 'c1' }, {
        mimetype: 'application/pdf', buffer: Buffer.from('%PDF-'), size: 5,
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects content that does not match the declared mime type', async () => {
    await expect(
      service.store({ type: 'candidate', id: 'c1' }, {
        mimetype: 'image/png', buffer: Buffer.from('not-an-image'), size: 12,
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects oversized files', async () => {
    await expect(
      service.store({ type: 'candidate', id: 'c1' }, {
        mimetype: 'image/png', buffer: Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]),
        size: PNG.length + 6 * 1024 * 1024,
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it('only accepts avatar-shaped keys for serving', () => {
    expect(service.isAvatarKey('candidate-avatars/c1/abc.png')).toBe(true);
    expect(service.isAvatarKey('platform/avatars/s1/abc.jpg')).toBe(true);
    expect(service.isAvatarKey('companies/t1/avatars/u1/abc.webp')).toBe(true);
    expect(service.isAvatarKey('companies/t1/resumes/u1/abc.pdf')).toBe(false);
    expect(service.isAvatarKey('../../etc/passwd')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/common/avatars/avatars.service.spec.ts`
Expected: FAIL — module/file missing.

- [ ] **Step 3: Implement AvatarsService**

Create `backend/src/common/avatars/avatars.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service';

const AVATAR_BUCKET = 'avatars';
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const KEY_PREFIXES = [
  'candidate-avatars/',
  'platform/avatars/',
  /^companies\/[0-9a-f-]{36}\/avatars\//,
] as const;

export type AvatarActor =
  | { type: 'candidate'; id: string }
  | { type: 'superAdmin'; id: string }
  | { type: 'companyUser'; id: string; companyId: string };

@Injectable()
export class AvatarsService {
  constructor(private readonly storage: StorageService) {}

  private assertSupportedType(mimeType: string) {
    if (!(mimeType in AVATAR_EXT)) {
      throw new BadRequestException(
        'Unsupported file type. Only PNG, JPEG and WebP are allowed.',
      );
    }
  }

  private assertSupportedContent(buffer: Buffer, mimeType: string) {
    const ok =
      mimeType === 'image/png'
        ? buffer
            .subarray(0, 8)
            .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : mimeType === 'image/jpeg'
          ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
          : mimeType === 'image/webp'
            ? buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
              buffer.subarray(8, 12).toString('ascii') === 'WEBP'
            : false;
    if (!ok) {
      throw new BadRequestException(
        'File content does not match an allowed image type (PNG, JPEG or WebP)',
      );
    }
  }

  // ponytail: no server-side resize — the 5MB cap + browser scaling suffice;
  // add `sharp` (resize + re-encode) only if storage/bandwidth costs matter.
  async store(actor: AvatarActor, file: Express.Multer.File): Promise<string> {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException('Avatar must be 5MB or smaller');
    }
    this.assertSupportedType(file.mimetype);
    this.assertSupportedContent(file.buffer, file.mimetype);

    const prefix =
      actor.type === 'candidate'
        ? `candidate-avatars/${actor.id}`
        : actor.type === 'superAdmin'
          ? `platform/avatars/${actor.id}`
          : `companies/${actor.companyId}/avatars/${actor.id}`;
    const key = `${prefix}/${randomUUID()}.${AVATAR_EXT[file.mimetype]}`;
    await this.storage.upload(key, file.buffer, file.mimetype, AVATAR_BUCKET);
    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    return this.storage.get(key, AVATAR_BUCKET);
  }

  async delete(key: string) {
    await this.storage.delete(key, AVATAR_BUCKET);
  }

  // Restricts the generic serve endpoint to avatar-shaped keys so it can never
  // be used to read resumes or arbitrary objects.
  isAvatarKey(key: string): boolean {
    return KEY_PREFIXES.some((prefix) =>
      typeof prefix === 'string' ? key.startsWith(prefix) : prefix.test(key),
    );
  }

  contentTypeOf(key: string): string {
    if (key.endsWith('.png')) return 'image/png';
    if (key.endsWith('.jpg')) return 'image/jpeg';
    if (key.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }
}
```

- [ ] **Step 4: Implement the serve controller**

Create `backend/src/common/avatars/avatars.controller.ts`:

```ts
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { SkipEnvelope } from '../decorators/skip-envelope.decorator';
import { AvatarsService } from './avatars.service';

@Controller('avatars')
export class AvatarsController {
  constructor(private readonly avatarsService: AvatarsService) {}

  @Get('file')
  @UseGuards(AuthGuard('jwt'))
  @SkipEnvelope()
  async file(@Query('key') key: string | undefined, @Res() res: Response) {
    if (!key || !this.avatarsService.isAvatarKey(key)) {
      throw new BadRequestException('Invalid avatar key');
    }
    const buffer = await this.avatarsService.get(key);
    if (!buffer) throw new NotFoundException('Avatar not found');
    res.setHeader('Content-Type', this.avatarsService.contentTypeOf(key));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }
}
```

- [ ] **Step 5: Implement the module**

Create `backend/src/common/avatars/avatars.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { StorageModule } from '../storage/storage.module';
import { AvatarsController } from './avatars.controller';
import { AvatarsService } from './avatars.service';

@Module({
  imports: [AuthCoreModule, StorageModule],
  controllers: [AvatarsController],
  providers: [AvatarsService],
  exports: [AvatarsService],
})
export class AvatarsModule {}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd backend && npx jest src/common/avatars && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/common/avatars
git commit -m "feat(m20): shared avatars module (store/validate/serve)"
```

---

### Task 4: Repositories + list mappings gain name/avatarUrl

**Files:**
- Modify: `backend/src/repositories/user.repository.ts`
- Modify: `backend/src/repositories/candidate-account.repository.ts`
- Modify: `backend/src/repositories/super-admin.repository.ts`
- Modify: `backend/src/repositories/candidate.repository.ts`
- Modify: `backend/src/modules/candidates/candidates.service.ts`
- Modify: `backend/src/modules/platform/platform-accounts.service.ts`
- Modify: `backend/src/modules/company/company-users.service.ts`

**Interfaces:**
- Consumes: schema columns from Task 1.
- Produces:
  - `userRepo.findAll()` rows include `name`, `avatarUrl`
  - `userRepo.create(data)` accepts `name?: string | null`
  - `userRepo.updateName(id, name: string): Promise<row>`, `userRepo.updateAvatarUrl(id, avatarUrl: string | null)`
  - `candidateAccountRepo.findAll()` rows include `avatarUrl`; `candidateAccountRepo.updateAvatarUrl(id, avatarUrl: string | null)`
  - `superAdminRepo.findById(id)`, `superAdminRepo.updateName(id, name)`, `superAdminRepo.updateAvatarUrl(id, avatarUrl)`
  - `candidateRepo.findPaginated`/`findAllFiltered` rows include `avatarUrl` (left-join `candidate_accounts`)
  - `candidates.service.getOne()` returns `avatarUrl`
  - `platform-accounts.service.collectAllUsers()` rows include `name` (company users) + `avatarUrl` (both)
  - `company-users.service.exportCsv()` CSV columns include `name`

- [ ] **Step 1: user.repository.ts**

- `findAll` select block gains:
```ts
          name: users.name,
          avatarUrl: users.avatarUrl,
```
- `create` data type gains `name?: string | null;` and pass-through unchanged (Drizzle ignores undefined keys).
- Add two methods:
```ts
  async updateName(id: string, name: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ name })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateAvatarUrl(id: string, avatarUrl: string | null, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ avatarUrl })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
```

- [ ] **Step 2: candidate-account.repository.ts**

- `findAll` select gains `avatarUrl: candidateAccounts.avatarUrl,`.
- Add:
```ts
  async updateAvatarUrl(id: string, avatarUrl: string | null) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(candidateAccounts)
        .set({ avatarUrl })
        .where(eq(candidateAccounts.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
```

- [ ] **Step 3: super-admin.repository.ts**

Add `findById`, `updateName`, `updateAvatarUrl`:
```ts
  async findById(id: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(superAdmins)
        .where(eq(superAdmins.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateName(id: string, name: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(superAdmins)
        .set({ name })
        .where(eq(superAdmins.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateAvatarUrl(id: string, avatarUrl: string | null) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(superAdmins)
        .set({ avatarUrl })
        .where(eq(superAdmins.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
```

- [ ] **Step 4: candidate.repository.ts — join avatarUrl into list queries**

Import `candidateAccounts` from schema, and replace `findPaginated` and `findAllFiltered` select statements with explicit selects + left join (`public.candidate_accounts` resolves via search_path — same connection, no schema hop needed):

```ts
import { candidates, candidateAccounts } from '../database/schema';
import { eq } from 'drizzle-orm';

const CANDIDATE_SELECT = {
  id: candidates.id,
  name: candidates.name,
  email: candidates.email,
  phone: candidates.phone,
  candidateAccountId: candidates.candidateAccountId,
  createdAt: candidates.createdAt,
  avatarUrl: candidateAccounts.avatarUrl,
};
```
(`eq` is already imported.)

- `findPaginated`: replace `.select()` with `.select(CANDIDATE_SELECT)` and add after `.from(candidates)`:
```ts
          .leftJoin(candidateAccounts, eq(candidates.candidateAccountId, candidateAccounts.id))
```
- `findAllFiltered`: same select + join.
- `findById` stays as-is (spreads full row; `getOne` resolves avatarUrl in the service).

- [ ] **Step 5: candidates.service.ts — getOne gains avatarUrl**

In `getOne`, both `account` branches already build `resume`; add the avatar alongside. After the `if (candidate.candidateAccountId) {...}` block and the `else if` block, add before the final `return`:

```ts
    const avatarUrl =
      (candidate.candidateAccountId
        ? await this.candidateAccountRepo
            .findById(candidate.candidateAccountId)
            .then((a) => a?.avatarUrl ?? null)
            .catch(() => null)
        : null) ??
      (candidate.email
        ? await this.candidateAccountRepo
            .findByEmail(candidate.email)
            .then((a) => a?.avatarUrl ?? null)
            .catch(() => null)
        : null);
```
Then extend the return object:
```ts
    return {
      ...candidate,
      avatarUrl,
      resume,
      skills,
      applications,
    };
```
(ponytail: the getOne avatar lookup duplicates the account fetch — fine, it's a per-row modal fetch, not a hot path.)

- [ ] **Step 6: platform-accounts.service.ts — collectAllUsers gains name/avatarUrl**

In `collectAllUsers` (line 296-345):
- `companyUsers` array type gains `name: string | null; avatarUrl: string | null;` and each pushed row gains `name: user.name ?? null, avatarUrl: user.avatarUrl ?? null,`.
- `candidateRows` map gains `avatarUrl: c.avatarUrl ?? null,`.

- [ ] **Step 7: company-users.service.ts — CSV gains name**

Replace line 43:
```ts
    return toCsv(['name', 'email', 'role', 'status', 'createdAt'], rows);
```

- [ ] **Step 8: Verify + commit**

Run: `cd backend && npm run typecheck && npm run lint && npm test`
Expected: PASS (platform-accounts.service.spec.ts `merges company users` assertion may need its mock rows to include the new fields — update the mock fixtures in that spec so the merged output matches; candidates.service.spec.ts may need the same for `findPaginated` row shapes).

```bash
git add backend/src/repositories backend/src/modules/candidates backend/src/modules/platform backend/src/modules/company
git commit -m "feat(m20): name/avatarUrl in user, candidate, and platform list mappings"
```

---

### Task 5: GET /auth/me

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `userRepo.findById`, `candidateAccountRepo.findById`, `superAdminRepo.findById` (Task 4).
- Produces: `GET /auth/me` (authed) → `{ id, role, companyId, email, name, avatarUrl }` — name/avatarUrl nullable.

- [ ] **Step 1: Add failing tests to auth.service.spec.ts**

Append a `describe('me', ...)` block and extend the mocks at the top of the file:

```ts
  const userRepo = { findByEmail: jest.fn(), findById: jest.fn() };
  const candidateAccountRepo = { findByEmail: jest.fn(), create: jest.fn(), findById: jest.fn() };
  const superAdminRepo = { findByEmail: jest.fn(), findById: jest.fn() };
```

Tests:
```ts
  describe('me', () => {
    it('returns a candidate profile composed from first/last name', async () => {
      candidateAccountRepo.findById.mockResolvedValue({
        id: 'c1', email: 'jane@test.com',
        firstName: 'Jane', lastName: 'Doe', avatarUrl: 'candidate-avatars/c1/x.png',
      });
      const result = await service.me({ companyId: 'public', userId: 'c1', role: 'Candidate' });
      expect(result).toMatchObject({
        id: 'c1', role: 'Candidate', companyId: null,
        email: 'jane@test.com', name: 'Jane Doe', avatarUrl: 'candidate-avatars/c1/x.png',
      });
    });

    it('returns a company user profile with the users.name column', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u1', email: 'rec@acme.com', role: 'Recruiter',
        name: 'Ada Lovelace', avatarUrl: null,
      });
      const result = await service.me({ companyId: 't1', userId: 'u1', role: 'Recruiter' });
      expect(result).toMatchObject({
        id: 'u1', role: 'Recruiter', companyId: 't1',
        email: 'rec@acme.com', name: 'Ada Lovelace', avatarUrl: null,
      });
    });

    it('returns a super admin profile', async () => {
      superAdminRepo.findById.mockResolvedValue({
        id: 's1', email: 'sa@talentpipe.com', name: 'Super Admin', avatarUrl: 'platform/avatars/s1/x.png',
      });
      const result = await service.me({ companyId: 'public', userId: 's1', role: 'SuperAdmin' });
      expect(result).toMatchObject({
        id: 's1', role: 'SuperAdmin', companyId: null,
        email: 'sa@talentpipe.com', name: 'Super Admin', avatarUrl: 'platform/avatars/s1/x.png',
      });
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts`
Expected: FAIL — `me` does not exist.

- [ ] **Step 3: Implement AuthService.me**

In `backend/src/modules/auth/auth.service.ts` add a `me` method:

```ts
  async me(ctx: CompanyContext) {
    if (ctx.role === 'Candidate') {
      const account = await this.candidateAccountRepo.findById(ctx.userId);
      if (!account) throw new UnauthorizedException('Account not found');
      return {
        id: account.id,
        role: 'Candidate',
        companyId: null,
        email: account.email,
        name: `${account.firstName} ${account.lastName}`.trim(),
        avatarUrl: account.avatarUrl ?? null,
      };
    }

    if (ctx.role === 'SuperAdmin') {
      const admin = await this.superAdminRepo.findById(ctx.userId);
      if (!admin) throw new UnauthorizedException('Account not found');
      return {
        id: admin.id,
        role: 'SuperAdmin',
        companyId: null,
        email: admin.email,
        name: admin.name ?? null,
        avatarUrl: admin.avatarUrl ?? null,
      };
    }

    const user = await this.userRepo.findById(ctx.userId);
    if (!user) throw new UnauthorizedException('Account not found');
    return {
      id: user.id,
      role: user.role,
      companyId: ctx.companyId,
      email: user.email,
      name: user.name ?? null,
      avatarUrl: user.avatarUrl ?? null,
    };
  }
```
(`CompanyContext` is already imported in auth.service.ts? If not, add `import { CompanyContext } from '../../common/context/company-context';`.)

- [ ] **Step 4: Add the controller endpoint**

In `backend/src/modules/auth/auth.controller.ts` add `Get` to the imports and:

```ts
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@CurrentUser() user: CompanyContext) {
    return this.authService.me(user);
  }
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd backend && npx jest src/modules/auth && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/auth
git commit -m "feat(m20): GET /auth/me returns profile for all roles"
```

---

### Task 6: Candidate avatar endpoints

**Files:**
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.module.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.spec.ts`

**Interfaces:**
- Consumes: `AvatarsService` (Task 3), `candidateAccountRepo.updateAvatarUrl` (Task 4).
- Produces: `POST /candidate/profile/avatar` (multipart `file`, 5MB) → `{ avatarUrl }`; `DELETE /candidate/profile/avatar` → `{ avatarUrl: null }`; `GET /candidate/profile` gains `avatarUrl`.

- [ ] **Step 1: Add failing tests to candidate-account.service.spec.ts**

- Add mock near the other repo mocks:
```ts
  const avatarsService = { store: jest.fn(), delete: jest.fn() };
```
- Register `{ provide: AvatarsService, useValue: avatarsService }` in the TestingModule providers (import `AvatarsService` from `../../common/avatars/avatars.service`).
- Extend the `candidateAccountRepo` mock with `updateAvatarUrl: jest.fn()` and make `findById` return `{ avatarUrl: null, ... }` shaped rows as needed.

Tests (append to the describe):
```ts
  describe('avatar', () => {
    it('uploads an avatar, persists the key, and deletes the old object', async () => {
      candidateAccountRepo.findById.mockResolvedValue({ id: 'c1', avatarUrl: 'candidate-avatars/c1/old.png' });
      avatarsService.store.mockResolvedValue('candidate-avatars/c1/new.png');
      candidateAccountRepo.updateAvatarUrl.mockResolvedValue({ id: 'c1', avatarUrl: 'candidate-avatars/c1/new.png' });

      const result = await service.uploadAvatar('c1', { mimetype: 'image/png' } as Express.Multer.File);

      expect(avatarsService.store).toHaveBeenCalledWith({ type: 'candidate', id: 'c1' }, { mimetype: 'image/png' });
      expect(avatarsService.delete).toHaveBeenCalledWith('candidate-avatars/c1/old.png');
      expect(candidateAccountRepo.updateAvatarUrl).toHaveBeenCalledWith('c1', 'candidate-avatars/c1/new.png');
      expect(result).toEqual({ avatarUrl: 'candidate-avatars/c1/new.png' });
    });

    it('removes an avatar: deletes the object and nulls the column', async () => {
      candidateAccountRepo.findById.mockResolvedValue({ id: 'c1', avatarUrl: 'candidate-avatars/c1/x.png' });
      candidateAccountRepo.updateAvatarUrl.mockResolvedValue({ id: 'c1', avatarUrl: null });

      const result = await service.removeAvatar('c1');

      expect(avatarsService.delete).toHaveBeenCalledWith('candidate-avatars/c1/x.png');
      expect(candidateAccountRepo.updateAvatarUrl).toHaveBeenCalledWith('c1', null);
      expect(result).toEqual({ avatarUrl: null });
    });
  });
```
(Adjust to the actual mock row shapes already used in that spec file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/candidate-account`
Expected: FAIL — `uploadAvatar`/`removeAvatar` missing.

- [ ] **Step 3: Implement service methods**

In `backend/src/modules/candidate-account/candidate-account.service.ts`:
- Add `import { AvatarsService } from '../../common/avatars/avatars.service';`
- Add `private readonly avatarsService: AvatarsService` to the constructor.
- `getProfile` return object gains `avatarUrl: account.avatarUrl ?? null,` (after `resumeUploadedAt`).
- Add methods:
```ts
  async uploadAvatar(candidateAccountId: string, file: Express.Multer.File) {
    const account = await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');
    const key = await this.avatarsService.store(
      { type: 'candidate', id: candidateAccountId },
      file,
    );
    if (account.avatarUrl) await this.avatarsService.delete(account.avatarUrl);
    const updated = await this.candidateAccountRepo.updateAvatarUrl(
      candidateAccountId,
      key,
    );
    if (!updated) throw new NotFoundException('Candidate account not found');
    return { avatarUrl: updated.avatarUrl };
  }

  async removeAvatar(candidateAccountId: string) {
    const account = await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');
    if (account.avatarUrl) await this.avatarsService.delete(account.avatarUrl);
    await this.candidateAccountRepo.updateAvatarUrl(candidateAccountId, null);
    return { avatarUrl: null };
  }
```

- [ ] **Step 4: Add controller endpoints**

In `candidate-account.controller.ts` (imports for Post/Delete already exist; `FileInterceptor` already imported):

```ts
  @Post('profile/avatar')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.uploadAvatar(user.userId, file);
  }

  @Delete('profile/avatar')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async removeAvatar(@CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.removeAvatar(user.userId);
  }
```

- [ ] **Step 5: Register AvatarsModule**

In `candidate-account.module.ts` imports add `AvatarsModule` (import from `../../common/avatars/avatars.module`).

- [ ] **Step 6: Run tests + typecheck**

Run: `cd backend && npx jest src/modules/candidate-account && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/candidate-account
git commit -m "feat(m20): candidate profile avatar upload/remove"
```

---

### Task 7: Company profile endpoints

**Files:**
- Create: `backend/src/modules/company/company-profile.controller.ts`
- Create: `backend/src/modules/company/company-profile.service.ts`
- Create: `backend/src/modules/company/company-profile.service.spec.ts`
- Create: `backend/src/modules/company/dto/update-profile.dto.ts`
- Modify: `backend/src/modules/company/company.module.ts`

**Interfaces:**
- Consumes: `userRepo.findById/updateName/updateAvatarUrl` (Task 4), `AvatarsService` (Task 3), `getCurrentUser()`/`getCompanyId()` context.
- Produces: `GET /company/profile` → `{ id, email, role, name, avatarUrl, status }`; `PUT /company/profile` body `{ name?: string }`; `POST /company/profile/avatar` (multipart `file`) → `{ avatarUrl }`; `DELETE /company/profile/avatar` → `{ avatarUrl: null }`. Guarded for all internal roles (`CompanyAdmin`, `Recruiter`, `HiringManager`, `Interviewer`).

- [ ] **Step 1: Write the failing unit test**

Create `backend/src/modules/company/company-profile.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/company-context';
import { UserRepository } from '../../repositories/user.repository';
import { AvatarsService } from '../../common/avatars/avatars.service';
import { CompanyProfileService } from './company-profile.service';

describe('CompanyProfileService', () => {
  let service: CompanyProfileService;
  const userRepo = {
    findById: jest.fn(),
    updateName: jest.fn(),
    updateAvatarUrl: jest.fn(),
  };
  const avatarsService = { store: jest.fn(), delete: jest.fn() };

  const run = <T>(fn: () => Promise<T>): Promise<T> =>
    asyncStorage.run({ companyId: 't1', userId: 'u1', role: 'Recruiter' }, fn);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyProfileService,
        { provide: UserRepository, useValue: userRepo },
        { provide: AvatarsService, useValue: avatarsService },
      ],
    }).compile();
    service = module.get(CompanyProfileService);
  });

  it('returns the current user profile', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'u1', email: 'rec@acme.com', role: 'Recruiter',
      name: 'Ada Lovelace', avatarUrl: null, status: 'active',
    });
    const result = await run(() => service.get());
    expect(result).toMatchObject({ id: 'u1', name: 'Ada Lovelace', avatarUrl: null });
  });

  it('updates the display name', async () => {
    userRepo.updateName.mockResolvedValue({
      id: 'u1', email: 'rec@acme.com', role: 'Recruiter',
      name: 'Grace Hopper', avatarUrl: null, status: 'active',
    });
    const result = await run(() => service.update({ name: 'Grace Hopper' }));
    expect(userRepo.updateName).toHaveBeenCalledWith('u1', 'Grace Hopper');
    expect(result.name).toBe('Grace Hopper');
  });

  it('uploads an avatar with the company-scoped key and deletes the old object', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'u1', email: 'rec@acme.com', role: 'Recruiter',
      name: 'Ada', avatarUrl: 'companies/t1/avatars/u1/old.png', status: 'active',
    });
    avatarsService.store.mockResolvedValue('companies/t1/avatars/u1/new.png');
    userRepo.updateAvatarUrl.mockResolvedValue({
      id: 'u1', email: 'rec@acme.com', role: 'Recruiter',
      name: 'Ada', avatarUrl: 'companies/t1/avatars/u1/new.png', status: 'active',
    });

    const result = await run(() => service.uploadAvatar({ mimetype: 'image/png' } as Express.Multer.File));

    expect(avatarsService.store).toHaveBeenCalledWith(
      { type: 'companyUser', id: 'u1', companyId: 't1' },
      { mimetype: 'image/png' },
    );
    expect(avatarsService.delete).toHaveBeenCalledWith('companies/t1/avatars/u1/old.png');
    expect(userRepo.updateAvatarUrl).toHaveBeenCalledWith('u1', 'companies/t1/avatars/u1/new.png');
    expect(result).toEqual({ avatarUrl: 'companies/t1/avatars/u1/new.png' });
  });

  it('removes the avatar', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'u1', email: 'rec@acme.com', role: 'Recruiter',
      name: 'Ada', avatarUrl: 'companies/t1/avatars/u1/x.png', status: 'active',
    });
    const result = await run(() => service.removeAvatar());
    expect(avatarsService.delete).toHaveBeenCalledWith('companies/t1/avatars/u1/x.png');
    expect(userRepo.updateAvatarUrl).toHaveBeenCalledWith('u1', null);
    expect(result).toEqual({ avatarUrl: null });
  });

  it('404s when the user row is gone', async () => {
    userRepo.findById.mockResolvedValue(null);
    await expect(run(() => service.get())).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/company/company-profile.service.spec.ts`
Expected: FAIL — files missing.

- [ ] **Step 3: Implement DTO**

Create `backend/src/modules/company/dto/update-profile.dto.ts`:
```ts
import { z } from 'zod';

export const UpdateCompanyProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(100).optional(),
});
export type UpdateCompanyProfileDto = z.infer<typeof UpdateCompanyProfileSchema>;
```

- [ ] **Step 4: Implement the service**

Create `backend/src/modules/company/company-profile.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  getCompanyId,
  getCurrentUser,
} from '../../common/context/company-context';
import { AvatarsService } from '../../common/avatars/avatars.service';
import { UserRepository } from '../../repositories/user.repository';
import { UpdateCompanyProfileDto } from './dto/update-profile.dto';

interface ProfileRow {
  id: string;
  email: string;
  role: string;
  name: string | null;
  avatarUrl: string | null;
  status: string;
}

@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly avatarsService: AvatarsService,
  ) {}

  private async requireSelf(): Promise<ProfileRow> {
    const user = await this.userRepo.findById(getCurrentUser().userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private map(user: ProfileRow) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      avatarUrl: user.avatarUrl,
      status: user.status,
    };
  }

  async get() {
    return this.map(await this.requireSelf());
  }

  async update(dto: UpdateCompanyProfileDto) {
    const user = await this.requireSelf();
    if (dto.name === undefined) return this.map(user);
    const updated = await this.userRepo.updateName(user.id, dto.name);
    if (!updated) throw new NotFoundException('User not found');
    return this.map(updated);
  }

  async uploadAvatar(file: Express.Multer.File) {
    const user = await this.requireSelf();
    const key = await this.avatarsService.store(
      { type: 'companyUser', id: user.id, companyId: getCompanyId() },
      file,
    );
    if (user.avatarUrl) await this.avatarsService.delete(user.avatarUrl);
    const updated = await this.userRepo.updateAvatarUrl(user.id, key);
    if (!updated) throw new NotFoundException('User not found');
    return { avatarUrl: updated.avatarUrl };
  }

  async removeAvatar() {
    const user = await this.requireSelf();
    if (user.avatarUrl) await this.avatarsService.delete(user.avatarUrl);
    await this.userRepo.updateAvatarUrl(user.id, null);
    return { avatarUrl: null };
  }
}
```

- [ ] **Step 5: Implement the controller**

Create `backend/src/modules/company/company-profile.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyProfileService } from './company-profile.service';
import {
  UpdateCompanyProfileSchema,
  UpdateCompanyProfileDto,
} from './dto/update-profile.dto';

const INTERNAL_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager', 'Interviewer'];

@Controller('company/profile')
@UseGuards(AuthGuard('jwt'))
@Roles(...INTERNAL_ROLES)
export class CompanyProfileController {
  constructor(private readonly profileService: CompanyProfileService) {}

  @Get()
  get() {
    return this.profileService.get();
  }

  @Put()
  update(
    @Body(new ZodValidationPipe(UpdateCompanyProfileSchema)) dto: UpdateCompanyProfileDto,
  ) {
    return this.profileService.update(dto);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    return this.profileService.uploadAvatar(file);
  }

  @Delete('avatar')
  removeAvatar() {
    return this.profileService.removeAvatar();
  }
}
```

- [ ] **Step 6: Register in company.module.ts**

- imports: add `AvatarsModule` (from `../../common/avatars/avatars.module`).
- controllers: add `CompanyProfileController`.
- providers: add `CompanyProfileService`.

- [ ] **Step 7: Run tests + typecheck**

Run: `cd backend && npx jest src/modules/company && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/company
git commit -m "feat(m20): company user profile endpoints (name + avatar)"
```

---

### Task 8: SuperAdmin profile endpoints

**Files:**
- Create: `backend/src/modules/platform/platform-profile.controller.ts`
- Create: `backend/src/modules/platform/platform-profile.service.ts`
- Create: `backend/src/modules/platform/platform-profile.service.spec.ts`
- Create: `backend/src/modules/platform/dto/update-profile.dto.ts`
- Modify: `backend/src/modules/platform/platform.module.ts`

**Interfaces:**
- Consumes: `superAdminRepo.findById/updateName/updateAvatarUrl` (Task 4), `AvatarsService` (Task 3).
- Produces: `GET /platform/profile`, `PUT /platform/profile` `{ name?: string }`, `POST /platform/profile/avatar`, `DELETE /platform/profile/avatar` — same response shapes as Task 7, guarded `@Roles('SuperAdmin')`.

- [ ] **Step 1: Write the failing unit test**

Create `backend/src/modules/platform/platform-profile.service.spec.ts` (same shape as Task 7, but no asyncStorage company id — SuperAdmin context is `{ companyId: 'public', userId: 's1', role: 'SuperAdmin' }`):

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/company-context';
import { SuperAdminRepository } from '../../repositories/super-admin.repository';
import { AvatarsService } from '../../common/avatars/avatars.service';
import { PlatformProfileService } from './platform-profile.service';

describe('PlatformProfileService', () => {
  let service: PlatformProfileService;
  const superAdminRepo = {
    findById: jest.fn(),
    updateName: jest.fn(),
    updateAvatarUrl: jest.fn(),
  };
  const avatarsService = { store: jest.fn(), delete: jest.fn() };

  const run = <T>(fn: () => Promise<T>): Promise<T> =>
    asyncStorage.run({ companyId: 'public', userId: 's1', role: 'SuperAdmin' }, fn);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformProfileService,
        { provide: SuperAdminRepository, useValue: superAdminRepo },
        { provide: AvatarsService, useValue: avatarsService },
      ],
    }).compile();
    service = module.get(PlatformProfileService);
  });

  it('returns the super admin profile', async () => {
    superAdminRepo.findById.mockResolvedValue({
      id: 's1', email: 'sa@talentpipe.com', name: 'Super Admin',
      avatarUrl: 'platform/avatars/s1/x.png',
    });
    const result = await run(() => service.get());
    expect(result).toMatchObject({ id: 's1', name: 'Super Admin', avatarUrl: 'platform/avatars/s1/x.png' });
  });

  it('uploads an avatar under the platform key prefix', async () => {
    superAdminRepo.findById.mockResolvedValue({
      id: 's1', email: 'sa@talentpipe.com', name: 'Super Admin', avatarUrl: null,
    });
    avatarsService.store.mockResolvedValue('platform/avatars/s1/new.png');
    superAdminRepo.updateAvatarUrl.mockResolvedValue({
      id: 's1', email: 'sa@talentpipe.com', name: 'Super Admin', avatarUrl: 'platform/avatars/s1/new.png',
    });

    const result = await run(() => service.uploadAvatar({ mimetype: 'image/png' } as Express.Multer.File));

    expect(avatarsService.store).toHaveBeenCalledWith(
      { type: 'superAdmin', id: 's1' },
      { mimetype: 'image/png' },
    );
    expect(superAdminRepo.updateAvatarUrl).toHaveBeenCalledWith('s1', 'platform/avatars/s1/new.png');
    expect(result).toEqual({ avatarUrl: 'platform/avatars/s1/new.png' });
  });

  it('removes the avatar', async () => {
    superAdminRepo.findById.mockResolvedValue({
      id: 's1', email: 'sa@talentpipe.com', name: 'Super Admin', avatarUrl: 'platform/avatars/s1/x.png',
    });
    const result = await run(() => service.removeAvatar());
    expect(avatarsService.delete).toHaveBeenCalledWith('platform/avatars/s1/x.png');
    expect(superAdminRepo.updateAvatarUrl).toHaveBeenCalledWith('s1', null);
    expect(result).toEqual({ avatarUrl: null });
  });

  it('404s when the admin row is gone', async () => {
    superAdminRepo.findById.mockResolvedValue(null);
    await expect(run(() => service.get())).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/platform/platform-profile.service.spec.ts`
Expected: FAIL — files missing.

- [ ] **Step 3: Implement DTO**

Create `backend/src/modules/platform/dto/update-profile.dto.ts`:
```ts
import { z } from 'zod';

export const UpdatePlatformProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(100).optional(),
});
export type UpdatePlatformProfileDto = z.infer<typeof UpdatePlatformProfileSchema>;
```

- [ ] **Step 4: Implement the service**

Create `backend/src/modules/platform/platform-profile.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { getCurrentUser } from '../../common/context/company-context';
import { AvatarsService } from '../../common/avatars/avatars.service';
import { SuperAdminRepository } from '../../repositories/super-admin.repository';
import { UpdatePlatformProfileDto } from './dto/update-profile.dto';

@Injectable()
export class PlatformProfileService {
  constructor(
    private readonly superAdminRepo: SuperAdminRepository,
    private readonly avatarsService: AvatarsService,
  ) {}

  private async requireSelf() {
    const admin = await this.superAdminRepo.findById(getCurrentUser().userId);
    if (!admin) throw new NotFoundException('SuperAdmin not found');
    return admin;
  }

  private map(admin: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  }) {
    return {
      id: admin.id,
      email: admin.email,
      role: 'SuperAdmin',
      name: admin.name,
      avatarUrl: admin.avatarUrl,
    };
  }

  async get() {
    return this.map(await this.requireSelf());
  }

  async update(dto: UpdatePlatformProfileDto) {
    const admin = await this.requireSelf();
    if (dto.name === undefined) return this.map(admin);
    const updated = await this.superAdminRepo.updateName(admin.id, dto.name);
    if (!updated) throw new NotFoundException('SuperAdmin not found');
    return this.map(updated);
  }

  async uploadAvatar(file: Express.Multer.File) {
    const admin = await this.requireSelf();
    const key = await this.avatarsService.store(
      { type: 'superAdmin', id: admin.id },
      file,
    );
    if (admin.avatarUrl) await this.avatarsService.delete(admin.avatarUrl);
    const updated = await this.superAdminRepo.updateAvatarUrl(admin.id, key);
    if (!updated) throw new NotFoundException('SuperAdmin not found');
    return { avatarUrl: updated.avatarUrl };
  }

  async removeAvatar() {
    const admin = await this.requireSelf();
    if (admin.avatarUrl) await this.avatarsService.delete(admin.avatarUrl);
    await this.superAdminRepo.updateAvatarUrl(admin.id, null);
    return { avatarUrl: null };
  }
}
```

- [ ] **Step 5: Implement the controller**

Create `backend/src/modules/platform/platform-profile.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformProfileService } from './platform-profile.service';
import {
  UpdatePlatformProfileSchema,
  UpdatePlatformProfileDto,
} from './dto/update-profile.dto';

@Controller('platform/profile')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformProfileController {
  constructor(private readonly profileService: PlatformProfileService) {}

  @Get()
  get() {
    return this.profileService.get();
  }

  @Put()
  update(
    @Body(new ZodValidationPipe(UpdatePlatformProfileSchema)) dto: UpdatePlatformProfileDto,
  ) {
    return this.profileService.update(dto);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    return this.profileService.uploadAvatar(file);
  }

  @Delete('avatar')
  removeAvatar() {
    return this.profileService.removeAvatar();
  }
}
```

- [ ] **Step 6: Register in platform.module.ts**

- imports: add `AvatarsModule`.
- controllers: add `PlatformProfileController`.
- providers: add `PlatformProfileService`.

- [ ] **Step 7: Run tests + typecheck**

Run: `cd backend && npx jest src/modules/platform && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/platform
git commit -m "feat(m20): super admin profile endpoints (name + avatar)"
```

---

### Task 9: Seed display names

**Files:**
- Modify: `backend/scripts/seed.ts`

**Interfaces:**
- Produces: sample company users carry readable `name` values so initials fallbacks look right.

- [ ] **Step 1: Extend createUser with a name param**

`createUser` (line 194) signature becomes `(client, companyId, email, role, password, name?: string)` and the insert becomes:

```ts
  await client.query(
    `INSERT INTO "company_${companyId}"."users" (id, email, password_hash, role, name)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, email, passwordHash, role, name ?? null],
  );
```

- [ ] **Step 2: Pass names at the call sites**

In `seedCompany` (line 466-476), add a `SEED_NAMES` list at module scope near `SUPERADMINS`:

```ts
const SEED_NAMES = [
  'Ada Lovelace',
  'Grace Hopper',
  'Katherine Johnson',
  'Alan Turing',
  'Edsger Dijkstra',
  'Linus Torvalds',
  'Margaret Hamilton',
];
```

And update the calls to consume it (they are created in a fixed order: admin, 2 interviewers, 2 hiring managers, 2 recruiters):

```ts
  const adminId = await createUser(client, companyId, company.adminEmail, 'CompanyAdmin', 'Admin123!', SEED_NAMES[0]);
  const interviewers = [
    await createUser(client, companyId, `iv1@${company.slug}.com`, 'Interviewer', 'Interviewer123!', SEED_NAMES[1]),
    await createUser(client, companyId, `iv2@${company.slug}.com`, 'Interviewer', 'Interviewer123!', SEED_NAMES[2]),
  ];
  for (let i = 1; i <= 2; i++) {
    await createUser(client, companyId, `hm${i}@${company.slug}.com`, 'HiringManager', 'HiringManager123!', SEED_NAMES[2 + i]);
  }
  for (let i = 1; i <= 2; i++) {
    await createUser(client, companyId, `rec${i}@${company.slug}.com`, 'Recruiter', 'Recruiter123!', SEED_NAMES[4 + i]);
  }
```

- [ ] **Step 3: Verify + commit**

Run: `cd backend && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add backend/scripts/seed.ts
git commit -m "feat(m20): seed display names for company users"
```

---

### Task 10: Frontend base — authApi.me, useAuth profile, useAvatarBlob, UserAvatar, UserMenu

**Files:**
- Modify: `frontend/src/api/authApi.ts`
- Modify: `frontend/src/api/useAuth.ts`
- Modify: `frontend/src/api/queryKeys.ts`
- Create: `frontend/src/shared/hooks/useAvatarBlob.ts`
- Create: `frontend/src/shared/components/UserAvatar.tsx`
- Create: `frontend/src/shared/components/UserMenu.tsx`

**Interfaces:**
- Consumes: `GET /auth/me`, `GET /avatars/file?key=` (Tasks 3, 5).
- Produces:
  - `useAuthStore.profile: { name: string | null; email: string | null; avatarUrl: string | null } | null`, `setProfile`
  - `UserAvatar({ name?, avatarUrl?, size?, color? })` — photo → initials → `U`
  - `UserMenu({ profilePath, roleLabel })` — avatar button + Profile/Logout dropdown
  - `useAvatarBlob(avatarUrl?)` — cached blob URL for one avatar key
  - `queryKeys.avatar(key)`, `queryKeys.company.profile()`, `queryKeys.platform.profile()`

- [ ] **Step 1: authApi.me + query keys**

`frontend/src/api/authApi.ts` add:
```ts
  me: () => apiClient.get('/auth/me'),
```

`frontend/src/api/queryKeys.ts`:
- add to `auth`: `me: () => ['auth', 'me'],` (already exists — verify; it does at line 54-56, no change needed).
- add `avatar: (key: string) => ['avatar', key],` to the root object.
- add `profile: () => ['company', 'profile'],` under `company`.
- add `profile: () => ['platform', 'profile'],` under `platform`.

- [ ] **Step 2: useAuth store gains profile**

`frontend/src/api/useAuth.ts`:

```ts
export interface AuthProfile {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}
```
`AuthState` gains:
```ts
  profile: AuthProfile | null;
  setProfile: (profile: AuthProfile) => void;
```
Initial state: `profile: null,` and:
```ts
  setProfile: (profile) => set({ profile }),
```
`clearTokens` also sets `profile: null` in the `set({...})` call.

- [ ] **Step 3: useAvatarBlob hook**

Create `frontend/src/shared/hooks/useAvatarBlob.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';

// Fetches one avatar object as a blob URL, cached by its S3 key. Object URLs
// are intentionally never revoked while the page lives (browser GC handles
// them); avatars are small and bounded by the 5MB upload cap.
export function useAvatarBlob(avatarUrl?: string | null): string | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.avatar(avatarUrl ?? ''),
    enabled: Boolean(avatarUrl),
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/avatars/file?key=${encodeURIComponent(avatarUrl as string)}`,
        { responseType: 'blob' },
      );
      return URL.createObjectURL(data as Blob);
    },
  });
  return data;
}
```

- [ ] **Step 4: UserAvatar component**

Create `frontend/src/shared/components/UserAvatar.tsx`:

```tsx
import { Avatar } from '@mantine/core';
import { useAvatarBlob } from '../hooks/useAvatarBlob';

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 'sm',
  color = 'indigo',
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: string;
  color?: string;
}) {
  const src = useAvatarBlob(avatarUrl);
  return (
    <Avatar src={src ?? undefined} color={color} size={size} radius="xl">
      {initialsOf(name)}
    </Avatar>
  );
}
```

- [ ] **Step 5: UserMenu component**

Create `frontend/src/shared/components/UserMenu.tsx`:

```tsx
import { Group, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconLogout, IconUser } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/api/useAuth';
import { useLogout } from '@/hooks/auth';
import { UserAvatar } from './UserAvatar';

export type ProfilePath = '/settings' | '/company/profile' | '/admin/profile';

export function UserMenu({ profilePath, roleLabel }: { profilePath: ProfilePath; roleLabel: string }) {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const { mutateAsync: logout } = useLogout();

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/auth/signin' });
  };

  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <UnstyledButton style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserAvatar name={profile?.name} avatarUrl={profile?.avatarUrl} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{roleLabel}</Menu.Label>
        <Menu.Item leftSection={<IconUser size="0.9rem" />} onClick={() => navigate({ to: profilePath })}>
          Profile
        </Menu.Item>
        <Menu.Item leftSection={<IconLogout size="0.9rem" />} color="red" onClick={handleLogout}>
          Logout
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
```

- [ ] **Step 6: Verify + commit**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

```bash
git add frontend/src/api/authApi.ts frontend/src/api/useAuth.ts frontend/src/api/queryKeys.ts frontend/src/shared
git commit -m "feat(m20): shared UserAvatar/UserMenu + /auth/me profile store"
```

---

### Task 11: Layout unification (3 layouts)

**Files:**
- Modify: `frontend/src/features/candidate-portal/layout.tsx`
- Modify: `frontend/src/features/company/layout.tsx`
- Modify: `frontend/src/features/admin/layout.tsx`
- Create: `frontend/src/hooks/useMe.ts`

**Interfaces:**
- Consumes: `UserMenu`, `UserAvatar`, `useAuthStore.profile`, `GET /auth/me` (Task 10).
- Produces: every header shows the same avatar dropdown (Profile + Logout); navbar footers show photo/initials + name.

- [ ] **Step 1: useMe hook**

Create `frontend/src/hooks/useMe.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/api/authApi';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore, type AuthProfile } from '@/api/useAuth';
import type { ApiEnvelope } from './useApiMutation';

export function useMe() {
  const setProfile = useAuthStore((s) => s.setProfile);
  return useQuery({
    queryKey: queryKeys.auth.me(),
    enabled: Boolean(useAuthStore.getState().accessToken),
    queryFn: async () => {
      const { data } = await authApi.me();
      const profile = (data as ApiEnvelope<AuthProfile>).data;
      setProfile(profile);
      return profile;
    },
  });
}
```

- [ ] **Step 2: Candidate layout**

`frontend/src/features/candidate-portal/layout.tsx`:
- Add `import { useMe } from '@/hooks/useMe';` and `import { UserMenu } from '@/shared/components/UserMenu';`.
- At the top of the component body: `useMe();`.
- Replace the whole `<Menu shadow="md" width={200} position="bottom-end">...</Menu>` block (lines 68-95) with:

```tsx
          <UserMenu profilePath="/settings" roleLabel="Candidate" />
```
- Remove now-unused imports (`Avatar`, `Menu`, `IconUser`, `IconLogout`, `useLogout` if unused elsewhere — `useLogout` becomes unused, remove it; keep `useNavigate` since navLinks use Link but `navigate` may become unused — remove if oxlint flags it).

- [ ] **Step 3: Company layout**

`frontend/src/features/company/layout.tsx`:
- Add `import { useMe } from '@/hooks/useMe';`, `import { UserMenu } from '@/shared/components/UserMenu';`, `import { UserAvatar } from '@/shared/components/UserAvatar';`.
- Component body: `useMe();` and `const profile = useAuthStore((s) => s.profile);`.
- Remove `useLogout`, `handleLogout`, `IconLogout` (header logout button gone).
- Header right group becomes:
```tsx
          <Group gap="xs">
            <ColorSchemeToggle />
            <UserMenu profilePath="/company/profile" roleLabel={role ?? 'User'} />
          </Group>
```
- Footer section (lines 137-149) becomes:
```tsx
        <AppShell.Section>
          <Divider mb="sm" />
          <Group gap="sm">
            <UserAvatar name={profile?.name} avatarUrl={profile?.avatarUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {profile?.name ?? role ?? 'User'}
              </Text>
            </div>
          </Group>
        </AppShell.Section>
```
- Remove the now-unused `Avatar` import.

- [ ] **Step 4: SuperAdmin layout**

`frontend/src/features/admin/layout.tsx`: same treatment:
- `useMe();` + `const profile = useAuthStore((s) => s.profile);` (import `useAuthStore` from `@/api/useAuth` — currently not imported).
- Replace the logout `UnstyledButton` (lines 65-71) with `<UserMenu profilePath="/admin/profile" roleLabel="SuperAdmin" />` inside the header `Group gap="xs"`.
- Footer (lines 98-110): `<UserAvatar name={profile?.name} avatarUrl={profile?.avatarUrl} color="red" />` and text `{profile?.name ?? 'SuperAdmin'}`.
- Remove `useLogout`, `handleLogout`, `IconLogout`, `Avatar` imports if now unused.

- [ ] **Step 5: Verify + commit**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

```bash
git add frontend/src/hooks/useMe.ts frontend/src/features/candidate-portal/layout.tsx frontend/src/features/company/layout.tsx frontend/src/features/admin/layout.tsx
git commit -m "feat(m20): universal avatar menu in all three layouts"
```

---

### Task 12: Candidate /settings avatar section

**Files:**
- Modify: `frontend/src/features/candidate-portal/types/index.ts`
- Modify: `frontend/src/features/candidate-portal/api/candidateApi.ts`
- Modify: `frontend/src/features/candidate-portal/hooks/useProfile.ts`
- Modify: `frontend/src/features/candidate-portal/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `POST /candidate/profile/avatar`, `DELETE /candidate/profile/avatar`, `GET /candidate/profile` gains `avatarUrl` (Task 6), `UserAvatar` (Task 10).
- Produces: `candidateApi.uploadAvatar(file)`, `candidateApi.removeAvatar()`, `useUploadAvatar`, `useRemoveAvatar`, `Profile.avatarUrl`.

- [ ] **Step 1: Type + API client**

- `frontend/src/features/candidate-portal/types/index.ts` — `Profile` gains `avatarUrl: string | null;`.
- `frontend/src/features/candidate-portal/api/candidateApi.ts`:
  - `updateProfile`'s `Omit<Profile, ...>` list gains `'avatarUrl'` (keep it out of the PUT body).
  - Add:
```ts
  uploadAvatar: async (file: File): Promise<ApiEnvelope<{ avatarUrl: string | null }>> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post('/candidate/profile/avatar', formData, {
      headers: { 'Content-Type': undefined },
    });
    return data as ApiEnvelope<{ avatarUrl: string | null }>;
  },

  removeAvatar: async (): Promise<void> => {
    await apiClient.delete('/candidate/profile/avatar');
  },
```

- [ ] **Step 2: Hooks**

`frontend/src/features/candidate-portal/hooks/useProfile.ts` add:

```ts
export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (file: File) => candidateApi.uploadAvatar(file),
    successMessage: 'Avatar updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => candidateApi.removeAvatar().then(() => ({ data: undefined, message: 'Avatar removed' })),
    successMessage: 'Avatar removed',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}
```
(Also update `ProfileUpdate` Omit type to include `'avatarUrl'`.)

- [ ] **Step 3: Settings page avatar section**

`frontend/src/features/candidate-portal/settings/SettingsPage.tsx`:
- Add constants + imports: `const AVATAR_MAX_BYTES = 5 * 1024 * 1024;`, `const AVATAR_ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];`, `import { UserAvatar } from '@/shared/components/UserAvatar';`, `import { FileButton, ActionIcon } from '@mantine/core';` (add to the Mantine import), `import { IconPhotoOff, IconUpload } from '@tabler/icons-react';`, and the two new hooks.
- Add state: `const [avatarFile, setAvatarFile] = useState<File | null>(null); const [avatarError, setAvatarError] = useState<string | null>(null); const uploadAvatar = useUploadAvatar(); const removeAvatar = useRemoveAvatar();`.
- Add handler:
```tsx
  const handleAvatarFileChange = (file: File | null) => {
    setAvatarFile(file);
    setAvatarError(null);
    if (!file) return;
    if (!AVATAR_ACCEPT.includes(file.type)) {
      setAvatarError('Only PNG, JPEG and WebP images are allowed.');
      setAvatarFile(null);
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError('Avatar must be 5MB or smaller.');
      setAvatarFile(null);
    }
  };
```
- Insert before the name inputs (after the "Member since" Text, around line 112):

```tsx
      <Stack gap="xs" mb="md">
        <Text fw={500}>Profile picture</Text>
        <Group align="center" gap="lg">
          <UserAvatar name={`${profile.firstName} ${profile.lastName}`} avatarUrl={profile.avatarUrl} size="xl" />
          <Stack gap="xs">
            <Group gap="xs">
              <FileButton onChange={handleAvatarFileChange} accept="image/png,image/jpeg,image/webp">
                {(props) => (
                  <Button {...props} variant="light" leftSection={<IconUpload size="1rem" />}>
                    Choose image
                  </Button>
                )}
              </FileButton>
              {profile.avatarUrl && (
                <Button variant="subtle" color="red" loading={removeAvatar.isPending} onClick={() => removeAvatar.mutate()}>
                  Remove
                </Button>
              )}
            </Group>
            {avatarFile && (
              <Button
                size="xs"
                onClick={async () => {
                  await uploadAvatar.mutateAsync(avatarFile);
                  setAvatarFile(null);
                }}
                loading={uploadAvatar.isPending}
                disabled={!avatarFile}
              >
                Upload
              </Button>
            )}
            {avatarError && <Text size="xs" c="red">{avatarError}</Text>}
            {uploadAvatar.error && (
              <Text size="xs" c="red">Upload failed: {(uploadAvatar.error as Error).message}</Text>
            )}
          </Stack>
        </Group>
      </Stack>
```

- [ ] **Step 4: Verify + commit**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

```bash
git add frontend/src/features/candidate-portal
git commit -m "feat(m20): candidate settings avatar upload/remove"
```

---

### Task 13: Company profile page

**Files:**
- Create: `frontend/src/api/companyProfileApi.ts`
- Create: `frontend/src/features/company/profile/hooks/useCompanyProfile.ts`
- Create: `frontend/src/features/company/profile/ProfilePage.tsx`
- Create: `frontend/src/routes/company/profile.tsx`

**Interfaces:**
- Consumes: `GET/PUT /company/profile`, `POST/DELETE /company/profile/avatar` (Task 7), `UserAvatar` (Task 10).
- Produces: route `/company/profile` rendering the profile page.

- [ ] **Step 1: API client**

Create `frontend/src/api/companyProfileApi.ts`:

```ts
import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface CompanyProfile {
  id: string;
  email: string;
  role: string;
  name: string | null;
  avatarUrl: string | null;
  status: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const companyProfileApi = {
  get: async (): Promise<CompanyProfile> => {
    const { data } = await apiClient.get('/company/profile');
    return unwrap(data as ApiEnvelope<CompanyProfile>);
  },
  update: async (name: string): Promise<CompanyProfile> => {
    const { data } = await apiClient.put('/company/profile', { name });
    return unwrap(data as ApiEnvelope<CompanyProfile>);
  },
  uploadAvatar: async (file: File): Promise<{ avatarUrl: string | null }> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post('/company/profile/avatar', formData, {
      headers: { 'Content-Type': undefined },
    });
    return unwrap(data as ApiEnvelope<{ avatarUrl: string | null }>);
  },
  removeAvatar: async (): Promise<{ avatarUrl: null }> => {
    const { data } = await apiClient.delete('/company/profile/avatar');
    return unwrap(data as ApiEnvelope<{ avatarUrl: null }>);
  },
};
```

- [ ] **Step 2: Hooks**

Create `frontend/src/features/company/profile/hooks/useCompanyProfile.ts`:

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companyProfileApi } from '@/api/companyProfileApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useCompanyProfile() {
  return useQuery({
    queryKey: queryKeys.company.profile(),
    queryFn: companyProfileApi.get,
  });
}

export function useUpdateCompanyProfile() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (name: string) => companyProfileApi.update(name),
    successMessage: 'Profile updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

export function useUploadCompanyAvatar() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (file: File) => companyProfileApi.uploadAvatar(file),
    successMessage: 'Avatar updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

export function useRemoveCompanyAvatar() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => companyProfileApi.removeAvatar(),
    successMessage: 'Avatar removed',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}
```

- [ ] **Step 3: Profile page**

Create `frontend/src/features/company/profile/ProfilePage.tsx` (modeled on the candidate SettingsPage section from Task 12 — same pre-check logic):

```tsx
import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileButton,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DetailSkeleton } from '@/shared/components/Skeletons';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { IconUpload } from '@tabler/icons-react';
import {
  useCompanyProfile,
  useRemoveCompanyAvatar,
  useUpdateCompanyProfile,
  useUploadCompanyAvatar,
} from './hooks/useCompanyProfile';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];

export function CompanyProfilePage() {
  const { data: profile, isLoading, error } = useCompanyProfile();
  const updateProfile = useUpdateCompanyProfile();
  const uploadAvatar = useUploadCompanyAvatar();
  const removeAvatar = useRemoveCompanyAvatar();
  const [name, setName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setName(profile.name ?? '');
  }, [profile]);

  if (isLoading) return <DetailSkeleton lines={4} />;
  if (error) return <Alert color="red">Failed to load profile: {error.message}</Alert>;
  if (!profile) return <Text>No profile data available</Text>;

  const handleAvatarFileChange = (file: File | null) => {
    setAvatarFile(file);
    setAvatarError(null);
    if (!file) return;
    if (!AVATAR_ACCEPT.includes(file.type)) {
      setAvatarError('Only PNG, JPEG and WebP images are allowed.');
      setAvatarFile(null);
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError('Avatar must be 5MB or smaller.');
      setAvatarFile(null);
    }
  };

  return (
    <Stack maw={560}>
      <Group justify="space-between">
        <Title order={2}>Profile</Title>
        <Badge variant="light" color="indigo">{profile.role}</Badge>
      </Group>

      <Stack gap="xs" mb="md">
        <Text fw={500}>Profile picture</Text>
        <Group align="center" gap="lg">
          <UserAvatar name={profile.name} avatarUrl={profile.avatarUrl} size="xl" />
          <Stack gap="xs">
            <Group gap="xs">
              <FileButton onChange={handleAvatarFileChange} accept="image/png,image/jpeg,image/webp">
                {(props) => (
                  <Button {...props} variant="light" leftSection={<IconUpload size="1rem" />}>
                    Choose image
                  </Button>
                )}
              </FileButton>
              {profile.avatarUrl && (
                <Button variant="subtle" color="red" loading={removeAvatar.isPending} onClick={() => removeAvatar.mutate()}>
                  Remove
                </Button>
              )}
            </Group>
            {avatarFile && (
              <Button
                size="xs"
                loading={uploadAvatar.isPending}
                onClick={async () => {
                  await uploadAvatar.mutateAsync(avatarFile);
                  setAvatarFile(null);
                }}
              >
                Upload
              </Button>
            )}
            {avatarError && <Text size="xs" c="red">{avatarError}</Text>}
            {uploadAvatar.error && (
              <Text size="xs" c="red">Upload failed: {(uploadAvatar.error as Error).message}</Text>
            )}
          </Stack>
        </Group>
      </Stack>

      <TextInput
        label="Name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        placeholder="Your display name"
      />
      <TextInput label="Email" value={profile.email} readOnly />
      <Button
        maw={160}
        onClick={() => updateProfile.mutate(name)}
        loading={updateProfile.isPending}
        disabled={name.trim().length === 0}
      >
        Save changes
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 4: Route**

Create `frontend/src/routes/company/profile.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { CompanyProfilePage } from '@/features/company/profile/ProfilePage';

export const Route = createFileRoute('/company/profile')({
  component: CompanyProfilePage,
});
```

(TanStack Router file-based codegen regenerates `routeTree.gen.ts` via the build/dev watcher; if the project uses a manual generate script, run it — check `frontend/package.json` scripts.)

- [ ] **Step 5: Verify + commit**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

```bash
git add frontend/src/api/companyProfileApi.ts frontend/src/features/company/profile frontend/src/routes/company/profile.tsx
git commit -m "feat(m20): company profile page"
```

---

### Task 14: SuperAdmin profile page

**Files:**
- Modify: `frontend/src/api/platformApi.ts`
- Create: `frontend/src/features/admin/profile/hooks/usePlatformProfile.ts`
- Create: `frontend/src/features/admin/profile/ProfilePage.tsx`
- Create: `frontend/src/routes/admin/profile.tsx`

**Interfaces:**
- Consumes: `GET/PUT /platform/profile`, `POST/DELETE /platform/profile/avatar` (Task 8), `UserAvatar` (Task 10).
- Produces: route `/admin/profile`.

- [ ] **Step 1: API client additions**

`frontend/src/api/platformApi.ts` — add a `PlatformProfile` interface near `PlatformUser`:

```ts
export interface PlatformProfile {
  id: string;
  email: string;
  role: string;
  name: string | null;
  avatarUrl: string | null;
}
```

Add methods to the `platformApi` object:

```ts
  getProfile: async (): Promise<PlatformProfile> => {
    const { data } = await apiClient.get('/platform/profile');
    return unwrap(data as ApiEnvelope<PlatformProfile>);
  },
  updateProfile: async (name: string): Promise<PlatformProfile> => {
    const { data } = await apiClient.put('/platform/profile', { name });
    return unwrap(data as ApiEnvelope<PlatformProfile>);
  },
  uploadAvatar: async (file: File): Promise<{ avatarUrl: string | null }> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post('/platform/profile/avatar', formData, {
      headers: { 'Content-Type': undefined },
    });
    return unwrap(data as ApiEnvelope<{ avatarUrl: string | null }>);
  },
  removeAvatar: async (): Promise<{ avatarUrl: null }> => {
    const { data } = await apiClient.delete('/platform/profile/avatar');
    return unwrap(data as ApiEnvelope<{ avatarUrl: null }>);
  },
```

- [ ] **Step 2: Hooks**

Create `frontend/src/features/admin/profile/hooks/usePlatformProfile.ts` (mirror of Task 13 Step 2, using `platformApi` and `queryKeys.platform.profile()`; success messages same).

- [ ] **Step 3: Profile page**

Create `frontend/src/features/admin/profile/ProfilePage.tsx` — identical structure to the company page from Task 13 Step 3, with:
- imports from `./hooks/usePlatformProfile`
- role badge shows `SuperAdmin`
- no read-only status field

- [ ] **Step 4: Route**

Create `frontend/src/routes/admin/profile.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { AdminProfilePage } from '@/features/admin/profile/ProfilePage';

export const Route = createFileRoute('/admin/profile')({
  component: AdminProfilePage,
});
```

- [ ] **Step 5: Verify + commit**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

```bash
git add frontend/src/api/platformApi.ts frontend/src/features/admin/profile frontend/src/routes/admin/profile.tsx
git commit -m "feat(m20): super admin profile page"
```

---

### Task 15: Avatar thumbnails in person-lists

**Files:**
- Modify: `frontend/src/api/companyUsersApi.ts`
- Modify: `frontend/src/features/company/users/UserManagementPage.tsx`
- Modify: `frontend/src/features/company/users/hooks/useCompanyUsers.ts`
- Modify: `frontend/src/api/platformApi.ts`
- Modify: `frontend/src/features/admin/UsersPage.tsx`
- Modify: `frontend/src/api/candidatesApi.ts`
- Modify: `frontend/src/features/company/candidates/CandidateList.tsx`
- Modify: `frontend/src/features/company/candidates/CandidateProfile.tsx`

**Interfaces:**
- Consumes: `GET /company/users` rows with `name`/`avatarUrl`, `GET /platform/users` rows with `avatarUrl`, `GET /candidates` rows with `avatarUrl`, `GET /candidates/:id` with `avatarUrl` (Tasks 4), `UserAvatar` (Task 10).

- [ ] **Step 1: CompanyUser type + create input**

`frontend/src/api/companyUsersApi.ts`:
- `CompanyUser` gains `name: string | null; avatarUrl: string | null;`.
- `CreateUserInput` gains `name?: string;`.
- `create` already sends the whole input object — no client change needed.

- [ ] **Step 2: Company UsersPage**

`frontend/src/features/company/users/UserManagementPage.tsx`:
- `CreateUserInput` cast at line 237 already spreads the form values — the form has `name`, so add it explicitly to the mutate payload:
```tsx
            createUser.mutate(
              {
                name: values.name || undefined,
                email: values.email,
                ...
```
- Table: add an `Avatar` column after the first column. Header `<Table.Th>User</Table.Th>` replacing `<Table.Th>Email</Table.Th>`, and row cell:
```tsx
                <Table.Td>
                  <Group gap="sm">
                    <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
                    <Stack gap={0}>
                      <Text size="sm">{user.name ?? '—'}</Text>
                      <Text size="xs" c="dimmed">{user.email}</Text>
                    </Stack>
                  </Group>
                </Table.Td>
```
- Import `UserAvatar`, `Stack`, `Text` (Text already imported).

- [ ] **Step 3: PlatformUser type + UsersPage**

`frontend/src/api/platformApi.ts` — `PlatformUser` gains `name: string | null; avatarUrl: string | null;`.

`frontend/src/features/admin/UsersPage.tsx` — find the row render (the `<Table.Tr>` with user.email) and add a leading cell:
```tsx
                <Table.Td>
                  <Group gap="sm">
                    <UserAvatar
                      name={user.type === 'company' ? user.name : `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()}
                      avatarUrl={user.avatarUrl}
                      size="sm"
                    />
                    <Text size="sm">{user.type === 'company' ? (user.name ?? user.email) : `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()}</Text>
                  </Group>
                </Table.Td>
```
- Import `UserAvatar` from `@/shared/components/UserAvatar`.

- [ ] **Step 4: Candidate type + list + modal**

`frontend/src/api/candidatesApi.ts` — `Candidate` interface gains `avatarUrl: string | null;`.

`frontend/src/features/company/candidates/CandidateList.tsx` — the Name cell becomes:
```tsx
      <Table.Td>
        <Group gap="sm">
          <UserAvatar name={c.name} avatarUrl={c.avatarUrl} size="sm" />
          <Text>{c.name}</Text>
        </Group>
      </Table.Td>
```
(import `UserAvatar` + `Text`; keep the row clickable).

`frontend/src/features/company/candidates/CandidateProfile.tsx` — at the top of the profile content (where name/email are shown), add:
```tsx
      <Group gap="md" mb="md">
        <UserAvatar name={candidate.name} avatarUrl={candidate.avatarUrl} size="xl" />
        <Stack gap={0}>
          <Text fw={600} size="lg">{candidate.name}</Text>
          <Text size="sm" c="dimmed">{candidate.email ?? '—'}</Text>
        </Stack>
      </Group>
```
(Adjust to the actual layout of the modal; if the candidate object is already spread with `avatarUrl` from `getOne`, no extra fetch is needed.)

- [ ] **Step 5: Verify + commit**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

```bash
git add frontend/src/api/companyUsersApi.ts frontend/src/features/company/users frontend/src/api/platformApi.ts frontend/src/features/admin/UsersPage.tsx frontend/src/api/candidatesApi.ts frontend/src/features/company/candidates
git commit -m "feat(m20): avatar thumbnails in user and candidate lists"
```

---

### Task 16: E2E phase21 + AGENTS.md current state

**Files:**
- Create: `backend/test/phase21.e2e-spec.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: all backend endpoints from Tasks 1-8.
- Produces: the phase21 release gate.

- [ ] **Step 1: Write the e2e spec**

Create `backend/test/phase21.e2e-spec.ts` — copy the harness from `phase20.e2e-spec.ts` (lines 1-210: imports, `ApiEnvelope`/`Tokens`/`JwtClaims`/`CompanyAccount` interfaces, `assertStatus`/`assertEnvelope`, `verifyInfrastructure`, `httpServer`, `signIn`, `createTenant`, `createSuperAdmin`, `createPlatformCandidate`, `cleanupDatabase`; adjust prefixes `phase20-` → `phase21-` and the spec run id) and add the Phase 21 describe block:

```ts
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-content'),
]);

describe('Phase 21 — Profile Avatars & Universal User Menu', () => {
  jest.setTimeout(120_000);
  beforeAll(verifyInfrastructure);
  afterAll(async () => {
    await cleanupDatabase();
    await cleanupRedis?.quit();
    await cleanupPool?.end();
  });

  let org: CompanyAccount;
  let candidate: { id: string; email: string; password: string };
  let superAdminToken: string;

  beforeAll(async () => {
    org = await createTenant('org');
    candidate = await createPlatformCandidate(await createSuperAdmin(), 'cand');
    superAdminToken = await createSuperAdmin();
  });

  it('GET /auth/me returns the company-user profile', async () => {
    const res = await request(httpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${org.token}`);
    const me = assertEnvelope<{
      id: string; role: string; companyId: string;
      email: string; name: string | null; avatarUrl: string | null;
    }>(res, 200);
    expect(me.id).toBe(org.userId);
    expect(me.role).toBe('CompanyAdmin');
    expect(me.companyId).toBe(org.companyId);
    expect(me.email).toBe(org.email);
    expect(me.name).toBeNull();
    expect(me.avatarUrl).toBeNull();
  });

  it('GET /auth/me returns the candidate profile with composed name', async () => {
    const signInRes = await signIn(candidate.email, candidate.password);
    const token = assertEnvelope<Tokens>(signInRes, 200).accessToken;
    const me = assertEnvelope<{ name: string; avatarUrl: string | null }>(
      await request(httpServer()).get('/api/auth/me').set('Authorization', `Bearer ${token}`),
      200,
    );
    expect(me.name).toBe(`Phase21 cand Candidate`);
    expect(me.avatarUrl).toBeNull();
  });

  it('GET /auth/me returns the super admin profile', async () => {
    const me = assertEnvelope<{ role: string; name: string | null }>(
      await request(httpServer()).get('/api/auth/me').set('Authorization', `Bearer ${superAdminToken}`),
      200,
    );
    expect(me.role).toBe('SuperAdmin');
    expect(me.name).toBe('Phase 21 SA');
  });

  it('company user avatar round-trip: upload → serve → remove', async () => {
    const uploaded = assertEnvelope<{ avatarUrl: string }>(
      await request(httpServer())
        .post('/api/company/profile/avatar')
        .set('Authorization', `Bearer ${org.token}`)
        .attach('file', PNG_BYTES, 'avatar.png'),
      201,
    );
    expect(uploaded.avatarUrl).toMatch(new RegExp(`^companies/${org.companyId}/avatars/`));

    const served = await request(httpServer())
      .get(`/api/avatars/file?key=${encodeURIComponent(uploaded.avatarUrl)}`)
      .set('Authorization', `Bearer ${org.token}`);
    assertStatus(served, 200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(served.body as Buffer, PNG_BYTES)).toBe(0);

    const profile = assertEnvelope<{ name: string | null; avatarUrl: string | null }>(
      await request(httpServer()).get('/api/company/profile').set('Authorization', `Bearer ${org.token}`),
      200,
    );
    expect(profile.avatarUrl).toBe(uploaded.avatarUrl);

    const removed = assertEnvelope<{ avatarUrl: null }>(
      await request(httpServer()).delete('/api/company/profile/avatar').set('Authorization', `Bearer ${org.token}`),
      200,
    );
    expect(removed.avatarUrl).toBeNull();
  });

  it('company user can update their display name', async () => {
    const updated = assertEnvelope<{ name: string }>(
      await request(httpServer())
        .put('/api/company/profile')
        .set('Authorization', `Bearer ${org.token}`)
        .send({ name: 'Ada Lovelace' }),
      200,
    );
    expect(updated.name).toBe('Ada Lovelace');

    const me = assertEnvelope<{ name: string | null }>(
      await request(httpServer()).get('/api/auth/me').set('Authorization', `Bearer ${org.token}`),
      200,
    );
    expect(me.name).toBe('Ada Lovelace');
  });

  it('rejects a file whose content is not an image', async () => {
    const res = await request(httpServer())
      .post('/api/company/profile/avatar')
      .set('Authorization', `Bearer ${org.token}`)
      .attach('file', Buffer.from('definitely-not-an-image'), 'avatar.png');
    assertStatus(res, 400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an oversized avatar with 413', async () => {
    const res = await request(httpServer())
      .post('/api/company/profile/avatar')
      .set('Authorization', `Bearer ${org.token}`)
      .attach('file', Buffer.concat([PNG_BYTES, Buffer.alloc(6 * 1024 * 1024)]), 'avatar.png');
    assertStatus(res, 413);
  });

  it('candidate avatar round-trip via /candidate/profile/avatar', async () => {
    const signInRes = await signIn(candidate.email, candidate.password);
    const token = assertEnvelope<Tokens>(signInRes, 200).accessToken;
    const uploaded = assertEnvelope<{ avatarUrl: string }>(
      await request(httpServer())
        .post('/api/candidate/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', PNG_BYTES, 'avatar.png'),
      201,
    );
    expect(uploaded.avatarUrl).toMatch(/^candidate-avatars\//);

    const profile = assertEnvelope<{ avatarUrl: string | null }>(
      await request(httpServer()).get('/api/candidate/profile').set('Authorization', `Bearer ${token}`),
      200,
    );
    expect(profile.avatarUrl).toBe(uploaded.avatarUrl);
  });

  it('super admin avatar round-trip via /platform/profile/avatar', async () => {
    const uploaded = assertEnvelope<{ avatarUrl: string }>(
      await request(httpServer())
        .post('/api/platform/profile/avatar')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', PNG_BYTES, 'avatar.png'),
      201,
    );
    expect(uploaded.avatarUrl).toMatch(/^platform\/avatars\//);
  });

  it('company user lists include name and avatarUrl', async () => {
    const users = assertEnvelope<Array<{ name: string | null; avatarUrl: string | null }>>(
      await request(httpServer()).get('/api/company/users').set('Authorization', `Bearer ${org.token}`),
      200,
    );
    const me = users.find((u) => u.email === org.email);
    expect(me?.name).toBe('Ada Lovelace');
    expect(me).toHaveProperty('avatarUrl');
  });

  it('platform merged users include avatarUrl', async () => {
    const users = assertEnvelope<{ data: Array<{ avatarUrl: string | null }> }>(
      await request(httpServer())
        .get('/api/platform/users?pageSize=50')
        .set('Authorization', `Bearer ${superAdminToken}`),
      200,
    );
    expect(users.data.length).toBeGreaterThan(0);
    expect(users.data.every((u) => 'avatarUrl' in u)).toBe(true);
  });

  it('new-company signup clones users.name and users.avatar_url', async () => {
    const fresh = await createTenant('clone');
    const cols = await cleanupPool!.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'users'
         AND column_name IN ('name', 'avatar_url')`,
      [`company_${fresh.companyId}`],
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(['avatar_url', 'name']);
  });
});
```

Notes for the implementer:
- The `me` test for the candidate asserts the composed name built from the `createPlatformCandidate` payload — adjust the exact string if the helper differs.
- Avatar S3 objects are not deleted in cleanup (dev MinIO; orphaned objects are harmless — `ponytail:`).

- [ ] **Step 2: Run the e2e spec**

Run: `cd backend && npm run test:e2e -- phase21`
Expected: PASS. (Requires docker postgres/redis/minio running; apply the migration `20260816000000_profile_avatars` to the e2e DB first if the DB is bootstrapped manually.)

- [ ] **Step 3: Update AGENTS.md Current State + Build Order**

- Append a "M20" paragraph to the Current State list, e.g.:
```text
- **M20:** Profile avatars + universal user menu — `users.name` + `avatar_url` (candidate_accounts/super_admins too, template-cloned), shared `AvatarsModule` (PNG/JPEG/WebP magic-byte validation, 5MB, second `avatars` S3 bucket via bucket-param on the single `StorageService`, authed `GET /avatars/file`), `GET /auth/me`, per-role profile+avatar endpoints (`/candidate`, `/company/profile`, `/platform/profile`), unified `UserMenu` (Profile + Logout) in all three layouts, profile pages for company users + SuperAdmins, candidate `/settings` avatar section, avatar thumbnails in company users/candidates + platform users tables, seed display names. E2e: `phase21.e2e-spec.ts`.
```
- Add a Build Order row:
```text
| M20 | Profile Avatars + Universal User Menu | Avatar upload/edit/remove + unified header menu — done ✅ |
```

- [ ] **Step 4: Full verification + commit**

Run: `cd backend && npm run typecheck && npm run lint && npm test && npm run test:e2e -- phase21 && cd ../frontend && npm run lint && npm run build`
Expected: all PASS.

```bash
git add backend/test/phase21.e2e-spec.ts AGENTS.md
git commit -m "feat(m20): phase21 e2e + AGENTS.md current state"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to tasks — data model (T1), storage dual-bucket (T2), avatar core + serve (T3), list fields (T4), `/auth/me` (T5), candidate/company/SA endpoints (T6-8), seed names (T9), shared frontend components + hydration (T10-11), profile pages (T12-14), list thumbnails (T15), e2e + docs (T16). Out-of-scope items (resize, presigned URLs, JWT avatar, password change) are intentionally absent.
- **Placeholders:** none — every step carries concrete code or an exact command.
- **Type consistency:** `avatarUrl` (camelCase) everywhere in TS/Drizzle; `avatar_url` only in SQL migrations; `updateAvatarUrl(id, avatarUrl | null)` signatures identical across the three repos; `AvatarsService.store(actor, file)` actor shapes match the three call sites; `UserMenu` `profilePath` union matches the three routes created.
