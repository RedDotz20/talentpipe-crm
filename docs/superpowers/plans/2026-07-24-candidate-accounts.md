# Candidate Accounts & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global candidate accounts with signup/login, cross-tenant job search, application history, and job bookmarks.

**Architecture:** Four new public-schema tables (`candidate_accounts`, `candidate_bookmarks`, `candidate_applications_index`, `job_listings_index`). New `CandidateAuthGuard` for `/candidate/*` routes. Candidate JWT has `role: 'Candidate'` but no `tenantId` — operates in public schema. Dual-writes sync tenant schema changes (stage updates, job publishes) to public index tables.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL 16, React 19, Mantine 9, TanStack Router, TanStack Query, Zustand 5, Zod 4

## Global Constraints

- All DB access via repositories (no direct Drizzle outside `/repositories`)
- Error shape: `{ "error": { "code": "...", "message": "..." } }`
- Candidate JWT has no `tenantId` — `TenantContextInterceptor` falls back to `public` schema
- Existing `POST /public/:tenantSlug/jobs/:id/apply` unchanged (backward compatible)
- Frontend uses Zustand for auth state, TanStack Query for API data
- Schema-per-tenant: `candidates`, `applications` stay in tenant schemas — only index tables live in public

---

### Task 1: Add public schema tables to Drizzle schema

**Files:**
- Modify: `backend/src/database/schema.ts`

**Interfaces:**
- Consumes: existing `schema.ts` patterns (pgTable, uuid, varchar, etc.)
- Produces: `candidateAccounts`, `candidateBookmarks`, `candidateApplicationsIndex`, `jobListingsIndex` table definitions exported from `backend/src/database/schema.ts`

- [ ] **Step 1: Add new table definitions to schema.ts**

Append these table definitions after the existing `notes` table:

```typescript
// ── Candidate Accounts (public schema) ──

export const candidateAccounts = pgTable(
  'candidate_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex('idx_candidate_accounts_email').on(table.email),
  }),
);

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
    candidateIdx: index('idx_candidate_bookmarks_account').on(table.candidateAccountId),
    jobIdx: index('idx_candidate_bookmarks_job').on(table.tenantId, table.jobPostingId),
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
    candidateIdx: index('idx_candidate_app_index_account').on(table.candidateAccountId),
    tenantJobIdx: index('idx_candidate_app_index_tenant_job').on(table.tenantId, table.jobPostingId),
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

- [ ] **Step 2: Generate and run migration**

```bash
cd backend && npx drizzle-kit generate && npx drizzle-kit migrate
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/schema.ts backend/drizzle
git commit -m "feat: add candidate_accounts, bookmarks, applications_index, job_listings_index tables"
```

---

### Task 2: CandidateAuthGuard

**Files:**
- Create: `backend/src/shared/candidate-auth.guard.ts`

**Interfaces:**
- Produces: `CandidateAuthGuard` — `CanActivate` guard checking `request.user?.role === 'Candidate'`

- [ ] **Step 1: Create CandidateAuthGuard**

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class CandidateAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return request.user?.role === 'Candidate';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/shared/candidate-auth.guard.ts
git commit -m "feat: add CandidateAuthGuard"
```

---

### Task 3: Candidate repositories

**Files:**
- Create: `backend/src/repositories/candidate-account.repository.ts`
- Create: `backend/src/repositories/candidate-bookmark.repository.ts`
- Create: `backend/src/repositories/candidate-applications-index.repository.ts`
- Create: `backend/src/repositories/job-listings-index.repository.ts`

**Interfaces:**
- Consumes: `DrizzleSchemaService` with `forPublic()` method
- Produces: Repository classes with methods for CRUD on each new table

- [ ] **Step 1: Create CandidateAccountRepository**

```typescript
import { Injectable } from '@nestjs/common';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { candidateAccounts } from '../database/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class CandidateAccountRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findByEmail(email: string) {
    const { db } = await this.drizzleSchema.forPublic();
    const rows = await db.select().from(candidateAccounts).where(eq(candidateAccounts.email, email));
    return rows[0] ?? null;
  }

  async findById(id: string) {
    const { db } = await this.drizzleSchema.forPublic();
    const rows = await db.select().from(candidateAccounts).where(eq(candidateAccounts.id, id));
    return rows[0] ?? null;
  }

  async create(data: { email: string; passwordHash: string; firstName: string; lastName: string; phone?: string }) {
    const { db } = await this.drizzleSchema.forPublic();
    const rows = await db.insert(candidateAccounts).values(data).returning();
    return rows[0];
  }
}
```

- [ ] **Step 2: Create CandidateBookmarkRepository**

