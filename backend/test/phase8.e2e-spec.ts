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

interface JobPosting {
  id: string;
  status: string;
}

interface Interview {
  id: string;
  applicationId: string;
  interviewerId: string;
  status: string;
  scheduledAt: string;
  candidateName: string;
  jobTitle: string;
  interviewerEmail: string;
}

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdTenantIds: string[] = [];
const createdOrgUserIds: string[] = [];
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

const createTenant = async (suffix: string): Promise<TenantAccount> => {
  const email = `phase8-${suffix}-${runId}@example.test`;
  const response = await request(httpServer())
    .post('/api/auth/org/signup')
    .send({
      companyName: `Phase 8 ${suffix} ${runId}`,
      slug: `phase8-${suffix}-${runId}`,
      email,
      password: `Phase8Org!${randomUUID().slice(0, 18)}`,
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
      email: `phase8-candidate-${suffix}-${runId}@example.test`,
      password: `Phase8Candidate!${randomUUID().slice(0, 16)}`,
      firstName: `Candidate${suffix}`,
      lastName: 'Phase8',
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
      title: `Phase 8 ${suffix} Job ${runId}`,
      description: 'Phase 8 release-gate job',
    });
  const posting = assertEnvelope<JobPosting>(created, 201);

  const published = await request(httpServer())
    .post(`/api/job-postings/${posting.id}/publish`)
    .set('Authorization', `Bearer ${tenant.token}`);
  return assertEnvelope<JobPosting>(published, 201);
};

