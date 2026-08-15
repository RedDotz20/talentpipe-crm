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

const SUPERADMINS = [
  { email: 'superadmin@talentpipe.com', name: 'Super Admin' },
  { email: 'platform@talentpipe.com', name: 'Platform Admin' },
];

const SEED_NAMES = [
  'Ada Lovelace',
  'Grace Hopper',
  'Katherine Johnson',
  'Alan Turing',
  'Edsger Dijkstra',
  'Linus Torvalds',
  'Margaret Hamilton',
];

const COMPANIES = [
  { name: 'Acme Corp', slug: 'acme-corp', adminEmail: 'admin@acme.com' },
  { name: 'Globex', slug: 'globex', adminEmail: 'admin@globex.com' },
  { name: 'Initech', slug: 'initech', adminEmail: 'admin@initech.com' },
  { name: 'Umbrella Corp', slug: 'umbrella-corp', adminEmail: 'admin@umbrella-corp.com' },
  { name: 'Stark Industries', slug: 'stark-industries', adminEmail: 'admin@stark-industries.com' },
];

const CANDIDATES = [
  { email: 'candidate1@test.com', firstName: 'Jane', lastName: 'Doe', skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'] },
  { email: 'candidate2@test.com', firstName: 'John', lastName: 'Smith', skills: ['Python', 'SQL', 'Docker'] },
  { email: 'candidate3@test.com', firstName: 'Maria', lastName: 'Garcia', skills: ['Java', 'Spring Boot', 'AWS'] },
  { email: 'candidate4@test.com', firstName: 'David', lastName: 'Kim', skills: ['JavaScript', 'Vue.js', 'HTML/CSS', 'Tailwind CSS'] },
  { email: 'candidate5@test.com', firstName: 'Aisha', lastName: 'Patel', skills: ['Go', 'Kubernetes', 'CI/CD', 'Terraform'] },
  { email: 'candidate6@test.com', firstName: 'Luis', lastName: 'Fernandez', skills: ['React', 'Next.js', 'GraphQL'] },
  { email: 'candidate7@test.com', firstName: 'Emma', lastName: 'Wilson', skills: ['SQL', 'Python', 'Data Analysis', 'Tableau'] },
  { email: 'candidate8@test.com', firstName: 'Omar', lastName: 'Hassan', skills: ['Node.js', 'Express', 'MongoDB', 'Redis'] },
  { email: 'candidate9@test.com', firstName: 'Sofia', lastName: 'Rossi', skills: ['Figma', 'UI/UX', 'Prototyping'] },
  { email: 'candidate10@test.com', firstName: 'Ethan', lastName: 'Brown', skills: ['C#', '.NET', 'Azure', 'SQL'] },
];

// 6 jobs per company, cycling through the pool with a company offset so every
// company gets a different slice of titles.
const JOB_POOL = [
  { title: 'Senior Frontend Engineer', type: 'full-time', location: 'Manila', setup: 'hybrid', skills: ['React', 'TypeScript', 'HTML/CSS'] },
  { title: 'Backend Engineer (Node.js)', type: 'full-time', location: 'Cebu', setup: 'remote', skills: ['Node.js', 'PostgreSQL', 'REST API'] },
  { title: 'DevOps Engineer', type: 'full-time', location: 'Singapore', setup: 'on-site', skills: ['Docker', 'Kubernetes', 'CI/CD'] },
  { title: 'Data Analyst', type: 'contract', location: 'Remote', setup: 'work-from-home', skills: ['SQL', 'Python'] },
  { title: 'QA Engineer', type: 'full-time', location: 'Manila', setup: 'on-site', skills: ['Playwright', 'Jest', 'Cypress'] },
  { title: 'Product Manager', type: 'full-time', location: 'Singapore', setup: 'hybrid', skills: ['Project Management', 'Agile/Scrum', 'Communication'] },
  { title: 'Full-Stack Developer', type: 'full-time', location: 'Jakarta', setup: 'hybrid', skills: ['TypeScript', 'React', 'NestJS', 'PostgreSQL'] },
  { title: 'ML Engineer', type: 'full-time', location: 'Remote', setup: 'work-from-home', skills: ['Python', 'AWS', 'Docker'] },
  { title: 'Mobile Engineer (React Native)', type: 'contract', location: 'Manila', setup: 'remote', skills: ['React', 'TypeScript'] },
  { title: 'Site Reliability Engineer', type: 'full-time', location: 'Tokyo', setup: 'on-site', skills: ['Kubernetes', 'Terraform', 'Go'] },
  { title: 'Security Engineer', type: 'full-time', location: 'Singapore', setup: 'hybrid', skills: ['AWS', 'CI/CD', 'Python'] },
  { title: 'Technical Writer', type: 'part-time', location: 'Remote', setup: 'work-from-home', skills: ['Communication', 'REST API'] },
  { title: 'UX Researcher', type: 'contract', location: 'Remote', setup: 'work-from-home', skills: ['Communication', 'Agile/Scrum'] },
  { title: 'Sales Engineer', type: 'full-time', location: 'Jakarta', setup: 'on-site', skills: ['Communication', 'REST API'] },
  { title: 'Engineering Manager', type: 'full-time', location: 'Singapore', setup: 'on-site', skills: ['Team Leadership', 'Project Management', 'Agile/Scrum'] },
  { title: 'Data Engineer', type: 'full-time', location: 'Manila', setup: 'hybrid', skills: ['Python', 'SQL', 'AWS', 'Docker'] },
  { title: 'Frontend Engineer (Vue)', type: 'full-time', location: 'Cebu', setup: 'remote', skills: ['Vue.js', 'JavaScript', 'HTML/CSS'] },
  { title: 'Platform Engineer', type: 'contract', location: 'Remote', setup: 'work-from-home', skills: ['Docker', 'Kubernetes', 'Redis'] },
  { title: 'Database Administrator', type: 'full-time', location: 'Tokyo', setup: 'on-site', skills: ['PostgreSQL', 'SQL'] },
  { title: 'QA Automation Lead', type: 'full-time', location: 'Manila', setup: 'hybrid', skills: ['Playwright', 'Cypress', 'Team Leadership'] },
  { title: 'Cloud Solutions Architect', type: 'contract', location: 'Singapore', setup: 'hybrid', skills: ['AWS', 'GCP', 'Docker', 'Kubernetes'] },
  { title: 'Support Engineer', type: 'full-time', location: 'Cebu', setup: 'on-site', skills: ['Node.js', 'REST API', 'Communication'] },
  { title: 'Frontend Engineer (Angular)', type: 'full-time', location: 'Jakarta', setup: 'hybrid', skills: ['Angular', 'TypeScript', 'HTML/CSS'] },
  { title: 'Site Reliability Engineer II', type: 'full-time', location: 'Remote', setup: 'work-from-home', skills: ['Kubernetes', 'Terraform', 'CI/CD'] },
  { title: 'Product Designer', type: 'full-time', location: 'Manila', setup: 'hybrid', skills: ['Figma', 'UI/UX', 'Communication'] },
  { title: 'Junior Backend Engineer', type: 'full-time', location: 'Cebu', setup: 'on-site', skills: ['Node.js', 'Express', 'PostgreSQL'] },
  { title: 'Data Scientist', type: 'full-time', location: 'Singapore', setup: 'hybrid', skills: ['Python', 'SQL', 'AWS'] },
  { title: 'QA Engineer (Manual)', type: 'contract', location: 'Manila', setup: 'remote', skills: ['Communication', 'Agile/Scrum'] },
  { title: 'Mobile Engineer (Flutter)', type: 'full-time', location: 'Jakarta', setup: 'hybrid', skills: ['Dart', 'Firebase', 'REST API'] },
  { title: 'Technical Account Manager', type: 'full-time', location: 'Tokyo', setup: 'on-site', skills: ['Communication', 'REST API', 'Project Management'] },
];

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

async function hash(val: string): Promise<string> {
  return argon2.hash(val);
}

async function provisionCompanySchema(client: any, companyId: string): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "company_${companyId}"`);
  for (const table of COMPANY_TABLES) {
    await client.query(
      `CREATE TABLE IF NOT EXISTS "company_${companyId}"."${table}" (LIKE template."${table}" INCLUDING ALL)`,
    );
  }
  // LIKE never copies FK constraints; mirror CompanyRepository.provisionSchema.
  const fks = [
    `ALTER TABLE "company_${companyId}"."interview_feedbacks" ADD CONSTRAINT interview_feedbacks_interview_id_interviews_id_fkey FOREIGN KEY (interview_id) REFERENCES "company_${companyId}"."interviews"(id) ON DELETE CASCADE`,
    `ALTER TABLE "company_${companyId}"."interviews" ADD CONSTRAINT interviews_application_id_applications_id_fkey FOREIGN KEY (application_id) REFERENCES "company_${companyId}"."applications"(id) ON DELETE CASCADE`,
    `ALTER TABLE "company_${companyId}"."notes" ADD CONSTRAINT notes_application_id_applications_id_fkey FOREIGN KEY (application_id) REFERENCES "company_${companyId}"."applications"(id) ON DELETE CASCADE`,
    `ALTER TABLE "company_${companyId}"."notes" ADD CONSTRAINT notes_author_user_id_users_id_fkey FOREIGN KEY (author_user_id) REFERENCES "company_${companyId}"."users"(id) ON DELETE CASCADE`,
    `ALTER TABLE "company_${companyId}"."job_postings" ADD CONSTRAINT job_postings_created_by_user_id_users_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "company_${companyId}"."users"(id) ON DELETE SET NULL`,
  ];
  for (const fk of fks) {
    await client.query(fk);
  }
}

async function createUser(
  client: any,
  companyId: string,
  email: string,
  role: string,
  password: string,
  name?: string,
): Promise<string> {
  const userId = randomUUID();
  const passwordHash = await hash(password);
  await client.query(
    `INSERT INTO "company_${companyId}"."users" (id, email, password_hash, role, name)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, email, passwordHash, role, name ?? null],
  );
  await client.query(
    `INSERT INTO public.user_emails (id, email, company_id, user_id)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), email, companyId, userId],
  );
  return userId;
}

async function seedSuperAdmins(client: any): Promise<void> {
  for (const sa of SUPERADMINS) {
    const existing = await client.query(
      `SELECT id FROM public.super_admins WHERE email = $1`,
      [sa.email],
    );
    if (existing.rows.length > 0) {
      console.log(`[SKIP] SuperAdmin already exists: ${sa.email}`);
      continue;
    }
    const passwordHash = await hash('SuperAdmin123!');
    await client.query(
      `INSERT INTO public.super_admins (id, email, password_hash, name)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), sa.email, passwordHash, sa.name],
    );
    console.log(`[OK] SuperAdmin created: ${sa.email}`);
  }
}

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

