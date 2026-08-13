import 'dotenv/config';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COMPANY_TABLES = [
  'users', 'permission_presets', 'job_postings', 'candidates', 'pipeline_stages',
  'applications', 'job_required_skills',
  'interviews', 'interview_feedbacks', 'notes',
];

const PIPELINE_STAGES = [
  { name: 'Applied', order: 0 },
  { name: 'Screening', order: 1 },
  { name: 'Interview', order: 2 },
  { name: 'Offer', order: 3 },
  { name: 'Hired', order: 4 },
  { name: 'Rejected', order: 5 },
];

const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

async function hash(val: string): Promise<string> {
  return argon2.hash(val);
}

async function seedSuperAdmin(client: any): Promise<void> {
  const existing = await client.query(
    `SELECT id FROM public.super_admins WHERE email = $1`,
    ['superadmin@talentpipe.com'],
  );
  if (existing.rows.length > 0) {
    console.log('[SKIP] SuperAdmin already exists');
    return;
  }
  const passwordHash = await hash('SuperAdmin123!');
  await client.query(
    `INSERT INTO public.super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'superadmin@talentpipe.com', passwordHash, 'Super Admin'],
  );
  console.log('[OK] SuperAdmin created: superadmin@talentpipe.com');
}

async function seedCompany(client: any): Promise<void> {
  const existing = await client.query(
    `SELECT id FROM public.companies WHERE slug = $1`,
    ['acme-corp'],
  );
  if (existing.rows.length > 0) {
    const companyId = existing.rows[0].id;
    const passwordHash = await hash('Admin123!');
    await client.query(
      `UPDATE "company_${companyId}"."users" SET password_hash = $1 WHERE email = $2`,
      [passwordHash, 'admin@acme.com'],
    );
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS).toISOString();
    const rawToken = randomUUID();
    const tokenHash = await hash(rawToken);
    const userResult = await client.query(
      `SELECT id FROM "company_${companyId}"."users" WHERE email = $1`,
      ['admin@acme.com'],
    );
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;
      await client.query(
        `DELETE FROM public.refresh_tokens WHERE user_id = $1`,
        [userId],
      );
      await client.query(
        `INSERT INTO public.refresh_tokens (id, user_id, company_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), userId, companyId, tokenHash, expiresAt],
      );
    }
    console.log(`[UPDATE] Company admin password reset for Acme Corp (company: ${companyId})`);
    return;
  }

  const companyId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await hash('Admin123!');

  await client.query(
    `INSERT INTO public.companies (id, name, slug)
     VALUES ($1, $2, $3)`,
    [companyId, 'Acme Corp', 'acme-corp'],
  );

  await client.query(`CREATE SCHEMA IF NOT EXISTS "company_${companyId}"`);

  for (const table of COMPANY_TABLES) {
    await client.query(
      `CREATE TABLE IF NOT EXISTS "company_${companyId}"."${table}" (LIKE template."${table}" INCLUDING ALL)`,
    );
  }

  await client.query(
    `INSERT INTO "company_${companyId}"."users" (id, email, password_hash, role)
     VALUES ($1, $2, $3, 'CompanyAdmin')`,
    [userId, 'admin@acme.com', passwordHash],
  );

  for (const stage of PIPELINE_STAGES) {
    await client.query(
      `INSERT INTO "company_${companyId}"."pipeline_stages" (id, name, "order")
       VALUES ($1, $2, $3)`,
      [randomUUID(), stage.name, stage.order],
    );
  }

  await client.query(
    `INSERT INTO public.user_emails (id, email, company_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'admin@acme.com', companyId, userId],
  );

  const refreshTokenId = randomUUID();
  const rawToken = randomUUID();
  const tokenHash = await hash(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS).toISOString();
  await client.query(
    `INSERT INTO public.refresh_tokens (id, user_id, company_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [refreshTokenId, userId, companyId, tokenHash, expiresAt],
  );

  console.log(`[OK] Company created: Acme Corp (admin@acme.com, tenant: ${companyId})`);
}

