import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  doublePrecision,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ── Public Schema Tables ──

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan: varchar('plan', { length: 50 }).default('free').notNull(),
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
      table.tenantId,
      table.action,
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
    tenantId: uuid('tenant_id').notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_refresh_tokens_user').on(table.userId),
  }),
);

// ── Tenant Schema Tables (recreated per tenant) ──

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('OrgAdmin').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const jobPostings = pgTable('job_postings', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('draft').notNull(),
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
  },
  (table) => ({
    orderIdx: index('idx_pipeline_stages_order').on(table.order),
  }),
);

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id),
    jobPostingId: uuid('job_posting_id')
      .notNull()
      .references(() => jobPostings.id),
    currentStageId: uuid('current_stage_id').references(
      () => pipelineStages.id,
    ),
    matchScore: doublePrecision('match_score').default(0),
    appliedAt: timestamp('applied_at').defaultNow().notNull(),
  },
  (table) => ({
    jobStageIdx: index('idx_applications_job_stage').on(
      table.jobPostingId,
      table.currentStageId,
    ),
  }),
);

export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id),
    fileUrl: varchar('file_url', { length: 512 }),
    parsedText: text('parsed_text'),
    uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  },
  (table) => ({
    candidateIdx: index('idx_resumes_candidate').on(table.candidateId),
  }),
);

export const resumeSkills = pgTable(
  'resume_skills',
  {
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id),
    skillId: uuid('skill_id').notNull(),
  },
  (table) => ({
    uniqueIdx: uniqueIndex('idx_resume_skills_unique').on(
      table.resumeId,
      table.skillId,
    ),
  }),
);

export const jobRequiredSkills = pgTable(
  'job_required_skills',
  {
    jobPostingId: uuid('job_posting_id')
      .notNull()
      .references(() => jobPostings.id),
    skillId: uuid('skill_id').notNull(),
  },
  (table) => ({
    uniqueIdx: uniqueIndex('idx_job_required_skills_unique').on(
      table.jobPostingId,
      table.skillId,
    ),
  }),
);

export const interviews = pgTable(
  'interviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    interviewerId: uuid('interviewer_id')
      .notNull()
      .references(() => users.id),
    scheduledAt: timestamp('scheduled_at').notNull(),
    status: varchar('status', { length: 50 }).default('scheduled').notNull(),
  },
  (table) => ({
    interviewerIdx: index('idx_interviews_interviewer').on(table.interviewerId),
    applicationIdx: index('idx_interviews_application').on(table.applicationId),
  }),
);

export const interviewFeedbacks = pgTable('interview_feedbacks', {
  id: uuid('id').defaultRandom().primaryKey(),
  interviewId: uuid('interview_id')
    .notNull()
    .unique()
    .references(() => interviews.id),
  rating: integer('rating'),
  comments: text('comments'),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
});

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const candidateBookmarks = pgTable(
  'candidate_bookmarks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateAccountId: uuid('candidate_account_id')
      .notNull()
      .references(() => candidateAccounts.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    jobPostingId: uuid('job_posting_id').notNull(),
    jobTitle: varchar('job_title', { length: 255 }).notNull(),
    companyName: varchar('company_name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    accountIdx: index('idx_candidate_bookmarks_account').on(
      table.candidateAccountId,
    ),
    tenantJobIdx: index('idx_candidate_bookmarks_tenant_job').on(
      table.tenantId,
      table.jobPostingId,
    ),
  }),
);

export const candidateApplicationsIndex = pgTable(
  'candidate_applications_index',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateAccountId: uuid('candidate_account_id')
      .notNull()
      .references(() => candidateAccounts.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    jobPostingId: uuid('job_posting_id').notNull(),
    applicationId: uuid('application_id').notNull(),
    jobTitle: varchar('job_title', { length: 255 }).notNull(),
    companyName: varchar('company_name', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    appliedAt: timestamp('applied_at').defaultNow().notNull(),
  },
  (table) => ({
    accountIdx: index('idx_candidate_applications_account').on(
      table.candidateAccountId,
    ),
    tenantJobIdx: index('idx_candidate_applications_tenant_job').on(
      table.tenantId,
      table.jobPostingId,
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
