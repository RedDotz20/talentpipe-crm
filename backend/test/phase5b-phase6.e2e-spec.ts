import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import Redis from 'ioredis';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { dashboardSummaryKey } from '../src/common/cache/cache.constants';

interface ApiEnvelope<T> {
  data: T;
  message: string;
}

interface ErrorResponse {
  error: { code: string; message: string };
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface JwtClaims {
  sub: string;
  tenantId?: string;
  role: string;
}

interface TenantAccount {
  tenantId: string;
  userId: string;
  token: string;
}

interface CandidateAccount {
  candidateId: string;
  token: string;
}

interface JobListing {
  id: string;
  tenantId: string;
  jobPostingId: string;
  status: string;
}

interface JobPosting {
  id: string;
  status: string;
}

interface PipelineStage {
  id: string;
  name: string;
}

interface CandidateApplication {
  applicationId: string;
  tenantId: string;
  status: string;
  jobPostingId: string;
}

interface DashboardSummary {
  totalApplications: number;
  totalCandidates: number;
  openJobPostings: number;
  applicationsByStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
  }>;
}

type HttpResponse = request.Response;

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdTenantIds: string[] = [];
const createdOrgUserIds: string[] = [];
const createdCandidateIds: string[] = [];
const createdLimiterEmailDigests: string[] = [];
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

const createTenant = async (suffix: string): Promise<TenantAccount> => {
  const email = `task8-${suffix}-${runId}@example.test`;
  const response = await request(httpServer())
    .post('/api/auth/org/signup')
    .send({
      companyName: `Task 8 ${suffix} ${runId}`,
      slug: `task8-${suffix}-${runId}`,
      email,
      password: `Task8Org!${randomUUID().slice(0, 18)}`,
    });
  const tokens = assertEnvelope<Tokens>(response, 201);
  const claims = decodeClaims(tokens.accessToken);
  if (!claims.tenantId)
    throw new Error('Organization token did not contain tenantId');
  createdTenantIds.push(claims.tenantId);
  createdOrgUserIds.push(claims.sub);
  return {
    tenantId: claims.tenantId,
    userId: claims.sub,
    token: tokens.accessToken,
  };
};

const createCandidate = async (suffix: string): Promise<CandidateAccount> => {
  const response = await request(httpServer())
    .post('/api/auth/signup')
    .send({
      email: `task8-candidate-${suffix}-${runId}@example.test`,
      password: `Task8Candidate!${randomUUID().slice(0, 16)}`,
      firstName: `Candidate${suffix}`,
      lastName: 'Task8',
    });
  const tokens = assertEnvelope<Tokens>(response, 201);
  const claims = decodeClaims(tokens.accessToken);
  createdCandidateIds.push(claims.sub);
  return { candidateId: claims.sub, token: tokens.accessToken };
};

const createOpenJob = async (
  tenant: TenantAccount,
  suffix: string,
): Promise<JobPosting> => {
  const created = await request(httpServer())
    .post('/api/job-postings')
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({
      title: `Task 8 ${suffix} Job ${runId}`,
      description: 'Release-gate integration job',
    });
  const posting = assertEnvelope<JobPosting>(created, 201);

  const published = await request(httpServer())
    .post(`/api/job-postings/${posting.id}/publish`)
    .set('Authorization', `Bearer ${tenant.token}`);
  return assertEnvelope<JobPosting>(published, 201);
};

const createDraftJob = async (
  tenant: TenantAccount,
  suffix: string,
): Promise<JobPosting> => {
  const created = await request(httpServer())
    .post('/api/job-postings')
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({
      title: `Task 8 ${suffix} Draft Job ${runId}`,
      description: 'Release-gate draft job',
    });
  return assertEnvelope<JobPosting>(created, 201);
};

const closeJob = async (
  tenant: TenantAccount,
  job: JobPosting,
): Promise<JobPosting> => {
  const closed = await request(httpServer())
    .post(`/api/job-postings/${job.id}/close`)
    .set('Authorization', `Bearer ${tenant.token}`);
  return assertEnvelope<JobPosting>(closed, 201);
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

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replaceAll('"', '""')}"`;