```typescript
import { Injectable } from '@nestjs/common';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { candidateBookmarks } from '../database/schema';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class CandidateBookmarkRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findByCandidate(candidateAccountId: string) {
    const { db } = await this.drizzleSchema.forPublic();
    return db.select().from(candidateBookmarks)
      .where(eq(candidateBookmarks.candidateAccountId, candidateAccountId));
  }

  async create(data: { candidateAccountId: string; tenantId: string; jobPostingId: string; jobTitle: string; companyName: string }) {
    const { db } = await this.drizzleSchema.forPublic();
    const rows = await db.insert(candidateBookmarks).values(data).returning();
    return rows[0];
  }

  async delete(id: string, candidateAccountId: string) {
    const { db } = await this.drizzleSchema.forPublic();
    await db.delete(candidateBookmarks)
      .where(and(
        eq(candidateBookmarks.id, id),
        eq(candidateBookmarks.candidateAccountId, candidateAccountId),
      ));
  }

  async findByJob(candidateAccountId: string, tenantId: string, jobPostingId: string) {
    const { db } = await this.drizzleSchema.forPublic();
    const rows = await db.select().from(candidateBookmarks)
      .where(and(
        eq(candidateBookmarks.candidateAccountId, candidateAccountId),
        eq(candidateBookmarks.tenantId, tenantId),
        eq(candidateBookmarks.jobPostingId, jobPostingId),
      ));
    return rows[0] ?? null;
  }
}
```

- [ ] **Step 3: Create CandidateApplicationsIndexRepository**

```typescript
import { Injectable } from '@nestjs/common';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { candidateApplicationsIndex } from '../database/schema';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class CandidateApplicationsIndexRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findByCandidate(candidateAccountId: string) {
    const { db } = await this.drizzleSchema.forPublic();
    return db.select().from(candidateApplicationsIndex)
      .where(eq(candidateApplicationsIndex.candidateAccountId, candidateAccountId))
      .orderBy(candidateApplicationsIndex.appliedAt);
  }

  async create(data: {
    candidateAccountId: string;
    tenantId: string;
    jobPostingId: string;
    applicationId: string;
    jobTitle: string;
    companyName: string;
    status: string;
  }) {
    const { db } = await this.drizzleSchema.forPublic();
    const rows = await db.insert(candidateApplicationsIndex).values(data).returning();
    return rows[0];
  }

  async updateStatus(applicationId: string, status: string) {
    const { db } = await this.drizzleSchema.forPublic();
    await db.update(candidateApplicationsIndex)
      .set({ status })
      .where(eq(candidateApplicationsIndex.applicationId, applicationId));
  }
}
```

- [ ] **Step 4: Create JobListingsIndexRepository**

```typescript
import { Injectable } from '@nestjs/common';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { jobListingsIndex } from '../database/schema';
import { eq, like, or, and, sql } from 'drizzle-orm';

@Injectable()
export class JobListingsIndexRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findAll(search?: string) {
    const { db } = await this.drizzleSchema.forPublic();
    let query = db.select().from(jobListingsIndex)
      .where(eq(jobListingsIndex.status, 'open'))
      .orderBy(jobListingsIndex.createdAt);

    const rows = await query;
    if (search) {
      const term = `%${search.toLowerCase()}%`;
      return rows.filter(r =>
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.companyName.toLowerCase().includes(search.toLowerCase())
      );
    }
    return rows;
  }

  async findById(tenantId: string, jobPostingId: string) {
    const { db } = await this.drizzleSchema.forPublic();
    const rows = await db.select().from(jobListingsIndex)
      .where(and(
        eq(jobListingsIndex.tenantId, tenantId),
        eq(jobListingsIndex.jobPostingId, jobPostingId),
      ));
    return rows[0] ?? null;
  }

  async upsert(data: {
    tenantId: string;
    jobPostingId: string;
    title: string;
    description: string | null;
    companyName: string;
    companySlug: string;
    status: string;
  }) {
    const { db, release } = await this.drizzleSchema.forPublic();
    const existing = await db.select().from(jobListingsIndex)
      .where(and(
        eq(jobListingsIndex.tenantId, data.tenantId),
        eq(jobListingsIndex.jobPostingId, data.jobPostingId),
      ));

    if (existing[0]) {
      const rows = await db.update(jobListingsIndex)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(jobListingsIndex.id, existing[0].id))
        .returning();
      release();
      return rows[0];
    }

    const rows = await db.insert(jobListingsIndex).values(data).returning();
    release();
    return rows[0];
  }

  async delete(tenantId: string, jobPostingId: string) {
    const { db } = await this.drizzleSchema.forPublic();
    await db.delete(jobListingsIndex)
      .where(and(
        eq(jobListingsIndex.tenantId, tenantId),
        eq(jobListingsIndex.jobPostingId, jobPostingId),
      ));
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/candidate-account.repository.ts backend/src/repositories/candidate-bookmark.repository.ts backend/src/repositories/candidate-applications-index.repository.ts backend/src/repositories/job-listings-index.repository.ts
git commit -m "feat: add candidate repositories (account, bookmark, applications index, job listings index)"
```

