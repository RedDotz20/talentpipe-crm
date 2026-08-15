# Resume Preview + Upload Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Candidates can preview their own uploaded resume in a new tab, and upload failures (oversized / wrong type) fail gracefully with clear errors on both client and server.

**Architecture:** Reuse the existing resume streaming pattern. One new candidate endpoint `GET /candidate/resume/file` mirrors the company-side `GET /candidates/:candidateId/resume/file` (streams the S3 object inline via `ResumesService.getFile`). Upload-limit failures get a `MulterError` branch in the existing app-global `ApiExceptionFilter` (no new filter, no new error code). Frontend: candidate Settings page gains a View button (blob URL in new tab) and a client-side size/type pre-check; the server stays the enforcement authority.

**Tech Stack:** NestJS 11, Drizzle, MinIO/S3 (`@aws-sdk/client-s3`), multer (via `@nestjs/platform-express`), React 19 + Mantine 9 + TanStack Query 5, supertest e2e.

## Global Constraints

- Error shape exactly `{ "error": { "code": "...", "message": "..." } }`; codes from `common/filters/api-exception.filter.ts` — reuse `VALIDATION_ERROR` (413 is already mapped to it).
- 10MB limit = `10 * 1024 * 1024` bytes; allowed types: `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document` only.
- PDF renders in-tab; DOCX downloads on click (browser limitation — no converter).
- All company data access through repositories; candidate context comes from JWT (`user.userId` is the candidate account id).
- Commit tags: `feat(m19): topic`. Backend lint = eslint; frontend lint = oxlint. Backend tests = Jest.
- No DB schema changes in this milestone — migration list in AGENTS.md stays untouched.

---

### Task 1: Map multer upload errors in the global exception filter

**Files:**
- Modify: `backend/src/common/filters/api-exception.filter.ts`
- Test: `backend/src/common/filters/api-exception.filter.spec.ts`

**Interfaces:**
- Produces: `ApiExceptionFilter.catch()` handles `MulterError` — `LIMIT_FILE_SIZE` → **413** `{ error: { code: 'VALIDATION_ERROR', message: 'Resume must be 10MB or smaller' } }`; any other `MulterError` → **400** `{ error: { code: 'VALIDATION_ERROR', message: 'File upload failed: <multer message>' } }`. Task 2's e2e and Task 4 depend on these exact statuses/codes.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/common/filters/api-exception.filter.spec.ts` (after the existing `describe` block's last `it`):

```ts
import { MulterError } from 'multer';
```

and at the end of the `describe('ApiExceptionFilter', ...)` block:

