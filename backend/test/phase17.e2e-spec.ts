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
  slug: string;
  name: string;
}

interface PlatformJob {
  id: string;
  title: string;
}

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdCompanyIds: string[] = [];
const createdOrgUserIds: string[] = [];
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
  const email = `phase17-${suffix}-${runId}@example.test`;
  const password = `Phase17Org!${randomUUID().slice(0, 18)}`;
  const slug = `phase17-${suffix}-${runId}`;
  const name = `Phase 17 ${suffix} ${runId}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({
      companyName: name,
      slug,
      email,
      password,
    });
  const tokens = assertEnvelope<Tokens>(response, 201);
  const claims = JSON.parse(
    Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString('utf8'),
  ) as JwtClaims;
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
    slug,
    name,
  };
};

const createSuperAdmin = async (): Promise<CompanyAccount> => {
  const pool = cleanupPool;
  if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
  const email = `phase17-superadmin-${runId}@example.test`;
  const password = `Phase17Sa!${randomUUID().slice(0, 16)}`;
  const userId = randomUUID();
  const passwordHash = (await argon2.hash(password)) as string;
  await pool.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, passwordHash, 'Phase 17 SuperAdmin'],
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
    slug: 'public',
    name: 'Phase 17 SuperAdmin',
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
  const email = `phase17-cand-${suffix}-${runId}@example.test`;
  const password = `Phase17Cd!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post('/api/platform/candidates')
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({
      email,
      password,
      firstName: `Phase17 ${suffix}`,
      lastName: 'Candidate',
    });
  const candidate = assertEnvelope<{ id: string; email: string }>(created, 201);
  createdCandidateIds.push(candidate.id);
  return { id: candidate.id, email, password };
};

const createPlatformJob = async (
  companyId: string,
  title: string,
): Promise<PlatformJob> => {
  const created = await request(httpServer())
    .post('/api/platform/jobs')
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({
      companyId,
      title,
      description: 'Phase 17 description',
      employmentType: 'full-time',
      location: 'Makati City',
      workSetup: 'hybrid',
    });
  return assertEnvelope<PlatformJob>(created, 201);
};

const publishJob = async (jobId: string): Promise<void> => {
  const response = await request(httpServer())
    .post(`/api/platform/jobs/${jobId}/publish`)
    .set('Authorization', `Bearer ${superAdminToken()}`);
  assertStatus(response, 201);
};

const applyToJob = async (
  candidateToken: string,
  companyId: string,
  jobId: string,
): Promise<string> => {
  const response = await request(httpServer())
    .post(`/api/candidate/jobs/${companyId}/${jobId}/apply`)
    .set('Authorization', `Bearer ${candidateToken}`)
    .send({});
  return assertEnvelope<{ applicationId: string }>(response, 201).applicationId;
};

