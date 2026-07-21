# TalentPipe — Data Model Definition

**Purpose:** The complete Drizzle (PostgreSQL) schema — every table, field, type, relationship, and index. Use this when writing migrations, repositories, and seed data.

**Architecture:** See `00_PROJECT_INSTRUCTIONS.md` §3.1 for the schema-per-tenant model.
**ERD:** See `04_ERD_DIAGRAM.md` for the conceptual entity diagram.

---

## Schema Organization

Two types of tables:

| Schema | Contents | Access |
|---|---|---|
| `public` | `tenant`, `skill`, `audit_log` | SuperAdmin + all tenants (`search_path` fallback) |
| `tenant_<id>` | `user`, `job_posting`, `candidate`, `application`, `pipeline_stage`, `resume`, `resume_skill`, `job_required_skill`, `interview`, `interview_feedback`, `note` | Tenant-scoped queries via `search_path` |

Tenant schemas are created at signup by cloning a `template` schema. Migrations run against `public` and `template`, then propagate to existing tenant schemas.

---

## Full Drizzle Schema

Install: `drizzle-orm pg @types/pg`

Path: `backend/src/database/schema.ts`

```typescript
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
  float,
  boolean,
  uniqueIndex,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core'

// =============================================================================
// PUBLIC SCHEMA — shared across all tenants
// =============================================================================

export const tenants = pgTable(
  'tenant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    plan: varchar('plan', { length: 50 }).notNull().default('free'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex('tenant_slug_idx').on(table.slug),
  }),
)

export const skills = pgTable(
  'skill',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    category: varchar('category', { length: 100 }),
  },
  (table) => ({
    nameIdx: uniqueIndex('skill_name_idx').on(table.name),
  }),
)

export const auditLogs = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    resourceId: varchar('resource_id', { length: 36 }),
    metadata: text('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantActionIdx: index('audit_tenant_action_idx').on(table.tenantId, table.action),
  }),
)

// =============================================================================
// TENANT-SCOPED TABLES — cloned into each tenant_<id> schema
// =============================================================================

// --- User ---
export const users = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull().default('OrgAdmin'),
    // roles: SuperAdmin | OrgAdmin | Recruiter | HiringManager | Interviewer
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('user_email_idx').on(table.email),
  }),
)

// --- Job Posting ---
export const jobPostings = pgTable(
  'job_posting',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).notNull().default('draft'),
    // status: draft | open | closed
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
)

// --- Candidate ---
export const candidates = pgTable(
  'candidate',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index('candidate_email_idx').on(table.email),
  }),
)

// --- Pipeline Stage ---
export const pipelineStages = pgTable(
  'pipeline_stage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    order: integer('order').notNull().default(0),
    // default stages: Applied(0) → Screening(1) → Interview(2) → Offer(3) → Hired(4) / Rejected(5)
  },
  (table) => ({
    orderIdx: index('pipeline_stage_order_idx').on(table.order),
  }),
)

// --- Application (pipeline record) ---
export const applications = pgTable(
  'application',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id),
    jobPostingId: uuid('job_posting_id')
      .notNull()
      .references(() => jobPostings.id),
    currentStageId: uuid('current_stage_id')
      .notNull()
      .references(() => pipelineStages.id),
    matchScore: float('match_score').default(0),
    appliedAt: timestamp('applied_at').notNull().defaultNow(),
  },
  (table) => ({
    jobStageIdx: index('application_job_stage_idx').on(table.jobPostingId, table.currentStageId),
  }),
)

// --- Resume ---
export const resumes = pgTable(
  'resume',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id),
    fileUrl: varchar('file_url', { length: 512 }).notNull(),
    parsedText: text('parsed_text'),
    uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  },
  (table) => ({
    candidateIdx: index('resume_candidate_idx').on(table.candidateId),
  }),
)

// --- Resume Skill (extracted from resume) ---
export const resumeSkills = pgTable(
  'resume_skill',
  {
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id),
    skillId: uuid('skill_id')
      .notNull(),
    // skillId references public.skill — resolved via search_path + schema fallback
  },
  (table) => ({
    pk: uniqueIndex('resume_skill_pk').on(table.resumeId, table.skillId),
  }),
)

// --- Job Required Skill ---
export const jobRequiredSkills = pgTable(
  'job_required_skill',
  {
    jobPostingId: uuid('job_posting_id')
      .notNull()
      .references(() => jobPostings.id),
    skillId: uuid('skill_id')
      .notNull(),
    // skillId references public.skill — resolved via search_path + schema fallback
  },
  (table) => ({
    pk: uniqueIndex('job_required_skill_pk').on(table.jobPostingId, table.skillId),
  }),
)

// --- Interview ---
export const interviews = pgTable(
  'interview',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    interviewerId: uuid('interviewer_id')
      .notNull()
      .references(() => users.id),
    scheduledAt: timestamp('scheduled_at').notNull(),
    status: varchar('status', { length: 50 }).notNull().default('scheduled'),
    // status: scheduled | completed | cancelled
  },
  (table) => ({
    interviewerIdx: index('interview_interviewer_idx').on(table.interviewerId),
    applicationIdx: index('interview_application_idx').on(table.applicationId),
  }),
)

// --- Interview Feedback ---
export const interviewFeedbacks = pgTable(
  'interview_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    interviewId: uuid('interview_id')
      .notNull()
      .references(() => interviews.id)
      .unique(), // 1:1 with interview
    rating: integer('rating').notNull(), // 1–5
    comments: text('comments'),
    submittedAt: timestamp('submitted_at').notNull().defaultNow(),
  },
  (table) => ({
    interviewIdx: uniqueIndex('feedback_interview_idx').on(table.interviewId),
  }),
)

// --- Note ---
export const notes = pgTable(
  'note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    applicationIdx: index('note_application_idx').on(table.applicationId),
  }),
)
```