async function seedCandidateAccounts(
  client: any,
  skillIds: Map<string, string>,
): Promise<Map<string, string>> {
  const accountIds = new Map<string, string>();
  for (const c of CANDIDATES) {
    const existing = await client.query(
      `SELECT id FROM public.candidate_accounts WHERE email = $1`,
      [c.email],
    );
    if (existing.rows.length > 0) {
      accountIds.set(c.email, existing.rows[0].id);
      continue;
    }
    const accountId = randomUUID();
    const passwordHash = await hash('Candidate123!');
    await client.query(
      `INSERT INTO public.candidate_accounts (id, email, password_hash, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [accountId, c.email, passwordHash, c.firstName, c.lastName, `+63 917 555 01${CANDIDATES.indexOf(c) + 1}`],
    );
    const skillUuids = c.skills
      .map((name) => skillIds.get(name))
      .filter((id): id is string => Boolean(id));
    for (const skillId of skillUuids) {
      await client.query(
        `INSERT INTO public.candidate_skills (id, candidate_account_id, skill_id)
         VALUES ($1, $2, $3)`,
        [randomUUID(), accountId, skillId],
      );
    }
    accountIds.set(c.email, accountId);
    console.log(`[OK] Candidate created: ${c.email}`);
  }
  return accountIds;
}

function matchScore(candidateSkills: string[], jobSkills: string[]): number {
  if (candidateSkills.length === 0 || jobSkills.length === 0) return 0;
  const overlap = candidateSkills.filter((s) => jobSkills.includes(s)).length;
  return Math.round((overlap / jobSkills.length) * 100);
}

async function seedJob(
  client: any,
  company: { name: string; slug: string },
  companyId: string,
  job: { title: string; type: string; location: string; setup: string; skills: string[] },
  createdByUserId: string,
  skillIds: Map<string, string>,
  jobIndex: number,
): Promise<string> {
  const jobId = randomUUID();
  const now = new Date();
  const status = jobIndex % 6 === 5 ? 'closed' : 'open';
  const createdAt = new Date(now.getTime() - (5 - (jobIndex % 6)) * 24 * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO "company_${companyId}"."job_postings"
       (id, title, description, employment_type, location, work_setup, status, created_by_user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      jobId, job.title,
      `We are looking for a ${job.title.toLowerCase()} to join our team. This is a ${job.type.replace('-', ' ')} role, ${job.setup.replace('-', ' ')}.`,
      job.type, job.location, job.setup, status, createdByUserId, createdAt,
    ],
  );
  for (const skillName of job.skills) {
    const skillId = skillIds.get(skillName);
    if (skillId) {
      await client.query(
        `INSERT INTO "company_${companyId}"."job_required_skills" (job_posting_id, skill_id)
         VALUES ($1, $2)`,
        [jobId, skillId],
      );
    }
  }
  await client.query(
    `INSERT INTO public.job_listings_index
       (id, company_id, job_posting_id, title, description, employment_type, location, work_setup,
        company_name, company_slug, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      randomUUID(), companyId, jobId, job.title,
      `We are looking for a ${job.title.toLowerCase()} to join our team. This is a ${job.type.replace('-', ' ')} role, ${job.setup.replace('-', ' ')}.`,
      job.type, job.location, job.setup, company.name, company.slug, status, createdAt, createdAt,
    ],
  );
  return jobId;
}

const STAGE_PATTERN = [
  'Applied', 'Screening', 'Screening', 'Interview', 'Interview', 'Interview',
  'Offer', 'Offer', 'Hired', 'Rejected',
];

async function seedApplication(
  client: any,
  company: { name: string },
  companyId: string,
  candidate: { email: string; firstName: string; lastName: string; skills: string[] },
  accountId: string,
  jobId: string,
  jobTitle: string,
  stageId: string,
  stageName: string,
  jobSkills: string[],
  skillIds: Map<string, string>,
  appliedAt: Date,
): Promise<string> {
  const candidateId = randomUUID();
  const phone = `+63 917 555 01${CANDIDATES.indexOf(candidate) + 1}`;
  await client.query(
    `INSERT INTO "company_${companyId}"."candidates" (id, name, email, phone, candidate_account_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [candidateId, `${candidate.firstName} ${candidate.lastName}`, candidate.email, phone, accountId],
  );
  const applicationId = randomUUID();
  const appliedSkillIds = candidate.skills
    .map((name) => skillIds.get(name))
    .filter((id): id is string => Boolean(id));
  await client.query(
    `INSERT INTO "company_${companyId}"."applications"
       (id, candidate_id, job_posting_id, current_stage_id, candidate_name, candidate_email,
        candidate_phone, applied_skill_ids, cover_letter, match_score, applied_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      applicationId, candidateId, jobId, stageId, `${candidate.firstName} ${candidate.lastName}`,
      candidate.email, phone, JSON.stringify(appliedSkillIds),
      `I am excited to apply for the ${jobTitle} position at ${company.name}.`,
      matchScore(candidate.skills, jobSkills), appliedAt,
    ],
  );
  await client.query(
    `INSERT INTO public.candidate_applications_index
       (id, candidate_account_id, company_id, job_posting_id, application_id, job_title,
        company_name, status, applied_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [randomUUID(), accountId, companyId, jobId, applicationId, jobTitle, company.name, stageName, appliedAt],
  );
  return applicationId;
}

async function seedInterview(
  client: any,
  companyId: string,
  applicationId: string,
  interviewerId: string,
  scheduledAt: Date,
  feedback?: { rating: number; comments: string },
): Promise<void> {
  const interviewId = randomUUID();
  await client.query(
    `INSERT INTO "company_${companyId}"."interviews" (id, application_id, interviewer_id, scheduled_at, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [interviewId, applicationId, interviewerId, scheduledAt, 'scheduled'],
  );
  if (feedback) {
    await client.query(
      `INSERT INTO "company_${companyId}"."interview_feedbacks" (id, interview_id, rating, comments, submitted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), interviewId, feedback.rating, feedback.comments, scheduledAt],
    );
  }
}

async function seedCompany(
  client: any,
  company: { name: string; slug: string; adminEmail: string },
  companyIndex: number,
  skillIds: Map<string, string>,
  accountIds: Map<string, string>,
): Promise<void> {
  const existing = await client.query(
    `SELECT id FROM public.companies WHERE slug = $1`,
    [company.slug],
  );
  if (existing.rows.length > 0) {
    console.log(`[SKIP] Company already exists: ${company.name}`);
    return;
  }

  const companyId = randomUUID();
  await client.query(
    `INSERT INTO public.companies (id, name, slug) VALUES ($1, $2, $3)`,
    [companyId, company.name, company.slug],
  );
  await provisionCompanySchema(client, companyId);

  const stageIds = new Map<string, string>();
  for (const stage of PIPELINE_STAGES) {
    const stageId = randomUUID();
    await client.query(
      `INSERT INTO "company_${companyId}"."pipeline_stages" (id, name, "order") VALUES ($1, $2, $3)`,
      [stageId, stage.name, stage.order],
    );
    stageIds.set(stage.name, stageId);
  }

  const adminId = await createUser(client, companyId, company.adminEmail, 'CompanyAdmin', 'Admin123!', SEED_NAMES[0]);
  const interviewers = [
    await createUser(client, companyId, `iv1@${company.slug}.com`, 'Interviewer', 'Interviewer123!', SEED_NAMES[1]),
    await createUser(client, companyId, `iv2@${company.slug}.com`, 'Interviewer', 'Interviewer123!', SEED_NAMES[2]),
  ];
  for (let i = 1; i <= 2; i++) {
    await createUser(client, companyId, `hm${i}@${company.slug}.com`, 'HiringManager', 'HiringManager123!', SEED_NAMES[2 + i]);
  }
  for (let i = 1; i <= 2; i++) {
    await createUser(client, companyId, `rec${i}@${company.slug}.com`, 'Recruiter', 'Recruiter123!', SEED_NAMES[4 + i]);
  }

  const jobs = JOB_POOL.slice(companyIndex * 6, companyIndex * 6 + 6);
  const jobIds: string[] = [];
  for (let i = 0; i < jobs.length; i++) {
    jobIds.push(await seedJob(client, company, companyId, jobs[i], adminId, skillIds, i));
  }

  const now = new Date();
  const interviewApplications: { applicationId: string; index: number }[] = [];
  for (let i = 0; i < CANDIDATES.length; i++) {
    const candidate = CANDIDATES[i];
    const accountId = accountIds.get(candidate.email);
    if (!accountId) continue;
    const stageName = STAGE_PATTERN[i];
    const stageId = stageIds.get(stageName);
    if (!stageId) continue;
    const job = jobs[i % jobs.length];
    const appliedAt = new Date(now.getTime() - (29 - i * 3) * 24 * 60 * 60 * 1000);
    const applicationId = await seedApplication(
      client, company, companyId, candidate, accountId,
      jobIds[i % jobs.length], job.title, stageId, stageName, job.skills,
      skillIds, appliedAt,
    );
    if (stageName === 'Interview') {
      interviewApplications.push({ applicationId, index: i });
    }
  }

  const pending = interviewApplications.slice(0, 2);
  const done = interviewApplications[2];
  for (let i = 0; i < pending.length; i++) {
    const scheduledAt = new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    await seedInterview(client, companyId, pending[i].applicationId, interviewers[i % 2], scheduledAt);
  }
  if (done) {
    const past = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    await seedInterview(client, companyId, done.applicationId, interviewers[0], past, {
      rating: 4,
      comments: 'Strong technical skills and good culture fit. Recommend moving forward.',
    });
  }

  console.log(
    `[OK] Company created: ${company.name} (${company.adminEmail}, tenant: ${companyId}) ` +
    `— 7 users, ${jobs.length} jobs, ${CANDIDATES.length} candidates, ${CANDIDATES.length} applications, ${interviewApplications.length} interviews`,
  );
}

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedSuperAdmins(client);

    const skillResult = await client.query('SELECT id, name FROM public.skills');
    const skillIds = new Map<string, string>(
      skillResult.rows.map((r: { id: string; name: string }) => [r.name, r.id]),
    );

    const accountIds = await seedCandidateAccounts(client, skillIds);

    for (let i = 0; i < COMPANIES.length; i++) {
      await seedCompany(client, COMPANIES[i], i, skillIds, accountIds);
    }

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