---

### Task 4: Update AuthModule — candidate signup/login

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.module.ts`
- Create: `backend/src/modules/auth/dto/candidate-auth.dto.ts`

**Interfaces:**
- Consumes: `CandidateAccountRepository`, `password.ts` (hashPassword, verifyPassword), `JwtService`
- Produces: `POST /auth/candidate/signup` and `POST /auth/candidate/login` endpoints

- [ ] **Step 1: Create candidate auth DTOs**

```typescript
// backend/src/modules/auth/dto/candidate-auth.dto.ts
import { z } from 'zod';

export const CandidateSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(50).optional(),
});

export const CandidateLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type CandidateSignupDto = z.infer<typeof CandidateSignupSchema>;
export type CandidateLoginDto = z.infer<typeof CandidateLoginSchema>;
```

- [ ] **Step 2: Add candidateSignup and candidateLogin to AuthService**

Add these methods to `backend/src/modules/auth/auth.service.ts`:

```typescript
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { candidateApplicationsIndex } from '../../database/schema';

// In constructor, add:
// private candidateAccountRepo: CandidateAccountRepository

async candidateSignup(dto: CandidateSignupDto) {
  const existing = await this.candidateAccountRepo.findByEmail(dto.email);
  if (existing) {
    throw new ConflictException('Email already registered');
  }

  const passwordHash = await hashPassword(dto.password);
  const account = await this.candidateAccountRepo.create({
    email: dto.email,
    passwordHash,
    firstName: dto.firstName,
    lastName: dto.lastName,
    phone: dto.phone,
  });

  return this.generateCandidateTokens(account.id);
}

async candidateLogin(dto: CandidateLoginDto) {
  const account = await this.candidateAccountRepo.findByEmail(dto.email);
  if (!account) {
    throw new UnauthorizedException('Invalid email or password');
  }

  const valid = await verifyPassword(account.passwordHash, dto.password);
  if (!valid) {
    throw new UnauthorizedException('Invalid email or password');
  }

  return this.generateCandidateTokens(account.id);
}

private async generateCandidateTokens(candidateAccountId: string) {
  const accessToken = this.jwtService.sign(
    { sub: candidateAccountId, role: 'Candidate' },
    { expiresIn: '15m' },
  );

  const refreshToken = this.jwtService.sign(
    { sub: candidateAccountId, role: 'Candidate' },
    { secret: process.env.JWT_REFRESH_SECRET!, expiresIn: '7d' },
  );

  return { accessToken, refreshToken };
}
```

- [ ] **Step 3: Add candidate auth endpoints to AuthController**

```typescript
@Post('auth/candidate/signup')
async candidateSignup(@Body() dto: CandidateSignupDto) {
  return this.authService.candidateSignup(dto);
}

@Post('auth/candidate/login')
async candidateLogin(@Body() dto: CandidateLoginDto) {
  return this.authService.candidateLogin(dto);
}
```

- [ ] **Step 4: Register CandidateAccountRepository in AuthModule**

Add `CandidateAccountRepository` to the `providers` array of `auth.module.ts`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/dto/candidate-auth.dto.ts backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.service.ts backend/src/modules/auth/auth.module.ts
git commit -m "feat: add candidate signup and login endpoints"
```

---

### Task 5: CandidateAccountModule — core API

