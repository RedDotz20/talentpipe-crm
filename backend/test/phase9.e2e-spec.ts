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

interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdCompanyIds: string[] = [];
const createdOrgUserIds: string[] = [];
const createdSuperAdminIds: string[] = [];
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
  const email = `phase9-${suffix}-${runId}@example.test`;
  const password = `Phase9Org!${randomUUID().slice(0, 18)}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({
      companyName: `Phase 9 ${suffix} ${runId}`,
      slug: `phase9-${suffix}-${runId}`,
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
  const email = `phase9-superadmin-${runId}@example.test`;
  const password = `Phase9Sa!${randomUUID().slice(0, 16)}`;
  const userId = randomUUID();
  const passwordHash = (await argon2.hash(password)) as string;
  await pool.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, passwordHash, 'Phase 9 SuperAdmin'],
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

const createOpenJob = async (
  tenant: CompanyAccount,
  suffix: string,
): Promise<{ id: string }> => {
  const created = await request(httpServer())
    .post('/api/job-postings')
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({
      title: `Phase 9 ${suffix} Job ${runId}`,
      employmentType: 'full-time',
      location: 'Makati City',
      workSetup: 'on-site',
    });
  const posting = assertEnvelope<{ id: string }>(created, 201);
  await request(httpServer())
    .post(`/api/job-postings/${posting.id}/publish`)
    .set('Authorization', `Bearer ${tenant.token}`);
  return { id: posting.id };
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

describe('Phase 9 release gate', () => {
  jest.setTimeout(30000);
  let superAdmin: CompanyAccount;
  let tenant: CompanyAccount;
  let secondTenant: CompanyAccount;
  let recruiterToken = '';

  beforeAll(async () => {
    await verifyInfrastructure();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();

    superAdmin = await createSuperAdmin();
    tenant = await createTenant('a');
    secondTenant = await createTenant('b');
    await createOpenJob(secondTenant, 'B');
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

  describe('platform tenant management', () => {
    it('lists companies with status and returns platform stats', async () => {
      const listed = await request(httpServer())
        .get('/api/platform/companies?pageSize=50')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const platformTenants = assertEnvelope<{ data: PlatformTenant[] }>(
        listed,
        200,
      ).data;
      const created = platformTenants.filter((t) =>
        createdCompanyIds.includes(t.id),
      );
      expect(created).toHaveLength(2);
      expect(created.every((t) => t.status === 'active')).toBe(true);
      expect(created.every((t) => t.plan === 'free')).toBe(true);

      const statsResponse = await request(httpServer())
        .get('/api/platform/stats')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const stats = assertEnvelope<{
        companies: number;
        users: number;
        applications: number;
      }>(statsResponse, 200);
      expect(stats.companies).toBeGreaterThanOrEqual(2);
      expect(stats.users).toBeGreaterThanOrEqual(2);
    });

    it('returns tenant detail with usage counts', async () => {
      const detail = await request(httpServer())
        .get(`/api/platform/companies/${tenant.companyId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const result = assertEnvelope<
        PlatformTenant & { users: number; applications: number }
      >(detail, 200);
      expect(result.id).toBe(tenant.companyId);
      expect(result.status).toBe('active');
      expect(result.users).toBeGreaterThanOrEqual(1);
      expect(typeof result.applications).toBe('number');
    });

    it('returns 404 for unknown companies', async () => {
      await request(httpServer())
        .get(`/api/platform/companies/${randomUUID()}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(404);
    });

    it('forbids non-SuperAdmin access to platform routes', async () => {
      await request(httpServer())
        .get('/api/platform/companies')
        .set('Authorization', `Bearer ${tenant.token}`)
        .expect(403);
    });
  });

  describe('suspend / reactivate', () => {
    let storedRefreshToken = '';

    it('suspends a tenant, blocking sign-in, refresh rotation, and public careers', async () => {
      const initialSignin = await signIn(
        secondTenant.email,
        secondTenant.password,
      );
      const initialTokens = assertEnvelope<Tokens>(initialSignin, 200);
      storedRefreshToken = initialTokens.refreshToken;

      const beforeSuspend = await request(httpServer()).get(
        `/api/public/phase9-b-${runId}/jobs`,
      );
      assertEnvelope<unknown[]>(beforeSuspend, 200);

      const suspended = assertEnvelope<PlatformTenant>(
        await request(httpServer())
          .patch(`/api/platform/companies/${secondTenant.companyId}/suspend`)
          .set('Authorization', `Bearer ${superAdmin.token}`),
        200,
      );
      expect(suspended.status).toBe('suspended');

      const suspendedList = await request(httpServer())
        .get('/api/platform/companies?pageSize=50')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const platformTenants = assertEnvelope<{ data: PlatformTenant[] }>(
        suspendedList,
        200,
      ).data;
      expect(
        platformTenants.find((t) => t.id === secondTenant.companyId)?.status,
      ).toBe('suspended');

      const signin = await signIn(secondTenant.email, secondTenant.password);
      assertStatus(signin, 403);

      const refresh = await request(httpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: storedRefreshToken });
      assertStatus(refresh, 401);

      const careers = await request(httpServer()).get(
        `/api/public/phase9-b-${runId}/jobs`,
      );
      assertStatus(careers, 404);

      const double = await request(httpServer())
        .patch(`/api/platform/companies/${secondTenant.companyId}/suspend`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertStatus(double, 409);
    });

    it('reactivates the tenant and restores sign-in, rotation, and careers', async () => {
      const reactivated = assertEnvelope<PlatformTenant>(
        await request(httpServer())
          .patch(`/api/platform/companies/${secondTenant.companyId}/reactivate`)
          .set('Authorization', `Bearer ${superAdmin.token}`),
        200,
      );
      expect(reactivated.status).toBe('active');

      const double = await request(httpServer())
        .patch(`/api/platform/companies/${secondTenant.companyId}/reactivate`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertStatus(double, 409);

      const refresh = await request(httpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: storedRefreshToken });
      assertEnvelope<Tokens>(refresh, 200);

      const careers = await request(httpServer()).get(
        `/api/public/phase9-b-${runId}/jobs`,
      );
      assertEnvelope<unknown[]>(careers, 200);
    });
  });

  describe('company settings', () => {
    it('returns the tenant settings and updates the name as CompanyAdmin', async () => {
      const settings = await request(httpServer())
        .get('/api/company')
        .set('Authorization', `Bearer ${tenant.token}`);
      const org = assertEnvelope<{
        name: string;
        slug: string;
        plan: string;
        status: string;
      }>(settings, 200);
      expect(org.slug).toBe(`phase9-a-${runId}`);
      expect(org.status).toBe('active');

      const updated = assertEnvelope<{ name: string }>(
        await request(httpServer())
          .patch('/api/company')
          .set('Authorization', `Bearer ${tenant.token}`)
          .send({ name: 'Phase 9 Renamed' }),
        200,
      );
      expect(updated.name).toBe('Phase 9 Renamed');
    });
  });

  describe('user management', () => {
    it('invites a user who can sign in, updates their role, and removes them', async () => {
      const email = `phase9-recruiter-${runId}@example.test`;
      const password = `Phase9Rc!${randomUUID().slice(0, 16)}`;

      const invited = await request(httpServer())
        .post('/api/company/users/invite')
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({ email, role: 'Recruiter', password });
      const user = assertEnvelope<{ id: string; email: string; role: string }>(
        invited,
        201,
      );
      createdOrgUserIds.push(user.id);
      expect(user.role).toBe('Recruiter');

      const signin = await signIn(email, password);
      const tokens = assertEnvelope<Tokens>(signin, 200);
      recruiterToken = tokens.accessToken;

      const duplicate = await request(httpServer())
        .post('/api/company/users/invite')
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({ email, role: 'Recruiter', password });
      assertStatus(duplicate, 409);

      const roleChanged = assertEnvelope<{ role: string }>(
        await request(httpServer())
          .patch(`/api/company/users/${user.id}/role`)
          .set('Authorization', `Bearer ${tenant.token}`)
          .send({ role: 'HiringManager' }),
        200,
      );
      expect(roleChanged.role).toBe('HiringManager');

      const list = await request(httpServer())
        .get('/api/company/users')
        .set('Authorization', `Bearer ${tenant.token}`);
      const users = assertEnvelope<Array<{ id: string; role: string }>>(
        list,
        200,
      );
      expect(users.find((u) => u.id === user.id)?.role).toBe('HiringManager');

      assertEnvelope<{ id: string }>(
        await request(httpServer())
          .delete(`/api/company/users/${user.id}`)
          .set('Authorization', `Bearer ${tenant.token}`),
        200,
      );

      const removedSignin = await signIn(email, password);
      assertStatus(removedSignin, 401);
    });

    it('blocks self role change, self removal, and recruiter management actions', async () => {
      await request(httpServer())
        .patch(`/api/company/users/${tenant.userId}/role`)
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({ role: 'Recruiter' })
        .expect(403);

      await request(httpServer())
        .delete(`/api/company/users/${tenant.userId}`)
        .set('Authorization', `Bearer ${tenant.token}`)
        .expect(403);

      await request(httpServer())
        .post('/api/company/users/invite')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          email: `phase9-nope-${runId}@example.test`,
          role: 'Recruiter',
          password: 'Whatever123!',
        })
        .expect(403);

      await request(httpServer())
        .patch(`/api/company/users/${tenant.userId}/role`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ role: 'Recruiter' })
        .expect(403);
    });

    it('writes audit rows for suspend, reactivate, invite, role change, and remove', async () => {
      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');

      const platformActions = await pool.query(
        `SELECT action FROM public.audit_logs
         WHERE company_id = $1`,
        [secondTenant.companyId],
      );
      const platformRows = (
        platformActions.rows as Array<{ action: string }>
      ).map((row) => row.action);
      expect(platformRows).toContain('company.suspend');
      expect(platformRows).toContain('company.reactivate');

      const orgActions = await pool.query(
        `SELECT action FROM public.audit_logs
         WHERE company_id = $1`,
        [tenant.companyId],
      );
      const orgRows = (orgActions.rows as Array<{ action: string }>).map(
        (row) => row.action,
      );
      expect(orgRows).toContain('user.invite');
      expect(orgRows).toContain('user.role_change');
      expect(orgRows).toContain('user.remove');
    });
  });
});
