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
const createdOrgUserIds: string[] = [];
const createdSuperAdminIds: string[] = [];
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

const signIn = async (
  email: string,
  password: string,
): Promise<request.Response> =>
  request(httpServer()).post('/api/auth/signin').send({ email, password });

const createTenant = async (suffix: string): Promise<CompanyAccount> => {
  const email = `phase12-${suffix}-${runId}@example.test`;
  const password = `Phase12Org!${randomUUID().slice(0, 18)}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({
      companyName: `Phase 12 ${suffix} ${runId}`,
      slug: `phase12-${suffix}-${runId}`,
      email,
      password,
    });
  const tokens = assertEnvelope<Tokens>(response, 201);
  const claims = decodeClaims(tokens.accessToken);
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
  const email = `phase12-superadmin-${runId}@example.test`;
  const password = `Phase12Sa!${randomUUID().slice(0, 16)}`;
  const userId = randomUUID();
  const passwordHash = (await argon2.hash(password)) as string;
  await pool.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, passwordHash, 'Phase 12 SuperAdmin'],
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
  const email = `phase12-cand-${suffix}-${runId}@example.test`;
  const password = `Phase12Cd!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post('/api/platform/candidates')
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({
      email,
      password,
      firstName: `Phase12 ${suffix}`,
      lastName: 'Candidate',
    });
  const candidate = assertEnvelope<{ id: string; email: string }>(created, 201);
  createdCandidateIds.push(candidate.id);
  return { id: candidate.id, email, password };
};

