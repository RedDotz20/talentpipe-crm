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
  permissions?: string[];
}

interface CompanyAccount {
  companyId: string;
  userId: string;
  token: string;
  email: string;
  password: string;
}

interface PresetItem {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  isDefault: boolean;
  usageCount: number;
}

let app: INestApplication<Server> | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdCompanyIds: string[] = [];
const createdOrgUserIds: string[] = [];
const createdSuperAdminIds: string[] = [];
const createdPresetIds: { id: string; schema: string }[] = [];
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
  const email = `phase18-${suffix}-${runId}@example.test`;
  const password = `Phase18Org!${randomUUID().slice(0, 18)}`;
  const slug = `phase18-${suffix}-${runId}`;
  const response = await request(httpServer())
    .post('/api/auth/company/signup')
    .send({
      companyName: `Phase 18 ${suffix} ${runId}`,
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
  const email = `phase18-sa-${runId}@example.test`;
  const password = `Phase18SA!${randomUUID().slice(0, 18)}`;
  const passwordHash = (await argon2.hash(password)) as string;
  const id = randomUUID();
  await cleanupPool!.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name) VALUES ($1, $2, $3, $4)`,
    [id, email, passwordHash, 'Phase 18 SA'],
  );
  createdSuperAdminIds.push(id);
  const response = await signIn(email, password);
  const tokens = assertEnvelope<Tokens>(response, 200);
  return {
    companyId: '',
    userId: id,
    token: tokens.accessToken,
    email,
    password,
  };
};

const createCompanyUser = async (
  token: string,
  body: {
    email: string;
    role: string;
    password: string;
    presetId?: string | null;
  },
): Promise<{ id: string }> => {
  const response = await request(httpServer())
    .post('/api/company/users')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return assertEnvelope<{ id: string }>(response, 201);
};

const listPresets = async (token: string): Promise<PresetItem[]> => {
  const response = await request(httpServer())
    .get('/api/company/permissions')
    .set('Authorization', `Bearer ${token}`);
  const data = assertEnvelope<{ presets: PresetItem[] }>(response, 200);
  return data.presets;
};

const DEFAULT_PRESETS: {
  id: string;
  name: string;
  role: string;
  permissions: string[];
}[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Company Admin Default',
    role: 'CompanyAdmin',
    permissions: [
      'jobs.view',
      'jobs.create_edit',
      'jobs.publish_close',
      'jobs.delete',
      'candidates.view',
      'candidates.manage',
      'applications.view',
      'applications.move',
      'applications.note',
      'interviews.view',
      'interviews.schedule',
      'stages.manage',
      'settings.manage',
      'users.manage',
      'permissions.manage',
      'dashboard.view',
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Recruiter Default',
    role: 'Recruiter',
    permissions: [
      'jobs.view',
      'jobs.create_edit',
      'jobs.publish_close',
      'candidates.view',
      'candidates.manage',
      'applications.view',
      'applications.move',
      'applications.note',
      'interviews.view',
      'interviews.schedule',
      'dashboard.view',
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Hiring Manager Default',
    role: 'HiringManager',
    permissions: [
      'jobs.view',
      'candidates.view',
      'applications.view',
      'applications.move',
      'applications.note',
      'interviews.view',
      'interviews.schedule',
      'dashboard.view',
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Interviewer Default',
    role: 'Interviewer',
    permissions: ['interviews.view', 'interviews.feedback', 'dashboard.view'],
  },
];

let tenantA: CompanyAccount;
let tenantB: CompanyAccount;
let superAdmin: CompanyAccount;

beforeAll(async () => {
  await verifyInfrastructure();
  await cleanupPool!.query(`
    CREATE TABLE IF NOT EXISTS public.permission_presets (
      id UUID PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      role VARCHAR(50) NOT NULL,
      permissions JSONB NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_by UUID,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preset_id UUID;
  `);
  for (const p of DEFAULT_PRESETS) {
    await cleanupPool!.query(
      `INSERT INTO public.permission_presets (id, name, role, permissions, is_default)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.role, JSON.stringify(p.permissions)],
    );
  }

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();

  tenantA = await createTenant('a');
  tenantB = await createTenant('b');
  superAdmin = await createSuperAdmin();
});

