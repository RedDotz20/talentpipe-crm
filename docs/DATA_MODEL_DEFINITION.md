# TalentPipe — Data Model Definition

**Purpose:** The complete Drizzle (PostgreSQL) schema — every table, field, type, relationship, and index. Use this when writing migrations, repositories, and seed data. The canonical source is `backend/src/database/schema.ts` — this doc mirrors it.

**Architecture:** See `00_PROJECT_INSTRUCTIONS.md` §3.1 for the schema-per-tenant model.
**ERD:** See `04_ERD_DIAGRAM.md` for the conceptual entity diagram.

---

## Schema Organization

Two groups of tables:

| Schema | Contents | Access |
|---|---|---|
| `public` | `tenants`, `skills`, `audit_logs`, `user_emails`, `refresh_tokens`, `super_admins`, `candidate_accounts`, `candidate_skills`, `candidate_bookmarks`, `candidate_applications_index`, `job_listings_index` | Global/platform data + cross-tenant indexes |
| `tenant_<id>` | `users`, `job_postings`, `candidates`, `pipeline_stages`, `applications`, `job_required_skills`, `interviews`, `interview_feedbacks`, `notes` | Tenant-scoped queries via `search_path` |

Tenant schemas are created at signup by cloning the `template` schema (`backend/drizzle/template-schema.sql`). Drizzle migrations apply to `public`; the `template` schema and existing tenant schemas are updated manually (see `00b_LOCAL_DEV_BOOTSTRAP.md` "Editing the schema").

---

## Full Drizzle Schema

Path: `backend/src/database/schema.ts`

```typescript
import {
  pgTable, uuid, varchar, text, integer, doublePrecision, timestamp,
  uniqueIndex, index, jsonb,
} from 'drizzle-orm/pg-core';

// ── Public Schema Tables ──

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan: varchar('plan', { length: 50 }).default('free').notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  // status: active | suspended
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  category: varchar('category', { length: 100 }),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    resourceId: varchar('resource_id', { length: 36 }),
    metadata: text('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantActionIdx: index('idx_audit_logs_tenant_action').on(
      table.tenantId, table.action,
    ),
  }),
);

export const userEmails = pgTable('user_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    tenantId: uuid('tenant_id').notNull(), // nil uuid for SuperAdmin/Candidate
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_refresh_tokens_user').on(table.userId),
  }),
);

export const superAdmins = pgTable('super_admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Tenant Schema Tables (recreated per tenant) ──

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('OrgAdmin').notNull(),
  // roles: OrgAdmin | Recruiter | HiringManager | Interviewer
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const jobPostings = pgTable('job_postings', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('draft').notNull(),
  // status: draft | open | closed
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    candidateAccountId: uuid('candidate_account_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index('idx_candidates_email').on(table.email),
  }),
);

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    order: integer('order').default(0).notNull(),
    // default stages: Applied(0) → Screening(1) → Interview(2) → Offer(3) → Hired(4) / Rejected(5)
  },
  (table) => ({
    orderIdx: index('idx_pipeline_stages_order').on(table.order),
  }),
);

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
    jobPostingId: uuid('job_posting_id').notNull().references(() => jobPostings.id),
    currentStageId: uuid('current_stage_id').references(() => pipelineStages.id),
    candidateName: varchar('candidate_name', { length: 255 }),
    candidateEmail: varchar('candidate_email', { length: 255 }),
    candidatePhone: varchar('candidate_phone', { length: 50 }),
    appliedSkillIds: jsonb('applied_skill_ids'),
    matchScore: doublePrecision('match_score').default(0),
    appliedAt: timestamp('applied_at').defaultNow().notNull(),
  },
  (table) => ({
    jobStageIdx: index('idx_applications_job_stage').on(
      table.jobPostingId, table.currentStageId,
    ),
  }),
);

export const jobRequiredSkills = pgTable(
  'job_required_skills',
  {
    jobPostingId: uuid('job_posting_id').notNull().references(() => jobPostings.id),
    skillId: uuid('skill_id').notNull(), // references public.skills.id
  },
  (table) => ({
    uniqueIdx: uniqueIndex('idx_job_required_skills_unique').on(
      table.jobPostingId, table.skillId,
    ),
  }),
);

export const interviews = pgTable(
  'interviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id').notNull().references(() => applications.id),
    interviewerId: uuid('interviewer_id').notNull().references(() => users.id),
    scheduledAt: timestamp('scheduled_at').notNull(),
    status: varchar('status', { length: 50 }).default('scheduled').notNull(),
    // status: scheduled | completed | cancelled
  },
  (table) => ({
    interviewerIdx: index('idx_interviews_interviewer').on(table.interviewerId),
    applicationIdx: index('idx_interviews_application').on(table.applicationId),
  }),
);

export const interviewFeedbacks = pgTable('interview_feedbacks', {
  id: uuid('id').defaultRandom().primaryKey(),
  interviewId: uuid('interview_id').notNull().unique().references(() => interviews.id),
  rating: integer('rating'), // 1–5
  comments: text('comments'),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
});

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id').notNull().references(() => applications.id),
    authorUserId: uuid('author_user_id').notNull().references(() => users.id),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    applicationIdx: index('idx_notes_application').on(table.applicationId),
  }),
);

// ── Public Candidate Schema Tables ──

export const candidateAccounts = pgTable('candidate_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  resumeFileUrl: varchar('resume_file_url', { length: 512 }),
  resumeUploadedAt: timestamp('resume_uploaded_at', { withTimezone: true }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const candidateSkills = pgTable(
  'candidate_skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateAccountId: uuid('candidate_account_id').notNull().references(() => candidateAccounts.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueCandidateSkill: uniqueIndex('unique_candidate_skill').on(table.candidateAccountId, table.skillId),
  }),
);

export const candidateBookmarks = pgTable(
  'candidate_bookmarks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateAccountId: uuid('candidate_account_id').notNull().references(() => candidateAccounts.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    jobPostingId: uuid('job_posting_id').notNull(),
    jobTitle: varchar('job_title', { length: 255 }).notNull(),
    companyName: varchar('company_name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    accountIdx: index('idx_candidate_bookmarks_account').on(table.candidateAccountId),
    tenantJobIdx: index('idx_candidate_bookmarks_tenant_job').on(
      table.tenantId, table.jobPostingId,
    ),
  }),
);

export const candidateApplicationsIndex = pgTable(
  'candidate_applications_index',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateAccountId: uuid('candidate_account_id').notNull().references(() => candidateAccounts.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    jobPostingId: uuid('job_posting_id').notNull(),
    applicationId: uuid('application_id').notNull(),
    jobTitle: varchar('job_title', { length: 255 }).notNull(),
    companyName: varchar('company_name', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    appliedAt: timestamp('applied_at').defaultNow().notNull(),
  },
  (table) => ({
    accountIdx: index('idx_candidate_applications_account').on(table.candidateAccountId),
    tenantJobIdx: index('idx_candidate_applications_tenant_job').on(
      table.tenantId, table.jobPostingId,
    ),
  }),
);

export const jobListingsIndex = pgTable(
  'job_listings_index',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    jobPostingId: uuid('job_posting_id').notNull().unique(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    companyName: varchar('company_name', { length: 255 }).notNull(),
    companySlug: varchar('company_slug', { length: 100 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index('idx_job_listings_status').on(table.status),
    companyIdx: index('idx_job_listings_company').on(table.companyName),
    tenantIdx: index('idx_job_listings_tenant').on(table.tenantId),
  }),
);
```