async function seedInterviewer(client: any): Promise<void> {
  const tenant = await client.query(
    `SELECT id FROM public.companies WHERE slug = $1`,
    ['acme-corp'],
  );
  if (tenant.rows.length === 0) {
    console.log('[SKIP] Interviewer: no Acme tenant found');
    return;
  }
  const companyId = tenant.rows[0].id;
  const existing = await client.query(
    `SELECT id FROM "company_${companyId}"."users" WHERE email = $1`,
    ['interviewer@acme.com'],
  );
  if (existing.rows.length > 0) {
    console.log('[SKIP] Interviewer already exists');
    return;
  }
  const userId = randomUUID();
  const passwordHash = await hash('Interviewer123!');
  await client.query(
    `INSERT INTO "company_${companyId}"."users" (id, email, password_hash, role)
     VALUES ($1, $2, $3, 'Interviewer')`,
    [userId, 'interviewer@acme.com', passwordHash],
  );
  await client.query(
    `INSERT INTO public.user_emails (id, email, company_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'interviewer@acme.com', companyId, userId],
  );
  console.log('[OK] Interviewer created: interviewer@acme.com');
}

async function seedHiringManager(client: any): Promise<void> {
  const tenant = await client.query(
    `SELECT id FROM public.companies WHERE slug = $1`,
    ['acme-corp'],
  );
  if (tenant.rows.length === 0) {
    console.log('[SKIP] Hiring Manager: no Acme tenant found');
    return;
  }
  const companyId = tenant.rows[0].id;
  const existing = await client.query(
    `SELECT id FROM "company_${companyId}"."users" WHERE email = $1`,
    ['hiring.manager@acme.com'],
  );
  if (existing.rows.length > 0) {
    console.log('[SKIP] Hiring Manager already exists');
    return;
  }
  const userId = randomUUID();
  const passwordHash = await hash('HiringManager123!');
  await client.query(
    `INSERT INTO "company_${companyId}"."users" (id, email, password_hash, role)
     VALUES ($1, $2, $3, 'HiringManager')`,
    [userId, 'hiring.manager@acme.com', passwordHash],
  );
  await client.query(
    `INSERT INTO public.user_emails (id, email, company_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'hiring.manager@acme.com', companyId, userId],
  );
  console.log('[OK] Hiring Manager created: hiring.manager@acme.com');
}

async function seedRecruiter(client: any): Promise<void> {
  const tenant = await client.query(
    `SELECT id FROM public.companies WHERE slug = $1`,
    ['acme-corp'],
  );
  if (tenant.rows.length === 0) {
    console.log('[SKIP] Recruiter: no Acme tenant found');
    return;
  }
  const companyId = tenant.rows[0].id;
  const existing = await client.query(
    `SELECT id FROM "company_${companyId}"."users" WHERE email = $1`,
    ['recruiter@acme.com'],
  );
  if (existing.rows.length > 0) {
    console.log('[SKIP] Recruiter already exists');
    return;
  }
  const userId = randomUUID();
  const passwordHash = await hash('Recruiter123!');
  await client.query(
    `INSERT INTO "company_${companyId}"."users" (id, email, password_hash, role)
     VALUES ($1, $2, $3, 'Recruiter')`,
    [userId, 'recruiter@acme.com', passwordHash],
  );
  await client.query(
    `INSERT INTO public.user_emails (id, email, company_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'recruiter@acme.com', companyId, userId],
  );
  console.log('[OK] Recruiter created: recruiter@acme.com');
}

async function seedCandidate(client: any): Promise<void> {
  const existing = await client.query(
    `SELECT id FROM public.candidate_accounts WHERE email = $1`,
    ['candidate@test.com'],
  );
  if (existing.rows.length > 0) {
    console.log('[SKIP] Candidate already exists');
    return;
  }
  const passwordHash = await hash('Candidate123!');
  await client.query(
    `INSERT INTO public.candidate_accounts (id, email, password_hash, first_name, last_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), 'candidate@test.com', passwordHash, 'Jane', 'Doe'],
  );
  console.log('[OK] Candidate created: candidate@test.com');
}

