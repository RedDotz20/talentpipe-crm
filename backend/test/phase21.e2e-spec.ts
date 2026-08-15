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
  const email = `phase21-${suffix}-${runId}@example.test`;
  const password = `Phase21Org!${randomUUID().slice(0, 18)}`;
  const slug = `phase21-${suffix}-${runId}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({
      companyName: `Phase 21 ${suffix} ${runId}`,
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
  // Per-call unique email: the brief creates two super admins in one run.
  const email = `phase21-sa-${runId}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `Phase21SA!${randomUUID().slice(0, 18)}`;
  const passwordHash = (await argon2.hash(password)) as string;
  const id = randomUUID();
  await cleanupPool!.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name) VALUES ($1, $2, $3, $4)`,
    [id, email, passwordHash, 'Phase 21 SA'],
  );
  createdSuperAdminIds.push(id);
  const response = await signIn(email, password);
  return assertEnvelope<Tokens>(response, 200).accessToken;
};

const createPlatformCandidate = async (
  superAdminToken: string,
  suffix: string,
): Promise<{ id: string; email: string; password: string }> => {
  const email = `phase21-cand-${suffix}-${runId}@example.test`;
  const password = `Phase21Cd!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post('/api/platform/candidates')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({
      email,
      password,
      firstName: `Phase21 ${suffix}`,
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

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-content'),
]);

