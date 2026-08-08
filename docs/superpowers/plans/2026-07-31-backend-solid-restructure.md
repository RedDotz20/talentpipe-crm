# Backend SOLID Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the NestJS backend into feature modules + shared infrastructure, split the AuthService god class, kill duplicated pools/wiring, standardize repositories, and enforce Zod validation — with no route or response-shape changes.

**Architecture:** Clean feature modules (Approach A). Each feature module (`auth`, `candidate-account`, `health`) owns controller + service + DTOs. Cross-cutting concerns move to a shared `common/` package plus a single owned `DatabaseModule` and `RepositoriesModule`. Services never touch Drizzle directly — all data access goes through repositories that extend a `BaseRepository` handling the acquire / `SET search_path` / release lifecycle.

**Tech Stack:** NestJS 11, Drizzle ORM rc4 (node-postgres), Zod 4, Passport-JWT, Jest + ts-jest, TypeScript 5.9.

## Global Constraints

- Commit tags follow the repo convention: `feat(be): ...`, `refactor(be): ...`, `test(be): ...`.
- No route paths, response envelope shapes, or HTTP status codes change.
- `npm run typecheck` (tsc --noEmit) must pass at the end of every task.
- `npm run lint` runs **eslint --fix** (not oxlint) in the backend.
- Backend tests run with **Jest** (`npm test`, `npm run test:e2e`).
- All DB access stays inside `repositories/`; services inject repositories.
- Zero `process.env` reads in business code — always inject `ConfigService`.
- Singleton repo return convention: `T | null`; list convention: `T[]`.
- Spec of record: `docs/superpowers/specs/2026-07-31-backend-solid-restructure-design.md`.

---

## File Structure Map

```
backend/src/
  main.ts                                   (T4: drop global filter/interceptor)
  app.module.ts                             (T4: rewrite)
  app.controller.ts / app.service.ts        (T4: DELETE)
  app.controller.spec.ts                    (T4: DELETE)
  common/
    context/company-context.ts               (T1: new — moved content)
    password.ts                             (T1: new — moved content)
    auth/auth-core.module.ts                (T1: new)
    auth/jwt.strategy.ts                    (T1: new — moved content)
    guards/roles.guard.ts                   (T1: new — moved content)
    guards/candidate-auth.guard.ts          (T1: new — moved content)
    decorators/roles.decorator.ts           (T1: new — moved content)
    decorators/current-user.decorator.ts    (T1: new)
    interceptors/company-context.interceptor.ts (T1: new — moved content)
    interceptors/response.interceptor.ts    (T1: new — moved content)
    filters/api-exception.filter.ts         (T1: new — moved content)
    middlewares/logger.middleware.ts        (T1: new — moved+renamed)
    pipes/zod-validation.pipe.ts            (T1: new)
    pipes/zod-validation.pipe.spec.ts       (T1: new)
  database/
    database.module.ts                      (T1: new)
    drizzle.provider.ts                     (T1: rewrite — ConfigService)
    drizzle-schema.service.ts               (T1: import path fix)
    schema.ts                               (untouched)
  repositories/
    base.repository.ts                      (T1: new)
    repositories.module.ts                  (T1: new)
    user.repository.ts                      (T1: rewrite)
    company.repository.ts                    (T1: rewrite)
    refresh-token.repository.ts             (T1: new)
    candidate.repository.ts                 (T1: new)
    application.repository.ts               (T1: new)
    pipeline-stage.repository.ts            (T1: new)
    super-admin.repository.ts               (T1: new)
    user-email.repository.ts                (T1: new)
    candidate-account.repository.ts         (T1: rewrite)
    candidate-bookmark.repository.ts        (T1: rewrite)
    candidate-applications-index.repository.ts (T1: rewrite)
    job-listings-index.repository.ts        (T1: rewrite)
  modules/
    auth/
      auth.module.ts                        (T2: rewrite)
      auth.controller.ts                    (T2: rewrite)
      auth.controller.spec.ts               (T2: import path stays — passes)
      auth.service.ts                       (T2: rewrite)
      auth.service.spec.ts                  (T2: rewrite)
      jwt.strategy.ts                       (T4: DELETE — moved to common/auth)
      dto/company-signup.dto.ts                 (T2: new)
      dto/signin.dto.ts                     (T2: new)
      dto/refresh.dto.ts                    (T2: new)
      dto/candidate-auth.dto.ts             (T2: remove CandidateLoginSchema)
      services/token.service.ts             (T2: new)
      services/token.service.spec.ts        (T2: new)
      services/company-provisioning.service.ts      (T2: new)
      services/company-provisioning.service.spec.ts (T2: new)
    candidate-account/
      candidate-account.module.ts           (T3: rewrite)
      candidate-account.controller.ts       (T3: rewrite)
      candidate-account.service.ts          (T3: rewrite)
      dto/bookmark.dto.ts                   (T3: new)
      dto/profile.dto.ts                    (T3: new)
      dto/apply.dto.ts                      (T3: new)
      dto/candidate-apply.dto.ts            (T3: DELETE)
    health/
      health.module.ts                      (T4: new)
      health.controller.ts                  (untouched)
  shared/                                   (T4: DELETE — contents moved to common/)
  interceptors/                             (T4: DELETE — contents moved to common/)
  test/app.e2e-spec.ts                      (T4: drop manual filter/interceptor)
```

---

### Task 1: Shared infrastructure + repository base (additive)

**Files:**
- Create: `backend/src/common/context/company-context.ts`
- Create: `backend/src/common/password.ts`
- Create: `backend/src/common/pipes/zod-validation.pipe.ts`
- Test: `backend/src/common/pipes/zod-validation.pipe.spec.ts`
- Create: `backend/src/common/decorators/current-user.decorator.ts`
- Create: `backend/src/common/auth/auth-core.module.ts`
- Create: `backend/src/common/auth/jwt.strategy.ts`
- Create: `backend/src/common/guards/roles.guard.ts`
- Create: `backend/src/common/guards/candidate-auth.guard.ts`
- Create: `backend/src/common/decorators/roles.decorator.ts`
- Create: `backend/src/common/interceptors/company-context.interceptor.ts`
- Create: `backend/src/common/interceptors/response.interceptor.ts`
- Create: `backend/src/common/filters/api-exception.filter.ts`
- Create: `backend/src/common/middlewares/logger.middleware.ts`
- Create: `backend/src/database/database.module.ts`
- Rewrite: `backend/src/database/drizzle.provider.ts`
- Modify: `backend/src/database/drizzle-schema.service.ts:5` (import path)
- Create: `backend/src/repositories/base.repository.ts`
- Create: `backend/src/repositories/repositories.module.ts`
- Create: `backend/src/repositories/refresh-token.repository.ts`
- Create: `backend/src/repositories/candidate.repository.ts`
- Create: `backend/src/repositories/application.repository.ts`
- Create: `backend/src/repositories/pipeline-stage.repository.ts`
- Create: `backend/src/repositories/super-admin.repository.ts`
- Create: `backend/src/repositories/user-email.repository.ts`
- Rewrite: `backend/src/repositories/user.repository.ts`
- Rewrite: `backend/src/repositories/company.repository.ts`
- Rewrite: `backend/src/repositories/candidate-account.repository.ts`
- Rewrite: `backend/src/repositories/candidate-bookmark.repository.ts`
- Rewrite: `backend/src/repositories/candidate-applications-index.repository.ts`
- Rewrite: `backend/src/repositories/job-listings-index.repository.ts`