**Files:**
- Create: `backend/src/modules/candidate-account/candidate-account.module.ts`
- Create: `backend/src/modules/candidate-account/candidate-account.controller.ts`
- Create: `backend/src/modules/candidate-account/candidate-account.service.ts`
- Create: `backend/src/modules/candidate-account/dto/candidate-apply.dto.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: All 4 candidate repositories, `CandidateAuthGuard`, `DrizzleSchemaService`, existing `candidates` and `applications` tenant tables
- Produces: All `/candidate/*` endpoints

- [ ] **Step 1: Create DTOs**

```typescript
// backend/src/modules/candidate-account/dto/candidate-apply.dto.ts
import { z } from 'zod';

export const ApplyJobSchema = z.object({
  phone: z.string().max(50).optional(),
});

export const BookmarkJobSchema = z.object({
  tenantId: z.string().uuid(),
  jobPostingId: z.string().uuid(),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).optional(),
});
```

- [ ] **Step 2: Create CandidateAccountService**

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateBookmarkRepository } from '../../repositories/candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';
import { candidates, applications, jobPostings, pipelineStages } from '../../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getCurrentUser } from '../../interceptors/tenant-context';

@Injectable()
export class CandidateAccountService {
  constructor(
    private candidateAccountRepo: CandidateAccountRepository,
    private candidateBookmarkRepo: CandidateBookmarkRepository,
    private candidateApplicationsIndexRepo: CandidateApplicationsIndexRepository,
    private jobListingsIndexRepo: JobListingsIndexRepository,
    private drizzleSchema: DrizzleSchemaService,
  ) {}

  async getJobs(search?: string) {
    return this.jobListingsIndexRepo.findAll(search);
  }

  async getJobDetail(tenantId: string, jobPostingId: string) {
    const job = await this.jobListingsIndexRepo.findById(tenantId, jobPostingId);
    if (!job) throw new NotFoundException();
    return job;
  }

  async apply(candidateAccountId: string, tenantId: string, jobPostingId: string, phone?: string) {
    const user = getCurrentUser();
    
    // Check job exists in index
    const job = await this.jobListingsIndexRepo.findById(tenantId, jobPostingId);
    if (!job || job.status !== 'open') throw new NotFoundException('Job not found or closed');

    // Switch to tenant schema
    const tenantSchema = `tenant_${tenantId}`;
    const { db: tenantDb, release } = await this.drizzleSchema.forSchema(tenantSchema);

    // Get candidate account info
    const account = await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Account not found');

    // Find or create candidate record in tenant schema
    let candidateRecord = await tenantDb.select().from(candidates)
      .where(eq(candidates.email, account.email)).then(r => r[0] ?? null);

    if (!candidateRecord) {
      candidateRecord = (await tenantDb.insert(candidates).values({
        name: `${account.firstName} ${account.lastName}`,
        email: account.email,
        phone: phone || account.phone,
      }).returning())[0];
    }

    // Get the initial pipeline stage (Applied = first stage by order)
    const initialStage = await tenantDb.select().from(pipelineStages)
      .orderBy(pipelineStages.order).limit(1).then(r => r[0]);

    // Create application
    const application = (await tenantDb.insert(applications).values({
      candidateId: candidateRecord.id,
      jobPostingId: jobPostingId,
      currentStageId: initialStage?.id,
    }).returning())[0];

    release();

    // Write to public index
    await this.candidateApplicationsIndexRepo.create({
      candidateAccountId,
      tenantId,
      jobPostingId,
      applicationId: application.id,
      jobTitle: job.title,
      companyName: job.companyName,
      status: initialStage?.name || 'Applied',
    });

    return { applicationId: application.id };
  }

  async getApplications(candidateAccountId: string) {
    return this.candidateApplicationsIndexRepo.findByCandidate(candidateAccountId);
  }

  async getBookmarks(candidateAccountId: string) {
    return this.candidateBookmarkRepo.findByCandidate(candidateAccountId);
  }

  async addBookmark(candidateAccountId: string, tenantId: string, jobPostingId: string) {
    const existing = await this.candidateBookmarkRepo.findByJob(candidateAccountId, tenantId, jobPostingId);
    if (existing) return existing; // idempotent

    const job = await this.jobListingsIndexRepo.findById(tenantId, jobPostingId);
    if (!job) throw new NotFoundException('Job not found');

    return this.candidateBookmarkRepo.create({
      candidateAccountId,
      tenantId,
      jobPostingId,
      jobTitle: job.title,
      companyName: job.companyName,
    });
  }

  async removeBookmark(candidateAccountId: string, bookmarkId: string) {
    await this.candidateBookmarkRepo.delete(bookmarkId, candidateAccountId);
  }

  async getProfile(candidateAccountId: string) {
    const account = await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException();
    const { passwordHash, ...profile } = account;
    return profile;
  }

  async updateProfile(candidateAccountId: string, data: { firstName?: string; lastName?: string; phone?: string }) {
    // Profile update would need a repository method — for now, read-only profile is sufficient
    // This is a placeholder for future implementation
    return this.getProfile(candidateAccountId);
  }
}
```

- [ ] **Step 3: Create CandidateAccountController**

```typescript
import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CandidateAuthGuard } from '../../shared/candidate-auth.guard';
import { CandidateAccountService } from './candidate-account.service';
import { ApplyJobSchema, BookmarkJobSchema, UpdateProfileSchema } from './dto/candidate-apply.dto';
import { getCurrentUser } from '../../interceptors/tenant-context';

@Controller('candidate')
@UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
export class CandidateAccountController {
  constructor(private service: CandidateAccountService) {}

  @Get('jobs')
  async listJobs(@Query('search') search?: string) {
    return this.service.getJobs(search);
  }

  @Get('jobs/:tenantId/:jobId')
  async getJobDetail(@Param('tenantId') tenantId: string, @Param('jobId') jobId: string) {
    return this.service.getJobDetail(tenantId, jobId);
  }

  @Post('jobs/:tenantId/:jobId/apply')
  async apply(
    @Param('tenantId') tenantId: string,
    @Param('jobId') jobId: string,
    @Body() body: { phone?: string },
  ) {
    const user = getCurrentUser();
    return this.service.apply(user.userId, tenantId, jobId, body.phone);
  }

  @Get('applications')
  async getApplications() {
    const user = getCurrentUser();
    return this.service.getApplications(user.userId);
  }

  @Post('bookmarks')
  async addBookmark(@Body() body: BookmarkJobSchema) {
    const user = getCurrentUser();
    return this.service.addBookmark(user.userId, body.tenantId, body.jobPostingId);
  }

  @Delete('bookmarks/:id')
  async removeBookmark(@Param('id', ParseUUIDPipe) id: string) {
    const user = getCurrentUser();
    return this.service.removeBookmark(user.userId, id);
  }

  @Get('bookmarks')
  async getBookmarks() {
    const user = getCurrentUser();
    return this.service.getBookmarks(user.userId);
  }

  @Get('profile')
  async getProfile() {
    const user = getCurrentUser();
    return this.service.getProfile(user.userId);
  }
}
```

- [ ] **Step 4: Create CandidateAccountModule**

```typescript
import { Module } from '@nestjs/common';
import { CandidateAccountController } from './candidate-account.controller';
import { CandidateAccountService } from './candidate-account.service';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateBookmarkRepository } from '../../repositories/candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';

@Module({
  controllers: [CandidateAccountController],
  providers: [
    CandidateAccountService,
    CandidateAccountRepository,
    CandidateBookmarkRepository,
    CandidateApplicationsIndexRepository,
    JobListingsIndexRepository,
    DrizzleSchemaService,
  ],
})
export class CandidateAccountModule {}
```

- [ ] **Step 5: Register CandidateAccountModule in AppModule**

Add `CandidateAccountModule` to the `imports` array in `backend/src/app.module.ts`.

- [ ] **Step 6: Add `forSchema` method to DrizzleSchemaService**

Add this method to `backend/src/database/drizzle-schema.service.ts`:

```typescript
async forSchema(schemaName: string): Promise<{ db: DrizzleDB; release: () => void }> {
  const client = await this.pool.connect();
  await client.query(`SET search_path TO "${schemaName}", public`);
  const db = drizzle({ client });
  return { db, release: () => client.release() };
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/candidate-account/ backend/src/app.module.ts backend/src/database/drizzle-schema.service.ts
git commit -m "feat: add CandidateAccountModule with full /candidate/* API"
```

---

### Task 6: Sync hooks — ApplicationsModule stage updates

**Files:**
- Modify: `backend/src/modules/applications/applications.service.ts`
- Modify: `backend/src/modules/applications/applications.module.ts`

**Interfaces:**
- Consumes: `CandidateApplicationsIndexRepository`
- Produces: When `PATCH /applications/:id/stage` runs, also updates `candidate_applications_index.status`

- [ ] **Step 1: Update ApplicationsService to sync index**

In `backend/src/modules/applications/applications.service.ts`, after the stage update logic in the `updateStage` method, add:

```typescript
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';

// In constructor:
// private candidateAppIndexRepo: CandidateApplicationsIndexRepository

// After the existing stage update query succeeds:
await this.candidateAppIndexRepo.updateStatus(applicationId, stageName);
```

- [ ] **Step 2: Register CandidateApplicationsIndexRepository in ApplicationsModule**

Add to `providers` array in `backend/src/modules/applications/applications.module.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/applications/
git commit -m "feat: sync candidate_applications_index on stage update"
```

---

### Task 7: Sync hooks — JobPostingsModule publish/close

**Files:**
- Modify: `backend/src/modules/job-postings/job-postings.service.ts`
- Modify: `backend/src/modules/job-postings/job-postings.module.ts`

**Interfaces:**
- Consumes: `JobListingsIndexRepository`, `TenantRepository` (for company name/slug)
- Produces: When job is published/closed, syncs `job_listings_index`

- [ ] **Step 1: Update JobPostingsService to sync index**

In `backend/src/modules/job-postings/job-postings.service.ts`, in the `publish`, `close`, and `create` methods, add index sync:

```typescript
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { getTenantId } from '../../interceptors/tenant-context';

// In constructor:
// private jobListingsIndexRepo: JobListingsIndexRepository
// private tenantRepo: TenantRepository

// Helper method:
private async syncJobListingIndex(jobPostingId: string, title: string, description: string | null, status: string) {
  const tenantId = getTenantId();
  const tenant = await this.tenantRepo.findById(tenantId);
  await this.jobListingsIndexRepo.upsert({
    tenantId,
    jobPostingId,
    title,
    description,
    companyName: tenant.name,
    companySlug: tenant.slug,
    status,
  });
}

// Call in publish:
await this.syncJobListingIndex(jobPosting.id, jobPosting.title, jobPosting.description, 'open');

// Call in close:
await this.syncJobListingIndex(jobPosting.id, jobPosting.title, jobPosting.description, 'closed');

// Call in create (if status is already 'open'):
if (data.status === 'open') {
  await this.syncJobListingIndex(newJob.id, newJob.title, newJob.description, 'open');
}

// Call in update (if status changes):
if (data.status) {
  await this.syncJobListingIndex(id, /* need title/desc from existing record */, data.status);
}
```

- [ ] **Step 2: Register repositories in JobPostingsModule**

Add `JobListingsIndexRepository` and `TenantRepository` to `providers` array.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/job-postings/
git commit -m "feat: sync job_listings_index on publish/close/update"
```

