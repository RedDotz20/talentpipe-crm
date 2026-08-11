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

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdCompanyIds: string[] = [];
const createdOrgUserIds: string[] = [];
const createdSuperAdminIds: string[] = [];
const createdCandidateIds: string[] = [];
const createdSkillIds: string[] = [];
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
  const email = `phase13-${suffix}-${runId}@example.test`;
  const password = `Phase13Org!${randomUUID().slice(0, 18)}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({
      companyName: `Phase 13 ${suffix} ${runId}`,
      slug: `phase13-${suffix}-${runId}`,
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
  };
};

const createSuperAdmin = async (): Promise<CompanyAccount> => {
  const pool = cleanupPool;
  if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
  const email = `phase13-superadmin-${runId}@example.test`;
  const password = `Phase13Sa!${randomUUID().slice(0, 16)}`;
  const userId = randomUUID();
  const passwordHash = (await argon2.hash(password)) as string;
  await pool.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, passwordHash, 'Phase 13 SuperAdmin'],
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
  const email = `phase13-cand-${suffix}-${runId}@example.test`;
  const password = `Phase13Cd!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post('/api/platform/candidates')
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({
      email,
      password,
      firstName: `Phase13 ${suffix}`,
      lastName: 'Candidate',
    });
  const candidate = assertEnvelope<{ id: string; email: string }>(created, 201);
  createdCandidateIds.push(candidate.id);
  return { id: candidate.id, email, password };
};

const createPlatformJob = async (
  companyId: string,
  title: string,
  requiredSkillIds?: string[],
): Promise<PlatformJob> => {
  const created = await request(httpServer())
    .post('/api/platform/jobs')
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({
      companyId,
      title,
      description: 'Phase 13 description',
      employmentType: 'full-time',
      location: 'Makati City',
      workSetup: 'hybrid',
      requiredSkillIds,
    });
  return assertEnvelope<PlatformJob>(created, 201);
};

const setJobStatus = async (
  jobId: string,
  action: 'publish' | 'close',
): Promise<PlatformJob> => {
  const response = await request(httpServer())
    .post(`/api/platform/jobs/${jobId}/${action}`)
    .set('Authorization', `Bearer ${superAdminToken()}`);
  return assertEnvelope<PlatformJob>(
    response,
    action === 'publish' ? 201 : 201,
  );
};

const candidateSearch = async (token: string): Promise<string[]> => {
  const response = await request(httpServer())
    .get('/api/candidate/jobs')
    .query({ pageSize: 50 })
    .set('Authorization', `Bearer ${token}`);
  const body = assertEnvelope<{
    data: Array<{ title: string }>;
  }>(response, 200);
  return body.data.map((job) => job.title);
};

const cleanupDatabase = async (): Promise<void> => {
  if (!cleanupPool) return;
  if (createdSkillIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.skills WHERE id = ANY($1::uuid[])',
      [createdSkillIds],
    );
  }
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