**Interfaces:**
- Consumes: existing `interceptors/company-context.ts` exports (`CompanyContext`, `asyncStorage`, `getCompanyId`, `getSchema`, `getCurrentUser`) — copied verbatim into `common/context/company-context.ts`.
- Produces: `ZodValidationPipe<T>` (param pipe), `CurrentUser` (param decorator → `CompanyContext`), `AuthCoreModule` (exports `JwtStrategy`, `PassportModule`, `JwtModule`), `DatabaseModule` (exports `DrizzleSchemaService`, `DRIZZLE_PROVIDER`), `RepositoriesModule` (exports all repos), `BaseRepository` with `withDb(schema, fn)` and default schema `'current'`, repos `UserRepository`, `CompanyRepository`, `RefreshTokenRepository`, `CandidateRepository`, `ApplicationRepository`, `PipelineStageRepository`, `SuperAdminRepository`, `UserEmailRepository`, `CandidateAccountRepository`, `CandidateBookmarkRepository`, `CandidateApplicationsIndexRepository`, `JobListingsIndexRepository`.

This task is additive — it creates copies/moves in new paths while the old files stay until Task 4. Everything compiles throughout.

- [ ] **Step 1: Update the design spec to include `common/password.ts`**

Edit `docs/superpowers/specs/2026-07-31-backend-solid-restructure-design.md` — in the directory tree, after the `common/pipes/` line add:
```
│   └── pipes/                       # zod-validation.pipe.ts (NEW)
```
replace with:
```
│   ├── pipes/                       # zod-validation.pipe.ts (NEW)
│   └── password.ts                  # moved from shared/password.ts
```

Commit:
```bash
git add docs/superpowers/specs/2026-07-31-backend-solid-restructure-design.md
git commit -m "docs(be): add common/password.ts to restructure spec"
```

- [ ] **Step 2: Write the failing test for ZodValidationPipe**

Create `backend/src/common/pipes/zod-validation.pipe.spec.ts`:
```ts
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

describe('ZodValidationPipe', () => {
  it('returns parsed data for a valid payload', () => {
    const pipe = new ZodValidationPipe(Schema);
    const out = pipe.transform({ email: 'a@b.co', password: 'longenough' });
    expect(out).toEqual({ email: 'a@b.co', password: 'longenough' });
  });

  it('throws BadRequestException with issue messages on an invalid payload', () => {
    const pipe = new ZodValidationPipe(Schema);
    try {
      pipe.transform({ email: 'nope', password: 'short' });
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as BadRequestException;
      const resp = err.getResponse() as { message: string[] };
      expect(resp.message.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/common/pipes/zod-validation.pipe.spec.ts`
Expected: FAIL — `Cannot find module './zod-validation.pipe'`.

- [ ] **Step 4: Create `common/pipes/zod-validation.pipe.ts`**

```ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message),
      );
    }
    return result.data;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/common/pipes/zod-validation.pipe.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Create `common/context/company-context.ts`** (copy of `interceptors/company-context.ts`)

```ts
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
  const companyId = getCompanyId();
  if (companyId === 'public') return 'public';
  return `company_${companyId}`;
}

export function getCurrentUser(): CompanyContext {
  const ctx = asyncStorage.getStore();
  if (!ctx) throw new Error('No company context');
  return ctx;
}
```

- [ ] **Step 7: Create `common/password.ts`** (copy of `shared/password.ts`)

```ts
import * as argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

- [ ] **Step 8: Create `common/decorators/current-user.decorator.ts`**

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CompanyContext } from '../context/company-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CompanyContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 9: Create `common/auth/jwt.strategy.ts`** (copy of `modules/auth/jwt.strategy.ts`)

```ts
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
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: {
    sub: string;
    companyId: string | null;
    role: string;
  }) {
    return {
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
    };
  }
}
```

- [ ] **Step 10: Create `common/auth/auth-core.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

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
  providers: [JwtStrategy],
  exports: [JwtStrategy, PassportModule, JwtModule],
})
export class AuthCoreModule {}
```

- [ ] **Step 11: Create `common/guards/roles.guard.ts`**

```ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
```

- [ ] **Step 12: Create `common/guards/candidate-auth.guard.ts`**

```ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class CandidateAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    return user?.role === 'Candidate';
  }
}
```

- [ ] **Step 13: Create `common/decorators/roles.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 14: Create `common/interceptors/company-context.interceptor.ts`**

```ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { asyncStorage, CompanyContext } from '../context/company-context';

@Injectable()
export class CompanyContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as CompanyContext | undefined;

    const companyId =
      user?.role === 'SuperAdmin' || !user?.companyId ? 'public' : user.companyId;

    const ctx: CompanyContext = user
      ? {
          companyId,
          userId: user.userId,
          role: user.role,
        }
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

- [ ] **Step 15: Create `common/interceptors/response.interceptor.ts`** (copy of `shared/response.interceptor.ts`)

```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  data: T;
  message: string;
}

const DEFAULT_MESSAGE = 'OK';

function isExplicitEnvelope(
  value: unknown,
): value is { data: unknown; message: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(obj, 'data') &&
    Object.prototype.hasOwnProperty.call(obj, 'message')
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((value) => {
        if (isExplicitEnvelope(value)) {
          return value as unknown as ApiResponse<T>;
        }
        return { data: (value ?? null) as T, message: DEFAULT_MESSAGE };
      }),
    );
  }
}
```

- [ ] **Step 16: Create `common/filters/api-exception.filter.ts`** (copy of `shared/api-exception.filter.ts`)

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

const DEFAULT_MESSAGE = 'Internal server error';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message: string = DEFAULT_MESSAGE;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const m = (body as Record<string, unknown>).message;
        if (typeof m === 'string') {
          message = m;
        } else if (Array.isArray(m)) {
          message = (m as unknown[])
            .filter((x) => typeof x === 'string')
            .join(', ');
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.stack);
    } else {
      this.logger.error(`Unhandled exception: ${String(exception)}`);
    }

    res.status(status).json({ error: { code, message } });
    if (req?.url) {
      this.logger.warn(
        `${status} ${req.method ?? '?'} ${req.url} → ${code}: ${message}`,
      );
    }
  }
}
```

- [ ] **Step 17: Create `common/middlewares/logger.middleware.ts`** (moved + renamed from `shared/logger.ts`)

```ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '';

    this.logger.log(`Req: ${method} ${originalUrl} - ${userAgent}`);

    res.on('finish', () => {
      const { statusCode } = res;
      this.logger.log(`Res: ${method} ${originalUrl} ${statusCode}`);
    });

    next();
  }
}
```

- [ ] **Step 18: Rewrite `database/drizzle.provider.ts`** (inject `ConfigService`)

```ts
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

export const DRIZZLE_PROVIDER = 'DRIZZLE_PROVIDER';

export const drizzleProvider = {
  provide: DRIZZLE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new Pool({ connectionString: config.get<string>('DATABASE_URL') });
  },
};
```

- [ ] **Step 19: Fix the import in `database/drizzle-schema.service.ts`**

Change line 5 from:
```ts
import { getSchema } from '../interceptors/company-context';
```
to:
```ts
import { getSchema } from '../common/context/company-context';
```

- [ ] **Step 20: Create `database/database.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DrizzleSchemaService } from './drizzle-schema.service';
import { drizzleProvider } from './drizzle.provider';

@Module({
  providers: [DrizzleSchemaService, drizzleProvider],
  exports: [DrizzleSchemaService, drizzleProvider],
})
export class DatabaseModule {}
```

- [ ] **Step 21: Create `repositories/base.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import {
  DrizzleSchemaService,
  DrizzleDB,
} from '../database/drizzle-schema.service';