---

### Task 8: Frontend — CandidateShell, auth pages, routing

**Files:**
- Create: `frontend/src/shared/components/CandidateShell.tsx`
- Create: `frontend/src/features/candidate/login/LoginPage.tsx`
- Create: `frontend/src/features/candidate/signup/SignupPage.tsx`
- Modify: `frontend/src/shared/api/useAuth.ts`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**
- Consumes: Zustand auth store (`useAuth`), existing TanStack Router patterns
- Produces: Candidate login/signup flow with separate shell

- [ ] **Step 1: Create CandidateShell layout**

```typescript
// frontend/src/shared/components/CandidateShell.tsx
import { Container, Group, Title, Button, Anchor } from '@mantine/core';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '../api/useAuth';

export function CandidateShell() {
  const navigate = useNavigate();
  const { role, logout } = useAuthStore();

  if (role !== 'Candidate') {
    navigate({ to: '/candidate/login' });
    return null;
  }

  return (
    <>
      <Group p="md" style={{ borderBottom: '1px solid #eee' }}>
        <Title order={3}>TalentPipe</Title>
        <Anchor onClick={() => navigate({ to: '/candidate/dashboard' })}>Jobs</Anchor>
        <Anchor onClick={() => navigate({ to: '/candidate/applications' })}>Applications</Anchor>
        <Anchor onClick={() => navigate({ to: '/candidate/bookmarks' })}>Bookmarks</Anchor>
        <Anchor onClick={() => navigate({ to: '/candidate/settings' })}>Settings</Anchor>
        <Button variant="subtle" onClick={() => { logout(); navigate({ to: '/candidate/login' }); }}>Logout</Button>
      </Group>
      <Container size="lg" py="xl">
        <Outlet />
      </Container>
    </>
  );
}
```

