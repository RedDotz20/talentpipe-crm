import pg from 'pg';
import argon2 from 'argon2';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://devuser:devpassword@localhost:5432/talentpipe' });

// Test 1: user_emails lookup
const emailResult = await pool.query("SELECT * FROM public.user_emails WHERE email = $1", ['admin@acme.com']);
console.log('user_emails found:', emailResult.rows.length > 0);
if (emailResult.rows.length === 0) {
  // All rows
  const all = await pool.query("SELECT * FROM public.user_emails");
  console.log('All user_emails rows:', JSON.stringify(all.rows));
  process.exit(1);
}

const record = emailResult.rows[0];
const tenantId = record.tenant_id;
console.log('tenantId:', tenantId);

// Test 2: user in tenant schema
const userResult = await pool.query(`SELECT * FROM "tenant_${tenantId}".users WHERE email = $1`, ['admin@acme.com']);
console.log('tenant user found:', userResult.rows.length > 0);
if (userResult.rows.length === 0) {
  // Check all users in tenant
  const all = await pool.query(`SELECT id, email, role FROM "tenant_${tenantId}".users`);
  console.log('All tenant users:', JSON.stringify(all.rows));
  process.exit(1);
}

const user = userResult.rows[0];
console.log('user role:', user.role);
console.log('hash:', user.password_hash.substring(0, 20) + '...');

// Test 3: verify password
const valid = await argon2.verify(user.password_hash, 'Admin123!');
console.log('password valid:', valid);

// Candidate test
const candResult = await pool.query("SELECT * FROM public.candidate_accounts WHERE email = $1", ['candidate@test.com']);
console.log('\ncandidate found:', candResult.rows.length > 0);
if (candResult.rows.length > 0) {
  const candValid = await argon2.verify(candResult.rows[0].password_hash, 'Candidate123!');
  console.log('candidate password valid:', candValid);
}

await pool.end();
