# Phase 1 — Auth, Tenancy & RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build schema-per-company auth with JWT access + DB-backed refresh tokens, RBAC, and frontend auth shell.

**Architecture:** Single shared pg Pool. Each request gets a dedicated client with `SET search_path` to isolate company data. `userEmails` table in public schema enables O(1) login lookups. Refresh tokens stored hashed in public `refreshTokens` for revocability.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, Passport JWT, Argon2, React, Mantine, TanStack Router, Zustand

---

### Task 1: Drizzle Schema (all tables)

**Files:**
- Modify: `backend/src/database/schema.ts`

- [ ] **Step 1: Write the complete Drizzle schema**

```typescript
import { pgTable, uuid, varchar, text, integer, float, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Public Schema Tables ──

export const companies = pgTable('companies', {
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

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: varchar('company_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 36 }),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyActionIdx: index('idx_audit_logs_company_action').on(table.companyId, table.action),
}));

export const userEmails = pgTable('user_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  companyId: uuid('company_id').notNull(),
  userId: uuid('user_id').notNull(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  companyId: uuid('company_id').notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_refresh_tokens_user').on(table.userId),
}));

// ── Company Schema Tables (recreated per company) ──

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('CompanyAdmin').notNull(),
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

export const candidates = pgTable('candidates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('idx_candidates_email').on(table.email),
}));

export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  order: integer('order').default(0).notNull(),
}, (table) => ({
  orderIdx: index('idx_pipeline_stages_order').on(table.order),
}));

export const applications = pgTable('applications', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
  jobPostingId: uuid('job_posting_id').notNull().references(() => jobPostings.id),
  currentStageId: uuid('current_stage_id').references(() => pipelineStages.id),
  matchScore: float('match_score').default(0),
  appliedAt: timestamp('applied_at').defaultNow().notNull(),
}, (table) => ({
  jobStageIdx: index('idx_applications_job_stage').on(table.jobPostingId, table.currentStageId),
}));

export const resumes = pgTable('resumes', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
  fileUrl: varchar('file_url', { length: 512 }),
  parsedText: text('parsed_text'),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
}, (table) => ({
  candidateIdx: index('idx_resumes_candidate').on(table.candidateId),
}));

export const resumeSkills = pgTable('resume_skills', {
  resumeId: uuid('resume_id').notNull().references(() => resumes.id),
  skillId: uuid('skill_id').notNull(),
}, (table) => ({
  uniqueIdx: uniqueIndex('idx_resume_skills_unique').on(table.resumeId, table.skillId),
}));

export const jobRequiredSkills = pgTable('job_required_skills', {
  jobPostingId: uuid('job_posting_id').notNull().references(() => jobPostings.id),
  skillId: uuid('skill_id').notNull(),
}, (table) => ({
  uniqueIdx: uniqueIndex('idx_job_required_skills_unique').on(table.jobPostingId, table.skillId),
}));

export const interviews = pgTable('interviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  applicationId: uuid('application_id').notNull().references(() => applications.id),
  interviewerId: uuid('interviewer_id').notNull().references(() => users.id),
  scheduledAt: timestamp('scheduled_at').notNull(),
  status: varchar('status', { length: 50 }).default('scheduled').notNull(),
}, (table) => ({
  interviewerIdx: index('idx_interviews_interviewer').on(table.interviewerId),
  applicationIdx: index('idx_interviews_application').on(table.applicationId),
}));

export const interviewFeedbacks = pgTable('interview_feedbacks', {
  id: uuid('id').defaultRandom().primaryKey(),
  interviewId: uuid('interview_id').notNull().unique().references(() => interviews.id),
  rating: integer('rating'),
  comments: text('comments'),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
});

export const notes = pgTable('notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  applicationId: uuid('application_id').notNull().references(() => applications.id),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index('idx_notes_application').on(table.applicationId),
}));
```

- [ ] **Step 2: Run drizzle-kit generate + migrate**