@Injectable()
export abstract class BaseRepository {
  constructor(protected readonly drizzleSchema: DrizzleSchemaService) {}

  protected async withDb<T>(
    schema: string,
    fn: (db: DrizzleDB) => Promise<T>,
  ): Promise<T> {
    let handle: { db: DrizzleDB; release: () => void };
    if (schema === 'public') {
      handle = await this.drizzleSchema.forPublic();
    } else if (schema === 'current') {
      handle = await this.drizzleSchema.forCurrentCompany();
    } else {
      handle = await this.drizzleSchema.forSchema(schema);
    }
    try {
      return await fn(handle.db);
    } finally {
      handle.release();
    }
  }
}
```

- [ ] **Step 22: Rewrite `repositories/user.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class UserRepository extends BaseRepository {
  async findByEmail(email: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async findById(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(
    data: { id: string; email: string; passwordHash: string; role: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(users)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
```

- [ ] **Step 23: Rewrite `repositories/company.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { companies } from '../database/schema';
import { BaseRepository } from './base.repository';

const COMPANY_TABLES = [
  'users',
  'job_postings',
  'candidates',
  'pipeline_stages',
  'applications',
  'resumes',
  'resume_skills',
  'job_required_skills',
  'interviews',
  'interview_feedbacks',
  'notes',
];

@Injectable()
export class CompanyRepository extends BaseRepository {
  async findBySlug(slug: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(companies)
        .where(eq(companies.slug, slug))
        .execute();
      return rows[0] ?? null;
    });
  }

  async findById(id: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(companies)
        .where(eq(companies.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: { id: string; name: string; slug: string }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(companies)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async provisionSchema(companyId: string) {
    const schemaName = `company_${companyId}`;
    return this.withDb('public', async (db) => {
      await db.execute(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      for (const table of COMPANY_TABLES) {
        await db.execute(
          `CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" (LIKE template."${table}" INCLUDING ALL)`,
        );
      }
    });
  }
}
```

- [ ] **Step 24: Create `repositories/refresh-token.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { refreshTokens } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class RefreshTokenRepository extends BaseRepository {
  async findLatestByUser(userId: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, userId))
        .orderBy(desc(refreshTokens.createdAt))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async deleteByUser(userId: string) {
    return this.withDb('public', (db) =>
      db.delete(refreshTokens).where(eq(refreshTokens.userId, userId)).execute(),
    );
  }

  async create(data: {
    userId: string;
    companyId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(refreshTokens)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
```

- [ ] **Step 25: Create `repositories/candidate.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { candidates } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateRepository extends BaseRepository {
  async findByEmail(email: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(
    data: { name: string; email: string; phone?: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(candidates)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
```

- [ ] **Step 26: Create `repositories/application.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { applications } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class ApplicationRepository extends BaseRepository {
  async create(
    data: { candidateId: string; jobPostingId: string; currentStageId: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(applications)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
```

- [ ] **Step 27: Create `repositories/pipeline-stage.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { pipelineStages } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class PipelineStageRepository extends BaseRepository {
  async findFirst(schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(pipelineStages)
        .orderBy(pipelineStages.order)
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async createMany(names: string[], schema = 'current') {
    return this.withDb(schema, async (db) => {
      await db
        .insert(pipelineStages)
        .values(names.map((name, order) => ({ name, order })))
        .execute();
    });
  }
}
```

- [ ] **Step 28: Create `repositories/super-admin.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { superAdmins } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class SuperAdminRepository extends BaseRepository {
  async findByEmail(email: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(superAdmins)
        .where(eq(superAdmins.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }
}
```

- [ ] **Step 29: Create `repositories/user-email.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { userEmails } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class UserEmailRepository extends BaseRepository {
  async findByEmail(email: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(userEmails)
        .where(eq(userEmails.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: { email: string; companyId: string; userId: string }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(userEmails)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
```

- [ ] **Step 30: Rewrite `repositories/candidate-account.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { candidateAccounts } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateAccountRepository extends BaseRepository {
  async findByEmail(email: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateAccounts)
        .where(eq(candidateAccounts.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async findById(id: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateAccounts)
        .where(eq(candidateAccounts.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(candidateAccounts)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
```

- [ ] **Step 31: Rewrite `repositories/candidate-bookmark.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { candidateBookmarks } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateBookmarkRepository extends BaseRepository {
  async findByCandidate(candidateAccountId: string) {
    return this.withDb('public', async (db) => {
      return db
        .select()
        .from(candidateBookmarks)
        .where(eq(candidateBookmarks.candidateAccountId, candidateAccountId))
        .execute();
    });
  }

  async findByJob(
    candidateAccountId: string,
    companyId: string,
    jobPostingId: string,
  ) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateBookmarks)
        .where(
          and(
            eq(candidateBookmarks.candidateAccountId, candidateAccountId),
            eq(candidateBookmarks.companyId, companyId),
            eq(candidateBookmarks.jobPostingId, jobPostingId),
          ),
        )
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: {
    candidateAccountId: string;
    companyId: string;
    jobPostingId: string;
    jobTitle: string;
    companyName: string;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(candidateBookmarks)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async delete(id: string, candidateAccountId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(candidateBookmarks)
        .where(
          and(
            eq(candidateBookmarks.id, id),
            eq(candidateBookmarks.candidateAccountId, candidateAccountId),
          ),
        )
        .execute(),
    );
  }
}
```

- [ ] **Step 32: Rewrite `repositories/candidate-applications-index.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { candidateApplicationsIndex } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateApplicationsIndexRepository extends BaseRepository {
  async findByCandidate(candidateAccountId: string) {
    return this.withDb('public', async (db) => {
      return db
        .select()
        .from(candidateApplicationsIndex)
        .where(
          eq(candidateApplicationsIndex.candidateAccountId, candidateAccountId),
        )
        .orderBy(desc(candidateApplicationsIndex.appliedAt))
        .execute();
    });
  }

  async create(data: {
    candidateAccountId: string;
    companyId: string;
    jobPostingId: string;
    applicationId: string;
    jobTitle: string;
    companyName: string;
    status: string;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(candidateApplicationsIndex)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async updateStatus(applicationId: string, status: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(candidateApplicationsIndex)
        .set({ status })
        .where(eq(candidateApplicationsIndex.applicationId, applicationId))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
}
```

- [ ] **Step 33: Rewrite `repositories/job-listings-index.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { jobListingsIndex } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class JobListingsIndexRepository extends BaseRepository {
  async findAll(search?: string) {
    return this.withDb('public', async (db) => {
      const results = await db
        .select()
        .from(jobListingsIndex)
        .where(eq(jobListingsIndex.status, 'open'))
        .orderBy(desc(jobListingsIndex.createdAt))
        .execute();

      if (search) {
        const lowerSearch = search.toLowerCase();
        return results.filter(
          (r) =>
            r.title.toLowerCase().includes(lowerSearch) ||
            r.companyName.toLowerCase().includes(lowerSearch),
        );
      }

      return results;
    });
  }

  async findById(companyId: string, jobPostingId: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, companyId),
            eq(jobListingsIndex.jobPostingId, jobPostingId),
          ),
        )
        .execute();
      return rows[0] ?? null;
    });
  }

  async upsert(data: {
    companyId: string;
    jobPostingId: string;
    title: string;
    description: string;
    companyName: string;
    companySlug: string;
    status: string;
  }) {
    return this.withDb('public', async (db) => {
      const existing = await db
        .select()
        .from(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, data.companyId),
            eq(jobListingsIndex.jobPostingId, data.jobPostingId),
          ),
        )
        .execute();

      if (existing.length > 0) {
        const rows = await db
          .update(jobListingsIndex)
          .set({
            title: data.title,
            description: data.description,
            companyName: data.companyName,
            companySlug: data.companySlug,
            status: data.status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(jobListingsIndex.companyId, data.companyId),
              eq(jobListingsIndex.jobPostingId, data.jobPostingId),
            ),
          )
          .returning()
          .execute();
        return rows[0];
      } else {
        const rows = await db
          .insert(jobListingsIndex)
          .values(data)
          .returning()
          .execute();
        return rows[0];
      }
    });
  }

  async delete(companyId: string, jobPostingId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, companyId),
            eq(jobListingsIndex.jobPostingId, jobPostingId),
          ),
        )
        .execute(),
    );
  }
}
```

- [ ] **Step 34: Create `repositories/repositories.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { UserRepository } from './user.repository';
import { CompanyRepository } from './company.repository';
import { RefreshTokenRepository } from './refresh-token.repository';
import { CandidateRepository } from './candidate.repository';
import { ApplicationRepository } from './application.repository';
import { PipelineStageRepository } from './pipeline-stage.repository';
import { SuperAdminRepository } from './super-admin.repository';
import { UserEmailRepository } from './user-email.repository';
import { CandidateAccountRepository } from './candidate-account.repository';
import { CandidateBookmarkRepository } from './candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from './candidate-applications-index.repository';
import { JobListingsIndexRepository } from './job-listings-index.repository';

const REPOSITORIES = [
  UserRepository,
  CompanyRepository,
  RefreshTokenRepository,
  CandidateRepository,
  ApplicationRepository,
  PipelineStageRepository,
  SuperAdminRepository,
  UserEmailRepository,
  CandidateAccountRepository,
  CandidateBookmarkRepository,
  CandidateApplicationsIndexRepository,
  JobListingsIndexRepository,
];

@Module({
  imports: [DatabaseModule],
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoriesModule {}
```

- [ ] **Step 35: Verify Task 1**

Run: `npm run typecheck`
Expected: PASS (no errors).
Run: `npm test`
Expected: PASS (existing specs — `AuthService` spec still uses old paths).

- [ ] **Step 36: Commit**

```bash
git add backend/src/common backend/src/database backend/src/repositories docs/superpowers/specs/2026-07-31-backend-solid-restructure-design.md
git commit -m "refactor(be): shared common/, DatabaseModule, RepositoriesModule, BaseRepository"
```

---

### Task 2: Auth module rebuild (split the god class)

**Files:**
- Create: `backend/src/modules/auth/services/token.service.ts`
- Test: `backend/src/modules/auth/services/token.service.spec.ts`
- Create: `backend/src/modules/auth/services/company-provisioning.service.ts`
- Test: `backend/src/modules/auth/services/company-provisioning.service.spec.ts`
- Create: `backend/src/modules/auth/dto/company-signup.dto.ts`
- Create: `backend/src/modules/auth/dto/signin.dto.ts`
- Create: `backend/src/modules/auth/dto/refresh.dto.ts`
- Modify: `backend/src/modules/auth/dto/candidate-auth.dto.ts` (remove `CandidateLoginSchema` + type)
- Rewrite: `backend/src/modules/auth/auth.service.ts`
- Rewrite: `backend/src/modules/auth/auth.controller.ts`
- Rewrite: `backend/src/modules/auth/auth.module.ts`
- Rewrite: `backend/src/modules/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `AuthCoreModule` (exports `JwtService` via `JwtModule`), `RepositoriesModule`, `common/password.ts`, `common/pipes/zod-validation.pipe.ts`, `common/decorators/current-user.decorator.ts`, `common/context/company-context.ts` (`CompanyContext` type).
- Produces: `TokenService.issueTokens(subject: { id: string; companyId: string | null | undefined; role: string }) => Promise<{ accessToken: string; refreshToken: string }>`, `TokenService.rotate(refreshToken: string) => Promise<{ accessToken: string; refreshToken: string }>`, `TokenService.logout(userId: string) => Promise<void>`, `CompanyProvisioningService.createCompany(dto) => Promise<{ companyId: string; userId: string }>`.

- [ ] **Step 1: Write the failing tests for TokenService**

Create `backend/src/modules/auth/services/token.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from '../../../repositories/refresh-token.repository';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-value'),
  verify: jest.fn().mockResolvedValue(true),
}));

describe('TokenService', () => {
  let service: TokenService;
  const jwtService = { sign: jest.fn().mockReturnValue('token'), verify: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue('refresh-secret') };
  const refreshTokenRepo = {
    deleteByUser: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue({ id: '1' }),
    findLatestByUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepo },
      ],
    }).compile();
    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('issueTokens', () => {
    it('signs access + refresh, stores a hashed row, and returns both tokens', async () => {
      const result = await service.issueTokens({
        id: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
      });

      expect(result).toEqual({ accessToken: 'token', refreshToken: 'token' });
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(jwtService.sign).toHaveBeenLastCalledWith(
        { sub: 'u1', companyId: 't1', role: 'CompanyAdmin' },
        expect.objectContaining({ secret: 'refresh-secret' }),
      );
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
      expect(refreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          companyId: 't1',
          tokenHash: 'hashed-value',
          expiresAt: expect.any(Date),
        }),
      );
    });

    it('maps a null companyId to the nil uuid in the stored row', async () => {
      await service.issueTokens({ id: 'u1', companyId: null, role: 'Candidate' });
      expect(refreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: '00000000-0000-0000-0000-000000000000',
        }),
      );
    });
  });

  describe('rotate', () => {
    it('throws UnauthorizedException when no stored record exists', async () => {
      jwtService.verify.mockReturnValue({ sub: 'u1', companyId: null, role: 'Candidate' });
      refreshTokenRepo.findLatestByUser.mockResolvedValue(null);
      await expect(service.rotate('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException on an expired stored record', async () => {
      jwtService.verify.mockReturnValue({ sub: 'u1', companyId: 't1', role: 'CompanyAdmin' });
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() - 1000),
        tokenHash: 'hashed-value',
      });
      await expect(service.rotate('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
    });

    it('re-issues tokens for a valid stored record', async () => {
      jwtService.verify.mockReturnValue({ sub: 'u1', companyId: 't1', role: 'CompanyAdmin' });
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: 'hashed-value',
      });
      const result = await service.rotate('refresh-token');
      expect(result).toEqual({ accessToken: 'token', refreshToken: 'token' });
    });
  });

  describe('logout', () => {
    it('deletes stored tokens for the user', async () => {
      await service.logout('u1');
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
    });
  });
});
```

- [ ] **Step 2: Write the failing tests for CompanyProvisioningService**

Create `backend/src/modules/auth/services/company-provisioning.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CompanyProvisioningService } from './company-provisioning.service';
import { CompanyRepository } from '../../../repositories/company.repository';
import { UserRepository } from '../../../repositories/user.repository';
import { UserEmailRepository } from '../../../repositories/user-email.repository';
import { PipelineStageRepository } from '../../../repositories/pipeline-stage.repository';

jest.mock('crypto', () => ({ randomUUID: jest.fn(() => 'uuid-1') }));
jest.mock('argon2', () => ({ hash: jest.fn().mockResolvedValue('hash'), verify: jest.fn() }));

describe('CompanyProvisioningService', () => {
  let service: CompanyProvisioningService;
  const companyRepo = {
    findBySlug: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'uuid-1' }),
    provisionSchema: jest.fn().mockResolvedValue(undefined),
  };
  const userRepo = { create: jest.fn().mockResolvedValue({ id: 'uuid-1' }) };
  const userEmailRepo = { create: jest.fn().mockResolvedValue({ id: 'e1' }) };
  const pipelineStageRepo = { createMany: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyProvisioningService,
        { provide: CompanyRepository, useValue: companyRepo },
        { provide: UserRepository, useValue: userRepo },
        { provide: UserEmailRepository, useValue: userEmailRepo },
        { provide: PipelineStageRepository, useValue: pipelineStageRepo },
      ],
    }).compile();
    service = module.get<CompanyProvisioningService>(CompanyProvisioningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws ConflictException when the slug is already taken', async () => {
    companyRepo.findBySlug.mockResolvedValue({ id: 'x' });
    await expect(
      service.createCompany({
        companyName: 'Acme',
        slug: 'acme',
        email: 'admin@acme.com',
        password: 'password1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates company, provisions schema, seeds user + stages + email link', async () => {
    companyRepo.findBySlug.mockResolvedValue(null);
    const result = await service.createCompany({
      companyName: 'Acme',
      slug: 'acme',
      email: 'admin@acme.com',
      password: 'password1',
    });

    expect(result).toEqual({ companyId: 'uuid-1', userId: 'uuid-1' });
    expect(companyRepo.create).toHaveBeenCalledWith({
      id: 'uuid-1',
      name: 'Acme',
      slug: 'acme',
    });
    expect(companyRepo.provisionSchema).toHaveBeenCalledWith('uuid-1');
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@acme.com', role: 'CompanyAdmin' }),
      'company_uuid-1',
    );
    expect(pipelineStageRepo.createMany).toHaveBeenCalledWith(
      ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'],
      'company_uuid-1',
    );
    expect(userEmailRepo.create).toHaveBeenCalledWith({
      email: 'admin@acme.com',
      companyId: 'uuid-1',
      userId: 'uuid-1',
    });
  });
});
```

- [ ] **Step 3: Run both new test files to verify they fail**

Run: `npm test -- src/modules/auth/services`
Expected: FAIL — `Cannot find module './token.service'` and `Cannot find module './company-provisioning.service'`.

- [ ] **Step 4: Create `modules/auth/services/token.service.ts`**

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { RefreshTokenRepository } from '../../../repositories/refresh-token.repository';

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NIL_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

export interface TokenSubject {
  id: string;
  companyId: string | null | undefined;
  role: string;
}

@Injectable()
export class TokenService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private refreshTokenRepo: RefreshTokenRepository,
  ) {}

  async issueTokens(subject: TokenSubject) {
    const companyId = subject.companyId ?? NIL_COMPANY_ID;
    const payload: Record<string, unknown> = {
      sub: subject.id,
      role: subject.role,
    };
    if (subject.companyId) {
      payload.companyId = subject.companyId;
    }

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TTL,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET')!,
      expiresIn: '7d',
    });

    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await this.refreshTokenRepo.deleteByUser(subject.id);
    await this.refreshTokenRepo.create({
      userId: subject.id,
      companyId,
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  async rotate(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);

    const stored = await this.refreshTokenRepo.findLatestByUser(payload.sub);
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (new Date() > new Date(stored.expiresAt)) {
      await this.refreshTokenRepo.deleteByUser(payload.sub);
      throw new UnauthorizedException('Refresh token expired');
    }

    const tokenMatches = await argon2.verify(
      stored.tokenHash,
      refreshToken,
    );
    if (!tokenMatches) throw new UnauthorizedException('Invalid refresh token');

    return this.issueTokens({
      id: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
    });
  }

  async logout(userId: string) {
    await this.refreshTokenRepo.deleteByUser(userId);
  }

  private verifyRefreshToken(refreshToken: string): {
    sub: string;
    companyId: string | null | undefined;
    role: string;
  } {
    try {
      return this.jwtService.verify<{
        sub: string;
        companyId: string | null | undefined;
        role: string;
      }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET')!,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
```

- [ ] **Step 5: Create `modules/auth/services/company-provisioning.service.ts`**

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hashPassword } from '../../../common/password';
import { CompanyRepository } from '../../../repositories/company.repository';
import { UserRepository } from '../../../repositories/user.repository';
import { UserEmailRepository } from '../../../repositories/user-email.repository';
import { PipelineStageRepository } from '../../../repositories/pipeline-stage.repository';

const DEFAULT_STAGES = [
  'Applied',
  'Screening',
  'Interview',
  'Offer',
  'Hired',
  'Rejected',
];

export interface CreateCompanyDto {
  companyName: string;
  slug: string;
  email: string;
  password: string;
}

@Injectable()
export class CompanyProvisioningService {
  constructor(
    private companyRepo: CompanyRepository,
    private userRepo: UserRepository,
    private userEmailRepo: UserEmailRepository,
    private pipelineStageRepo: PipelineStageRepository,
  ) {}

  async createCompany(dto: CreateCompanyDto) {
    const existing = await this.companyRepo.findBySlug(dto.slug);
    if (existing) throw new ConflictException('Slug already taken');

    const companyId = randomUUID();
    const schemaName = `company_${companyId}`;

    await this.companyRepo.create({
      id: companyId,
      name: dto.companyName,
      slug: dto.slug,
    });
    await this.companyRepo.provisionSchema(companyId);

    const passwordHash = await hashPassword(dto.password);
    const userId = randomUUID();

    await this.userRepo.create(
      { id: userId, email: dto.email, passwordHash, role: 'CompanyAdmin' },
      schemaName,
    );
    await this.pipelineStageRepo.createMany(DEFAULT_STAGES, schemaName);
    await this.userEmailRepo.create({ email: dto.email, companyId, userId });

    return { companyId, userId };
  }
}
```

- [ ] **Step 6: Run the two new specs to verify they pass**

Run: `npm test -- src/modules/auth/services`
Expected: PASS (TokenService + CompanyProvisioningService).

- [ ] **Step 7: Create the new auth DTOs**

`backend/src/modules/auth/dto/company-signup.dto.ts`:
```ts
import { z } from 'zod';

export const CompanySignupSchema = z.object({
  companyName: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export type CompanySignupDto = z.infer<typeof CompanySignupSchema>;
```

`backend/src/modules/auth/dto/signin.dto.ts`:
```ts
import { z } from 'zod';

export const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SigninDto = z.infer<typeof SigninSchema>;
```

`backend/src/modules/auth/dto/refresh.dto.ts`:
```ts
import { z } from 'zod';

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshDto = z.infer<typeof RefreshSchema>;
```

- [ ] **Step 8: Remove unused `CandidateLoginSchema` from `candidate-auth.dto.ts`**

New content of `backend/src/modules/auth/dto/candidate-auth.dto.ts`:
```ts
import { z } from 'zod';

export const CandidateSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(50).optional(),
});

export type CandidateSignupDto = z.infer<typeof CandidateSignupSchema>;
```

- [ ] **Step 9: Rewrite `modules/auth/auth.service.ts`**

```ts
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hashPassword, verifyPassword } from '../../common/password';
import { TokenService } from './services/token.service';
import { CompanyProvisioningService } from './services/company-provisioning.service';
import { CompanySignupDto } from './dto/company-signup.dto';
import { SigninDto } from './dto/signin.dto';
import { RefreshDto } from './dto/refresh.dto';
import { CandidateSignupDto } from './dto/candidate-auth.dto';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { UserRepository } from '../../repositories/user.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { SuperAdminRepository } from '../../repositories/super-admin.repository';

@Injectable()
export class AuthService {
  constructor(
    private companyProvisioning: CompanyProvisioningService,
    private tokenService: TokenService,
    private userEmailRepo: UserEmailRepository,
    private userRepo: UserRepository,
    private candidateAccountRepo: CandidateAccountRepository,
    private superAdminRepo: SuperAdminRepository,
  ) {}

  async companySignup(dto: CompanySignupDto) {
    const { companyId, userId } = await this.companyProvisioning.createCompany(dto);
    const tokens = await this.tokenService.issueTokens({
      id: userId,
      companyId,
      role: 'CompanyAdmin',
    });
    return { data: tokens, message: 'Company created' };
  }

  async signin(dto: SigninDto) {
    const emailRecord = await this.userEmailRepo.findByEmail(dto.email);
    if (emailRecord) {
      const user = await this.userRepo.findByEmail(
        dto.email,
        `company_${emailRecord.companyId}`,
      );
      if (!user) throw new UnauthorizedException('Invalid credentials');
      const valid = await verifyPassword(user.passwordHash, dto.password);
      if (!valid) throw new UnauthorizedException('Invalid credentials');

      const tokens = await this.tokenService.issueTokens({
        id: user.id,
        companyId: emailRecord.companyId,
        role: user.role,
      });
      return { data: tokens, message: 'Signed in' };
    }

    const account = await this.candidateAccountRepo.findByEmail(dto.email);
    if (account) {
      const valid = await verifyPassword(account.passwordHash, dto.password);
      if (!valid) throw new UnauthorizedException('Invalid credentials');

      const tokens = await this.tokenService.issueTokens({
        id: account.id,
        companyId: null,
        role: 'Candidate',
      });
      return { data: tokens, message: 'Signed in' };
    }

    const admin = await this.superAdminRepo.findByEmail(dto.email);
    if (!admin) throw new UnauthorizedException('Invalid credentials');
    const valid = await verifyPassword(admin.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.tokenService.issueTokens({
      id: admin.id,
      companyId: null,
      role: 'SuperAdmin',
    });
    return { data: tokens, message: 'Signed in' };
  }

  async candidateSignup(dto: CandidateSignupDto) {
    const existing = await this.candidateAccountRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already taken');

    const passwordHash = await hashPassword(dto.password);
    const account = await this.candidateAccountRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });

    const tokens = await this.tokenService.issueTokens({
      id: account.id,
      companyId: null,
      role: 'Candidate',
    });
    return { data: tokens, message: 'Account created' };
  }

  async logout(userId: string) {
    await this.tokenService.logout(userId);
  }

  async refresh(dto: RefreshDto) {
    return {
      data: await this.tokenService.rotate(dto.refreshToken),
      message: 'Signed in',
    };
  }
}
```

- [ ] **Step 10: Rewrite `modules/auth/auth.controller.ts`**

```ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyContext } from '../../common/context/company-context';
import { CompanySignupSchema, CompanySignupDto } from './dto/company-signup.dto';
import { SigninSchema, SigninDto } from './dto/signin.dto';
import { RefreshSchema, RefreshDto } from './dto/refresh.dto';
import { CandidateSignupSchema, CandidateSignupDto } from './dto/candidate-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('company/signup')
  async companySignup(
    @Body(new ZodValidationPipe(CompanySignupSchema)) dto: CompanySignupDto,
  ) {
    return this.authService.companySignup(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(@Body(new ZodValidationPipe(SigninSchema)) dto: SigninDto) {
    return this.authService.signin(dto);
  }

  @Post('signup')
  async signup(
    @Body(new ZodValidationPipe(CandidateSignupSchema)) dto: CandidateSignupDto,
  ) {
    return this.authService.candidateSignup(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodValidationPipe(RefreshSchema)) dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async logout(@CurrentUser() user: CompanyContext) {
    await this.authService.logout(user.userId);
    return { message: 'Logged out' };
  }
}
```

- [ ] **Step 11: Rewrite `modules/auth/auth.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { CompanyProvisioningService } from './services/company-provisioning.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, CompanyProvisioningService],
})
export class AuthModule {}
```

- [ ] **Step 12: Rewrite `modules/auth/auth.service.spec.ts`**

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CompanyProvisioningService } from './services/company-provisioning.service';
import { TokenService } from './services/token.service';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { UserRepository } from '../../repositories/user.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { SuperAdminRepository } from '../../repositories/super-admin.repository';

jest.mock('argon2', () => ({ hash: jest.fn(), verify: jest.fn().mockResolvedValue(true) }));

describe('AuthService', () => {
  let service: AuthService;
  const companyProvisioning = { createCompany: jest.fn() };
  const tokenService = { issueTokens: jest.fn() };
  const userEmailRepo = { findByEmail: jest.fn() };
  const userRepo = { findByEmail: jest.fn() };
  const candidateAccountRepo = { findByEmail: jest.fn(), create: jest.fn() };
  const superAdminRepo = { findByEmail: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: CompanyProvisioningService, useValue: companyProvisioning },
        { provide: TokenService, useValue: tokenService },
        { provide: UserEmailRepository, useValue: userEmailRepo },
        { provide: UserRepository, useValue: userRepo },
        { provide: CandidateAccountRepository, useValue: candidateAccountRepo },
        { provide: SuperAdminRepository, useValue: superAdminRepo },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('companySignup', () => {
    it('provisions company and issues CompanyAdmin tokens', async () => {
      companyProvisioning.createCompany.mockResolvedValue({
        companyId: 't1',
        userId: 'u1',
      });
      tokenService.issueTokens.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
      });

      const result = await service.companySignup({
        companyName: 'Acme',
        slug: 'acme',
        email: 'admin@acme.com',
        password: 'password1',
      });

      expect(tokenService.issueTokens).toHaveBeenCalledWith({
        id: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
      });
      expect(result).toEqual({
        data: { accessToken: 'a', refreshToken: 'r' },
        message: 'Company created',
      });
    });
  });

  describe('signin', () => {
    it('signs in an company user found via the email index', async () => {
      userEmailRepo.findByEmail.mockResolvedValue({ companyId: 't1', userId: 'u1' });
      userRepo.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'admin@acme.com',
        passwordHash: 'hash',
        role: 'CompanyAdmin',
      });
      tokenService.issueTokens.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
      });

      const result = await service.signin({
        email: 'admin@acme.com',
        password: 'password1',
      });

      expect(userRepo.findByEmail).toHaveBeenCalledWith(
        'admin@acme.com',
        'company_t1',
      );
      expect(tokenService.issueTokens).toHaveBeenCalledWith({
        id: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
      });
      expect(result).toEqual({
        data: { accessToken: 'a', refreshToken: 'r' },
        message: 'Signed in',
      });
    });

    it('throws UnauthorizedException for unknown emails', async () => {
      userEmailRepo.findByEmail.mockResolvedValue(null);
      candidateAccountRepo.findByEmail.mockResolvedValue(null);
      superAdminRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.signin({ email: 'ghost@nowhere.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('delegates to TokenService.rotate and wraps the result', async () => {
      const rotate = jest
        .fn()
        .mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
      (tokenService as { rotate?: jest.Mock }).rotate = rotate;

      const result = await service.refresh({ refreshToken: 'rt' });

      expect(rotate).toHaveBeenCalledWith('rt');
      expect(result).toEqual({
        data: { accessToken: 'a', refreshToken: 'r' },
        message: 'Signed in',
      });
    });
  });
});
```

- [ ] **Step 13: Verify Task 2**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm test`
Expected: PASS (all specs).

- [ ] **Step 14: Commit**

```bash
git add backend/src/modules/auth
git commit -m "refactor(be): split AuthService into TokenService + CompanyProvisioningService, add Zod DTOs"
```

---

### Task 3: Candidate-account module rebuild

**Files:**
- Create: `backend/src/modules/candidate-account/dto/bookmark.dto.ts`
- Create: `backend/src/modules/candidate-account/dto/profile.dto.ts`
- Create: `backend/src/modules/candidate-account/dto/apply.dto.ts`
- Delete: `backend/src/modules/candidate-account/dto/candidate-apply.dto.ts`
- Rewrite: `backend/src/modules/candidate-account/candidate-account.controller.ts`
- Rewrite: `backend/src/modules/candidate-account/candidate-account.service.ts`
- Rewrite: `backend/src/modules/candidate-account/candidate-account.module.ts`

**Interfaces:**
- Consumes: `AuthCoreModule`, `RepositoriesModule`, `ZodValidationPipe`, `CurrentUser`, `CompanyContext`. Repos: `CandidateRepository.findByEmail(email, schema)`, `CandidateRepository.create(data, schema)`, `PipelineStageRepository.findFirst(schema)`, `ApplicationRepository.create(data, schema)`.
- Produces: unchanged controller/service API (same routes and return shapes).

- [ ] **Step 1: Create the candidate-account DTOs**

`backend/src/modules/candidate-account/dto/bookmark.dto.ts`:
```ts
import { z } from 'zod';

export const BookmarkJobSchema = z.object({
  companyId: z.string().uuid(),
  jobPostingId: z.string().uuid(),
});

export type BookmarkJobDto = z.infer<typeof BookmarkJobSchema>;
```

`backend/src/modules/candidate-account/dto/profile.dto.ts`:
```ts
import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
```

`backend/src/modules/candidate-account/dto/apply.dto.ts`:
```ts
import { z } from 'zod';

export const ApplyJobSchema = z.object({
  phone: z.string().max(50).optional(),
});

export type ApplyJobDto = z.infer<typeof ApplyJobSchema>;
```

- [ ] **Step 2: Delete `dto/candidate-apply.dto.ts`**

Run: `Remove-Item -LiteralPath "backend/src/modules/candidate-account/dto/candidate-apply.dto.ts"`

- [ ] **Step 3: Rewrite `candidate-account.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateBookmarkRepository } from '../../repositories/candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';

@Injectable()
export class CandidateAccountService {
  constructor(
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly candidateBookmarkRepo: CandidateBookmarkRepository,
    private readonly candidateApplicationsIndexRepo: CandidateApplicationsIndexRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
    private readonly candidateRepo: CandidateRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
  ) {}

  async getJobs(search?: string) {
    return this.jobListingsIndexRepo.findAll(search);
  }

  async getJobDetail(companyId: string, jobPostingId: string) {
    const job = await this.jobListingsIndexRepo.findById(
      companyId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');
    return job;
  }

  async apply(
    candidateAccountId: string,
    companyId: string,
    jobPostingId: string,
    phone?: string,
  ) {
    const job = await this.jobListingsIndexRepo.findById(
      companyId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');

    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');

    const schemaName = `company_${companyId}`;

    let candidate = await this.candidateRepo.findByEmail(
      account.email,
      schemaName,
    );
    if (!candidate) {
      candidate = await this.candidateRepo.create(
        {
          name: `${account.firstName} ${account.lastName}`,
          email: account.email,
          phone: phone || account.phone,
        },
        schemaName,
      );
    }

    const firstStage = await this.pipelineStageRepo.findFirst(schemaName);
    if (!firstStage) throw new NotFoundException('No pipeline stages configured');

    const application = await this.applicationRepo.create(
      {
        candidateId: candidate.id,
        jobPostingId,
        currentStageId: firstStage.id,
      },
      schemaName,
    );

    await this.candidateApplicationsIndexRepo.create({
      candidateAccountId,
      companyId,
      jobPostingId,
      applicationId: application.id,
      jobTitle: job.title,
      companyName: job.companyName,
      status: firstStage.name,
    });

    return { applicationId: application.id };
  }

  async getApplications(candidateAccountId: string) {
    return this.candidateApplicationsIndexRepo.findByCandidate(
      candidateAccountId,
    );
  }

  async getBookmarks(candidateAccountId: string) {
    return this.candidateBookmarkRepo.findByCandidate(candidateAccountId);
  }

  async addBookmark(
    candidateAccountId: string,
    companyId: string,
    jobPostingId: string,
  ) {
    const existing = await this.candidateBookmarkRepo.findByJob(
      candidateAccountId,
      companyId,
      jobPostingId,
    );
    if (existing) return existing;

    const job = await this.jobListingsIndexRepo.findById(
      companyId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');

    return this.candidateBookmarkRepo.create({
      candidateAccountId,
      companyId,
      jobPostingId,
      jobTitle: job.title,
      companyName: job.companyName,
    });
  }

  async removeBookmark(candidateAccountId: string, bookmarkId: string) {
    await this.candidateBookmarkRepo.delete(bookmarkId, candidateAccountId);
  }

  async getProfile(candidateAccountId: string) {
    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');

    const { passwordHash, ...profile } = account;
    return { ...profile, role: 'Candidate' };
  }

  async updateProfile(
    candidateAccountId: string,
    _data: UpdateProfileDto,
  ) {
    return this.getProfile(candidateAccountId);
  }
}
```

Add the missing import at the top (insert after the pipeline-stage import):
```ts
import { UpdateProfileDto } from './dto/profile.dto';
```

- [ ] **Step 4: Rewrite `candidate-account.controller.ts`**

```ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CandidateAuthGuard } from '../../common/guards/candidate-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyContext } from '../../common/context/company-context';
import { CandidateAccountService } from './candidate-account.service';
import { BookmarkJobSchema, BookmarkJobDto } from './dto/bookmark.dto';
import { ApplyJobSchema, ApplyJobDto } from './dto/apply.dto';

@Controller('candidate')
export class CandidateAccountController {
  constructor(
    private readonly candidateAccountService: CandidateAccountService,
  ) {}

  @Get('jobs')
  async listJobs(@Query('search') search?: string) {
    return this.candidateAccountService.getJobs(search);
  }

  @Get('jobs/:companyId/:jobId')
  async getJobDetail(
    @Param('companyId') companyId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.candidateAccountService.getJobDetail(companyId, jobId);
  }

  @Post('jobs/:companyId/:jobId/apply')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async apply(
    @Param('companyId') companyId: string,
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(ApplyJobSchema)) body: ApplyJobDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.apply(
      user.userId,
      companyId,
      jobId,
      body.phone,
    );
  }

  @Get('applications')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getApplications(@CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.getApplications(user.userId);
  }

  @Post('bookmarks')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async addBookmark(
    @Body(new ZodValidationPipe(BookmarkJobSchema)) body: BookmarkJobDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.addBookmark(
      user.userId,
      body.companyId,
      body.jobPostingId,
    );
  }

  @Delete('bookmarks/:id')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async removeBookmark(@Param('id') id: string, @CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.removeBookmark(user.userId, id);
  }

  @Get('bookmarks')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getBookmarks(@CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.getBookmarks(user.userId);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getProfile(@CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.getProfile(user.userId);
  }
}
```

- [ ] **Step 5: Rewrite `candidate-account.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { CandidateAccountController } from './candidate-account.controller';
import { CandidateAccountService } from './candidate-account.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule],
  controllers: [CandidateAccountController],
  providers: [CandidateAccountService],
})
export class CandidateAccountModule {}
```

- [ ] **Step 6: Verify Task 3**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/candidate-account
git commit -m "refactor(be): candidate-account uses repositories + Zod validation, drops direct Drizzle"
```

---

### Task 4: App-level rewiring, cleanup, and deletion of old structure

**Files:**
- Create: `backend/src/modules/health/health.module.ts`
- Rewrite: `backend/src/app.module.ts`
- Rewrite: `backend/src/main.ts`
- Rewrite: `backend/test/app.e2e-spec.ts`
- Delete: `backend/src/app.controller.ts`
- Delete: `backend/src/app.service.ts`
- Delete: `backend/src/app.controller.spec.ts`
- Delete: `backend/src/modules/auth/jwt.strategy.ts`
- Delete: `backend/src/shared/` (all files — moved to `common/`)
- Delete: `backend/src/interceptors/` (all files — moved to `common/`)
- Move: `backend/src/shared/response.interceptor.spec.ts` → `backend/src/common/interceptors/response.interceptor.spec.ts`
- Move: `backend/src/shared/api-exception.filter.spec.ts` → `backend/src/common/filters/api-exception.filter.spec.ts`

**Interfaces:**
- Consumes: all files created in Tasks 1–3.
- Produces: final app bootstrap with DI-registered global filter/interceptor; no remaining references to `shared/` or `interceptors/`.

- [ ] **Step 1: Create `modules/health/health.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 2: Rewrite `app.module.ts`**

```ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { CandidateAccountModule } from './modules/candidate-account/candidate-account.module';
import { HealthModule } from './modules/health/health.module';
import { CompanyContextInterceptor } from './common/interceptors/company-context.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RolesGuard } from './common/guards/roles.guard';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    CandidateAccountModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CompanyContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('{*path}');
  }
}
```

- [ ] **Step 3: Rewrite `main.ts`**

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',') ?? [];
  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^https?:\/\/localhost:\d+$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
```

- [ ] **Step 4: Move the two shared specs into `common/`**

```bash
git mv backend/src/shared/response.interceptor.spec.ts backend/src/common/interceptors/response.interceptor.spec.ts
git mv backend/src/shared/api-exception.filter.spec.ts backend/src/common/filters/api-exception.filter.spec.ts
```

No content changes — their `./response.interceptor` and `./api-exception.filter` imports resolve in the new locations.

- [ ] **Step 5: Delete dead files and old structure**

```bash
Remove-Item -LiteralPath "backend/src/app.controller.ts"
Remove-Item -LiteralPath "backend/src/app.service.ts"
Remove-Item -LiteralPath "backend/src/app.controller.spec.ts"
Remove-Item -LiteralPath "backend/src/modules/auth/jwt.strategy.ts"
Remove-Item -LiteralPath "backend/src/shared/password.ts"
Remove-Item -LiteralPath "backend/src/shared/logger.ts"
Remove-Item -LiteralPath "backend/src/shared/api-exception.filter.ts"
Remove-Item -LiteralPath "backend/src/shared/response.interceptor.ts"
Remove-Item -LiteralPath "backend/src/shared/roles.guard.ts"
Remove-Item -LiteralPath "backend/src/shared/roles.decorator.ts"
Remove-Item -LiteralPath "backend/src/shared/candidate-auth.guard.ts"
Remove-Item -LiteralPath "backend/src/interceptors/company-context.ts"
Remove-Item -LiteralPath "backend/src/interceptors/company-context.interceptor.ts"
Remove-Item -LiteralPath "backend/src/interceptors/.gitkeep"
Remove-Item -LiteralPath "backend/src/shared/.gitkeep" -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "backend/src/database/.gitkeep" -ErrorAction SilentlyContinue
```

Then confirm no orphaned references:
```bash
rg -n "shared/|interceptors/|app\.service|AppService|app\.controller|AppController" backend/src backend/test
```
Expected: no output (all references gone). Note `company-context` (common/context) will still appear — that's correct.

- [ ] **Step 6: Rewrite `test/app.e2e-spec.ts`**

New content:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

interface ErrorResponse {
  error: { code: string; message: string };
}

interface SigninSuccessResponse {
  data: { accessToken: string; refreshToken: string };
  message: string;
}

describe('App e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Envelope contract', () => {
    it('POST /auth/signin — valid creds returns { data, message } envelope', async () => {
      const res = await request(app.getHttpServer() as unknown as string)
        .post('/api/auth/signin')
        .send({ email: 'admin@acme.com', password: 'Admin123!' });
      if (res.status === 401) {
        return;
      }
      expect(res.status).toBe(200);

      const body = res.body as SigninSuccessResponse;
      expect(body).toEqual(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            accessToken: expect.any(String),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            refreshToken: expect.any(String),
          }),
          message: 'Signed in',
        }),
      );
    });

    it('POST /auth/signin — bad creds returns { error: { code: "UNAUTHORIZED", message } }', async () => {
      const res = await request(app.getHttpServer() as unknown as string)
        .post('/api/auth/signin')
        .send({ email: 'admin@acme.com', password: 'wrong' });
      expect(res.status).toBe(401);

      const body = res.body as ErrorResponse;

      expect(body).toEqual({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        error: { code: 'UNAUTHORIZED', message: expect.any(String) },
      });
    });
  });
});
```

- [ ] **Step 7: Verify Task 4**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run lint`
Expected: PASS (eslint --fix runs, may reformat files).
Run: `npm test`
Expected: PASS.
Run: `npm run test:e2e`
Expected: PASS (or skips the first test if seed not present; second test still passes).

- [ ] **Step 8: Commit**

```bash
git add -A backend
git commit -m "refactor(be): DI-register global filter/interceptor, delete shared/ + interceptors/ + dead scaffold"
```

---

### Task 5: Full verification

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full backend check suite**

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```
Expected: all PASS.

- [ ] **Step 2: Smoke test against a real DB (if Postgres is running)**

Run: `npm run start:dev` (or `npm start`), then:
```powershell
$body = '{"companyName":"Smoke Co","slug":"smoke-" + (Get-Random),"email":"smoke@example.com","password":"Smoke123!"}'
$res = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/company/signup -ContentType application/json -Body $body
$res.data.accessToken  # expect a non-empty JWT
```
Then sign in with the same credentials via `POST /api/auth/signin` and expect `{ data: { accessToken, refreshToken }, message: "Signed in" }`.

Expected: signup returns tokens; signin returns tokens; both wrapped in the `{ data, message }` envelope.

- [ ] **Step 3: Confirm no stray references to deleted paths**

Run: `rg -n "shared/|interceptors/" backend/src`
Expected: no output.

- [ ] **Step 4: Commit any remaining cleanup**

```bash
git add -A backend
git status   # confirm nothing unexpected
git commit -m "chore(be): final cleanup after SOLID restructure"
```
(Only commit if `git status` shows changes.)

---

## Self-Review Notes

**Spec coverage:**
- Shared `common/` package → Task 1 (Steps 4–17).
- `DatabaseModule` + `drizzleProvider` ConfigService → Task 1 (Steps 18–20).
- `BaseRepository` + standard shapes + all new repos → Task 1 (Steps 21–33).
- `RepositoriesModule` → Task 1 (Step 34).
- `AuthService` split → Task 2 (TokenService, CompanyProvisioningService, rewritten AuthService).
- `AuthCoreModule` + hidden-coupling fix → Task 1 (Step 10) + Task 2/3 module rewrites.
- Zod validation enforcement → Task 2 (Steps 7–10) + Task 3 (Steps 1–4).
- `CurrentUser` decorator → Task 1 (Step 8), used in Tasks 2–3.
- Health module + AppModule rewiring + main.ts + dead-code deletion + e2e update → Task 4.
- `common/password.ts` added to spec → Task 1 Step 1.
- Migrations and profile-update behavior explicitly out of scope (documented in spec).
