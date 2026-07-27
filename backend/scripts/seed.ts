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
    console.log('[SKIP] Org tenant acme-corp already exists');
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

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedSuperAdmin(client);
    await seedOrg(client);
    await seedCandidate(client);
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
