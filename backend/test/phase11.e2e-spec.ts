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
  email: string;
  password: string;
}

interface PlatformUser {
  id: string;
  email: string;
  role: string;
}

interface PipelineStage {
  id: string;
  name: string;
  order: number;
}

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdTenantIds: string[] = [];
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

const createTenant = async (suffix: string): Promise<TenantAccount> => {
  const email = `phase11-${suffix}-${runId}@example.test`;
  const password = `Phase11Org!${randomUUID().slice(0, 18)}`;
  const response = await request(httpServer())
    .post('/api/auth/org/signup')
    .send({
      companyName: `Phase 11 ${suffix} ${runId}`,
      slug: `phase11-${suffix}-${runId}`,
      email,
      password,
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
    email,
    password,
  };
};

const createSuperAdmin = async (): Promise<TenantAccount> => {
  const pool = cleanupPool;
  if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
  const email = `phase11-superadmin-${runId}@example.test`;
  const password = `Phase11Sa!${randomUUID().slice(0, 16)}`;
  const userId = randomUUID();
  const passwordHash = (await argon2.hash(password)) as string;
  await pool.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, passwordHash, 'Phase 11 SuperAdmin'],
  );
  createdSuperAdminIds.push(userId);

  const response = await signIn(email, password);
  const tokens = assertEnvelope<Tokens>(response, 200);
  return {
    tenantId: 'public',
    userId,
    token: tokens.accessToken,
    email,
    password,
  };
};

