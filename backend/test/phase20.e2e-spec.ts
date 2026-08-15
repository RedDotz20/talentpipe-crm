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
    .send({
      companyName: `Phase 20 ${suffix} ${runId}`,
      slug,
      email,
      password,
    });
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
    .send({
      email,
      password,
      firstName: `Phase20 ${suffix}`,
      lastName: 'Candidate',
    });
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
    // Must also remove the companies row, otherwise the orphaned company
    // (with its schema already dropped) breaks schema-looping endpoints such
    // as platform candidate removal on subsequent e2e runs.
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
    const response = await request(httpServer()).get(
      '/api/candidate/resume/file',
    );
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
    const uploaded = assertEnvelope<{ fileUrl: string; uploadedAt: string }>(
      upload,
      201,
    );
    expect(uploaded.fileUrl).toMatch(/\.pdf$/);

    // responseType('arraybuffer') forces the binary parser: superagent only
    // buffers application/pdf by default and yields an empty object for the
    // DOCX mime type otherwise.
    const preview = await request(httpServer())
      .get('/api/candidate/resume/file')
      .set('Authorization', `Bearer ${candidateToken}`)
      .responseType('arraybuffer');
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
      .set('Authorization', `Bearer ${candidateToken}`)
      .responseType('arraybuffer');
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
        // NestJS transforms the multer LIMIT_FILE_SIZE error into a
        // PayloadTooLargeException('File too large') before the global
        // ApiExceptionFilter runs, which maps it to 413 VALIDATION_ERROR.
        message: 'File too large',
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
    const published = await request(httpServer())
      .post(`/api/job-postings/${created.id}/publish`)
      .set('Authorization', `Bearer ${tenant.token}`);
    assertEnvelope(published, 201);
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

    // The DOCX upload above replaced the candidate's resume, so the company
    // endpoint serves that file.
    const preview = await request(httpServer())
      .get(`/api/candidates/${rows[0].id}/resume/file`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .responseType('arraybuffer');
    assertStatus(preview, 200);
    expect(preview.headers['content-type']).toContain('wordprocessingml');
    expect(preview.body).toEqual(DOCX_BYTES);
  });
});