```bash
cd backend
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: `drizzle/` folder created with migration SQL, tables created in `public` schema.

- [ ] **Step 3: Create template schema**

Run this SQL against postgres (via psql or psql container):
```sql
CREATE SCHEMA IF NOT EXISTS template;
CREATE TABLE template."users" (LIKE public."users" INCLUDING ALL);
CREATE TABLE template."job_postings" (LIKE public."job_postings" INCLUDING ALL);
CREATE TABLE template."candidates" (LIKE public."candidates" INCLUDING ALL);
CREATE TABLE template."pipeline_stages" (LIKE public."pipeline_stages" INCLUDING ALL);
CREATE TABLE template."applications" (LIKE public."applications" INCLUDING ALL);
CREATE TABLE template."resumes" (LIKE public."resumes" INCLUDING ALL);
CREATE TABLE template."resume_skills" (LIKE public."resume_skills" INCLUDING ALL);
CREATE TABLE template."job_required_skills" (LIKE public."job_required_skills" INCLUDING ALL);
CREATE TABLE template."interviews" (LIKE public."interviews" INCLUDING ALL);
CREATE TABLE template."interview_feedbacks" (LIKE public."interview_feedbacks" INCLUDING ALL);
CREATE TABLE template."notes" (LIKE public."notes" INCLUDING ALL);
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/schema.ts backend/drizzle/
git commit -m "phase1: drizzle schema + migration + template schema"
```

---

### Task 2: Drizzle Provider + Schema Routing Service

**Files:**
- Create: `backend/src/database/drizzle.provider.ts`
- Create: `backend/src/database/drizzle-schema.service.ts`

- [ ] **Step 1: Create drizzle provider**

```typescript
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export const DRIZZLE_PROVIDER = 'DRIZZLE_PROVIDER';

export const drizzleProvider = {
  provide: DRIZZLE_PROVIDER,
  useFactory: () => {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  },
};
```

- [ ] **Step 2: Create schema routing service**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE_PROVIDER } from './drizzle.provider';
import { getSchema } from '../interceptors/company-context';
import * as schema from './schema';

export type DrizzleDB = NodePgDatabase<typeof schema>;

@Injectable()
export class DrizzleSchemaService {
  constructor(@Inject(DRIZZLE_PROVIDER) private pool: Pool) {}

  async forCurrentCompany(): Promise<{ db: DrizzleDB; release: () => void }> {
    const schemaName = getSchema();
    const client = await this.pool.connect();
    await client.query(`SET search_path TO ${schemaName}, public`);
    const db = drizzle(client, { schema }) as unknown as DrizzleDB;
    return { db, release: () => client.release() };
  }

  async forSchema(schemaName: string): Promise<{ db: DrizzleDB; release: () => void }> {
    const client = await this.pool.connect();
    await client.query(`SET search_path TO ${schemaName}, public`);
    const db = drizzle(client, { schema }) as unknown as DrizzleDB;
    return { db, release: () => client.release() };
  }

  async forPublic(): Promise<{ db: DrizzleDB; release: () => void }> {
    const client = await this.pool.connect();
    await client.query('SET search_path TO public');
    const db = drizzle(client, { schema }) as unknown as DrizzleDB;
    return { db, release: () => client.release() };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/drizzle.provider.ts backend/src/database/drizzle-schema.service.ts
git commit -m "phase1: drizzle provider + schema routing service"
```

---

### Task 3: Company Context (AsyncLocalStorage)

**Files:**
- Create: `backend/src/interceptors/company-context.ts`
- Create: `backend/src/interceptors/company-context.interceptor.ts`

- [ ] **Step 1: Create company context utilities**

```typescript
import { AsyncLocalStorage } from 'async_hooks';

export interface CompanyContext {
  companyId: string;
  userId: string;
  role: string;
}

export const asyncStorage = new AsyncLocalStorage<CompanyContext>();

export function getCompanyId(): string {
  const ctx = asyncStorage.getStore();
  if (!ctx) throw new Error('No company context');
  return ctx.companyId;
}

export function getSchema(): string {
  return `company_${getCompanyId()}`;
}

export function getCurrentUser(): CompanyContext {
  const ctx = asyncStorage.getStore();
  if (!ctx) throw new Error('No company context');
  return ctx;
}
```

- [ ] **Step 2: Create company context interceptor**

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { asyncStorage, CompanyContext } from './company-context';