---

## Schema Provisioning Flow

### On tenant signup

```sql
-- 1. Create the tenant schema
CREATE SCHEMA tenant_abc123;

-- 2. Clone table structure from template
CREATE TABLE tenant_abc123.user      (LIKE "template".user      INCLUDING ALL);
CREATE TABLE tenant_abc123.job_posting (LIKE "template".job_posting INCLUDING ALL);
CREATE TABLE tenant_abc123.candidate (LIKE "template".candidate INCLUDING ALL);
CREATE TABLE tenant_abc123.application (LIKE "template".application INCLUDING ALL);
CREATE TABLE tenant_abc123.pipeline_stage (LIKE "template".pipeline_stage INCLUDING ALL);
CREATE TABLE tenant_abc123.resume    (LIKE "template".resume    INCLUDING ALL);
CREATE TABLE tenant_abc123.resume_skill (LIKE "template".resume_skill INCLUDING ALL);
CREATE TABLE tenant_abc123.job_required_skill (LIKE "template".job_required_skill INCLUDING ALL);
CREATE TABLE tenant_abc123.interview (LIKE "template".interview INCLUDING ALL);
CREATE TABLE tenant_abc123.interview_feedback (LIKE "template".interview_feedback INCLUDING ALL);
CREATE TABLE tenant_abc123.note      (LIKE "template".note      INCLUDING ALL);

-- 3. Insert default pipeline stages
INSERT INTO tenant_abc123.pipeline_stage (name, "order") VALUES
  ('Applied', 0),
  ('Screening', 1),
  ('Interview', 2),
  ('Offer', 3),
  ('Hired', 4),
  ('Rejected', 5);
```

### On schema migration

1. Update the table definition in `database/schema.ts`
2. Run `pnpm drizzle-kit generate` and `pnpm drizzle-kit migrate` — this updates `public` and `template` schemas
3. For each existing tenant, run the migration DDL against their schema (or use a migration script that iterates tenant schemas)

---

## Entity Relationship Summary

| Table | Schema | FK References | Notes |
|-------|--------|---------------|-------|
| `tenant` | `public` | — | One row per company |
| `skill` | `public` | — | Shared taxonomy, not tenant-scoped |
| `audit_log` | `public` | — | Cross-tenant action log |
| `user` | tenant | — | Row-level role assignment |
| `job_posting` | tenant | `createdByUserId → user.id` | |
| `candidate` | tenant | — | |
| `pipeline_stage` | tenant | — | Ordered, configurable per tenant |
| `application` | tenant | `candidateId → candidate.id`, `jobPostingId → job_posting.id`, `currentStageId → pipeline_stage.id` | The pipeline record |
| `resume` | tenant | `candidateId → candidate.id` | |
| `resume_skill` | tenant | `resumeId → resume.id`, `skillId → public.skill.id` | Many-to-many |
| `job_required_skill` | tenant | `jobPostingId → job_posting.id`, `skillId → public.skill.id` | Many-to-many |
| `interview` | tenant | `applicationId → application.id`, `interviewerId → user.id` | |
| `interview_feedback` | tenant | `interviewId → interview.id` (unique) | 1:1 with interview |
| `note` | tenant | `applicationId → application.id`, `authorUserId → user.id` | |

---

## Seed Data: Skill Taxonomy

Optional — insert during setup. These are the base skills used for resume matching.

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

1. **No `tenantId` columns.** Isolation is purely by PostgreSQL schema. Every table in a tenant schema is implicitly owned by that tenant.

2. **`skill` is shared.** The `skill` and `job_required_skill`/`resume_skill` join tables reference `public.skill` via `search_path` fallback. The FKs on `skillId` are not physically enforced by DDL (cross-schema FK requires `REFERENCES public.skill(id)`) — skill validation should happen at the application layer.

3. **`audit_log` is in `public` schema.** Even though it carries `tenantId`, it needs to be accessible cross-schema for SuperAdmin reporting. The `tenantId` there is a data field, not an isolation column.

4. **UUID primary keys.** All tables use UUID v4 with `defaultRandom()`. Sequential IDs are avoided to prevent ID enumeration attacks (v1 doesn't expose IDs to unauthenticated users, but this is good practice).

5. **`matchScore` is denormalized.** Stored on `application`, computed once by the background job. Recompute if job posting required skills change.

6. **`pipeline_stage` has `order` as a reserved word.** In PostgreSQL, `order` must be quoted. Drizzle handles this with the string key `'order'` — in raw SQL, use `"order"`.