describe('Phase 21 — Profile Avatars & Universal User Menu', () => {
  jest.setTimeout(120_000);
  beforeAll(verifyInfrastructure);
  afterAll(async () => {
    await cleanupDatabase();
    await cleanupRedis?.quit();
    await cleanupPool?.end();
    await app?.close();
  });

  let org: CompanyAccount;
  let candidate: { id: string; email: string; password: string };
  let superAdminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    org = await createTenant('org');
    candidate = await createPlatformCandidate(await createSuperAdmin(), 'cand');
    superAdminToken = await createSuperAdmin();
  });

  it('GET /auth/me returns the company-user profile', async () => {
    const res = await request(httpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${org.token}`);
    const me = assertEnvelope<{
      id: string;
      role: string;
      companyId: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
    }>(res, 200);
    expect(me.id).toBe(org.userId);
    expect(me.role).toBe('CompanyAdmin');
    expect(me.companyId).toBe(org.companyId);
    expect(me.email).toBe(org.email);
    expect(me.name).toBeNull();
    expect(me.avatarUrl).toBeNull();
  });

  it('GET /auth/me returns the candidate profile with composed name', async () => {
    const signInRes = await signIn(candidate.email, candidate.password);
    const token = assertEnvelope<Tokens>(signInRes, 200).accessToken;
    const me = assertEnvelope<{ name: string; avatarUrl: string | null }>(
      await request(httpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`),
      200,
    );
    expect(me.name).toBe(`Phase21 cand Candidate`);
    expect(me.avatarUrl).toBeNull();
  });

  it('GET /auth/me returns the super admin profile', async () => {
    const me = assertEnvelope<{ role: string; name: string | null }>(
      await request(httpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${superAdminToken}`),
      200,
    );
    expect(me.role).toBe('SuperAdmin');
    expect(me.name).toBe('Phase 21 SA');
  });

  it('company user avatar round-trip: upload → serve → remove', async () => {
    const uploaded = assertEnvelope<{ avatarUrl: string }>(
      await request(httpServer())
        .post('/api/company/profile/avatar')
        .set('Authorization', `Bearer ${org.token}`)
        .attach('file', PNG_BYTES, 'avatar.png'),
      201,
    );
    expect(uploaded.avatarUrl).toMatch(
      new RegExp(`^companies/${org.companyId}/avatars/`),
    );

    const served = await request(httpServer())
      .get(`/api/avatars/file?key=${encodeURIComponent(uploaded.avatarUrl)}`)
      .set('Authorization', `Bearer ${org.token}`);
    assertStatus(served, 200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(served.body as Buffer, PNG_BYTES)).toBe(0);

    const profile = assertEnvelope<{
      name: string | null;
      avatarUrl: string | null;
    }>(
      await request(httpServer())
        .get('/api/company/profile')
        .set('Authorization', `Bearer ${org.token}`),
      200,
    );
    expect(profile.avatarUrl).toBe(uploaded.avatarUrl);

    const removed = assertEnvelope<{ avatarUrl: null }>(
      await request(httpServer())
        .delete('/api/company/profile/avatar')
        .set('Authorization', `Bearer ${org.token}`),
      200,
    );
    expect(removed.avatarUrl).toBeNull();
  });

  it('company user can update their display name', async () => {
    const updated = assertEnvelope<{ name: string }>(
      await request(httpServer())
        .put('/api/company/profile')
        .set('Authorization', `Bearer ${org.token}`)
        .send({ name: 'Ada Lovelace' }),
      200,
    );
    expect(updated.name).toBe('Ada Lovelace');

    const me = assertEnvelope<{ name: string | null }>(
      await request(httpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${org.token}`),
      200,
    );
    expect(me.name).toBe('Ada Lovelace');
  });

  it('rejects a file whose content is not an image', async () => {
    const res = await request(httpServer())
      .post('/api/company/profile/avatar')
      .set('Authorization', `Bearer ${org.token}`)
      .attach('file', Buffer.from('definitely-not-an-image'), 'avatar.png');
    assertStatus(res, 400);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('rejects an oversized avatar with 413', async () => {
    const res = await request(httpServer())
      .post('/api/company/profile/avatar')
      .set('Authorization', `Bearer ${org.token}`)
      .attach(
        'file',
        Buffer.concat([PNG_BYTES, Buffer.alloc(6 * 1024 * 1024)]),
        'avatar.png',
      );
    assertStatus(res, 413);
  });

  it('candidate avatar round-trip via /candidate/profile/avatar', async () => {
    const signInRes = await signIn(candidate.email, candidate.password);
    const token = assertEnvelope<Tokens>(signInRes, 200).accessToken;
    const uploaded = assertEnvelope<{ avatarUrl: string }>(
      await request(httpServer())
        .post('/api/candidate/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', PNG_BYTES, 'avatar.png'),
      201,
    );
    expect(uploaded.avatarUrl).toMatch(/^candidate-avatars\//);

    const profile = assertEnvelope<{ avatarUrl: string | null }>(
      await request(httpServer())
        .get('/api/candidate/profile')
        .set('Authorization', `Bearer ${token}`),
      200,
    );
    expect(profile.avatarUrl).toBe(uploaded.avatarUrl);
  });

  it('super admin avatar round-trip via /platform/profile/avatar', async () => {
    const uploaded = assertEnvelope<{ avatarUrl: string }>(
      await request(httpServer())
        .post('/api/platform/profile/avatar')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', PNG_BYTES, 'avatar.png'),
      201,
    );
    expect(uploaded.avatarUrl).toMatch(/^platform\/avatars\//);
  });

  it('company user lists include name and avatarUrl', async () => {
    const users = assertEnvelope<
      Array<{ email: string; name: string | null; avatarUrl: string | null }>
    >(
      await request(httpServer())
        .get('/api/company/users')
        .set('Authorization', `Bearer ${org.token}`),
      200,
    );
    const me = users.find((u) => u.email === org.email);
    expect(me?.name).toBe('Ada Lovelace');
    expect(me).toHaveProperty('avatarUrl');
  });

  it('platform merged users include avatarUrl', async () => {
    const users = assertEnvelope<{ data: Array<{ avatarUrl: string | null }> }>(
      await request(httpServer())
        .get('/api/platform/users?pageSize=50')
        .set('Authorization', `Bearer ${superAdminToken}`),
      200,
    );
    expect(users.data.length).toBeGreaterThan(0);
    expect(users.data.every((u) => 'avatarUrl' in u)).toBe(true);
  });

  it('new-company signup clones users.name and users.avatar_url', async () => {
    const fresh = await createTenant('clone');
    const cols = await cleanupPool!.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'users'
         AND column_name IN ('name', 'avatar_url')`,
      [`company_${fresh.companyId}`],
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual([
      'avatar_url',
      'name',
    ]);
  });
});