describe('Phase 13 release gate', () => {
  jest.setTimeout(30000);
  let superAdmin: CompanyAccount;
  let tenant: CompanyAccount;
  let doomed: CompanyAccount;
  let candidateAToken = '';
  let candidateBToken = '';
  const jobTitle = `Phase 13 Job ${runId}`;
  let createdJobId = '';

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
    tenant = await createTenant('a');
    doomed = await createTenant('doomed');
    const candidateA = await createPlatformCandidate('a');
    const candidateB = await createPlatformCandidate('b');
    const signinA = await signIn(candidateA.email, candidateA.password);
    const signinB = await signIn(candidateB.email, candidateB.password);
    candidateAToken = assertEnvelope<Tokens>(signinA, 200).accessToken;
    candidateBToken = assertEnvelope<Tokens>(signinB, 200).accessToken;
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

  describe('platform job RBAC', () => {
    it('forbids CompanyAdmin and Candidate on job routes, requires auth', async () => {
      const routes: Array<[string, string]> = [
        ['GET', '/api/platform/jobs'],
        ['POST', '/api/platform/jobs'],
        ['PATCH', `/api/platform/jobs/${randomUUID()}`],
        ['DELETE', `/api/platform/jobs/${randomUUID()}`],
      ];
      for (const token of [tenant.token, candidateAToken]) {
        for (const [method, path] of routes) {
          const response = await request(httpServer())
            [method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path)
            .set('Authorization', `Bearer ${token}`)
            .send({});
          assertStatus(response, 403);
        }
      }
      const anonymous = await request(httpServer()).get('/api/platform/jobs');
      assertStatus(anonymous, 401);
    });
  });

  describe('platform job CRUD', () => {
    it('creates a draft job in the target company', async () => {
      const job = await createPlatformJob(tenant.companyId, jobTitle);
      createdJobId = job.id;
      expect(job.status).toBe('draft');
      expect(job.companyId).toBe(tenant.companyId);
      expect(job.companyName).toBe(`Phase 13 a ${runId}`);
      expect(job.employmentType).toBe('full-time');
      expect(job.location).toBe('Makati City');
      expect(job.workSetup).toBe('hybrid');
    });

    it('lists jobs across companies and filters by company', async () => {
      const all = await request(httpServer())
        .get('/api/platform/jobs')
        .query({ pageSize: 50 })
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const rows = assertEnvelope<{ data: PlatformJob[] }>(all, 200).data;
      expect(rows.find((r) => r.id === createdJobId)?.title).toBe(jobTitle);

      const filtered = await request(httpServer())
        .get(`/api/platform/jobs?companyId=${tenant.companyId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const filteredRows = assertEnvelope<{ data: PlatformJob[] }>(
        filtered,
        200,
      ).data;
      expect(filteredRows.map((r) => r.id)).toContain(createdJobId);
      expect(filteredRows.every((r) => r.companyId === tenant.companyId)).toBe(
        true,
      );
    });

    it('updates the title of a draft job', async () => {
      const updatedTitle = `${jobTitle} (edited)`;
      const response = await request(httpServer())
        .patch(`/api/platform/jobs/${createdJobId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ title: updatedTitle });
      const job = assertEnvelope<PlatformJob>(response, 200);
      expect(job.title).toBe(updatedTitle);
    });

    it('refuses to publish a job in an unknown company', async () => {
      const created = await request(httpServer())
        .post('/api/platform/jobs')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({
          companyId: randomUUID(),
          title: 'Ghost job',
          employmentType: 'full-time',
          location: 'Makati City',
          workSetup: 'on-site',
        });
      assertStatus(created, 404);
    });
  });

  describe('candidate job search visibility', () => {
    it('publishes the job and exposes it to candidate search', async () => {
      await setJobStatus(createdJobId, 'publish');
      const titles = await candidateSearch(candidateAToken);
      expect(titles).toContain(`${jobTitle} (edited)`);

      const detailResponse = await request(httpServer())
        .get(`/api/platform/jobs/${createdJobId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const detail = assertEnvelope<PlatformJob>(detailResponse, 200);
      expect(detail.employmentType).toBe('full-time');
      expect(detail.location).toBe('Makati City');
      expect(detail.workSetup).toBe('hybrid');

      const search = await request(httpServer())
        .get('/api/candidate/jobs')
        .query({ pageSize: 50 })
        .set('Authorization', `Bearer ${candidateAToken}`);
      const body = assertEnvelope<{
        data: Array<{
          jobPostingId: string;
          employmentType: string;
          location: string;
          workSetup: string;
        }>;
      }>(search, 200);
      const found = body.data.find((j) => j.jobPostingId === createdJobId);
      expect(found?.employmentType).toBe('full-time');
      expect(found?.location).toBe('Makati City');
      expect(found?.workSetup).toBe('hybrid');
    });

    it('closes the job, hiding it from search but keeping it viewable for the applied candidate', async () => {
      const applied = await request(httpServer())
        .post(`/api/candidate/jobs/${tenant.companyId}/${createdJobId}/apply`)
        .set('Authorization', `Bearer ${candidateAToken}`)
        .send({});
      assertEnvelope<{ applicationId: string }>(applied, 201);

      await setJobStatus(createdJobId, 'close');

      const titles = await candidateSearch(candidateAToken);
      expect(titles).not.toContain(`${jobTitle} (edited)`);

      const appliedDetail = await request(httpServer())
        .get(`/api/candidate/jobs/${tenant.companyId}/${createdJobId}`)
        .set('Authorization', `Bearer ${candidateAToken}`);
      const job = assertEnvelope<{ title: string; status: string }>(
        appliedDetail,
        200,
      );
      expect(job.title).toBe(`${jobTitle} (edited)`);
      expect(job.status).toBe('closed');

      const strangerDetail = await request(httpServer())
        .get(`/api/candidate/jobs/${tenant.companyId}/${createdJobId}`)
        .set('Authorization', `Bearer ${candidateBToken}`);
      assertStatus(strangerDetail, 404);
    });

    it('returns required skills on candidate job detail', async () => {
      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
      const skillId = randomUUID();
      await pool.query(
        `INSERT INTO public.skills (id, name, category) VALUES ($1, $2, $3)`,
        [skillId, `Phase 13 Skill ${runId}`, 'Testing'],
      );
      createdSkillIds.push(skillId);

      const job = await createPlatformJob(
        tenant.companyId,
        `Phase 13 Skills Job ${runId}`,
        [skillId],
      );
      await setJobStatus(job.id, 'publish');

      const detailResponse = await request(httpServer())
        .get(`/api/candidate/jobs/${tenant.companyId}/${job.id}`)
        .set('Authorization', `Bearer ${candidateAToken}`);
      const detail = assertEnvelope<
        PlatformJob & {
          requiredSkills: Array<{ id: string; name: string }>;
        }
      >(detailResponse, 200);
      expect(detail.requiredSkills).toEqual([
        expect.objectContaining({
          id: skillId,
          name: `Phase 13 Skill ${runId}`,
        }),
      ]);
    });
  });

  describe('deleted-company jobs', () => {
    it('stops listing jobs of a company that was deleted', async () => {
      const doomedJob = await createPlatformJob(
        doomed.companyId,
        `Phase 13 Doomed ${runId}`,
      );
      await setJobStatus(doomedJob.id, 'publish');
      const before = await candidateSearch(candidateBToken);
      expect(before).toContain(`Phase 13 Doomed ${runId}`);

      const removed = await request(httpServer())
        .delete(`/api/platform/companies/${doomed.companyId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertEnvelope<{ id: string }>(removed, 200);

      const after = await candidateSearch(candidateBToken);
      expect(after).not.toContain(`Phase 13 Doomed ${runId}`);
    });
  });

  describe('platform job delete constraints', () => {
    it('refuses to delete an open or in-use job, deletes a closed one', async () => {
      const other = await createPlatformJob(
        tenant.companyId,
        `Phase 13 Other ${runId}`,
      );
      await setJobStatus(other.id, 'publish');
      const openDelete = await request(httpServer())
        .delete(`/api/platform/jobs/${other.id}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertStatus(openDelete, 409);

      await setJobStatus(other.id, 'close');
      const closedDelete = await request(httpServer())
        .delete(`/api/platform/jobs/${other.id}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertEnvelope<{ id: string }>(closedDelete, 200);

      const gone = await request(httpServer())
        .get(`/api/platform/jobs/${other.id}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertStatus(gone, 404);
    });

    it('refuses to delete a closed job that has applications', async () => {
      const hasApps = await createPlatformJob(
        tenant.companyId,
        `Phase 13 HasApps ${runId}`,
      );
      await setJobStatus(hasApps.id, 'publish');
      await request(httpServer())
        .post(`/api/candidate/jobs/${tenant.companyId}/${hasApps.id}/apply`)
        .set('Authorization', `Bearer ${candidateAToken}`)
        .send({});
      await setJobStatus(hasApps.id, 'close');

      const response = await request(httpServer())
        .delete(`/api/platform/jobs/${hasApps.id}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertStatus(response, 409);
    });
  });
});