afterAll(async () => {
  // Preset rows must be deleted BEFORE the company schemas are dropped
  // (the custom preset lives inside the company schema).
  for (const p of createdPresetIds) {
    await cleanupPool!.query(
      `DELETE FROM "${p.schema}".permission_presets WHERE id = $1`,
      [p.id],
    );
  }
  await cleanupPool!.query(
    `DELETE FROM public.permission_presets
     WHERE id IN (
       '00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-000000000003',
       '00000000-0000-0000-0000-000000000004'
     )`,
  );
  for (const companyId of createdCompanyIds) {
    await cleanupPool!.query(
      `DROP SCHEMA IF EXISTS "company_${companyId}" CASCADE`,
    );
    await cleanupPool!.query('DELETE FROM public.companies WHERE id = $1', [
      companyId,
    ]);
  }
  for (const userId of createdOrgUserIds) {
    await cleanupPool!.query(
      'DELETE FROM public.user_emails WHERE user_id = $1',
      [userId],
    );
  }
  for (const id of createdSuperAdminIds) {
    await cleanupPool!.query('DELETE FROM public.super_admins WHERE id = $1', [
      id,
    ]);
  }
  if (cleanupRedis) await cleanupRedis.quit();
  if (cleanupPool) await cleanupPool.end();
  if (app) await app.close();
});