const createInterviewerUser = async (
  tenant: TenantAccount,
  suffix: string,
): Promise<{ userId: string; token: string; email: string }> => {
  const pool = cleanupPool;
  if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
  const email = `phase8-interviewer-${suffix}-${runId}@example.test`;
  const password = `Phase8Iv!${randomUUID().slice(0, 16)}`;
  const userId = randomUUID();
  const passwordHash = await argon2.hash(password);
  await pool.query(
    `INSERT INTO "tenant_${tenant.tenantId}"."users" (id, email, password_hash, role)
     VALUES ($1, $2, $3, 'Interviewer')`,
    [userId, email, passwordHash],
  );
  await pool.query(
    `INSERT INTO public.user_emails (id, email, tenant_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), email, tenant.tenantId, userId],
  );
  createdOrgUserIds.push(userId);

  const signin = await request(httpServer())
    .post('/api/auth/signin')
    .send({ email, password });
  const tokens = assertEnvelope<Tokens>(signin, 200);
  return { userId, token: tokens.accessToken, email };
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
      'DELETE FROM public.audit_logs WHERE tenant_id = ANY($1::text[])',
      [createdTenantIds],
    );
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

describe('Phase 8 release gate', () => {
  let tenant: TenantAccount;
  let candidate: CandidateAccount;
  let job: JobPosting;
  let applicationId: string;
  let interviewerA: { userId: string; token: string; email: string };
  let interviewerB: { userId: string; token: string; email: string };

  beforeAll(async () => {
    jest.setTimeout(30000);
    await verifyInfrastructure();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();

    tenant = await createTenant('a');
    job = await createOpenJob(tenant, 'A');
    candidate = await createCandidate('a');
    interviewerA = await createInterviewerUser(tenant, 'A');
    interviewerB = await createInterviewerUser(tenant, 'B');

    const applyResponse = await request(httpServer())
      .post(`/api/candidate/jobs/${tenant.tenantId}/${job.id}/apply`)
      .set('Authorization', `Bearer ${candidate.token}`)
      .send({ coverLetter: 'Phase 8 interview test' });
    const application = assertEnvelope<{ applicationId: string }>(
      applyResponse,
      201,
    );
    applicationId = application.applicationId;
  });

  afterAll(async () => {
    try {
      await cleanupDatabase();
      await cleanupRedisKeys('bull:notifications:*');
    } finally {
      if (app) await app.close();
      if (cleanupRedis) await cleanupRedis.quit();
      if (cleanupPool) await cleanupPool.end();
    }
  });

  it('schedules an interview and auto-moves the application to the Interview stage', async () => {
    const scheduled = await request(httpServer())
      .post('/api/interviews')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({
        applicationId,
        interviewerId: interviewerA.userId,
        scheduledAt: '2026-08-10T14:00:00.000Z',
      });
    const interview = assertEnvelope<Interview>(scheduled, 201);
    expect(interview.interviewerId).toBe(interviewerA.userId);
    expect(interview.applicationId).toBe(applicationId);
    expect(interview.status).toBe('scheduled');

    const detail = await request(httpServer())
      .get(`/api/applications/${applicationId}`)
      .set('Authorization', `Bearer ${tenant.token}`);
    const application = assertEnvelope<{ stageName: string }>(detail, 200);
    expect(application.stageName).toBe('Interview');

    const pool = cleanupPool;
    if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
    const indexed = await pool.query(
      `SELECT status FROM public.candidate_applications_index
       WHERE application_id = $1`,
      [applicationId],
    );
    expect(indexed.rows[0]?.status).toBe('Interview');
  });

  it('filters interviews server-side by assignment', async () => {
    const own = await request(httpServer())
      .get('/api/interviews')
      .set('Authorization', `Bearer ${interviewerA.token}`);
    const ownList = assertEnvelope<Interview[]>(own, 200);
    expect(ownList).toHaveLength(1);
    expect(ownList[0].interviewerId).toBe(interviewerA.userId);

    const other = await request(httpServer())
      .get('/api/interviews')
      .set('Authorization', `Bearer ${interviewerB.token}`);
    const otherList = assertEnvelope<Interview[]>(other, 200);
    expect(otherList).toHaveLength(0);

    const all = await request(httpServer())
      .get('/api/interviews')
      .set('Authorization', `Bearer ${tenant.token}`);
    const allList = assertEnvelope<Interview[]>(all, 200);
    expect(allList).toHaveLength(1);
  });

  it('enforces feedback assignment rules', async () => {
    const submitted = await request(httpServer())
      .post(`/api/interviews/${interviewerA.userId}/feedback`)
      .set('Authorization', `Bearer ${interviewerA.token}`)
      .send({ rating: 4, comments: 'Strong candidate' });
    assertStatus(submitted, 404);

    const interviews = await request(httpServer())
      .get('/api/interviews')
      .set('Authorization', `Bearer ${interviewerA.token}`);
    const list = assertEnvelope<Interview[]>(interviews, 200);
    const interviewId = list[0].id;

    const forbidden = await request(httpServer())
      .post(`/api/interviews/${interviewId}/feedback`)
      .set('Authorization', `Bearer ${interviewerB.token}`)
      .send({ rating: 2 });
    assertStatus(forbidden, 403);

    const created = await request(httpServer())
      .post(`/api/interviews/${interviewId}/feedback`)
      .set('Authorization', `Bearer ${interviewerA.token}`)
      .send({ rating: 4, comments: 'Strong candidate' });
    const feedback = assertEnvelope<{
      interviewId: string;
      rating: number;
      comments: string;
    }>(created, 201);
    expect(feedback.rating).toBe(4);
    expect(feedback.comments).toBe('Strong candidate');

    const duplicate = await request(httpServer())
      .post(`/api/interviews/${interviewId}/feedback`)
      .set('Authorization', `Bearer ${interviewerA.token}`)
      .send({ rating: 5 });
    assertStatus(duplicate, 409);

    const detail = await request(httpServer())
      .get(`/api/interviews/${interviewId}`)
      .set('Authorization', `Bearer ${tenant.token}`);
    const interview = assertEnvelope<Interview>(detail, 200);
    expect(interview.status).toBe('completed');
  });

  it('allows schedulers to reschedule and cancel', async () => {
    const interviews = await request(httpServer())
      .get('/api/interviews')
      .set('Authorization', `Bearer ${tenant.token}`);
    const list = assertEnvelope<Interview[]>(interviews, 200);
    const interviewId = list[0].id;

    const rescheduled = await request(httpServer())
      .patch(`/api/interviews/${interviewId}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ scheduledAt: '2026-08-11T10:00:00.000Z' });
    const afterReschedule = assertEnvelope<Interview>(rescheduled, 200);
    expect(afterReschedule.scheduledAt).toBe('2026-08-11T10:00:00.000Z');

    const cancelled = await request(httpServer())
      .patch(`/api/interviews/${interviewId}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ status: 'cancelled' });
    const afterCancel = assertEnvelope<Interview>(cancelled, 200);
    expect(afterCancel.status).toBe('cancelled');
  });

  it('rejects non-interviewer roles from scheduling and feedback', async () => {
    const candidateSchedule = await request(httpServer())
      .post('/api/interviews')
      .set('Authorization', `Bearer ${candidate.token}`)
      .send({
        applicationId,
        interviewerId: interviewerA.userId,
        scheduledAt: '2026-08-12T10:00:00.000Z',
      });
    assertStatus(candidateSchedule, 403);

    const candidateList = await request(httpServer())
      .get('/api/interviews')
      .set('Authorization', `Bearer ${candidate.token}`);
    assertStatus(candidateList, 403);

    const interviews = await request(httpServer())
      .get('/api/interviews')
      .set('Authorization', `Bearer ${tenant.token}`);
    const list = assertEnvelope<Interview[]>(interviews, 200);
    const interviewId = list[0].id;

    const orgFeedback = await request(httpServer())
      .post(`/api/interviews/${interviewId}/feedback`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ rating: 3 });
    assertStatus(orgFeedback, 403);
  });

  it('lists tenant users for the interviewer picker', async () => {
    const response = await request(httpServer())
      .get('/api/org/users')
      .set('Authorization', `Bearer ${tenant.token}`);
    const users = assertEnvelope<{ id: string; email: string; role: string }[]>(
      response,
      200,
    );
    expect(users.some((user) => user.email === interviewerA.email)).toBe(true);
    expect(users.some((user) => user.email === interviewerB.email)).toBe(true);
  });
});