- [ ] **Step 2: Create CandidateLoginPage**

```typescript
// frontend/src/features/candidate/login/LoginPage.tsx
import { TextInput, PasswordInput, Button, Paper, Title, Stack, Anchor } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate, Link } from '@tanstack/react-router';
import { useAuthStore } from '../../../shared/api/useAuth';

export function CandidateLoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Invalid email'),
      password: (v) => (v.length < 1 ? 'Required' : null),
    },
  });

  const handleSubmit = async (values: { email: string; password: string }) => {
    try {
      // login expects a role param or we need to update useAuth to handle candidate login
      // For now, call the candidate login endpoint
      const response = await fetch('/api/auth/candidate/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Login failed');
      
      // Store tokens (reuse useAuth store)
      const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('userId', payload.sub);
      localStorage.setItem('role', payload.role);
      useAuthStore.setState({ accessToken: data.accessToken, refreshToken: data.refreshToken, userId: payload.sub, role: payload.role });
      
      navigate({ to: '/candidate/dashboard' });
    } catch (err: any) {
      form.setFieldError('email', err.message);
    }
  };

  return (
    <Paper withBorder p="xl" maw={400} mx="auto" mt="xl">
      <Title order={2} mb="lg">Candidate Login</Title>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput label="Email" {...form.getInputProps('email')} />
          <PasswordInput label="Password" {...form.getInputProps('password')} />
          <Button type="submit">Login</Button>
        </Stack>
      </form>
      <Anchor component={Link} to="/candidate/signup" mt="md">Don't have an account? Sign up</Anchor>
    </Paper>
  );
}
```

- [ ] **Step 3: Create CandidateSignupPage**

```typescript
// frontend/src/features/candidate/signup/SignupPage.tsx
import { TextInput, PasswordInput, Button, Paper, Title, Stack, Anchor } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate, Link } from '@tanstack/react-router';

export function CandidateSignupPage() {
  const navigate = useNavigate();

  const form = useForm({
    initialValues: { email: '', password: '', confirmPassword: '', firstName: '', lastName: '' },
    validate: {
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Invalid email'),
      password: (v) => (v.length < 8 ? 'At least 8 characters' : null),
      confirmPassword: (v, values) => (v !== values.password ? 'Passwords do not match' : null),
      firstName: (v) => (v.length < 1 ? 'Required' : null),
      lastName: (v) => (v.length < 1 ? 'Required' : null),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    try {
      const response = await fetch('/api/auth/candidate/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Signup failed');
      
      // Auto-login after signup
      const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('userId', payload.sub);
      localStorage.setItem('role', payload.role);
      useAuthStore.setState({ accessToken: data.accessToken, refreshToken: data.refreshToken, userId: payload.sub, role: payload.role });
      
      navigate({ to: '/candidate/dashboard' });
    } catch (err: any) {
      form.setFieldError('email', err.message);
    }
  };

  return (
    <Paper withBorder p="xl" maw={400} mx="auto" mt="xl">
      <Title order={2} mb="lg">Create Candidate Account</Title>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput label="First Name" {...form.getInputProps('firstName')} />
          <TextInput label="Last Name" {...form.getInputProps('lastName')} />
          <TextInput label="Email" {...form.getInputProps('email')} />
          <PasswordInput label="Password" {...form.getInputProps('password')} />
          <PasswordInput label="Confirm Password" {...form.getInputProps('confirmPassword')} />
          <Button type="submit">Sign Up</Button>
        </Stack>
      </form>
      <Anchor component={Link} to="/candidate/login" mt="md">Already have an account? Login</Anchor>
    </Paper>
  );
}
```