---

## Template Schema

The `template` schema (`backend/drizzle/template-schema.sql`) contains exactly the **9 tenant tables** (`users`, `job_postings`, `candidates`, `pipeline_stages`, `applications`, `job_required_skills`, `interviews`, `interview_feedbacks`, `notes`). It does **not** include the public candidate tables (`candidate_accounts`, `candidate_skills`, `candidate_bookmarks`, `candidate_applications_index`) or the public platform tables (`super_admins`, `user_emails`, `refresh_tokens`, `skills`, `audit_logs`, `job_listings_index`). On tenant signup, `TenantProvisioningService` clones these into a new `tenant_<id>` schema and inserts the default pipeline stages.

> **Note:** Tenant `resumes` and `resume_skills` tables were removed by the Phase 4 redesign. Resume metadata is stored on `public.candidate_accounts`; skill matching uses `public.candidate_skills` and application snapshots.

---

## Entity Relationship Summary

| Table | Schema | FK References | Notes |
|-------|--------|---------------|-------|
| `tenants` | `public` | — | One row per company |
| `skills` | `public` | — | Shared taxonomy, not tenant-scoped |
| `audit_logs` | `public` | — | Cross-tenant action log (carries `tenantId` as a data field) |
| `user_emails` | `public` | — | Email → tenant/user lookup for login |
| `refresh_tokens` | `public` | — | Hashed refresh tokens (JWT rotation) |
| `super_admins` | `public` | — | Platform-level SuperAdmin accounts |
| `users` | tenant | — | Row-level role assignment (internal roles) |
| `job_postings` | tenant | `createdByUserId → users.id` | |
| `candidates` | tenant | — | Company's record of a person who applied |
| `pipeline_stages` | tenant | — | Ordered, configurable per tenant |
| `applications` | tenant | `candidateId → candidates.id`, `jobPostingId → job_postings.id`, `currentStageId → pipeline_stages.id` | The pipeline record |
| `candidate_skills` | public | `candidateAccountId → candidate_accounts.id`, `skillId → public.skills.id` | Many-to-many; unique per candidate/skill |
| `job_required_skills` | tenant | `jobPostingId → job_postings.id`, `skillId → public.skills.id` | Many-to-many |
| `interviews` | tenant | `applicationId → applications.id`, `interviewerId → users.id` | |
| `interview_feedbacks` | tenant | `interviewId → interviews.id` (unique) | 1:1 with interview |
| `notes` | tenant | `applicationId → applications.id`, `authorUserId → users.id` | |
| `candidate_accounts` | `public` | — | Global candidate identity and resume metadata (no tenant) |
| `candidate_skills` | `public` | `candidateAccountId → candidate_accounts.id`, `skillId → skills.id` | Candidate-declared skills; unique per account/skill |
| `candidate_bookmarks` | `public` | `candidateAccountId → candidate_accounts.id` | Cross-tenant; denormalized `jobTitle`/`companyName` |
| `candidate_applications_index` | `public` | `candidateAccountId → candidate_accounts.id` | Cross-tenant application history |
| `job_listings_index` | `public` | — | Cross-tenant open-job catalog (denormalized from tenant `job_postings`) |