describe('phase19: permission presets', () => {
  it('seeds 4 read-only defaults visible to a CompanyAdmin', async () => {
    const presets = await listPresets(tenantA.token);
    expect(presets.filter((p) => p.isDefault)).toHaveLength(4);
    expect(presets.find((p) => p.role === 'Recruiter')?.permissions).toContain(
      'jobs.create_edit',
    );
  });

  it('platform cannot edit or delete a default preset', async () => {
    const defaultId = DEFAULT_PRESETS[1].id;
    const patch = await request(httpServer())
      .patch(`/api/platform/permissions/${defaultId}`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ name: 'Hacked' });
    assertStatus(patch, 400);
    const del = await request(httpServer())
      .delete(`/api/platform/permissions/${defaultId}`)
      .set('Authorization', `Bearer ${superAdmin.token}`);
    assertStatus(del, 400);
  });

  it('company admin creates a custom preset scoped to own company', async () => {
    const create = await request(httpServer())
      .post('/api/company/permissions')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({
        name: 'Recruiter No Jobs',
        role: 'Recruiter',
        permissions: [
          'jobs.view',
          'candidates.view',
          'candidates.manage',
          'applications.view',
          'applications.move',
          'applications.note',
          'interviews.view',
          'interviews.schedule',
          'dashboard.view',
        ],
      });
    const created = assertEnvelope<{ id: string }>(create, 201);
    expect(created.id).toBeTruthy();
    createdPresetIds.push({
      id: created.id,
      schema: `company_${tenantA.companyId}`,
    });

    const inA = await listPresets(tenantA.token);
    expect(inA.find((p) => p.id === created.id)?.name).toBe(
      'Recruiter No Jobs',
    );

    const inB = await listPresets(tenantB.token);
    expect(inB.find((p) => p.id === created.id)).toBeUndefined();
  });

  it('rejects a preset with permissions outside the role default', async () => {
    const response = await request(httpServer())
      .post('/api/company/permissions')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({
        name: 'Interviewer Superpowers',
        role: 'Interviewer',
        permissions: ['jobs.create_edit'],
      });
    assertStatus(response, 400);
  });

  it('superadmin creates a global preset visible to every company', async () => {
    const create = await request(httpServer())
      .post('/api/platform/permissions')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({
        name: 'Global Recruiter Light',
        role: 'Recruiter',
        permissions: ['jobs.view', 'applications.view', 'dashboard.view'],
      });
    const created = assertEnvelope<{ id: string }>(create, 201);
    createdPresetIds.push({ id: created.id, schema: 'public' });
    const inA = await listPresets(tenantA.token);
    expect(inA.find((p) => p.id === created.id)).toBeTruthy();
    const inB = await listPresets(tenantB.token);
    expect(inB.find((p) => p.id === created.id)).toBeTruthy();
  });

  it('assigning a preset narrows the account and the backend enforces it', async () => {
    const recruiter = await createCompanyUser(tenantA.token, {
      email: `rec1-${runId}@acme.test`,
      role: 'Recruiter',
      password: 'Recruiter123!',
    });
    createdOrgUserIds.push(recruiter.id);
    const signInResponse = await signIn(
      `rec1-${runId}@acme.test`,
      'Recruiter123!',
    );
    const tokens = assertEnvelope<Tokens>(signInResponse, 200);
    const claims = JSON.parse(
      Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString(
        'utf8',
      ),
    ) as JwtClaims;
    expect(claims.permissions).toContain('jobs.create_edit');

    const preset = (await listPresets(tenantA.token)).find(
      (p) => p.name === 'Recruiter No Jobs',
    );
    if (!preset) throw new Error('Expected Recruiter No Jobs preset');
    const assign = await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: preset.id });
    assertEnvelope<{ id: string }>(assign, 200);

    const blocked = await request(httpServer())
      .post('/api/job-postings')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        title: 'Blocked Job',
        description: 'x',
        employmentType: 'full-time',
        location: 'Remote',
        workSetup: 'work-from-home',
      });
    assertStatus(blocked, 403);

    const allowed = await request(httpServer())
      .get('/api/job-postings')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    assertStatus(allowed, 200);

    const reset = await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: null });
    assertEnvelope<{ id: string }>(reset, 200);
  });

  it('company admin cannot assign a preset to a CompanyAdmin account', async () => {
    const response = await request(httpServer())
      .patch(`/api/company/users/${tenantA.userId}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: null });
    assertStatus(response, 403);
  });

  it('company admin cannot reach another company user (404)', async () => {
    const response = await request(httpServer())
      .patch(`/api/company/users/${tenantB.userId}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: null });
    assertStatus(response, 404);
  });

  it('rejects assignment with a role mismatch (400)', async () => {
    const interviewer = await createCompanyUser(tenantA.token, {
      email: `iv1-${runId}@acme.test`,
      role: 'Interviewer',
      password: 'Interviewer123!',
    });
    createdOrgUserIds.push(interviewer.id);
    const preset = (await listPresets(tenantA.token)).find(
      (p) => p.name === 'Recruiter No Jobs',
    );
    if (!preset) throw new Error('Expected Recruiter No Jobs preset');
    const response = await request(httpServer())
      .patch(`/api/company/users/${interviewer.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: preset.id });
    assertStatus(response, 400);
  });

  it('role change resets the preset to the role default', async () => {
    const recruiter = await createCompanyUser(tenantA.token, {
      email: `rec2-${runId}@acme.test`,
      role: 'Recruiter',
      password: 'Recruiter123!',
    });
    createdOrgUserIds.push(recruiter.id);
    const preset = (await listPresets(tenantA.token)).find(
      (p) => p.name === 'Recruiter No Jobs',
    );
    if (!preset) throw new Error('Expected Recruiter No Jobs preset');
    await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: preset.id });

    const roleChange = await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/role`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ role: 'HiringManager' });
    assertEnvelope<{ id: string }>(roleChange, 200);

    const users = assertEnvelope<
      Array<{ id: string; presetId: string | null }>
    >(
      await request(httpServer())
        .get('/api/company/users')
        .set('Authorization', `Bearer ${tenantA.token}`),
      200,
    );
    expect(users.find((u) => u.id === recruiter.id)?.presetId).toBeNull();
  });

  it('cannot delete a preset that is in use (409)', async () => {
    const recruiter = await createCompanyUser(tenantA.token, {
      email: `rec3-${runId}@acme.test`,
      role: 'Recruiter',
      password: 'Recruiter123!',
    });
    createdOrgUserIds.push(recruiter.id);
    const preset = (await listPresets(tenantA.token)).find(
      (p) => p.name === 'Recruiter No Jobs',
    );
    if (!preset) throw new Error('Expected Recruiter No Jobs preset');
    await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: preset.id });

    const response = await request(httpServer())
      .delete(`/api/company/permissions/${preset.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    assertStatus(response, 409);

    await request(httpServer())
      .patch(`/api/company/users/${recruiter.id}/preset`)
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({ presetId: null });
    const after = await request(httpServer())
      .delete(`/api/company/permissions/${preset.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    assertStatus(after, 200);
  });

  it('superadmin can restrict a CompanyAdmin via a global preset', async () => {
    const globalLight = assertEnvelope<{ id: string }>(
      await request(httpServer())
        .post('/api/platform/permissions')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({
          name: 'Global CA Settings-Less',
          role: 'CompanyAdmin',
          permissions: [
            'jobs.view',
            'jobs.create_edit',
            'jobs.publish_close',
            'jobs.delete',
            'candidates.view',
            'candidates.manage',
            'applications.view',
            'applications.move',
            'applications.note',
            'interviews.view',
            'interviews.schedule',
            'stages.manage',
            'users.manage',
            'permissions.manage',
            'dashboard.view',
          ],
        }),
      201,
    );
    createdPresetIds.push({ id: globalLight.id, schema: 'public' });

    const assign = await request(httpServer())
      .patch(
        `/api/platform/companies/${tenantB.companyId}/users/${tenantB.userId}/preset`,
      )
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ presetId: globalLight.id });
    assertEnvelope<{ id: string }>(assign, 200);

    const settingsPatch = await request(httpServer())
      .patch('/api/company')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .send({ name: 'Hacked Name' });
    assertStatus(settingsPatch, 403);

    const settingsGet = await request(httpServer())
      .get('/api/company')
      .set('Authorization', `Bearer ${tenantB.token}`);
    assertStatus(settingsGet, 200);

    await request(httpServer())
      .patch(
        `/api/platform/companies/${tenantB.companyId}/users/${tenantB.userId}/preset`,
      )
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ presetId: null });
  });
});