- [ ] **Step 4: Update frontend router**

In `frontend/src/app/router.tsx`, add candidate routes. Read the existing router file to find the exact location.

```typescript
// Add import:
import { CandidateShell } from '../shared/components/CandidateShell';
import { CandidateLoginPage } from '../features/candidate/login/LoginPage';
import { CandidateSignupPage } from '../features/candidate/signup/SignupPage';
import { CandidateDashboardPage } from '../features/candidate/dashboard/DashboardPage';
import { CandidateApplicationsPage } from '../features/candidate/applications/ApplicationsPage';
import { CandidateBookmarksPage } from '../features/candidate/bookmarks/BookmarksPage';
import { CandidateSettingsPage } from '../features/candidate/settings/SettingsPage';

// Add routes:
{
  path: '/candidate',
  component: CandidateShell,
  children: [
    { path: '/login', component: CandidateLoginPage },
    { path: '/signup', component: CandidateSignupPage },
    { path: '/dashboard', component: CandidateDashboardPage },
    { path: '/applications', component: CandidateApplicationsPage },
    { path: '/bookmarks', component: CandidateBookmarksPage },
    { path: '/settings', component: CandidateSettingsPage },
  ],
},
```

- [ ] **Step 5: Update `useAuth` store to handle Candidate role**

Read `frontend/src/shared/api/useAuth.ts` and ensure the store can persist candidate tokens alongside org tokens. The existing store should work with any role — just ensure `isAuthenticated()` returns true for candidate tokens.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/components/CandidateShell.tsx frontend/src/features/candidate/login/ frontend/src/features/candidate/signup/ frontend/src/app/router.tsx frontend/src/shared/api/useAuth.ts
git commit -m "feat: add candidate shell, login/signup pages, and routing"
```

---

### Task 9: Frontend — Candidate dashboard, applications, bookmarks, settings

**Files:**
- Create: `frontend/src/features/candidate/dashboard/DashboardPage.tsx`
- Create: `frontend/src/features/candidate/applications/ApplicationsPage.tsx`
- Create: `frontend/src/features/candidate/bookmarks/BookmarksPage.tsx`
- Create: `frontend/src/features/candidate/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: TanStack Query for `/api/candidate/*` endpoints
- Produces: Four full candidate pages

- [ ] **Step 1: Create DashboardPage**

```typescript
// frontend/src/features/candidate/dashboard/DashboardPage.tsx
import { useEffect, useState } from 'react';
import { Card, TextInput, Title, Text, Badge, Group, Stack, Button, Grid, Anchor } from '@mantine/core';
import { useNavigate, Link } from '@tanstack/react-router';

export function CandidateDashboardPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const url = search ? `/api/candidate/jobs?search=${encodeURIComponent(search)}` : '/api/candidate/jobs';
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setJobs(await res.json());
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
  }, [search]);

  const handleApply = async (tenantId: string, jobId: string) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/candidate/jobs/${tenantId}/${jobId}/apply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.ok) navigate({ to: '/candidate/applications' });
  };

  return (
    <>
      <Title order={2} mb="md">Find Your Next Role</Title>
      <TextInput
        placeholder="Search jobs by title or company..."
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="lg"
      />
      <Grid>
        {jobs.map((job) => (
          <Grid.Col key={`${job.tenantId}-${job.jobPostingId}`} span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder p="lg">
              <Title order={4}>{job.title}</Title>
              <Text c="dimmed">{job.companyName}</Text>
              <Text lineClamp={3} mt="sm">{job.description}</Text>
              <Group mt="md">
                <Button size="sm" onClick={() => handleApply(job.tenantId, job.jobPostingId)}>Apply</Button>
                <Anchor component={Link} to={`/candidate/jobs/${job.tenantId}/${job.jobPostingId}`}>Details</Anchor>
              </Group>
            </Card>
          </Grid.Col>
        ))}
        {!loading && jobs.length === 0 && <Text>No open jobs found.</Text>}
      </Grid>
    </>
  );
}
```

- [ ] **Step 2: Create ApplicationsPage**