const createCompanyUser = async (
  companyId: string,
  suffix: string,
  role = 'Recruiter',
): Promise<{ user: { id: string; role: string }; email: string; password: string }> => {
  const email = `phase12-${suffix}-${runId}@example.test`;
  const password = `Phase12U!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post(`/api/platform/companies/${companyId}/users`)
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({ email, role, password });
  const user = assertEnvelope<{ id: string; role: string }>(created, 201);
  return { user, email, password };
};

const createOpenJob = async (
  tenant: CompanyAccount,
  suffix: string,
): Promise<{ id: string }> => {
  const created = await request(httpServer())
    .post('/api/job-postings')
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({ title: `Phase 12 ${suffix} Job ${runId}` });
  const posting = assertEnvelope<{ id: string }>(created, 201);
  await request(httpServer())
    .post(`/api/job-postings/${posting.id}/publish`)
    .set('Authorization', `Bearer ${tenant.token}`);
  return { id: posting.id };
};

const applyAsCandidate = async (
  token: string,
  companyId: string,
  jobId: string,
): Promise<{ applicationId: string }> => {
  const applied = await request(httpServer())
    .post(`/api/candidate/jobs/${companyId}/${jobId}/apply`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  return assertEnvelope<{ applicationId: string }>(applied, 201);
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
      'DELETE FROM public.audit_logs WHERE resource_id = ANY($1::text[])',
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

describe('Phase 12 release gate', () => {
  let superAdmin: CompanyAccount;
  let tenant: CompanyAccount;
  let candidateAToken = '';
  let doomed: CompanyAccount;

  beforeAll(async () => {
    jest.setTimeout(30000);
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
    const signin = await signIn(candidateA.email, candidateA.password);
    candidateAToken = assertEnvelope<Tokens>(signin, 200).accessToken;
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

  describe('platform RBAC on new routes', () => {
    it('forbids CompanyAdmin and Candidate on users list and company delete', async () => {
      const routes: Array<[string, string]> = [
        ['GET', '/api/platform/users'],
        ['DELETE', `/api/platform/companies/${tenant.companyId}`],
      ];
      for (const token of [tenant.token, candidateAToken]) {
        for (const [method, path] of routes) {
          const response = await request(httpServer())
            [method.toLowerCase() as 'get' | 'delete'](path)
            .set('Authorization', `Bearer ${token}`);
          assertStatus(response, 403);
        }
      }
      const anonymous = await request(httpServer()).get('/api/platform/users');
      assertStatus(anonymous, 401);
    });
  });

  describe('merged users list', () => {
    it('returns company users with company names and candidates with null company', async () => {
      const listed = await request(httpServer())
        .get('/api/platform/users')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const rows = assertEnvelope<
        Array<{
          type: string;
          email: string;
          role: string;
          status: string | null;
          companyId: string | null;
          companyName: string | null;
        }>
      >(listed, 200);

      const admin = rows.find((r) => r.email === tenant.email);
      expect(admin?.type).toBe('company');
      expect(admin?.companyId).toBe(tenant.companyId);
      expect(admin?.companyName).toBe(`Phase 12 a ${runId}`);
      expect(admin?.role).toBe('CompanyAdmin');
      expect(admin?.status).toBe('active');

      const candidate = rows.find((r) => r.email === `phase12-cand-a-${runId}@example.test`);
      expect(candidate?.type).toBe('candidate');
      expect(candidate?.companyId).toBeNull();
      expect(candidate?.companyName).toBeNull();
      expect(candidate?.role).toBe('Candidate');
      expect(candidate?.status).toBeNull();
    });
  });

  describe('company suspend cascade', () => {
    it('suspends every user in the schema, reactivation restores them', async () => {
      const extra = await createCompanyUser(tenant.companyId, 'cascade');
      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');

      await request(httpServer())
        .patch(`/api/platform/companies/${tenant.companyId}/suspend`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const suspended = (
        await pool.query(
          `SELECT status FROM "company_${tenant.companyId}".users WHERE id = ANY($1::uuid[])`,
          [[extra.user.id, tenant.userId]],
        )
      ).rows as Array<{ status: string }>;
      expect(suspended.every((row) => row.status === 'suspended')).toBe(true);

      const blockedSignin = await signIn(tenant.email, tenant.password);
      assertStatus(blockedSignin, 403);

      await request(httpServer())
        .patch(`/api/platform/companies/${tenant.companyId}/reactivate`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const restored = (
        await pool.query(
          `SELECT status FROM "company_${tenant.companyId}".users WHERE id = ANY($1::uuid[])`,
          [[extra.user.id, tenant.userId]],
        )
      ).rows as Array<{ status: string }>;
      expect(restored.every((row) => row.status === 'active')).toBe(true);

      const restoredSignin = await signIn(tenant.email, tenant.password);
      assertEnvelope<Tokens>(restoredSignin, 200);
    });
  });

  describe('CompanyAdmin suspend cascade', () => {
    it('suspends all users when the CompanyAdmin is suspended, reactivation does not cascade', async () => {
      const extra = await createCompanyUser(tenant.companyId, 'admincascade');
      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');

      await request(httpServer())
        .patch(
          `/api/platform/companies/${tenant.companyId}/users/${tenant.userId}/suspend`,
        )
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const suspended = (
        await pool.query(
          `SELECT status FROM "company_${tenant.companyId}".users WHERE id = $1`,
          [extra.user.id],
        )
      ).rows as Array<{ status: string }>;
      expect(suspended[0]?.status).toBe('suspended');

      await request(httpServer())
        .patch(
          `/api/platform/companies/${tenant.companyId}/users/${tenant.userId}/reactivate`,
        )
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const stillSuspended = (
        await pool.query(
          `SELECT status FROM "company_${tenant.companyId}".users WHERE id = $1`,
          [extra.user.id],
        )
      ).rows as Array<{ status: string }>;
      expect(stillSuspended[0]?.status).toBe('suspended');

      await request(httpServer())
        .patch(
          `/api/platform/companies/${tenant.companyId}/users/${extra.user.id}/reactivate`,
        )
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);
    });
  });

  describe('company delete cascade', () => {
    it('drops the schema, cleans public rows, cancels applications, keeps candidates', async () => {
      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');

      const jobId = (await createOpenJob(doomed, 'doomed')).id;
      const applicationId = (
        await applyAsCandidate(candidateAToken, doomed.companyId, jobId)
      ).applicationId;

      await request(httpServer())
        .delete(`/api/platform/companies/${doomed.companyId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const schemaExists = (
        await pool.query(
          `SELECT COUNT(*)::int AS count FROM information_schema.schemata WHERE schema_name = $1`,
          [`company_${doomed.companyId}`],
        )
      ).rows[0] as { count: number };
      expect(schemaExists.count).toBe(0);

      const companyRow = (
        await pool.query('SELECT COUNT(*)::int AS count FROM public.companies WHERE id = $1', [
          doomed.companyId,
        ])
      ).rows[0] as { count: number };
      expect(companyRow.count).toBe(0);

      const emailRows = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.user_emails WHERE company_id = $1',
          [doomed.companyId],
        )
      ).rows[0] as { count: number };
      expect(emailRows.count).toBe(0);

      const tokenRows = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.refresh_tokens WHERE company_id = $1',
          [doomed.companyId],
        )
      ).rows[0] as { count: number };
      expect(tokenRows.count).toBe(0);

      const jobRows = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.job_listings_index WHERE company_id = $1',
          [doomed.companyId],
        )
      ).rows[0] as { count: number };
      expect(jobRows.count).toBe(0);

      const indexRows = (
        await pool.query(
          'SELECT status FROM public.candidate_applications_index WHERE company_id = $1',
          [doomed.companyId],
        )
      ).rows as Array<{ status: string }>;
      expect(indexRows.length).toBe(1);
      expect(indexRows[0]?.status).toBe('cancelled');

      const candidateStillLives = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.candidate_accounts WHERE email = $1',
          [`phase12-cand-a-${runId}@example.test`],
        )
      ).rows[0] as { count: number };
      expect(candidateStillLives.count).toBe(1);

      const auditRow = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM public.audit_logs WHERE company_id = $1 AND action = $2',
          [doomed.companyId, 'company.delete'],
        )
      ).rows[0] as { count: number };
      expect(auditRow.count).toBe(1);

      const doomedSignin = await signIn(doomed.email, doomed.password);
      assertStatus(doomedSignin, 401);
    });
  });

  describe('unknown company delete', () => {
    it('404s for a nonexistent company', async () => {
      const response = await request(httpServer())
        .delete(`/api/platform/companies/${randomUUID()}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertStatus(response, 404);
    });
  });
});