@Injectable()
export class CompanyContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as CompanyContext | undefined;

    const ctx: CompanyContext = user
      ? { companyId: user.companyId, userId: user.userId, role: user.role }
      : { companyId: 'public', userId: '', role: 'anonymous' };

    return new Observable((subscriber) => {
      asyncStorage.run(ctx, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/interceptors/company-context.ts backend/src/interceptors/company-context.interceptor.ts
git commit -m "phase1: company context + interceptor"
```

---

### Task 4: Password Utility + Repositories

**Files:**
- Create: `backend/src/shared/password.ts`
- Create: `backend/src/repositories/company.repository.ts`
- Create: `backend/src/repositories/user.repository.ts`

- [ ] **Step 1: Create password utility**

```typescript
import * as argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

- [ ] **Step 2: Create company repository**

```typescript
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { companies } from '../database/schema';

@Injectable()
export class CompanyRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findBySlug(slug: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db.select().from(companies).where(eq(companies.slug, slug)).execute();
    } finally {
      release();
    }
  }

  async findById(id: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db.select().from(companies).where(eq(companies.id, id)).execute();
    } finally {
      release();
    }
  }

  async create(data: { name: string; slug: string }) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db.insert(companies).values(data).returning().execute();
    } finally {
      release();
    }
  }
}
```

- [ ] **Step 3: Create user repository**

```typescript
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { users } from '../database/schema';

@Injectable()
export class UserRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findByEmail(email: string) {
    const { db, release } = await this.drizzleSchema.forCurrentCompany();
    try {
      return db.select().from(users).where(eq(users.email, email)).execute();
    } finally {
      release();
    }
  }

  async findById(id: string) {
    const { db, release } = await this.drizzleSchema.forCurrentCompany();
    try {
      return db.select().from(users).where(eq(users.id, id)).execute();
    } finally {
      release();
    }
  }

  async create(data: { email: string; passwordHash: string; role: string }) {
    const { db, release } = await this.drizzleSchema.forCurrentCompany();
    try {
      return db.insert(users).values(data).returning().execute();
    } finally {
      release();
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/password.ts backend/src/repositories/
git commit -m "phase1: password utility + company + user repositories"
```

---

### Task 5: RolesGuard + @Roles Decorator

**Files:**
- Create: `backend/src/shared/roles.guard.ts`
- Create: `backend/src/shared/roles.decorator.ts`

- [ ] **Step 1: Create roles decorator**

```typescript
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 2: Create roles guard**

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/roles.guard.ts backend/src/shared/roles.decorator.ts
git commit -m "phase1: roles guard + decorator"
```

---

### Task 6: JWT Strategy + Auth Service + Controller

**Files:**
- Create: `backend/src/modules/auth/jwt.strategy.ts`
- Modify: `backend/src/modules/auth/auth.module.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.controller.ts`

- [ ] **Step 1: Create JWT strategy**

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; companyId: string; role: string }) {
    return { userId: payload.sub, companyId: payload.companyId, role: payload.role };
  }
}
```

- [ ] **Step 2: Implement auth service**

```typescript
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { hashPassword, verifyPassword } from '../../shared/password';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';
import { CompanyRepository } from '../../repositories/company.repository';
import { UserRepository } from '../../repositories/user.repository';
import { userEmails, refreshTokens, companies, users, pipelineStages } from '../../database/schema';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private drizzleSchema: DrizzleSchemaService,
    private companyRepo: CompanyRepository,
    private userRepo: UserRepository,
  ) {}

  async signup(dto: { companyName: string; slug: string; email: string; password: string }) {
    const existing = await this.companyRepo.findBySlug(dto.slug);
    if (existing.length > 0) throw new ConflictException('Slug already taken');

    const companyId = randomUUID();
    const { db: pubDb, release: pubRelease } = await this.drizzleSchema.forPublic();
    try {
      await pubDb.insert(companies).values({ id: companyId, name: dto.companyName, slug: dto.slug }).execute();
    } finally {
      pubRelease();
    }

    const { db: schemaDb, release: schemaRelease } = await this.drizzleSchema.forPublic();
    try {
      await schemaDb.execute(`CREATE SCHEMA IF NOT EXISTS "company_${companyId}"`);
      const tables = ['users', 'job_postings', 'candidates', 'pipeline_stages', 'applications', 'resumes', 'resume_skills', 'job_required_skills', 'interviews', 'interview_feedbacks', 'notes'];
      for (const table of tables) {
        await schemaDb.execute(`CREATE TABLE IF NOT EXISTS "company_${companyId}"."${table}" (LIKE template."${table}" INCLUDING ALL)`);
      }
    } finally {
      schemaRelease();
    }

    const passwordHash = await hashPassword(dto.password);
    const userId = randomUUID();

    const { db, release } = await this.drizzleSchema.forSchema(`company_${companyId}`);
    try {
      await db.insert(users).values({ id: userId, email: dto.email, passwordHash, role: 'CompanyAdmin' }).execute();

      const defaultStages = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
      for (let i = 0; i < defaultStages.length; i++) {
        await db.insert(pipelineStages).values({ name: defaultStages[i], order: i }).execute();
      }
    } finally {
      release();
    }

    const { db: pubDb2, release: pubRelease2 } = await this.drizzleSchema.forPublic();
    try {
      await pubDb2.insert(userEmails).values({ email: dto.email, companyId, userId }).execute();
    } finally {
      pubRelease2();
    }

    return this.generateTokens(userId, companyId, 'CompanyAdmin');
  }

  async login(dto: { email: string; password: string }) {
    const { db: pubDb, release } = await this.drizzleSchema.forPublic();
    let emailRecord: { companyId: string; userId: string } | undefined;
    try {
      const records = await pubDb.select().from(userEmails).where(eq(userEmails.email, dto.email)).execute();
      if (records.length === 0) throw new UnauthorizedException('Invalid credentials');
      emailRecord = records[0];
    } finally {
      release();
    }

    const userResult = await this.userRepo.findByEmail(dto.email);
    if (userResult.length === 0) throw new UnauthorizedException('Invalid credentials');

    const user = userResult[0];
    const valid = await verifyPassword(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user.id, emailRecord.companyId, user.role);
  }

  async refresh(dto: { refreshToken: string }) {
    let payload: { sub: string; companyId: string; role: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, { secret: process.env.JWT_REFRESH_SECRET! });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const records = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, payload.sub))
        .execute();

      if (records.length === 0) throw new UnauthorizedException('Invalid refresh token');

      const stored = records[0];
      if (new Date() > new Date(stored.expiresAt)) {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, payload.sub)).execute();
        throw new UnauthorizedException('Refresh token expired');
      }

      const tokenMatches = await argon2.verify(stored.tokenHash, dto.refreshToken);
      if (!tokenMatches) throw new UnauthorizedException('Invalid refresh token');

      return this.generateTokens(payload.sub, payload.companyId, payload.role);
    } finally {
      release();
    }
  }

  private async generateTokens(userId: string, companyId: string, role: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, companyId, role },
      { expiresIn: '15m' },
    );

    const rawRefresh = randomUUID();
    const refreshToken = this.jwtService.sign(
      { sub: userId, companyId, role },
      { secret: process.env.JWT_REFRESH_SECRET!, expiresIn: '7d' },
    );

    const tokenHash = await argon2.hash(rawRefresh);

    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId)).execute();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(refreshTokens).values({ userId, companyId, tokenHash, expiresAt }).execute();
    } finally {
      release();
    }

    return { accessToken, refreshToken };
  }
}
```

- [ ] **Step 3: Implement auth controller**

```typescript
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  async signup(@Body() dto: { companyName: string; slug: string; email: string; password: string }) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: { email: string; password: string }) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refresh(dto);
  }
}
```

- [ ] **Step 4: Update auth module**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';
import { drizzleProvider } from '../../database/drizzle.provider';
import { CompanyRepository } from '../../repositories/company.repository';
import { UserRepository } from '../../repositories/user.repository';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, DrizzleSchemaService, drizzleProvider, CompanyRepository, UserRepository],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/
git commit -m "phase1: JWT strategy, auth service + controller with signup/login/refresh"
```

