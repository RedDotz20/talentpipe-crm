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

interface PublicJobRow {
  id: string;
  companyId: string;
  companySlug: string;
  companyName: string;
  title: string;
  employmentType: string | null;
  location: string | null;
  workSetup: string | null;
}

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdCompanyIds: string[] = [];
const createdOrgUserIds: string[] = [];
const createdSuperAdminIds: string[] = [];
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
  const email = `phase18-${suffix}-${runId}@example.test`;
  const password = `Phase18Org!${randomUUID().slice(0, 18)}`;
  const slug = `phase18-${suffix}-${runId}`;
  const name = `Phase 18 ${suffix} ${runId}`;
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
  const email = `phase18-superadmin-${runId}@example.test`;
  const password = `Phase18Sa!${randomUUID().slice(0, 16)}`;
  const userId = randomUUID();
  const passwordHash = (await argon2.hash(password)) as string;
  await pool.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, passwordHash, 'Phase 18 SuperAdmin'],
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
    name: 'Phase 18 SuperAdmin',
  };
};

let superAdminTokenValue = '';
const superAdminToken = (): string => {
  if (!superAdminTokenValue)
    throw new Error('SuperAdmin was not initialized before use');
  return superAdminTokenValue;
};

const createPlatformJob = async (
  companyId: string,
  title: string,
  employmentType = 'full-time',
): Promise<PlatformJob> => {
  const created = await request(httpServer())
    .post('/api/platform/jobs')
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({
      companyId,
      title,
      description: 'Phase 18 description',
      employmentType,
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

const listPublicJobs = async (query = ''): Promise<request.Response> =>
  request(httpServer()).get(`/api/public/jobs${query}`);

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

describe('Phase 18 release gate', () => {
  jest.setTimeout(30000);
  let tenantA: CompanyAccount;
  let tenantB: CompanyAccount;
  let openJobA: PlatformJob;
  let draftJobA: PlatformJob;
  let openJobB: PlatformJob;

  beforeAll(async () => {
    await verifyInfrastructure();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();

    const superAdmin = await createSuperAdmin();
    superAdminTokenValue = superAdmin.token;

    tenantA = await createTenant('a');
    tenantB = await createTenant('b');

    openJobA = await createPlatformJob(
      tenantA.companyId,
      `Phase18 Backend Engineer ${runId}`,
    );
    await publishJob(openJobA.id);
    draftJobA = await createPlatformJob(
      tenantA.companyId,
      `Phase18 Draft Engineer ${runId}`,
      'contract',
    );
    openJobB = await createPlatformJob(
      tenantB.companyId,
      `Phase18 Designer ${runId}`,
      'part-time',
    );
    await publishJob(openJobB.id);
    await request(httpServer())
      .patch(`/api/platform/companies/${tenantB.companyId}/suspend`)
      .set('Authorization', `Bearer ${superAdminToken()}`);
  });

  afterAll(async () => {
    try {
      await cleanupDatabase();
      if (cleanupRedis) {
        const notifications = await cleanupRedis.keys('bull:notifications:*');
        if (notifications.length > 0) await cleanupRedis.del(...notifications);
        const limiters = await cleanupRedis.keys('limiter:*');
        if (limiters.length > 0) await cleanupRedis.del(...limiters);
      }
    } finally {
      if (app) await app.close();
      if (cleanupRedis) await cleanupRedis.quit();
      if (cleanupPool) await cleanupPool.end();
    }
  });

  describe('GET /public/jobs', () => {
    it('works without authentication', async () => {
      const response = await listPublicJobs();
      assertStatus(response, 200);
    });

    it('lists open jobs of active companies only', async () => {
      const response = await listPublicJobs('?pageSize=50');
      const result = assertEnvelope<{
        data: PublicJobRow[];
        total: number;
      }>(response, 200);

      const rows = result.data;
      expect(rows).toContainEqual(
        expect.objectContaining({
          id: openJobA.id,
          companyId: tenantA.companyId,
          companySlug: tenantA.slug,
          companyName: tenantA.name,
          title: openJobA.title,
          employmentType: 'full-time',
          location: 'Makati City',
          workSetup: 'hybrid',
        }),
      );
      expect(rows.map((row) => row.id)).not.toContain(draftJobA.id);
      expect(rows.map((row) => row.id)).not.toContain(openJobB.id);
    });

    it('respects employmentType filters', async () => {
      const response = await listPublicJobs('?employmentType=contract');
      const result = assertEnvelope<{ data: PublicJobRow[] }>(response, 200);
      expect(result.data.map((row) => row.id)).not.toContain(openJobA.id);
    });

    it('searches across companies by title', async () => {
      const response = await listPublicJobs(
        `?search=${encodeURIComponent('Backend Engineer')}`,
      );
      const result = assertEnvelope<{ data: PublicJobRow[] }>(response, 200);
      expect(result.data.map((row) => row.id)).toContain(openJobA.id);
    });
  });
});