const moveApplicationToRejected = async (
  companyToken: string,
  applicationId: string,
  companyId: string,
): Promise<void> => {
  const pool = cleanupPool;
  if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM "company_${companyId}".pipeline_stages WHERE name = 'Rejected'`,
  );
  const rejectedStageId = rows[0]?.id;
  if (!rejectedStageId)
    throw new Error('Seeded Rejected stage was not found in the schema');
  const response = await request(httpServer())
    .patch(`/api/applications/${applicationId}/stage`)
    .set('Authorization', `Bearer ${companyToken}`)
    .send({ stageId: rejectedStageId });
  assertStatus(response, 200);
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

describe('Phase 17 release gate', () => {
  jest.setTimeout(30000);
  let superAdmin: CompanyAccount;
  let tenantA: CompanyAccount;
  let tenantB: CompanyAccount;
  let candidate: { id: string; email: string; password: string };
  let candidateToken = '';
  let jobA1: PlatformJob;
  let jobA2: PlatformJob;
  let baseline: Record<string, unknown>;

  beforeAll(async () => {
    await verifyInfrastructure();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();

    superAdmin = await createSuperAdmin();
    superAdminTokenValue = superAdmin.token;
    const baselineResponse = await request(httpServer())
      .get('/api/platform/dashboard')
      .set('Authorization', `Bearer ${superAdminToken()}`);
    baseline = assertEnvelope<Record<string, unknown>>(baselineResponse, 200);
    tenantA = await createTenant('a');
    tenantB = await createTenant('b');

    jobA1 = await createPlatformJob(
      tenantA.companyId,
      `Phase17 Backend Engineer ${runId}`,
    );
    await publishJob(jobA1.id);
    jobA2 = await createPlatformJob(
      tenantA.companyId,
      `Phase17 Frontend Engineer ${runId}`,
    );

    candidate = await createPlatformCandidate('main');
    const signin = await signIn(candidate.email, candidate.password);
    candidateToken = assertEnvelope<Tokens>(signin, 200).accessToken;

    const applicationId = await applyToJob(
      candidateToken,
      tenantA.companyId,
      jobA1.id,
    );
    await moveApplicationToRejected(
      tenantA.token,
      applicationId,
      tenantA.companyId,
    );
    await request(httpServer())
      .patch(`/api/platform/companies/${tenantB.companyId}/suspend`)
      .set('Authorization', `Bearer ${superAdminToken()}`);
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

  describe('platform dashboard', () => {
    it('returns tenant aggregates with bucketed company growth', async () => {
      const response = await request(httpServer())
        .get('/api/platform/dashboard')
        .set('Authorization', `Bearer ${superAdminToken()}`);
      const dashboard = assertEnvelope<Record<string, unknown>>(response, 200);

      expect(dashboard.companies).toBe((baseline.companies as number) + 2);
      expect(dashboard.activeCompanies).toBe(
        (baseline.activeCompanies as number) + 1,
      );
      expect(dashboard.suspendedCompanies).toBe(
        (baseline.suspendedCompanies as number) + 1,
      );
      expect(dashboard.applications).toBe(
        (baseline.applications as number) + 1,
      );
      expect(dashboard.jobs).toBe((baseline.jobs as number) + 2);
      expect(dashboard.users).toBe((baseline.users as number) + 2);

      const overTime = dashboard.companiesOverTime as Record<
        string,
        Array<{ label: string; count: number }>
      >;
      expect(overTime.day).toHaveLength(30);
      expect(overTime.week).toHaveLength(12);
      expect(overTime.month).toHaveLength(12);
      const baselineOverTime = baseline.companiesOverTime as Record<
        string,
        Array<{ label: string; count: number }>
      >;
      expect(overTime.day.at(-1)?.count).toBe(
        (baselineOverTime.day.at(-1)?.count ?? 0) + 2,
      );

      const applicationsPerCompany = dashboard.applicationsPerCompany as Array<{
        companyName: string;
        count: number;
      }>;
      expect(
        applicationsPerCompany.filter(
          (row) => row.companyName === tenantA.name,
        ),
      ).toEqual([{ companyName: tenantA.name, count: 1 }]);

      const usersPerCompany = dashboard.usersPerCompany as Array<{
        companyName: string;
        count: number;
      }>;
      expect(usersPerCompany).toEqual(
        expect.arrayContaining([
          { companyName: tenantA.name, count: 1 },
          { companyName: tenantB.name, count: 1 },
        ]),
      );

      const jobsByStatusPerCompany = dashboard.jobsByStatusPerCompany as Array<{
        companyName: string;
        draft: number;
        open: number;
        closed: number;
      }>;
      expect(
        jobsByStatusPerCompany.filter(
          (row) => row.companyName === tenantA.name,
        ),
      ).toEqual([{ companyName: tenantA.name, draft: 1, open: 1, closed: 0 }]);
    });

    it('rejects non-SuperAdmin roles', async () => {
      const response = await request(httpServer())
        .get('/api/platform/dashboard')
        .set('Authorization', `Bearer ${tenantA.token}`);
      assertStatus(response, 403);
    });
  });

  describe('company dashboard summary', () => {
    it('returns chart-ready aggregates for the current company', async () => {
      const response = await request(httpServer())
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${tenantA.token}`);
      const summary = assertEnvelope<Record<string, unknown>>(response, 200);

      expect(summary.totalApplications).toBe(1);
      expect(summary.totalCandidates).toBe(1);
      expect(summary.openJobPostings).toBe(1);

      const overTime = summary.applicationsOverTime as Record<
        string,
        Array<{ label: string; count: number }>
      >;
      expect(overTime.day).toHaveLength(30);
      expect(overTime.week).toHaveLength(12);
      expect(overTime.month).toHaveLength(12);
      expect(overTime.day.at(-1)?.count).toBe(1);

      const topJobs = summary.topJobsByApplications as Array<{
        title: string;
        count: number;
      }>;
      expect(topJobs).toEqual([{ title: jobA1.title, count: 1 }]);
      expect(topJobs).not.toContainEqual(
        expect.objectContaining({ title: jobA2.title }),
      );

      const jobsByStatus = summary.jobsByStatus as Array<{
        status: string;
        count: number;
      }>;
      expect(jobsByStatus).toContainEqual({ status: 'draft', count: 1 });
      expect(jobsByStatus).toContainEqual({ status: 'open', count: 1 });

      const jobsByEmploymentType = summary.jobsByEmploymentType as Array<{
        type: string;
        count: number;
      }>;
      expect(jobsByEmploymentType).toContainEqual({
        type: 'full-time',
        count: 2,
      });

      const interviewBreakdown = summary.interviewStatusBreakdown as Array<{
        status: string;
        count: number;
      }>;
      expect(interviewBreakdown).toEqual([]);

      const rejection = summary.rejection as {
        rejected: number;
        total: number;
      };
      expect(rejection).toEqual({ rejected: 1, total: 1 });

      const byStage = summary.applicationsByStage as Array<{
        stageName: string;
        count: number;
      }>;
      expect(byStage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stageName: 'Rejected', count: 1 }),
        ]),
      );
    });
  });
});

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