---

### Task 7: Health Controller + App Wiring

**Files:**
- Create: `backend/src/modules/health/health.controller.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/app.controller.ts` (remove default Hello World)

- [ ] **Step 1: Create health controller**

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

- [ ] **Step 2: Update AppModule**

```typescript
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './modules/health/health.controller';
import { CompanyContextInterceptor } from './interceptors/company-context.interceptor';
import { RolesGuard } from './shared/roles.guard';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CompanyContextInterceptor },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Update AppController (remove Hello World)**

```typescript
import { Controller } from '@nestjs/common';

@Controller()
export class AppController {}
```

- [ ] **Step 4: Update main.ts to add global prefix**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/health/ backend/src/app.module.ts backend/src/app.controller.ts backend/src/main.ts
git commit -m "phase1: health controller + app wiring + global prefix"
```

---

### Task 8: Verify Backend

- [ ] **Step 1: Start infrastructure and backend**

```bash
docker compose up -d
cd backend && npm run start:dev &
```

- [ ] **Step 2: Test endpoints**

```bash
# Health
curl http://localhost:3000/api/health

# Signup
curl -X POST http://localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"companyName":"TestCorp","slug":"testcorp","email":"admin@testcorp.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@testcorp.com","password":"password123"}'
```

Expected: signup returns `{ accessToken, refreshToken }`. Login returns same.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "phase1: verify backend auth endpoints"
```

---

### Task 9: Frontend Auth Store + Pages

**Files:**
- Create: `frontend/src/shared/api/useAuth.ts`
- Create: `frontend/src/features/auth/LoginPage.tsx`
- Create: `frontend/src/features/auth/SignupPage.tsx`

- [ ] **Step 1: Create auth Zustand store**

```typescript
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  companyId: string | null;
  role: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { companyName: string; slug: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  isAuthenticated: () => boolean;
}

