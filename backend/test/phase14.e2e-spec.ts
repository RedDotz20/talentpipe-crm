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
}

interface PlatformJob {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  employmentType: string | null;
  location: string | null;
  workSetup: string | null;
  status: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdCompanyIds: string[] = [];
const createdOrgUserIds: string[] = [];
const createdSuperAdminIds: string[] = [];
const createdCandidateIds: string[] = [];
const createdInterviewerIds: string[] = [];
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

const assertPaginated = <T>(
  response: { status: number; body: unknown },
  expectedStatus: number,
): Paginated<T> => {
  const page = assertEnvelope<Paginated<T>>(response, expectedStatus);
  if (!Array.isArray(page.data)) {
    throw new Error('The response did not contain a paginated data array');
  }
  if (typeof page.total !== 'number') {
    throw new Error('The response did not contain a numeric total');
  }
  return page;
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
  const email = `phase14-${suffix}-${runId}@example.test`;
  const password = `Phase14Org!${randomUUID().slice(0, 18)}`;
  const slug = `phase14-${suffix}-${runId}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({
      companyName: `Phase 14 ${suffix} ${runId}`,
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
  };
};

const createSuperAdmin = async (): Promise<CompanyAccount> => {
  const pool = cleanupPool;
  if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
  const email = `phase14-superadmin-${runId}@example.test`;
  const password = `Phase14Sa!${randomUUID().slice(0, 16)}`;
  const userId = randomUUID();
  const passwordHash = (await argon2.hash(password)) as string;
  await pool.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, passwordHash, 'Phase 14 SuperAdmin'],
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
  const email = `phase14-cand-${suffix}-${runId}@example.test`;
  const password = `Phase14Cd!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post('/api/platform/candidates')
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({
      email,
      password,
      firstName: `Phase14 ${suffix}`,
      lastName: 'Candidate',
    });
  const candidate = assertEnvelope<{ id: string; email: string }>(created, 201);
  createdCandidateIds.push(candidate.id);
  return { id: candidate.id, email, password };
};

const createPlatformJob = async (
  companyId: string,
  title: string,
  meta?: { employmentType?: string; workSetup?: string; location?: string },
): Promise<PlatformJob> => {
  const created = await request(httpServer())
    .post('/api/platform/jobs')
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({
      companyId,
      title,
      description: 'Phase 14 description',
      employmentType: meta?.employmentType ?? 'full-time',
      location: meta?.location ?? 'Makati City',
      workSetup: meta?.workSetup ?? 'hybrid',
    });
  return assertEnvelope<PlatformJob>(created, 201);
};

const publishJob = async (jobId: string): Promise<PlatformJob> => {
  const response = await request(httpServer())
    .post(`/api/platform/jobs/${jobId}/publish`)
    .set('Authorization', `Bearer ${superAdminToken()}`);
  return assertEnvelope<PlatformJob>(response, 201);
};

const applyToJob = async (
  candidateToken: string,
  companyId: string,
  jobId: string,
): Promise<void> => {
  const response = await request(httpServer())
    .post(`/api/candidate/jobs/${companyId}/${jobId}/apply`)
    .set('Authorization', `Bearer ${candidateToken}`)
    .send({});
  assertStatus(response, 201);
};

const bookmarkJob = async (
  candidateToken: string,
  companyId: string,
  jobId: string,
): Promise<void> => {
  const response = await request(httpServer())
    .post('/api/candidate/bookmarks')
    .set('Authorization', `Bearer ${candidateToken}`)
    .send({ companyId, jobPostingId: jobId });
  assertStatus(response, 201);
};

const createInterviewer = async (
  companyId: string,
): Promise<{ id: string; email: string; password: string }> => {
  const email = `phase14-int-${runId}@example.test`;
  const password = `Phase14Iv!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post(`/api/platform/companies/${companyId}/users`)
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({ email, role: 'Interviewer', password });
  const user = assertEnvelope<{ id: string }>(created, 201);
  createdInterviewerIds.push(user.id);
  return { id: user.id, email, password };
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
  if (createdInterviewerIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.refresh_tokens WHERE user_id = ANY($1::uuid[])',
      [createdInterviewerIds],
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

describe('Phase 14 release gate', () => {
  jest.setTimeout(30000);
  let superAdmin: CompanyAccount;
  let tenantA: CompanyAccount;
  let tenantB: CompanyAccount;
  let candidateToken = '';
  let jobA1: PlatformJob;
  let jobA2: PlatformJob;
  let jobA3: PlatformJob;
  let jobB1: PlatformJob;
  let firstStageName = 'Applied';

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
    tenantA = await createTenant('a');
    tenantB = await createTenant('b');

    jobA1 = await createPlatformJob(
      tenantA.companyId,
      `Phase14 Backend Engineer ${runId}`,
    );
    jobA2 = await createPlatformJob(
      tenantA.companyId,
      `Phase14 Frontend Engineer ${runId}`,
      {
        employmentType: 'contract',
        workSetup: 'work-from-home',
        location: 'Manila',
      },
    );
    jobA3 = await createPlatformJob(
      tenantA.companyId,
      `Phase14 Data Scientist ${runId}`,
      {
        employmentType: 'intern',
        workSetup: 'on-site',
        location: 'Cebu',
      },
    );
    jobB1 = await createPlatformJob(
      tenantB.companyId,
      `Phase14 Platform Engineer ${runId}`,
    );
    await publishJob(jobA1.id);
    await publishJob(jobA2.id);
    await publishJob(jobA3.id);
    await publishJob(jobB1.id);

    const candidate = await createPlatformCandidate('main');
    const signin = await signIn(candidate.email, candidate.password);
    candidateToken = assertEnvelope<Tokens>(signin, 200).accessToken;

    await applyToJob(candidateToken, tenantA.companyId, jobA1.id);
    await applyToJob(candidateToken, tenantA.companyId, jobA2.id);
    await applyToJob(candidateToken, tenantB.companyId, jobB1.id);
    await bookmarkJob(candidateToken, tenantA.companyId, jobA1.id);
    await bookmarkJob(candidateToken, tenantA.companyId, jobA3.id);

    const stages = await request(httpServer())
      .get(`/api/platform/companies/${tenantA.companyId}/pipeline-stages`)
      .set('Authorization', `Bearer ${superAdminToken()}`);
    const stageList = assertEnvelope<Array<{ name: string }>>(stages, 200);
    firstStageName = stageList[0]?.name ?? 'Applied';
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

  describe('candidate jobs list query', () => {
    it('searches by title', async () => {
      const response = await request(httpServer())
        .get('/api/candidate/jobs')
        .query({ search: 'Phase14 Frontend', pageSize: 50 })
        .set('Authorization', `Bearer ${candidateToken}`);
      const page = assertPaginated<{ title: string }>(response, 200);
      expect(page.data).toHaveLength(1);
      expect(page.data[0].title).toBe(jobA2.title);
    });

    it('filters by employmentType', async () => {
      const response = await request(httpServer())
        .get('/api/candidate/jobs')
        .query({ search: 'Phase14', employmentType: 'intern', pageSize: 50 })
        .set('Authorization', `Bearer ${candidateToken}`);
      const page = assertPaginated<{ title: string }>(response, 200);
      expect(page.data.map((j) => j.title)).toEqual([jobA3.title]);
    });

    it('sorts and paginates', async () => {
      const response = await request(httpServer())
        .get('/api/candidate/jobs')
        .query({
          search: 'Phase14',
          sortBy: 'title',
          sortDir: 'asc',
          pageSize: 2,
          page: 1,
        })
        .set('Authorization', `Bearer ${candidateToken}`);
      const page = assertPaginated<{ title: string }>(response, 200);
      expect(page.data).toHaveLength(2);
      expect(page.total).toBe(4);
      const titles = page.data.map((j) => j.title);
      expect(titles[0] < titles[1]).toBe(true);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(2);
    });

    it('excludes suspended companies with correct totals', async () => {
      await request(httpServer())
        .patch(`/api/platform/companies/${tenantB.companyId}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken()}`);
      const response = await request(httpServer())
        .get('/api/candidate/jobs')
        .query({ search: 'Phase14', pageSize: 2, page: 1 })
        .set('Authorization', `Bearer ${candidateToken}`);
      const page = assertPaginated<{ title: string }>(response, 200);
      expect(page.total).toBe(3);
      expect(page.data.every((j) => j.title !== jobB1.title)).toBe(true);
      await request(httpServer())
        .patch(`/api/platform/companies/${tenantB.companyId}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken()}`);
    });

    it('falls back to the default sort for injection attempts', async () => {
      const response = await request(httpServer())
        .get('/api/candidate/jobs')
        .query({
          search: 'Phase14',
          sortBy: '1;DROP TABLE job_listings_index--',
          pageSize: 50,
        })
        .set('Authorization', `Bearer ${candidateToken}`);
      const page = assertPaginated<{ title: string }>(response, 200);
      expect(page.total).toBe(4);
    });
  });

  describe('candidate applications list query', () => {
    it('searches jobTitle and filters by status', async () => {
      const response = await request(httpServer())
        .get('/api/candidate/applications')
        .query({ search: 'Backend', status: firstStageName, pageSize: 50 })
        .set('Authorization', `Bearer ${candidateToken}`);
      const page = assertPaginated<{ jobTitle: string }>(response, 200);
      expect(page.data.map((a) => a.jobTitle)).toEqual([jobA1.title]);
    });

    it('paginates and returns total', async () => {
      const response = await request(httpServer())
        .get('/api/candidate/applications')
        .query({ pageSize: 2, page: 1 })
        .set('Authorization', `Bearer ${candidateToken}`);
      const page = assertPaginated<{ jobTitle: string }>(response, 200);
      expect(page.data).toHaveLength(2);
      expect(page.total).toBe(3);
    });
  });

  describe('candidate bookmarks list query', () => {
    it('searches jobTitle and sorts by title', async () => {
      const response = await request(httpServer())
        .get('/api/candidate/bookmarks')
        .query({
          search: 'Engineer',
          sortBy: 'jobTitle',
          sortDir: 'asc',
          pageSize: 50,
        })
        .set('Authorization', `Bearer ${candidateToken}`);
      const page = assertPaginated<{ jobTitle: string }>(response, 200);
      expect(page.data).toHaveLength(1);
      expect(page.data[0].jobTitle).toBe(jobA1.title);
    });
  });

  describe('company list queries', () => {
    it('searches and filters job postings with pagination', async () => {
      const response = await request(httpServer())
        .get('/api/job-postings')
        .query({ search: 'Engineer', status: 'open', pageSize: 2, page: 1 })
        .set('Authorization', `Bearer ${tenantA.token}`);
      const page = assertPaginated<{ title: string }>(response, 200);
      expect(page.total).toBe(2);
      expect(page.data).toHaveLength(2);
      expect(page.data.every((j) => j.title.includes('Engineer'))).toBe(true);
    });

    it('searches candidates by name', async () => {
      const response = await request(httpServer())
        .get('/api/candidates')
        .query({ search: 'Phase14', pageSize: 50 })
        .set('Authorization', `Bearer ${tenantA.token}`);
      const page = assertPaginated<{ name: string }>(response, 200);
      expect(page.total).toBeGreaterThanOrEqual(1);
    });

    it('searches applications without pagination (array return)', async () => {
      const response = await request(httpServer())
        .get('/api/applications')
        .query({ search: 'Backend' })
        .set('Authorization', `Bearer ${tenantA.token}`);
      const apps = assertEnvelope<Array<{ jobTitle: string }>>(response, 200);
      expect(Array.isArray(apps)).toBe(true);
      expect(apps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('company interviews list query', () => {
    it('searches by candidate and filters by status', async () => {
      const interviewer = await createInterviewer(tenantA.companyId);
      const apps = assertEnvelope<Array<{ id: string; jobTitle: string }>>(
        await request(httpServer())
          .get('/api/applications')
          .query({ search: 'Backend' })
          .set('Authorization', `Bearer ${tenantA.token}`),
        200,
      );
      const application = apps[0];
      await request(httpServer())
        .post('/api/interviews')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          applicationId: application.id,
          interviewerId: interviewer.id,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(201);

      const response = await request(httpServer())
        .get('/api/interviews')
        .query({ search: 'Phase14', status: 'scheduled', pageSize: 50 })
        .set('Authorization', `Bearer ${tenantA.token}`);
      const page = assertPaginated<{ status: string }>(response, 200);
      expect(page.total).toBe(1);
      expect(page.data[0].status).toBe('scheduled');
    });
  });

  describe('platform list queries', () => {
    it('companies: search + status filter + pagination', async () => {
      const response = await request(httpServer())
        .get('/api/platform/companies')
        .query({ search: runId, pageSize: 1, page: 1 })
        .set('Authorization', `Bearer ${superAdminToken()}`);
      const page = assertPaginated<{ name: string }>(response, 200);
      expect(page.total).toBe(2);
      expect(page.data).toHaveLength(1);
      expect(page.data[0].name).toContain('Phase 14');
    });

    it('users: type filter + company filter + pagination', async () => {
      const response = await request(httpServer())
        .get('/api/platform/users')
        .query({ type: 'company', companyId: tenantA.companyId, pageSize: 50 })
        .set('Authorization', `Bearer ${superAdminToken()}`);
      const page = assertPaginated<{ type: string; companyId: string | null }>(
        response,
        200,
      );
      expect(page.data.length).toBeGreaterThanOrEqual(1);
      expect(page.data.every((u) => u.type === 'company')).toBe(true);
      expect(page.data.every((u) => u.companyId === tenantA.companyId)).toBe(
        true,
      );
      expect(page.total).toBe(page.data.length);
    });

    it('jobs: company filter + sort', async () => {
      const response = await request(httpServer())
        .get('/api/platform/jobs')
        .query({
          companyId: tenantA.companyId,
          sortBy: 'title',
          sortDir: 'asc',
          pageSize: 50,
        })
        .set('Authorization', `Bearer ${superAdminToken()}`);
      const page = assertPaginated<{ title: string }>(response, 200);
      expect(page.total).toBe(3);
      const titles = page.data.map((j) => j.title);
      expect([...titles].sort()).toEqual(titles);
    });

    it('applications: search + company filter', async () => {
      const response = await request(httpServer())
        .get('/api/platform/applications')
        .query({
          search: 'Backend',
          companyId: tenantA.companyId,
          pageSize: 50,
        })
        .set('Authorization', `Bearer ${superAdminToken()}`);
      const page = assertPaginated<{ jobTitle: string; companyId: string }>(
        response,
        200,
      );
      expect(page.total).toBe(1);
      expect(page.data[0].jobTitle).toBe(jobA1.title);
      expect(page.data[0].companyId).toBe(tenantA.companyId);
    });
  });

  describe('public careers list query', () => {
    it('searches and filters by employmentType with pagination', async () => {
      const response = await request(httpServer())
        .get(`/api/public/${tenantA.slug}/jobs`)
        .query({
          search: 'Data',
          employmentType: 'intern',
          pageSize: 1,
          page: 1,
        });
      const page = assertPaginated<{ title: string }>(response, 200);
      expect(page.total).toBe(1);
      expect(page.data).toHaveLength(1);
      expect(page.data[0].title).toBe(jobA3.title);
    });
  });
});