const cleanupDatabase = async (): Promise<void> => {
  if (!cleanupPool) return;
  if (createdCandidateIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.candidate_applications_index WHERE candidate_account_id = ANY($1::uuid[])',
      [createdCandidateIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.candidate_bookmarks WHERE candidate_account_id = ANY($1::uuid[])',
      [createdCandidateIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.candidate_skills WHERE candidate_account_id = ANY($1::uuid[])',
      [createdCandidateIds],
    );
  }
  if (createdTenantIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.candidate_applications_index WHERE tenant_id = ANY($1::text[])',
      [createdTenantIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.candidate_bookmarks WHERE tenant_id = ANY($1::text[])',
      [createdTenantIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.job_listings_index WHERE tenant_id = ANY($1::text[])',
      [createdTenantIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.user_emails WHERE tenant_id = ANY($1::uuid[])',
      [createdTenantIds],
    );
    await cleanupPool.query(
      'DELETE FROM public.refresh_tokens WHERE tenant_id = ANY($1::uuid[])',
      [createdTenantIds],
    );
  }
  if (createdOrgUserIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.refresh_tokens WHERE user_id = ANY($1::uuid[])',
      [createdOrgUserIds],
    );
  }
  if (createdCandidateIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.candidate_accounts WHERE id = ANY($1::uuid[])',
      [createdCandidateIds],
    );
  }
  if (createdTenantIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.tenants WHERE id = ANY($1::uuid[])',
      [createdTenantIds],
    );
    for (const tenantId of createdTenantIds) {
      await cleanupPool.query(
        `DROP SCHEMA IF EXISTS ${quoteIdentifier(`tenant_${tenantId}`)} CASCADE`,
      );
    }
  }
};