const createPlatformCandidate = async (
  suffix: string,
): Promise<{ id: string; email: string; password: string }> => {
  const superToken = superAdminToken();
  const email = `phase11-cand-${suffix}-${runId}@example.test`;
  const password = `Phase11Cd!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post('/api/platform/candidates')
    .set('Authorization', `Bearer ${superToken}`)
    .send({
      email,
      password,
      firstName: `Phase11 ${suffix}`,
      lastName: 'Candidate',
    });
  const candidate = assertEnvelope<{ id: string; email: string }>(created, 201);
  createdCandidateIds.push(candidate.id);
  return { id: candidate.id, email, password };
};

let superAdminTokenValue = '';
const superAdminToken = (): string => {
  if (!superAdminTokenValue)
    throw new Error('SuperAdmin was not initialized before use');
  return superAdminTokenValue;
};

const createTenantUser = async (
  tenantId: string,
  suffix: string,
  role = 'Recruiter',
): Promise<{ user: PlatformUser; email: string; password: string }> => {
  const email = `phase11-${suffix}-${runId}@example.test`;
  const password = `Phase11U!${randomUUID().slice(0, 16)}`;
  const created = await request(httpServer())
    .post(`/api/platform/tenants/${tenantId}/users`)
    .set('Authorization', `Bearer ${superAdminToken()}`)
    .send({ email, role, password });
  const user = assertEnvelope<PlatformUser>(created, 201);
  return { user, email, password };
};

const createOpenJob = async (
  tenant: TenantAccount,
  suffix: string,
): Promise<{ id: string }> => {
  const created = await request(httpServer())
    .post('/api/job-postings')
    .set('Authorization', `Bearer ${tenant.token}`)
    .send({ title: `Phase 11 ${suffix} Job ${runId}` });
  const posting = assertEnvelope<{ id: string }>(created, 201);
  await request(httpServer())
    .post(`/api/job-postings/${posting.id}/publish`)
    .set('Authorization', `Bearer ${tenant.token}`);
  return { id: posting.id };
};

const applyAsCandidate = async (
  token: string,
  tenantId: string,
  jobId: string,
): Promise<{ applicationId: string }> => {
  const applied = await request(httpServer())
    .post(`/api/candidate/jobs/${tenantId}/${jobId}/apply`)
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
  if (createdTenantIds.length > 0) {
    await cleanupPool.query(
      'DELETE FROM public.tenants WHERE id = ANY($1::uuid[])',
      [createdTenantIds],
    );
    for (const tenantId of createdTenantIds) {
      await cleanupPool.query(
        `DROP SCHEMA IF EXISTS "tenant_${tenantId}" CASCADE`,
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

describe('Phase 11 release gate', () => {
  let superAdmin: TenantAccount;
  let tenant: TenantAccount;
  let candidateAToken = '';

  // State shared across ordered scenarios.
  let lifecycleUserId = '';
  let suspendedUserId = '';
  let candidateBId = '';
  let jobId = '';
  let applicationId = '';
  let interviewId = '';
  let interviewerId = '';

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

  describe('platform RBAC', () => {
    it('forbids OrgAdmin and Candidate on every new platform route', async () => {
      const userId = randomUUID();
      const candidateId = randomUUID();
      const applicationIdPlaceholder = randomUUID();
      const routes: Array<[string, string]> = [
        ['GET', `/api/platform/tenants/${tenant.tenantId}/users`],
        ['POST', `/api/platform/tenants/${tenant.tenantId}/users`],
        ['PATCH', `/api/platform/tenants/${tenant.tenantId}/users/${userId}`],
        [
          'PATCH',
          `/api/platform/tenants/${tenant.tenantId}/users/${userId}/suspend`,
        ],
        [
          'PATCH',
          `/api/platform/tenants/${tenant.tenantId}/users/${userId}/reactivate`,
        ],
        ['DELETE', `/api/platform/tenants/${tenant.tenantId}/users/${userId}`],
        ['GET', '/api/platform/candidates'],
        ['POST', '/api/platform/candidates'],
        ['PATCH', `/api/platform/candidates/${candidateId}`],
        ['DELETE', `/api/platform/candidates/${candidateId}`],
        ['GET', '/api/platform/applications'],
        [
          'PATCH',
          `/api/platform/applications/${applicationIdPlaceholder}/stage`,
        ],
        ['GET', '/api/platform/interviews'],
        ['PATCH', `/api/platform/interviews/${applicationIdPlaceholder}`],
        ['GET', `/api/platform/tenants/${tenant.tenantId}/pipeline-stages`],
      ];

      for (const token of [tenant.token, candidateAToken]) {
        for (const [method, path] of routes) {
          const response = await request(httpServer())
            [method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path)
            .set('Authorization', `Bearer ${token}`);
          assertStatus(response, 403);
        }
      }
    });
  });

  describe('tenant user lifecycle', () => {
    it('creates a user, rotates credentials, and removes them', async () => {
      const { user, email, password } = await createTenantUser(
        tenant.tenantId,
        'lifecycle',
      );
      lifecycleUserId = user.id;
      expect(user.role).toBe('Recruiter');

      const signin = await signIn(email, password);
      const tokens = assertEnvelope<Tokens>(signin, 200);

      const roleChanged = assertEnvelope<PlatformUser>(
        await request(httpServer())
          .patch(`/api/platform/tenants/${tenant.tenantId}/users/${user.id}`)
          .set('Authorization', `Bearer ${superAdmin.token}`)
          .send({ role: 'Interviewer' }),
        200,
      );
      expect(roleChanged.role).toBe('Interviewer');

      const staleRefresh = await request(httpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });
      assertStatus(staleRefresh, 401);

      const newPassword = `Phase11New!${randomUUID().slice(0, 16)}`;
      await request(httpServer())
        .patch(`/api/platform/tenants/${tenant.tenantId}/users/${user.id}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ password: newPassword })
        .expect(200);

      const oldPasswordSignin = await signIn(email, password);
      assertStatus(oldPasswordSignin, 401);

      const newPasswordSignin = await signIn(email, newPassword);
      assertEnvelope<Tokens>(newPasswordSignin, 200);

      await request(httpServer())
        .delete(`/api/platform/tenants/${tenant.tenantId}/users/${user.id}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const removedSignin = await signIn(email, newPassword);
      assertStatus(removedSignin, 401);
    });
  });

  describe('user suspension', () => {
    it('suspends and reactivates a tenant user with 403/401/409 semantics', async () => {
      const { user, email, password } = await createTenantUser(
        tenant.tenantId,
        'suspendee',
      );
      suspendedUserId = user.id;

      const signin = await signIn(email, password);
      const tokens = assertEnvelope<Tokens>(signin, 200);

      const suspended = assertEnvelope<{ status: string }>(
        await request(httpServer())
          .patch(
            `/api/platform/tenants/${tenant.tenantId}/users/${user.id}/suspend`,
          )
          .set('Authorization', `Bearer ${superAdmin.token}`),
        200,
      );
      expect(suspended.status).toBe('suspended');

      const blockedSignin = await signIn(email, password);
      assertStatus(blockedSignin, 403);

      const blockedRefresh = await request(httpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });
      assertStatus(blockedRefresh, 401);

      const doubleSuspend = await request(httpServer())
        .patch(
          `/api/platform/tenants/${tenant.tenantId}/users/${user.id}/suspend`,
        )
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertStatus(doubleSuspend, 409);

      const reactivated = assertEnvelope<{ status: string }>(
        await request(httpServer())
          .patch(
            `/api/platform/tenants/${tenant.tenantId}/users/${user.id}/reactivate`,
          )
          .set('Authorization', `Bearer ${superAdmin.token}`),
        200,
      );
      expect(reactivated.status).toBe('active');

      const restoredSignin = await signIn(email, password);
      assertEnvelope<Tokens>(restoredSignin, 200);

      const doubleReactivate = await request(httpServer())
        .patch(
          `/api/platform/tenants/${tenant.tenantId}/users/${user.id}/reactivate`,
        )
        .set('Authorization', `Bearer ${superAdmin.token}`);
      assertStatus(doubleReactivate, 409);
    });
  });

  describe('candidate lifecycle', () => {
    it('creates, updates, and removes a candidate account', async () => {
      const candidate = await createPlatformCandidate('lifecycle');
      candidateBId = candidate.id;

      const signin = await signIn(candidate.email, candidate.password);
      assertEnvelope<Tokens>(signin, 200);

      const updated = assertEnvelope<{ firstName: string }>(
        await request(httpServer())
          .patch(`/api/platform/candidates/${candidate.id}`)
          .set('Authorization', `Bearer ${superAdmin.token}`)
          .send({ firstName: 'Phase11 Renamed' }),
        200,
      );
      expect(updated.firstName).toBe('Phase11 Renamed');

      await request(httpServer())
        .delete(`/api/platform/candidates/${candidate.id}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const removedSignin = await signIn(candidate.email, candidate.password);
      assertStatus(removedSignin, 401);
    });

    it('rejects a candidate email that already belongs to a tenant user', async () => {
      const conflict = await request(httpServer())
        .post('/api/platform/candidates')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({
          email: tenant.email,
          password: `Phase11Cd!${randomUUID().slice(0, 16)}`,
          firstName: 'Conflict',
          lastName: 'Candidate',
        });
      assertStatus(conflict, 409);
    });
  });

  describe('cross-tenant applications', () => {
    it('lists applications and moves stages as SuperAdmin', async () => {
      jobId = (await createOpenJob(tenant, 'A')).id;
      applicationId = (
        await applyAsCandidate(candidateAToken, tenant.tenantId, jobId)
      ).applicationId;

      const listed = await request(httpServer())
        .get(`/api/platform/applications?tenantId=${tenant.tenantId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const rows = assertEnvelope<
        Array<{ id: string; tenantId: string; jobPostingId: string }>
      >(listed, 200);
      const row = rows.find((r) => r.id === applicationId);
      expect(row).toBeDefined();
      expect(row?.tenantId).toBe(tenant.tenantId);
      expect(row?.jobPostingId).toBe(jobId);

      const stagesResponse = await request(httpServer())
        .get(`/api/platform/tenants/${tenant.tenantId}/pipeline-stages`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const stages = assertEnvelope<PipelineStage[]>(stagesResponse, 200);
      expect(stages.length).toBeGreaterThanOrEqual(2);
      const secondStage = stages[1];

      await request(httpServer())
        .patch(`/api/platform/applications/${applicationId}/stage`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ stageId: secondStage.id })
        .expect(200);

      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
      const appRow = (
        await pool.query(
          `SELECT current_stage_id FROM "tenant_${tenant.tenantId}".applications WHERE id = $1`,
          [applicationId],
        )
      ).rows[0] as { current_stage_id: string } | undefined;
      expect(appRow?.current_stage_id).toBe(secondStage.id);

      const indexRow = (
        await pool.query(
          `SELECT status FROM public.candidate_applications_index WHERE application_id = $1`,
          [applicationId],
        )
      ).rows[0] as { status: string } | undefined;
      expect(indexRow?.status).toBe(secondStage.name);
    });
  });

  describe('interviews', () => {
    it('lists, cancels, and reschedules interviews via platform', async () => {
      const interviewer = await createTenantUser(
        tenant.tenantId,
        'interviewer',
        'Interviewer',
      );
      interviewerId = interviewer.user.id;

      const scheduledAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();
      const scheduled = await request(httpServer())
        .post('/api/interviews')
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({
          applicationId,
          interviewerId,
          scheduledAt,
        });
      const created = assertEnvelope<{ id: string }>(scheduled, 201);
      interviewId = created.id;

      const listed = await request(httpServer())
        .get(`/api/platform/interviews?tenantId=${tenant.tenantId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      const rows = assertEnvelope<
        Array<{ id: string; status: string; tenantId: string }>
      >(listed, 200);
      expect(rows.find((r) => r.id === interviewId)?.tenantId).toBe(
        tenant.tenantId,
      );

      await request(httpServer())
        .patch(`/api/platform/interviews/${interviewId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ status: 'cancelled' })
        .expect(200);

      const rescheduledAt = new Date(
        Date.now() + 48 * 60 * 60 * 1000,
      ).toISOString();
      await request(httpServer())
        .patch(`/api/platform/interviews/${interviewId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ scheduledAt: rescheduledAt })
        .expect(200);

      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
      const interviewRow = (
        await pool.query(
          `SELECT status, scheduled_at FROM "tenant_${tenant.tenantId}".interviews WHERE id = $1`,
          [interviewId],
        )
      ).rows[0] as { status: string; scheduled_at: Date } | undefined;
      expect(interviewRow?.status).toBe('cancelled');
      expect(interviewRow?.scheduled_at.toISOString()).toBe(rescheduledAt);
    });
  });

  describe('withdraw', () => {
    it('withdraws own application, forbids foreign and org tokens, cleans rows', async () => {
      const candidateC = await createPlatformCandidate('withdrawer');
      const candidateCSignin = await signIn(
        candidateC.email,
        candidateC.password,
      );
      const candidateCToken = assertEnvelope<Tokens>(
        candidateCSignin,
        200,
      ).accessToken;
      const withdrawal = await applyAsCandidate(
        candidateCToken,
        tenant.tenantId,
        jobId,
      );
      const foreignApplicationId = withdrawal.applicationId;

      const foreignWithdraw = await request(httpServer())
        .delete(`/api/candidate/applications/${foreignApplicationId}`)
        .set('Authorization', `Bearer ${candidateAToken}`);
      assertStatus(foreignWithdraw, 404);

      const orgWithdraw = await request(httpServer())
        .delete(`/api/candidate/applications/${foreignApplicationId}`)
        .set('Authorization', `Bearer ${tenant.token}`);
      assertStatus(orgWithdraw, 403);

      const ownWithdraw = await request(httpServer())
        .delete(`/api/candidate/applications/${foreignApplicationId}`)
        .set('Authorization', `Bearer ${candidateCToken}`);
      assertEnvelope<{ applicationId: string }>(ownWithdraw, 200);

      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
      const appRow = (
        await pool.query(
          `SELECT COUNT(*)::int AS count FROM "tenant_${tenant.tenantId}".applications WHERE id = $1`,
          [foreignApplicationId],
        )
      ).rows[0] as { count: number } | undefined;
      expect(appRow?.count).toBe(0);
      const indexRow = (
        await pool.query(
          `SELECT COUNT(*)::int AS count FROM public.candidate_applications_index WHERE application_id = $1`,
          [foreignApplicationId],
        )
      ).rows[0] as { count: number } | undefined;
      expect(indexRow?.count).toBe(0);
    });
  });

  describe('audit trail', () => {
    it('records platform audit rows for user, candidate, and stage actions', async () => {
      const pool = cleanupPool;
      if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');

      const actionsFor = async (resourceId: string): Promise<string[]> => {
        const result = await pool.query(
          `SELECT action FROM public.audit_logs WHERE resource_id = $1`,
          [resourceId],
        );
        return (result.rows as Array<{ action: string }>).map(
          (row) => row.action,
        );
      };

      expect(await actionsFor(lifecycleUserId)).toContain(
        'platform.user.create',
      );
      expect(await actionsFor(suspendedUserId)).toContain(
        'platform.user.suspend',
      );
      expect(await actionsFor(applicationId)).toContain(
        'platform.application.stage_move',
      );
      expect(await actionsFor(candidateBId)).toContain(
        'platform.candidate.create',
      );
    });
  });
});