const SKILLS: { name: string; category: string }[] = [
  { name: 'JavaScript', category: 'Language' },
  { name: 'TypeScript', category: 'Language' },
  { name: 'Python', category: 'Language' },
  { name: 'Java', category: 'Language' },
  { name: 'Go', category: 'Language' },
  { name: 'Rust', category: 'Language' },
  { name: 'C#', category: 'Language' },
  { name: 'SQL', category: 'Language' },
  { name: 'PHP', category: 'Language' },
  { name: 'Ruby', category: 'Language' },
  { name: 'React', category: 'Frontend' },
  { name: 'Vue.js', category: 'Frontend' },
  { name: 'Angular', category: 'Frontend' },
  { name: 'Next.js', category: 'Frontend' },
  { name: 'HTML/CSS', category: 'Frontend' },
  { name: 'Tailwind CSS', category: 'Frontend' },
  { name: 'Node.js', category: 'Backend' },
  { name: 'NestJS', category: 'Backend' },
  { name: 'Express', category: 'Backend' },
  { name: 'REST API', category: 'Backend' },
  { name: 'GraphQL', category: 'Backend' },
  { name: 'gRPC', category: 'Backend' },
  { name: 'PostgreSQL', category: 'Database' },
  { name: 'MySQL', category: 'Database' },
  { name: 'MongoDB', category: 'Database' },
  { name: 'Redis', category: 'Database' },
  { name: 'Docker', category: 'DevOps' },
  { name: 'Kubernetes', category: 'DevOps' },
  { name: 'AWS', category: 'Cloud' },
  { name: 'Azure', category: 'Cloud' },
  { name: 'GCP', category: 'Cloud' },
  { name: 'CI/CD', category: 'DevOps' },
  { name: 'Terraform', category: 'DevOps' },
  { name: 'Unit Testing', category: 'Testing' },
  { name: 'Integration Testing', category: 'Testing' },
  { name: 'Playwright', category: 'Testing' },
  { name: 'Cypress', category: 'Testing' },
  { name: 'Jest', category: 'Testing' },
  { name: 'Project Management', category: 'Soft Skill' },
  { name: 'Team Leadership', category: 'Soft Skill' },
  { name: 'Communication', category: 'Soft Skill' },
  { name: 'Agile/Scrum', category: 'Soft Skill' },
];

async function seedSkills(client: any): Promise<void> {
  for (const skill of SKILLS) {
    await client.query(
      `INSERT INTO public.skills (id, name, category)
       SELECT $1::uuid, $2::varchar, $3::varchar
       WHERE NOT EXISTS (SELECT 1 FROM public.skills WHERE name = $2::varchar)`,
      [randomUUID(), skill.name, skill.category],
    );
  }
  const count = await client.query(
    'SELECT count(*)::int AS n FROM public.skills',
  );
  console.log(`[OK] Skills seeded: ${count.rows[0].n} total`);
}

const DEFAULT_PRESETS: { name: string; role: string; permissions: string[] }[] = [
  {
    name: 'Company Admin Default',
    role: 'CompanyAdmin',
    permissions: [
      'jobs.view', 'jobs.create_edit', 'jobs.publish_close', 'jobs.delete',
      'candidates.view', 'candidates.manage',
      'applications.view', 'applications.move', 'applications.note',
      'interviews.view', 'interviews.schedule',
      'stages.manage', 'settings.manage', 'users.manage', 'permissions.manage',
      'dashboard.view',
    ],
  },
  {
    name: 'Recruiter Default',
    role: 'Recruiter',
    permissions: [
      'jobs.view', 'jobs.create_edit', 'jobs.publish_close',
      'candidates.view', 'candidates.manage',
      'applications.view', 'applications.move', 'applications.note',
      'interviews.view', 'interviews.schedule',
      'dashboard.view',
    ],
  },
  {
    name: 'Hiring Manager Default',
    role: 'HiringManager',
    permissions: [
      'jobs.view', 'candidates.view',
      'applications.view', 'applications.move', 'applications.note',
      'interviews.view', 'interviews.schedule',
      'dashboard.view',
    ],
  },
  {
    name: 'Interviewer Default',
    role: 'Interviewer',
    permissions: ['interviews.view', 'interviews.feedback', 'dashboard.view'],
  },
];

async function seedPermissionPresets(client: any): Promise<void> {
  for (const preset of DEFAULT_PRESETS) {
    await client.query(
      `INSERT INTO public.permission_presets (id, name, role, permissions, is_default)
       SELECT $1::uuid, $2::varchar, $3::varchar, $4::jsonb, true
       WHERE NOT EXISTS (
         SELECT 1 FROM public.permission_presets WHERE role = $3::varchar AND is_default = true
       )`,
      [randomUUID(), preset.name, preset.role, JSON.stringify(preset.permissions)],
    );
  }
  const count = await client.query(
    'SELECT count(*)::int AS n FROM public.permission_presets',
  );
  console.log(`[OK] Permission presets seeded: ${count.rows[0].n} total`);
}

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedSuperAdmin(client);
    await seedCompany(client);
    await seedInterviewer(client);
    await seedHiringManager(client);
    await seedRecruiter(client);
    await seedCandidate(client);
    await seedSkills(client);
    await seedPermissionPresets(client);
    await client.query('COMMIT');
    console.log('\nSeed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