describe('Phase 5b/6 release gates', () => {
  let tenantA: TenantAccount;
  let tenantB: TenantAccount;
  let jobA: JobPosting;
  let jobB: JobPosting;
  let jobADraft: JobPosting;
  let jobAClosed: JobPosting;
  let candidateA: CandidateAccount;
  let candidateB: CandidateAccount;
  let applicationId: string;

  beforeAll(async () => {
    await verifyInfrastructure();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();

    tenantA = await createTenant('a');
    tenantB = await createTenant('b');
    jobA = await createOpenJob(tenantA, 'A');
    jobB = await createOpenJob(tenantB, 'B');
    jobADraft = await createDraftJob(tenantA, 'A');
    jobAClosed = await closeJob(tenantA, await createOpenJob(tenantA, 'A'));
    candidateA = await createCandidate('a');
    candidateB = await createCandidate('b');
  });

  afterAll(async () => {
    try {
      try {
        await cleanupDatabase();
      } finally {
        try {
          for (const digest of createdLimiterEmailDigests) {
            await cleanupRedisKeys(`ratelimit:login:${digest}:*`);
          }
        } finally {
          for (const tenantId of createdTenantIds) {
            if (cleanupRedis)
              await cleanupRedis.del(dashboardSummaryKey(tenantId));
          }
        }
      }
    } finally {
      if (app) await app.close();
      if (cleanupRedis) await cleanupRedis.quit();
      if (cleanupPool) await cleanupPool.end();
    }
  });

  it('keeps candidate jobs open-only, enforces ownership, and synchronizes stage status', async () => {
    const jobsResponse = await request(httpServer())
      .get('/api/candidate/jobs')
      .set('Authorization', `Bearer ${candidateA.token}`);
    const jobs = assertEnvelope<JobListing[]>(jobsResponse, 200);
    expect(jobs.every((job) => job.status === 'open')).toBe(true);
    expect(jobs.some((job) => job.jobPostingId === jobA.id)).toBe(true);
    expect(jobs.some((job) => job.jobPostingId === jobB.id)).toBe(true);
    expect(jobs.some((job) => job.jobPostingId === jobADraft.id)).toBe(false);
    expect(jobs.some((job) => job.jobPostingId === jobAClosed.id)).toBe(false);

    const applyResponse = await request(httpServer())
      .post(`/api/candidate/jobs/${tenantA.tenantId}/${jobA.id}/apply`)
      .set('Authorization', `Bearer ${candidateA.token}`)
      .send({ coverLetter: 'Task 8 ownership test' });
    const application = assertEnvelope<{ applicationId: string }>(
      applyResponse,
      201,
    );
    expect(application.applicationId).toEqual(expect.any(String));
    applicationId = application.applicationId;

    const duplicate = await request(httpServer())
      .post(`/api/candidate/jobs/${tenantA.tenantId}/${jobA.id}/apply`)
      .set('Authorization', `Bearer ${candidateA.token}`)
      .send({});
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as ErrorResponse).error.code).toBe('CONFLICT');

    const tenantBApplicationResponse = await request(httpServer())
      .post(`/api/candidate/jobs/${tenantB.tenantId}/${jobB.id}/apply`)
      .set('Authorization', `Bearer ${candidateB.token}`)
      .send({});
    const tenantBApplication = assertEnvelope<{ applicationId: string }>(
      tenantBApplicationResponse,
      201,
    );
    const tenantBApplicationsResponse = await request(httpServer())
      .get('/api/candidate/applications')
      .set('Authorization', `Bearer ${candidateB.token}`);
    const tenantBApplications = assertEnvelope<CandidateApplication[]>(
      tenantBApplicationsResponse,
      200,
    );
    const tenantBIndexedApplication = tenantBApplications.find(
      (indexed) => indexed.applicationId === tenantBApplication.applicationId,
    );
    if (!tenantBIndexedApplication) {
      throw new Error(
        'Tenant B application was not added to the candidate index',
      );
    }
    const tenantBStatusBeforeTenantAUpdate = tenantBIndexedApplication.status;

    const ownerDetail = await request(httpServer())
      .get(`/api/candidate/applications/${applicationId}`)
      .set('Authorization', `Bearer ${candidateA.token}`);
    const ownerData = assertEnvelope<CandidateApplication>(ownerDetail, 200);
    expect(ownerData.applicationId).toBe(applicationId);
    expect(ownerData.tenantId).toBe(tenantA.tenantId);

    const otherCandidateDetail = await request(httpServer())
      .get(`/api/candidate/applications/${applicationId}`)
      .set('Authorization', `Bearer ${candidateB.token}`);
    expect(otherCandidateDetail.status).toBe(404);
    expect((otherCandidateDetail.body as ErrorResponse).error.code).toBe(
      'NOT_FOUND',
    );

    const stagesResponse = await request(httpServer())
      .get('/api/org/pipeline-stages')
      .set('Authorization', `Bearer ${tenantA.token}`);
    const stages = assertEnvelope<PipelineStage[]>(stagesResponse, 200);
    const screening = stages.find((stage) => stage.name === 'Screening');
    if (!screening)
      throw new Error('The test tenant did not have a Screening stage');

    const moved = await request(httpServer())
      .patch(`/api/applications/${applicationId}/stage`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ stageId: screening.id });
    assertStatus(moved, 200);

    const synchronizedDetail = await request(httpServer())
      .get(`/api/candidate/applications/${applicationId}`)
      .set('Authorization', `Bearer ${candidateA.token}`);
    const synchronizedData = assertEnvelope<CandidateApplication>(
      synchronizedDetail,
      200,
    );
    expect(synchronizedData.status).toBe('Screening');

    const tenantBApplicationsAfterTenantAUpdateResponse = await request(
      httpServer(),
    )
      .get('/api/candidate/applications')
      .set('Authorization', `Bearer ${candidateB.token}`);
    const tenantBApplicationsAfterTenantAUpdate = assertEnvelope<
      CandidateApplication[]
    >(tenantBApplicationsAfterTenantAUpdateResponse, 200);
    expect(
      tenantBApplicationsAfterTenantAUpdate.find(
        (indexed) => indexed.applicationId === tenantBApplication.applicationId,
      )?.status,
    ).toBe(tenantBStatusBeforeTenantAUpdate);
  });

  it('limits sign-in attempts to five per normalized email and IP', async () => {
    const email = `task8-limit-${runId}@example.test`;
    const password = `Task8Limit!${randomUUID().slice(0, 18)}`;
    const ip = '198.51.100.28';
    const emailVariants = [
      email,
      email.toUpperCase(),
      ` ${email} `,
      ` ${email.toUpperCase()} `,
      email,
      ` ${email} `,
    ];
    createdLimiterEmailDigests.push(
      createHash('sha256').update(email).digest('hex'),
    );
    const responses: HttpResponse[] = [];
    for (const emailVariant of emailVariants) {
      responses.push(
        await request(httpServer())
          .post('/api/auth/signin')
          .set('X-Forwarded-For', ip)
          .send({ email: emailVariant, password }),
      );
    }

    expect(
      responses.slice(0, 5).every((response) => response.status !== 429),
    ).toBe(true);
    const limited = responses[5];
    expect(limited.status).toBe(429);
    expect(Number.isFinite(Number(limited.headers['retry-after']))).toBe(true);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    const limitedBody: unknown = limited.body as unknown;
    const errorResponse = limitedBody as {
      error?: { code?: unknown; message?: unknown };
    };
    expect(errorResponse.error?.code).toBe('RATE_LIMITED');
    expect(typeof errorResponse.error?.message).toBe('string');
  });

  it('keeps dashboard summaries and cache keys isolated and invalidates only the changed tenant', async () => {
    const summaryAResponse = await request(httpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tenantA.token}`);
    const summaryA = assertEnvelope<DashboardSummary>(summaryAResponse, 200);
    expect(summaryA).toEqual(
      expect.objectContaining({
        totalApplications: 1,
        totalCandidates: 1,
        openJobPostings: 1,
      }),
    );

    const summaryBResponse = await request(httpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tenantB.token}`);
    const summaryB = assertEnvelope<DashboardSummary>(summaryBResponse, 200);
    expect(summaryB).toEqual(
      expect.objectContaining({
        totalApplications: 1,
        totalCandidates: 1,
        openJobPostings: 1,
      }),
    );

    const keyA = dashboardSummaryKey(tenantA.tenantId);
    const keyB = dashboardSummaryKey(tenantB.tenantId);
    expect(await cleanupRedis!.get(keyA)).not.toBeNull();
    expect(await cleanupRedis!.get(keyB)).not.toBeNull();

    const secondAResponse = await request(httpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tenantA.token}`);
    expect(assertEnvelope<DashboardSummary>(secondAResponse, 200)).toEqual(
      summaryA,
    );
    expect(await cleanupRedis!.get(keyA)).not.toBeNull();

    const pool = cleanupPool;
    if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
    const tenantASchema = quoteIdentifier(`tenant_${tenantA.tenantId}`);
    try {
      const closeResult = await pool.query(
        `UPDATE ${tenantASchema}."job_postings" SET "status" = 'closed' WHERE "id" = $1`,
        [jobA.id],
      );
      expect(closeResult.rowCount).toBe(1);

      const closedJobResult = await pool.query(
        `SELECT "status" FROM ${tenantASchema}."job_postings" WHERE "id" = $1`,
        [jobA.id],
      );
      expect(closedJobResult.rowCount).toBe(1);
      expect(closedJobResult.rows[0]?.status).toBe('closed');

      const cachedAfterDirectDatabaseChangeResponse = await request(
        httpServer(),
      )
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${tenantA.token}`);
      const cachedAfterDirectDatabaseChange = assertEnvelope<DashboardSummary>(
        cachedAfterDirectDatabaseChangeResponse,
        200,
      );
      expect(cachedAfterDirectDatabaseChange.openJobPostings).toBe(
        summaryA.openJobPostings,
      );
    } finally {
      const restoreResult = await pool.query(
        `UPDATE ${tenantASchema}."job_postings" SET "status" = 'open' WHERE "id" = $1`,
        [jobA.id],
      );
      expect(restoreResult.rowCount).toBe(1);
    }

    const secondApplication = await request(httpServer())
      .post(`/api/candidate/jobs/${tenantA.tenantId}/${jobA.id}/apply`)
      .set('Authorization', `Bearer ${candidateB.token}`)
      .send({});
    assertStatus(secondApplication, 201);
    expect(await cleanupRedis!.get(keyA)).toBeNull();
    expect(await cleanupRedis!.get(keyB)).not.toBeNull();

    const updatedAResponse = await request(httpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tenantA.token}`);
    const updatedA = assertEnvelope<DashboardSummary>(updatedAResponse, 200);
    expect(updatedA.totalApplications).toBe(2);
    expect(updatedA.totalCandidates).toBe(2);

    const cachedBResponse = await request(httpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tenantB.token}`);
    expect(assertEnvelope<DashboardSummary>(cachedBResponse, 200)).toEqual(
      summaryB,
    );
  });
});
