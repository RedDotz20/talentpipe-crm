import 'dotenv/config';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TENANT_TABLES = [
  'users', 'job_postings', 'candidates', 'pipeline_stages',
  'applications', 'resumes', 'resume_skills', 'job_required_skills',
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

async function seedOrg(client: any): Promise<void> {
  const existing = await client.query(
    `SELECT id FROM public.tenants WHERE slug = $1`,
    ['acme-corp'],
  );
  if (existing.rows.length > 0) {
    const tenantId = existing.rows[0].id;
    const passwordHash = await hash('Admin123!');
    await client.query(
      `UPDATE "tenant_${tenantId}"."users" SET password_hash = $1 WHERE email = $2`,
      [passwordHash, 'admin@acme.com'],
    );
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS).toISOString();
    const rawToken = randomUUID();
    const tokenHash = await hash(rawToken);
    const userResult = await client.query(
      `SELECT id FROM "tenant_${tenantId}"."users" WHERE email = $1`,
      ['admin@acme.com'],
    );
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;
      await client.query(
        `DELETE FROM public.refresh_tokens WHERE user_id = $1`,
        [userId],
      );
      await client.query(
        `INSERT INTO public.refresh_tokens (id, user_id, tenant_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), userId, tenantId, tokenHash, expiresAt],
      );
    }
    console.log(`[UPDATE] Org admin password reset for Acme Corp (tenant: ${tenantId})`);
    return;
  }

  const tenantId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await hash('Admin123!');

  await client.query(
    `INSERT INTO public.tenants (id, name, slug)
     VALUES ($1, $2, $3)`,
    [tenantId, 'Acme Corp', 'acme-corp'],
  );

  await client.query(`CREATE SCHEMA IF NOT EXISTS "tenant_${tenantId}"`);

  for (const table of TENANT_TABLES) {
    await client.query(
      `CREATE TABLE IF NOT EXISTS "tenant_${tenantId}"."${table}" (LIKE template."${table}" INCLUDING ALL)`,
    );
  }

  await client.query(
    `INSERT INTO "tenant_${tenantId}"."users" (id, email, password_hash, role)
     VALUES ($1, $2, $3, 'OrgAdmin')`,
    [userId, 'admin@acme.com', passwordHash],
  );

  for (const stage of PIPELINE_STAGES) {
    await client.query(
      `INSERT INTO "tenant_${tenantId}"."pipeline_stages" (id, name, "order")
       VALUES ($1, $2, $3)`,
      [randomUUID(), stage.name, stage.order],
    );
  }

  await client.query(
    `INSERT INTO public.user_emails (id, email, tenant_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'admin@acme.com', tenantId, userId],
  );

  const refreshTokenId = randomUUID();
  const rawToken = randomUUID();
  const tokenHash = await hash(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS).toISOString();
  await client.query(
    `INSERT INTO public.refresh_tokens (id, user_id, tenant_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [refreshTokenId, userId, tenantId, tokenHash, expiresAt],
  );

  console.log(`[OK] Org created: Acme Corp (admin@acme.com, tenant: ${tenantId})`);
}

async function seedInterviewer(client: any): Promise<void> {
  const tenant = await client.query(
    `SELECT id FROM public.tenants WHERE slug = $1`,
    ['acme-corp'],
  );
  if (tenant.rows.length === 0) {
    console.log('[SKIP] Interviewer: no Acme tenant found');
    return;
  }
  const tenantId = tenant.rows[0].id;
  const existing = await client.query(
    `SELECT id FROM "tenant_${tenantId}"."users" WHERE email = $1`,
    ['interviewer@acme.com'],
  );
  if (existing.rows.length > 0) {
    console.log('[SKIP] Interviewer already exists');
    return;
  }
  const userId = randomUUID();
  const passwordHash = await hash('Interviewer123!');
  await client.query(
    `INSERT INTO "tenant_${tenantId}"."users" (id, email, password_hash, role)
     VALUES ($1, $2, $3, 'Interviewer')`,
    [userId, 'interviewer@acme.com', passwordHash],
  );
  await client.query(
    `INSERT INTO public.user_emails (id, email, tenant_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'interviewer@acme.com', tenantId, userId],
  );
  console.log('[OK] Interviewer created: interviewer@acme.com');
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

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedSuperAdmin(client);
    await seedOrg(client);
    await seedInterviewer(client);
    await seedCandidate(client);
    await seedSkills(client);
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