const API = 'http://localhost:3000/api';

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  userId: localStorage.getItem('userId'),
  companyId: localStorage.getItem('companyId'),
  role: localStorage.getItem('role'),

  login: async (email, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('userId', payload.sub);
    localStorage.setItem('companyId', payload.companyId);
    localStorage.setItem('role', payload.role);
    set({ accessToken: data.accessToken, refreshToken: data.refreshToken, userId: payload.sub, companyId: payload.companyId, role: payload.role });
  },

  signup: async (data) => {
    const res = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Signup failed');
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('companyId');
    localStorage.removeItem('role');
    set({ accessToken: null, refreshToken: null, userId: null, companyId: null, role: null });
  },

  refreshAuth: async () => {
    const refreshToken = get().refreshToken;
    if (!refreshToken) return;
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      get().logout();
      return;
    }
    const data = await res.json();
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    set({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? refreshToken });
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },
}));
```

- [ ] **Step 2: Create LoginPage**

```tsx
import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useAuthStore } from '../../shared/api/useAuth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate({ to: '/dashboard' });
    } catch {
      setError('Invalid email or password');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Welcome back</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit}>
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <TextInput label="Email" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput label="Password" placeholder="Your password" required mt="md" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button fullWidth mt="xl" type="submit">Sign in</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </Text>
      </Paper>
    </Container>
  );
}
```

- [ ] **Step 3: Create SignupPage**

```tsx
import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useAuthStore } from '../../shared/api/useAuth';

export function SignupPage() {
  const [form, setForm] = useState({ companyName: '', slug: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const signup = useAuthStore((s) => s.signup);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await signup({ companyName: form.companyName, slug: form.slug, email: form.email, password: form.password });
      navigate({ to: '/login' });
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Container size={420} my={40}>
      <Title ta="center">Create your company</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit}>
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <TextInput label="Company name" placeholder="Acme Inc" required value={form.companyName} onChange={update('companyName')} />
          <TextInput label="Company slug" placeholder="acme" required mt="md" value={form.slug} onChange={update('slug')} />
          <TextInput label="Email" placeholder="you@company.com" required mt="md" value={form.email} onChange={update('email')} />
          <PasswordInput label="Password" placeholder="Your password" required mt="md" value={form.password} onChange={update('password')} />
          <PasswordInput label="Confirm password" placeholder="Confirm password" required mt="md" value={form.confirmPassword} onChange={update('confirmPassword')} />
          <Button fullWidth mt="xl" type="submit">Create account</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Already have an account? <Link to="/login">Sign in</Link>
        </Text>
      </Paper>
    </Container>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/shared/api/useAuth.ts frontend/src/features/auth/
git commit -m "phase1: frontend auth store + login/signup pages"
```

---

### Task 10: Frontend Router + Shell + Providers

**Files:**
- Create: `frontend/src/app/router.tsx`
- Create: `frontend/src/app/AppShell.tsx`
- Create: `frontend/src/app/providers.tsx`
- Create: `frontend/src/shared/components/RoleGuard.tsx`

- [ ] **Step 1: Create router**

```tsx
import { createRouter, Route, RootRoute } from '@tanstack/react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { AppShell } from './AppShell';

const rootRoute = new RootRoute({
  component: AppShell,
});

const loginRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const signupRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/signup',
  component: SignupPage,
});

const dashboardRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: () => <div>Dashboard</div>,
});

const routeTree = rootRoute.addChildren([loginRoute, signupRoute, dashboardRoute]);

export const router = createRouter({ routeTree });
```

- [ ] **Step 2: Create AppShell**

```tsx
import { Outlet, Link, useNavigate } from '@tanstack/react-router';
import { AppShell as MantineShell, Group, Text, Button, NavLink } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDashboard, IconBriefcase, IconUsers, IconLayoutKanban, IconCalendarEvent } from '@tabler/icons-react';
import { useAuthStore } from '../shared/api/useAuth';

export function AppShell() {
  const [opened] = useDisclosure();
  const isAuth = useAuthStore((s) => s.isAuthenticated());
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate({ to: '/login' });
  };

  const navItems = [
    { label: 'Dashboard', icon: IconDashboard, to: '/dashboard' },
    { label: 'Job Postings', icon: IconBriefcase, to: '/job-postings' },
    { label: 'Candidates', icon: IconUsers, to: '/candidates' },
    { label: 'Pipeline', icon: IconLayoutKanban, to: '/pipeline' },
    { label: 'Interviews', icon: IconCalendarEvent, to: '/interviews' },
  ];

  return (
    <MantineShell
      header={{ height: 60 }}
      navbar={isAuth ? { width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } } : undefined}
      padding="md"
    >
      <MantineShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>TalentPipe</Text>
          {isAuth && (
            <Group>
              <Text size="sm" c="dimmed">{role}</Text>
              <Button variant="outline" size="xs" onClick={handleLogout}>Logout</Button>
            </Group>
          )}
        </Group>
      </MantineShell.Header>

      {isAuth && (
        <MantineShell.Navbar p="xs">
          {navItems.map((item) => (
            <NavLink key={item.to} label={item.label} leftSection={<item.icon size="1rem" />} component={Link} to={item.to} />
          ))}
        </MantineShell.Navbar>
      )}

      <MantineShell.Main>
        <Outlet />
      </MantineShell.Main>
    </MantineShell>
  );
}
```

- [ ] **Step 3: Create RoleGuard**

```tsx
import { ReactNode } from 'react';
import { Navigate } from '@tanstack/react-router';
import { useAuthStore } from '../api/useAuth';

interface Props {
  allowedRoles: string[];
  children: ReactNode;
}

export function RoleGuard({ allowedRoles, children }: Props) {
  const role = useAuthStore((s) => s.role);
  const isAuth = useAuthStore((s) => s.isAuthenticated());

  if (!isAuth) return <Navigate to="/login" />;
  if (!allowedRoles.includes(role!)) return <div>403 - Forbidden</div>;
  return <>{children}</>;
}
```

- [ ] **Step 4: Create providers**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';

const queryClient = new QueryClient();

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/ frontend/src/shared/components/
git commit -m "phase1: frontend router, app shell, role guard, providers"
```

---

### Task 11: Frontend App Wiring

**Files:**
- Modify: `frontend/src/App.tsx`
- Update: `frontend/src/main.tsx`

- [ ] **Step 1: Rewrite App.tsx**

```tsx
import { Providers } from './app/providers';

export default function App() {
  return <Providers />;
}
```

- [ ] **Step 2: Rewrite main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Create global styles import in index.css**

Replace content with:
```css
body {
  margin: 0;
  padding: 0;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/main.tsx frontend/src/index.css
git commit -m "phase1: wire frontend app with providers"
```

---

### Task 12: End-to-End Verification

- [ ] **Step 1: Start both servers**

```bash
docker compose up -d
cd backend && npm run start:dev &
cd frontend && npm run dev &
```

- [ ] **Step 2: Verify backend flow**

```bash
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/auth/signup -H 'Content-Type: application/json' -d '{"companyName":"TestCorp","slug":"testcorp","email":"admin@testcorp.com","password":"password123"}'
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@testcorp.com","password":"password123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")
echo $TOKEN
```

- [ ] **Step 3: Verify frontend**

Open `http://localhost:5173` — should see login page. Navigate to `/signup` — fill form, submit. Should redirect to `/login`. Log in — should see dashboard with sidebar.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "phase1: auth, schema-per-company, RBAC — backend + frontend"
```
