import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import Redis from 'ioredis';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
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

interface PipelineStage {
  id: string;
  name: string;
}

interface AuditLogRow {
  action: string;
  resource_id: string;
  tenant_id: string;
  metadata: string;
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
  const email = `phase7-${suffix}-${runId}@example.test`;
  const response = await request(httpServer())
    .post('/api/auth/org/signup')
    .send({
      companyName: `Phase 7 ${suffix} ${runId}`,
      slug: `phase7-${suffix}-${runId}`,
      email,
      password: `Phase7Org!${randomUUID().slice(0, 18)}`,
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
      email: `phase7-candidate-${suffix}-${runId}@example.test`,
      password: `Phase7Candidate!${randomUUID().slice(0, 16)}`,
      firstName: `Candidate${suffix}`,
      lastName: 'Phase7',
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
      title: `Phase 7 ${suffix} Job ${runId}`,
      description: 'Phase 7 release-gate job',
    });
  const posting = assertEnvelope<JobPosting>(created, 201);

  const published = await request(httpServer())
    .post(`/api/job-postings/${posting.id}/publish`)
    .set('Authorization', `Bearer ${tenant.token}`);
  return assertEnvelope<JobPosting>(published, 201);
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

const waitForAuditLog = async (
  pool: Pool,
  applicationId: string,
  timeoutMs = 5000,
): Promise<AuditLogRow | null> => {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await pool.query(
      `SELECT action, resource_id, tenant_id, metadata
       FROM public.audit_logs
       WHERE action = 'notification.stage_change' AND resource_id = $1`,
      [applicationId],
    );
    if (result.rowCount && result.rowCount > 0) {
      return result.rows[0] as AuditLogRow;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  return null;
};

describe('Phase 7 release gate', () => {
  let tenant: TenantAccount;
  let candidate: CandidateAccount;
  let job: JobPosting;
  let applicationId: string;

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

  it('delivers a stage-change notification to the audit log via the BullMQ worker', async () => {
    const applyResponse = await request(httpServer())
      .post(`/api/candidate/jobs/${tenant.tenantId}/${job.id}/apply`)
      .set('Authorization', `Bearer ${candidate.token}`)
      .send({ coverLetter: 'Phase 7 notification test' });
    const application = assertEnvelope<{ applicationId: string }>(
      applyResponse,
      201,
    );
    applicationId = application.applicationId;

    const stagesResponse = await request(httpServer())
      .get('/api/org/pipeline-stages')
      .set('Authorization', `Bearer ${tenant.token}`);
    const stages = assertEnvelope<PipelineStage[]>(stagesResponse, 200);
    const screening = stages.find((stage) => stage.name === 'Screening');
    if (!screening)
      throw new Error('The test tenant did not have a Screening stage');

    const moved = await request(httpServer())
      .patch(`/api/applications/${applicationId}/stage`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ stageId: screening.id });
    assertStatus(moved, 200);

    const pool = cleanupPool;
    if (!pool) throw new Error('Cleanup PostgreSQL pool was not initialized');
    const row = await waitForAuditLog(pool, applicationId);
    if (!row) {
      throw new Error(
        'The notification worker did not write the stage-change audit log within the timeout',
      );
    }

    expect(row.tenant_id).toBe(tenant.tenantId);
    const metadata = JSON.parse(row.metadata) as {
      jobPostingId?: unknown;
      fromStage?: unknown;
      toStage?: unknown;
      recipientEmail?: unknown;
    };
    expect(metadata.jobPostingId).toBe(job.id);
    expect(metadata.toStage).toBe('Screening');
    expect(metadata.recipientEmail).toBe(
      `phase7-candidate-a-${runId}@example.test`,
    );
  });
});