```typescript
// frontend/src/features/candidate/applications/ApplicationsPage.tsx
import { useEffect, useState } from 'react';
import { Table, Badge, Title, Text } from '@mantine/core';

export function CandidateApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('accessToken');

  useEffect(() => {
    fetch('/api/candidate/applications', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then(setApplications)
      .finally(() => setLoading(false));
  }, []);

  const statusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'applied': return 'blue';
      case 'screening': return 'yellow';
      case 'interview': return 'violet';
      case 'offer': return 'green';
      case 'hired': return 'teal';
      case 'rejected': return 'red';
      default: return 'gray';
    }
  };

  return (
    <>
      <Title order={2} mb="md">My Applications</Title>
      {loading ? <Text>Loading...</Text> : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Company</Table.Th>
              <Table.Th>Job</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Applied</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {applications.map((app) => (
              <Table.Tr key={app.id}>
                <Table.Td>{app.companyName}</Table.Td>
                <Table.Td>{app.jobTitle}</Table.Td>
                <Table.Td><Badge color={statusColor(app.status)}>{app.status}</Badge></Table.Td>
                <Table.Td>{new Date(app.appliedAt).toLocaleDateString()}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
```

- [ ] **Step 3: Create BookmarksPage**

```typescript
// frontend/src/features/candidate/bookmarks/BookmarksPage.tsx
import { useEffect, useState } from 'react';
import { Card, Title, Text, Button, Group, Grid } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';

export function CandidateBookmarksPage() {
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const navigate = useNavigate();
  const token = localStorage.getItem('accessToken');

  useEffect(() => {
    fetch('/api/candidate/bookmarks', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then(setBookmarks);
  }, []);

  const removeBookmark = async (id: string) => {
    await fetch(`/api/candidate/bookmarks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <>
      <Title order={2} mb="md">Saved Jobs</Title>
      <Grid>
        {bookmarks.map((bm) => (
          <Grid.Col key={bm.id} span={{ base: 12, sm: 6 }}>
            <Card withBorder p="lg">
              <Title order={4}>{bm.jobTitle || 'Job'}</Title>
              <Text c="dimmed">{bm.companyName || bm.tenantId}</Text>
              <Text size="sm" c="gray">Bookmarked {new Date(bm.createdAt).toLocaleDateString()}</Text>
              <Group mt="md">
                <Button size="sm" onClick={() => removeBookmark(bm.id)} color="red">Remove</Button>
                <Button size="sm" variant="outline" onClick={() => navigate({ to: `/candidate/jobs/${bm.tenantId}/${bm.jobPostingId}` })}>View Job</Button>
              </Group>
            </Card>
          </Grid.Col>
        ))}
      </Grid>
    </>
  );
}
```

- [ ] **Step 4: Create SettingsPage**

```typescript
// frontend/src/features/candidate/settings/SettingsPage.tsx
import { useEffect, useState } from 'react';
import { Paper, Title, Text, TextInput, Stack } from '@mantine/core';

export function CandidateSettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const token = localStorage.getItem('accessToken');

  useEffect(() => {
    fetch('/api/candidate/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then(setProfile);
  }, []);

  if (!profile) return <Text>Loading...</Text>;

  return (
    <Paper withBorder p="xl" maw={500}>
      <Title order={2} mb="lg">Profile</Title>
      <Stack>
        <TextInput label="First Name" value={profile.firstName} readOnly />
        <TextInput label="Last Name" value={profile.lastName} readOnly />
        <TextInput label="Email" value={profile.email} readOnly />
        {profile.phone && <TextInput label="Phone" value={profile.phone} readOnly />}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/candidate/dashboard/ frontend/src/features/candidate/applications/ frontend/src/features/candidate/bookmarks/ frontend/src/features/candidate/settings/
git commit -m "feat: add candidate dashboard, applications, bookmarks, and settings pages"
```

---

### Task 10: Backend verification (integration test)

**Files:**
- Create: `backend/src/__tests__/candidate-auth.spec.ts`

**Interfaces:**
- Verifies: candidate signup, login, job listing, apply, bookmarks flow end-to-end

- [ ] **Step 1: Write candidate auth integration test**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';

describe('Candidate Auth (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/candidate/signup — creates account and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/candidate/signup')
      .send({
        email: 'test-candidate@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'Candidate',
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('POST /auth/candidate/login — returns tokens for valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/candidate/login')
      .send({
        email: 'test-candidate@example.com',
        password: 'password123',
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('POST /auth/candidate/login — returns 401 for wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/candidate/login')
      .send({
        email: 'test-candidate@example.com',
        password: 'wrongpassword',
      });
    expect(res.status).toBe(401);
  });

  it('GET /candidate/jobs — returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/candidate/jobs');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd backend && npm test
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/candidate-auth.spec.ts
git commit -m "test: add candidate auth integration tests"
```