```ts
  it('maps MulterError LIMIT_FILE_SIZE to 413 VALIDATION_ERROR', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch(new MulterError('LIMIT_FILE_SIZE', 'file'), host);
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Resume must be 10MB or smaller',
      },
    });
  });

  it('maps other MulterError to 400 VALIDATION_ERROR', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch(new MulterError('LIMIT_UNEXPECTED_FILE', 'file'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'File upload failed: Unexpected field',
      },
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (workdir `backend`): `npx jest src/common/filters/api-exception.filter.spec.ts`
Expected: both new tests FAIL — the filter currently falls into the generic `Error` branch → 500 `INTERNAL_ERROR`.

- [ ] **Step 3: Implement the MulterError branch**

In `backend/src/common/filters/api-exception.filter.ts`:
1. Add import: `import { MulterError } from 'multer';`
2. In `catch()`, insert the branch **before** `else if (exception instanceof Error)` (MulterError extends Error — order matters):

```ts
    } else if (exception instanceof MulterError) {
      status =
        exception.code === 'LIMIT_FILE_SIZE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_ERROR';
      message =
        exception.code === 'LIMIT_FILE_SIZE'
          ? 'Resume must be 10MB or smaller'
          : `File upload failed: ${exception.message}`;
    } else if (exception instanceof Error) {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (workdir `backend`): `npx jest src/common/filters/api-exception.filter.spec.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Verify the whole backend still typechecks/lints/tests**

Run (workdir `backend`): `npm run typecheck && npm run lint && npm test`
Expected: clean typecheck, lint with no errors, all unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/common/filters/api-exception.filter.ts backend/src/common/filters/api-exception.filter.spec.ts
git commit -m "feat(m19): map multer upload errors to 413/400 in api exception filter"
```

---

### Task 2: Add `GET /candidate/resume/file` (candidate self-preview)

**Files:**
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts`
- Test: `backend/src/modules/candidate-account/candidate-account.service.spec.ts`

**Interfaces:**
- Consumes: `ResumesService.getFile(candidateAccountId: string)` → `Promise<{ buffer: Buffer; contentType: string; filename: string }>` (exists — throws `NotFoundException` when no resume).
- Produces: `CandidateAccountService.getResumeFile(candidateAccountId: string)` → same shape. Controller route `GET /candidate/resume/file` (auth: `AuthGuard('jwt')` + `CandidateAuthGuard`, `@SkipEnvelope()`) streams `buffer` with `Content-Type: file.contentType` and `Content-Disposition: inline; filename="<file.filename>"`.

- [ ] **Step 1: Write the failing service test**

In `backend/src/modules/candidate-account/candidate-account.service.spec.ts`:
1. Extend the `resumesService` mock (line ~81) with `getFile`:

```ts
  const resumesService = {
    upload: jest.fn(),
    getFile: jest.fn(),
  };
```

2. Add a new `describe` block (e.g., after the resume-related tests; any position inside the outer `describe` works):

```ts
  describe('getResumeFile', () => {
    it('delegates to ResumesService.getFile', async () => {
      const file = {
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
        filename: 'resume.pdf',
      };
      resumesService.getFile.mockResolvedValue(file);

      await expect(service.getResumeFile('candidate-1')).resolves.toEqual(file);
      expect(resumesService.getFile).toHaveBeenCalledWith('candidate-1');
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run (workdir `backend`): `npx jest src/modules/candidate-account/candidate-account.service.spec.ts -t getResumeFile`
Expected: FAIL — `getResumeFile` is not a function.

- [ ] **Step 3: Add the service pass-through**

In `backend/src/modules/candidate-account/candidate-account.service.ts`, next to `removeResume` (around line 532):

```ts
  async getResumeFile(candidateAccountId: string) {
    return this.resumesService.getFile(candidateAccountId);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run (workdir `backend`): `npx jest src/modules/candidate-account/candidate-account.service.spec.ts`
Expected: all tests PASS.

- [ ] **Step 5: Add the controller route**

In `backend/src/modules/candidate-account/candidate-account.controller.ts`:

1. Extend the `@nestjs/common` import: add `Res`.
2. Add `import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';`
3. Add `import type { Response } from 'express';`
4. Insert the route right after `uploadResume` (before the existing `@Delete('resume')`):

```ts
  @Get('resume/file')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  @SkipEnvelope()
  async downloadResumeFile(
    @CurrentUser() user: CompanyContext,
    @Res() res: Response,
  ) {
    const file = await this.candidateAccountService.getResumeFile(user.userId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    res.send(file.buffer);
  }
```

- [ ] **Step 6: Verify the whole backend**

Run (workdir `backend`): `npm run typecheck && npm run lint && npm test`
Expected: clean typecheck, lint no errors, all unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/candidate-account/candidate-account.service.ts backend/src/modules/candidate-account/candidate-account.controller.ts backend/src/modules/candidate-account/candidate-account.service.spec.ts
git commit -m "feat(m19): add GET /candidate/resume/file for candidate resume self-preview"
```

---

### Task 3: Candidate settings — View button + client-side upload validation

**Files:**
- Modify: `frontend/src/features/candidate-portal/api/candidateApi.ts`
- Modify: `frontend/src/features/candidate-portal/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `GET /candidate/resume/file` from Task 2 (blob response).
- Produces: `candidateApi.getResumeFile(): Promise<string>` (object URL, mirrors `resumesApi.download` in `frontend/src/api/resumesApi.ts:18-24`). `SettingsPage` shows a View button when a resume exists, and blocks uploads of non-PDF/DOCX or >10MB files with an inline `Alert`.

- [ ] **Step 1: Add the API client method**

In `frontend/src/features/candidate-portal/api/candidateApi.ts`, inside the `candidateApi` object (after `removeResume`):

```ts
  getResumeFile: async (): Promise<string> => {
    const { data } = await apiClient.get('/candidate/resume/file', {
      responseType: 'blob',
    });
    return URL.createObjectURL(data as Blob);
  },
```

- [ ] **Step 2: Update SettingsPage**

In `frontend/src/features/candidate-portal/settings/SettingsPage.tsx`:

1. Add `import { candidateApi } from '../api/candidateApi';`
2. Add constants at module top (after imports):

```ts
const RESUME_MAX_BYTES = 10 * 1024 * 1024;
const RESUME_ACCEPT = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
```

3. Add state next to `resumeFile` (line ~35):

```ts
  const [resumeError, setResumeError] = useState<string | null>(null);
```

4. Replace `handleResumeUpload` (line ~69) with:

```ts
  const handleResumeFileChange = (file: File | null) => {
    setResumeFile(file);
    setResumeError(null);
    if (!file) return;
    if (!RESUME_ACCEPT.includes(file.type)) {
      setResumeError('Only PDF and DOCX files are allowed.');
      setResumeFile(null);
      return;
    }
    if (file.size > RESUME_MAX_BYTES) {
      setResumeError('Resume must be 10MB or smaller.');
      setResumeFile(null);
    }
  };

  const handleResumeUpload = async () => {
    if (!resumeFile) return;
    await uploadResume.mutateAsync(resumeFile);
    setResumeFile(null);
  };

  const handleViewResume = async () => {
    const url = await candidateApi.getResumeFile();
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
```

5. Replace the resume `Stack` block (lines ~91-116) with:

```tsx
      <Stack gap="xs">
        <Text fw={500}>Resume</Text>
        {profile.resumeFileUrl ? (
          <Text size="sm">
            Current resume uploaded {profile.resumeUploadedAt ? new Date(profile.resumeUploadedAt).toLocaleDateString() : ''}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">No resume uploaded</Text>
        )}
        {resumeError && (
          <Alert color="red" size="sm">{resumeError}</Alert>
        )}
        {uploadResume.error && (
          <Alert color="red" size="sm">
            Upload failed: {(uploadResume.error as Error).message}
          </Alert>
        )}
        <Group align="end">
          <FileInput
            flex={1}
            value={resumeFile}
            onChange={handleResumeFileChange}
            accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            placeholder="Choose PDF or DOCX"
            clearable
          />
          <Button onClick={handleResumeUpload} loading={uploadResume.isPending} disabled={!resumeFile}>Upload</Button>
          {profile.resumeFileUrl && (
            <Button variant="subtle" onClick={handleViewResume} loading={false}>
              View
            </Button>
          )}
          {profile.resumeFileUrl && (
            <Button variant="subtle" color="red" onClick={() => removeResume.mutate()} loading={removeResume.isPending}>
              Remove
            </Button>
          )}
        </Group>
      </Stack>
```

(`Alert` and `Group` are already imported in this file.)

- [ ] **Step 3: Verify the frontend**

Run (workdir `frontend`): `npm run lint && npm run build`
Expected: oxlint clean, tsc + vite build succeed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/candidate-portal/api/candidateApi.ts frontend/src/features/candidate-portal/settings/SettingsPage.tsx
git commit -m "feat(m19): candidate resume preview button and upload pre-check in settings"
```

---

### Task 4: E2E — phase20

**Files:**
- Create: `backend/test/phase20.e2e-spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-2; existing auth endpoints (`/api/auth/signin`, `/api/auth/company/signup`, `/api/platform/candidates`), apply flow, and company resume endpoint `GET /api/candidates/:candidateId/resume/file`.

**Prerequisite:** Docker infra up (`docker compose up -d` from repo root) with the migrations + template schema applied (see `docs/00b_LOCAL_DEV_BOOTSTRAP.md` steps 1-3). The seed is NOT required — this spec creates its own tenant/candidate.

- [ ] **Step 1: Create the spec file**

Create `backend/test/phase20.e2e-spec.ts` with this full content (harness mirrors `phase17.e2e-spec.ts`):

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
const createdSuperAdminIds: string[] = [];
const createdCandidateIds: string[] = [];
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
  const email = `phase20-${suffix}-${runId}@example.test`;
  const password = `Phase20Org!${randomUUID().slice(0, 18)}`;
  const slug = `phase20-${suffix}-${runId}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({ companyName: `Phase 20 ${suffix} ${runId}`, slug, email, password });
  const tokens = assertEnvelope<Tokens>(response, 201);
  const claims = JSON.parse(
    Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString('utf8'),
  ) as JwtClaims;
  if (!claims.companyId) throw new Error('Company token lacked companyId');
  createdCompanyIds.push(claims.companyId);
  return {
    companyId: claims.companyId,
    userId: claims.sub,
    token: tokens.accessToken,
    email,
    password,
  };
};

const createSuperAdmin = async (): Promise<string> => {
  const email = `phase20-sa-${runId}@example.test`;
  const password = `Phase20SA!${randomUUID().slice(0, 18)}`;
  const passwordHash = (await argon2.hash(password)) as string;
  const id = randomUUID();
  await cleanupPool!.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name) VALUES ($1, $2, $3, $4)`,
    [id, email, passwordHash, 'Phase 20 SA'],
  );
  createdSuperAdminIds.push(id);
  const response = await signIn(email, password);
  return assertEnvelope<Tokens>(response, 200).accessToken;
};

const createPlatformCandidate = async (
  superAdminToken: string,
  suffix: string,
): Promise<{ id: string; email: string; password: string }> => {
  const email = `phase20-cand-${suffix}-${runId}@example.test`;
  const password = `Phase20Cd!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post('/api/platform/candidates')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ email, password, firstName: `Phase20 ${suffix}`, lastName: 'Candidate' });
  const candidate = assertEnvelope<{ id: string; email: string }>(created, 201);
  createdCandidateIds.push(candidate.id);
  return { id: candidate.id, email, password };
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
      'DELETE FROM public.candidate_applications_index WHERE candidate_account_id = ANY($1::uuid[])',
      [createdCandidateIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.candidate_bookmarks WHERE candidate_account_id = ANY($1::uuid[])',
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
      'DELETE FROM public.candidate_bookmarks WHERE company_id = ANY($1::text[])',
      [createdCompanyIds],
    );
    for (const companyId of createdCompanyIds) {
      await cleanupPool.query(
        `DROP SCHEMA IF EXISTS "company_${companyId}" CASCADE`,
      );
    }
  }
};

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
);
const DOCX_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('fake-docx-content'),
]);

describe('Phase 20 — Resume Preview & Upload Hardening', () => {
  jest.setTimeout(60_000);
  let tenant: CompanyAccount;
  let superAdminToken = '';
  let candidate: { id: string; email: string; password: string };
  let candidateToken = '';

  beforeAll(async () => {
    await verifyInfrastructure();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    tenant = await createTenant('resume');
    superAdminToken = await createSuperAdmin();
    candidate = await createPlatformCandidate(superAdminToken, 'main');
    const signin = await signIn(candidate.email, candidate.password);
    candidateToken = assertEnvelope<Tokens>(signin, 200).accessToken;
  });

  afterAll(async () => {
    await cleanupDatabase();
    await cleanupRedis?.quit();
    await cleanupPool?.end();
    await app?.close();
  });

  it('rejects unauthenticated resume file access', async () => {
    const response = await request(httpServer()).get('/api/candidate/resume/file');
    assertStatus(response, 401);
  });

  it('uploads a PDF and the candidate can preview their own resume', async () => {
    const upload = await request(httpServer())
      .post('/api/candidate/resume')
      .set('Authorization', `Bearer ${candidateToken}`)
      .attach('file', PDF_BYTES, {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      });
    const uploaded = assertEnvelope<{ fileUrl: string; uploadedAt: string }>(upload, 201);
    expect(uploaded.fileUrl).toMatch(/\.pdf$/);

    const preview = await request(httpServer())
      .get('/api/candidate/resume/file')
      .set('Authorization', `Bearer ${candidateToken}`);
    assertStatus(preview, 200);
    expect(preview.headers['content-type']).toContain('application/pdf');
    expect(preview.headers['content-disposition']).toContain('inline');
    expect(preview.body).toEqual(PDF_BYTES);
  });

  it('uploads a DOCX and serves it with the docx content type', async () => {
    const upload = await request(httpServer())
      .post('/api/candidate/resume')
      .set('Authorization', `Bearer ${candidateToken}`)
      .attach('file', DOCX_BYTES, {
        filename: 'resume.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    const uploaded = assertEnvelope<{ fileUrl: string }>(upload, 201);
    expect(uploaded.fileUrl).toMatch(/\.docx$/);

    const preview = await request(httpServer())
      .get('/api/candidate/resume/file')
      .set('Authorization', `Bearer ${candidateToken}`);
    assertStatus(preview, 200);
    expect(preview.headers['content-type']).toContain('wordprocessingml');
    expect(preview.body).toEqual(DOCX_BYTES);
  });

  it('rejects non-PDF/DOCX uploads with 400', async () => {
    const response = await request(httpServer())
      .post('/api/candidate/resume')
      .set('Authorization', `Bearer ${candidateToken}`)
      .attach('file', Buffer.from('plain text'), {
        filename: 'resume.txt',
        contentType: 'text/plain',
      });
    assertStatus(response, 400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
    });
  });

  it('rejects uploads over 10MB with 413', async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
    const response = await request(httpServer())
      .post('/api/candidate/resume')
      .set('Authorization', `Bearer ${candidateToken}`)
      .attach('file', oversized, {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      });
    assertStatus(response, 413);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Resume must be 10MB or smaller',
      },
    });
  });

  it('company reviewer can still view the candidate resume via the existing endpoint', async () => {
    const job = await request(httpServer())
      .post('/api/job-postings')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        title: 'Phase 20 Resume Job',
        description: 'description',
        employmentType: 'full-time',
        location: 'Makati City',
        workSetup: 'hybrid',
      });
    const created = assertEnvelope<{ id: string }>(job, 201);
    const applied = await request(httpServer())
      .post(`/api/candidate/jobs/${tenant.companyId}/${created.id}/apply`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({});
    assertEnvelope<{ applicationId: string }>(applied, 201);

    const { rows } = await cleanupPool!.query<{ id: string }>(
      `SELECT id FROM "company_${tenant.companyId}".candidates WHERE candidate_account_id = $1`,
      [candidate.id],
    );
    expect(rows[0]?.id).toBeDefined();

    const preview = await request(httpServer())
      .get(`/api/candidates/${rows[0]!.id}/resume/file`)
      .set('Authorization', `Bearer ${tenant.token}`);
    assertStatus(preview, 200);
    expect(preview.headers['content-type']).toContain('application/pdf');
    expect(preview.body).toEqual(PDF_BYTES);
  });
});
```

- [ ] **Step 2: Run the e2e spec**

Prerequisite: `docker compose up -d` running (postgres + redis + minio), migrations + template schema applied (`backend/drizzle/*/migration.sql` + `template-schema.sql` — see `docs/00b_LOCAL_DEV_BOOTSTRAP.md`; the DB may already be provisioned from prior phases).

Run (workdir `backend`): `npx jest --config test/jest-e2e.json --runInBand test/phase20.e2e-spec.ts`
Expected: all 6 tests PASS. If `relation "..." does not exist` appears, the DB was never bootstrapped — apply migrations + template schema first.

- [ ] **Step 3: Run the full e2e suite to confirm no regressions**

Run (workdir `backend`): `npm run test:e2e`
Expected: every phase spec (7-20) passes.

- [ ] **Step 4: Commit**

```bash
git add backend/test/phase20.e2e-spec.ts
git commit -m "feat(m19): phase20 e2e for resume preview and upload hardening"
```

---

### Task 5: Documentation

**Files:**
- Modify: `docs/07_API_ENDPOINT_DOCUMENTATION.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the endpoint to the API docs**

In `docs/07_API_ENDPOINT_DOCUMENTATION.md`, in the "Candidate (authenticated)" table (around line 121), add a row after `DELETE | /candidate/resume`:

```markdown
| GET | `/candidate/resume/file` | CANDIDATE | Download/preview own resume — `Content-Disposition: inline`; PDF renders in-tab, DOCX downloads (browser limitation). `404` when no resume |
```

And update the `POST /candidate/resume` row to note failure codes:

```markdown
| POST | `/candidate/resume` | CANDIDATE | Upload or replace the candidate profile resume (PDF/DOCX, max 10MB). `400` for wrong type/content, `413` when >10MB (both `VALIDATION_ERROR`) |
```

- [ ] **Step 2: Add the M19 status + build-order entries in AGENTS.md**

In `AGENTS.md`, after the M18 Permission Management bullet (ends with `E2e: phase19.e2e-spec.ts.`), add:

```markdown
- **M19:** Resume preview + upload hardening — new `GET /candidate/resume/file` (candidate self-preview, `Content-Disposition: inline`; PDF renders in-tab, DOCX downloads), Settings page View button + client-side pre-check (PDF/DOCX only, ≤10MB), multer upload errors now mapped in the global `ApiExceptionFilter` (`LIMIT_FILE_SIZE` → 413, other `MulterError` → 400, both `VALIDATION_ERROR`) instead of a silent 500. Upload limits were already enforced server-side (10MB multer limit + MIME/magic-byte check). E2e: `phase20.e2e-spec.ts`.
```

In the Build Order table, append:

```markdown
| M19 | Resume Preview + Upload Hardening | Candidate self-preview in a new tab; graceful 10MB/PDF-DOCX upload errors — done ✅ |
```

- [ ] **Step 3: Verify + commit**

Run (workdir `backend`): `npm run typecheck && npm test` (docs-only change, but confirm nothing else broke since Task 4)
Run (workdir `frontend`): `npm run build`

```bash
git add docs/07_API_ENDPOINT_DOCUMENTATION.md AGENTS.md
git commit -m "feat(m19): document resume preview endpoint and M19 milestone"
```

---

## Self-Review Notes

- **Spec coverage:** §3.1 endpoint → Task 2; §3.2 multer mapping → Task 1; §4 frontend → Task 3; §5 testing → Tasks 1-4; §6 docs → Task 5. No out-of-scope items (DOCX conversion, other surfaces) are planned.
- **No placeholders:** every step carries full code or exact commands.
- **Type consistency:** `getResumeFile(candidateAccountId)` appears identically in Task 2 service/controller and Task 2's e2e does not call it directly (e2e hits HTTP). Frontend `getResumeFile(): Promise<string>` object URL matches `resumesApi.download`'s established pattern.
- The controller unit-spec mentioned in the design is covered by the e2e instead (no controller spec file exists in the codebase; the e2e asserts 401/200/413/400 behavior end-to-end).