---

## Seed Data: Skill Taxonomy

Seeded by `backend/scripts/seed.ts`. These are the base skills used for manual candidate declarations and job requirements.

```typescript
const seedSkills = [
  // Programming Languages
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

  // Frontend
  { name: 'React', category: 'Frontend' },
  { name: 'Vue.js', category: 'Frontend' },
  { name: 'Angular', category: 'Frontend' },
  { name: 'Next.js', category: 'Frontend' },
  { name: 'HTML/CSS', category: 'Frontend' },
  { name: 'Tailwind CSS', category: 'Frontend' },

  // Backend & API
  { name: 'Node.js', category: 'Backend' },
  { name: 'NestJS', category: 'Backend' },
  { name: 'Express', category: 'Backend' },
  { name: 'REST API', category: 'Backend' },
  { name: 'GraphQL', category: 'Backend' },
  { name: 'gRPC', category: 'Backend' },

  // Database
  { name: 'PostgreSQL', category: 'Database' },
  { name: 'MySQL', category: 'Database' },
  { name: 'MongoDB', category: 'Database' },
  { name: 'Redis', category: 'Database' },

  // DevOps & Cloud
  { name: 'Docker', category: 'DevOps' },
  { name: 'Kubernetes', category: 'DevOps' },
  { name: 'AWS', category: 'Cloud' },
  { name: 'Azure', category: 'Cloud' },
  { name: 'GCP', category: 'Cloud' },
  { name: 'CI/CD', category: 'DevOps' },
  { name: 'Terraform', category: 'DevOps' },

  // Testing
  { name: 'Unit Testing', category: 'Testing' },
  { name: 'Integration Testing', category: 'Testing' },
  { name: 'Playwright', category: 'Testing' },
  { name: 'Cypress', category: 'Testing' },
  { name: 'Jest', category: 'Testing' },

  // Soft Skills
  { name: 'Project Management', category: 'Soft Skill' },
  { name: 'Team Leadership', category: 'Soft Skill' },
  { name: 'Communication', category: 'Soft Skill' },
  { name: 'Agile/Scrum', category: 'Soft Skill' },
]
```

---

## Important Design Notes

1. **No `tenantId` columns on tenant-scoped tables.** Isolation is purely by PostgreSQL schema. Every table in a tenant schema is implicitly owned by that tenant. The `public` tables that do carry a `tenantId` (`audit_logs`, `candidate_bookmarks`, `candidate_applications_index`, `job_listings_index`) use it as a **data field**, not an isolation mechanism.

2. **`skills` is shared.** The `candidate_skills` public join table and tenant `job_required_skills` table reference `public.skills` through application-level validation. Cross-schema FKs are not physically enforced by DDL; skill IDs are validated before writes.

3. **`audit_logs` is in `public` schema.** Even though it carries `tenantId`, it needs to be accessible cross-schema for SuperAdmin reporting.

4. **UUID primary keys.** All tables use UUID v4 via `defaultRandom()`. Sequential IDs are avoided to prevent ID enumeration attacks.

5. **`matchScore` is denormalized** on `applications` (`doublePrecision`, default 0). Computed synchronously at application time from declared or overridden skills; recompute if a posting's required skills change after applications exist.

6. **`pipeline_stages.order` is a reserved word.** In PostgreSQL, `order` must be quoted — in raw SQL use `"order"`. Drizzle handles this with the string key `'order'`.

7. **Refresh tokens are hashed at rest.** `refresh_tokens.tokenHash` stores an argon2 hash, not the raw token. SuperAdmin/Candidate rows use the nil UUID (`00000000-0000-0000-0000-000000000000`) as `tenantId` since the column is `notNull`.
