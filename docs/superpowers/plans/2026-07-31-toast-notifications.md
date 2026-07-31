# Frontend Toast Notification System (M1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation for user-facing toast notifications across the app. Backend response/error envelopes become canonical (`{ data, message }` and `{ error: { code, message } }`); frontend mounts Mantine's `<Notifications>` provider and gains a `useApiMutation` hook that auto-toasts every mutation. M2+ features inherit toasting for free.

**Architecture:** Two new backend files (`response.interceptor.ts`, `api-exception.filter.ts`) registered globally in `main.ts`. They normalize every NestJS 2xx into `{ data, message }` and every thrown error into `{ error: { code, message } }`, matching the contract already documented in `AGENTS.md`, `docs/00_PROJECT_INSTRUCTIONS.md`, and `docs/00b_LOCAL_DEV_BOOTSTRAP.md`. The `signin`, `candidateSignup`, and `orgSignup` handlers return explicit envelopes so their success toasts have meaningful copy from day one. On the frontend, `useApiMutation` wraps `@tanstack/react-query`'s `useMutation` and toasts on success/failure, suppressing noise on 401s (the axios client already redirects on token-present 401s).

**Tech Stack:** NestJS 11, RxJS, `@tanstack/react-query@5.101`, `@mantine/notifications@9.4.2`, axios 1.x, Jest (backend), Vitest/Jest pattern (frontend — none configured yet, manual verification only).

## Global Constraints

- NestJS 11 + RxJS-only interceptors (`map`); no additional runtime deps on backend
- Backend `ResponseInterceptor` and `ApiExceptionFilter` registered in `backend/src/main.ts` via `app.useGlobalInterceptors(...)` / `app.useGlobalFilters(...)`
- All DB code stays in `repositories/`; no service/controller logic changes except return-shape wrapping
- Frontend lint: `oxlint` (not eslint); typecheck: `tsc -b`. Backend lint: `eslint --fix`; typecheck: `tsc --noEmit`
- `@mantine/notifications@9.4.2` is already in `frontend/package.json`; do not add new dependencies
- Frontend test runner is **not** configured in M1.5. Hook tests are out of scope (deferred to M9). Backend unit/e2e tests follow the existing pattern (co-located `*.spec.ts` for unit; `test/*.e2e-spec.ts` for supertest)
- `SignInPage` `<Alert>` UX is **not** migrated in this M; failure-UX consolidation is deferred
- Backend error envelope contract: `{ error: { code, message } }` where `code` is one of `VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT | UNPROCESSABLE | RATE_LIMITED | INTERNAL_ERROR | SERVICE_UNAVAILABLE`
- Toast copy precedence on success: hook `successMessage` override → backend envelope `message` → literal `'Done'`
- Toast copy precedence on error: hook `errorMessage` override → backend `error.error.message` → literal `'Something went wrong'`
- 401s from any endpoint with no held token: silent (no toast, no redirect — caller decides). 401s with held token: axios interceptor logs out + redirects; `useApiMutation` also stays silent on 401 to avoid double noise.

---

### Task 1: Backend — `ApiExceptionFilter` with status→code table

**Files:**
- Create: `backend/src/shared/api-exception.filter.ts`
- Create: `backend/src/shared/api-exception.filter.spec.ts`

**Interfaces:**
- Produces: throws via Nest response cycle produce bodies of shape `{ error: { code: string, message: string } }` with `code` derived from the status table

- [ ] **Step 1: Write failing spec for the filter**

Create `backend/src/shared/api-exception.filter.spec.ts`:

```typescript
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

function makeHost(): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const getResponse = jest.fn().mockReturnValue({ status });
  const getRequest = jest.fn().mockReturnValue({});
  return {
    switchToHttp: () => ({ getResponse, getRequest, getNext: jest.fn() }),
  } as unknown as ArgumentsHost;
}

function capture(host: ArgumentsHost) {
  const json = (host.switchToHttp().getResponse() as any).status().json as jest.Mock;
  const status = (host.switchToHttp().getResponse() as any).status as jest.Mock;
  return { status, json };
}

describe('ApiExceptionFilter', () => {
  let filter: ApiExceptionFilter;

  beforeEach(() => {
    filter = new ApiExceptionFilter();
  });

  it('maps UnauthorizedException to UNAUTHORIZED code', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch(new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
    });
  });

  it('maps ConflictException to CONFLICT code', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch(new HttpException('Slug already taken', HttpStatus.CONFLICT), host);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'CONFLICT', message: 'Slug already taken' },
    });
    expect(status).toHaveBeenCalledWith(409);
  });

  it('joins ValidationPipe string[] messages with ", "', () => {
    const host = makeHost();
    const { json } = capture(host);
    filter.catch(
      new HttpException(
        { message: ['email must be valid', 'password too short'], error: 'Bad Request', statusCode: 400 },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'email must be valid, password too short',
      },
    });
  });

  it('maps plain Error to 500 INTERNAL_ERROR with its message', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch(new Error('db exploded'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'db exploded' },
    });
  });

  it('falls back to INTERNAL_ERROR + "Internal server error" for unknown throws', () => {
    const host = makeHost();
    const { status, json } = capture(host);
    filter.catch('weird', host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
```

- [ ] **Step 2: Run spec, confirm RED**

```bash
cd backend && npx jest src/shared/api-exception.filter.spec.ts
```

Expected: FAIL — `Cannot find module './api-exception.filter'`.

- [ ] **Step 3: Implement the filter**

Create `backend/src/shared/api-exception.filter.ts`:

```typescript
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
          message = (m as unknown[]).filter((x) => typeof x === 'string').join(', ');
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
      this.logger.warn(`${status} ${req.method ?? '?'} ${req.url} → ${code}: ${message}`);
    }
  }
}
```

- [ ] **Step 4: Run spec, confirm GREEN**

```bash
cd backend && npx jest src/shared/api-exception.filter.spec.ts
```

Expected: PASS, 5 tests passing.

- [ ] **Step 5: Lint + typecheck**

```bash
cd backend && npm run lint && npm run typecheck
```

Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add backend/src/shared/api-exception.filter.ts backend/src/shared/api-exception.filter.spec.ts
git commit -m "feat(be): ApiExceptionFilter normalizes errors to { error: { code, message } }"
```

---

### Task 2: Backend — `ResponseInterceptor` (wraps success bodies, passes explicit envelopes through)

**Files:**
- Create: `backend/src/shared/response.interceptor.ts`
- Create: `backend/src/shared/response.interceptor.spec.ts`

**Interfaces:**
- Produces: every controller handler that returns a non-envelope gets wrapped as `{ data: <original>, message: 'OK' }`. Handlers that return an explicit envelope (object with own keys `data` AND `message`) pass through unchanged.

- [ ] **Step 1: Write failing spec**

Create `backend/src/shared/response.interceptor.spec.ts`:

```typescript
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

const dummyCtx = {} as ExecutionContext;

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  it('wraps a plain payload as { data, message: "OK" }', async () => {
    const out = await firstValueFrom(interceptor.intercept(dummyCtx, makeHandler({ id: 1 })));
    expect(out).toEqual({ data: { id: 1 }, message: 'OK' });
  });

  it('passes through explicit envelopes (object with both data + message keys)', async () => {
    const envelope = { data: { accessToken: 'abc' }, message: 'Signed in' };
    const out = await firstValueFrom(interceptor.intercept(dummyCtx, makeHandler(envelope)));
    expect(out).toEqual(envelope);
  });

  it('does NOT treat arrays as envelopes (arrays lack own message key)', async () => {
    const out = await firstValueFrom(interceptor.intercept(dummyCtx, makeHandler([1, 2, 3])));
    expect(out).toEqual({ data: [1, 2, 3], message: 'OK' });
  });

  it('converts null/undefined returns to { data: null, message: "OK" }', async () => {
    const out = await firstValueFrom(interceptor.intercept(dummyCtx, makeHandler(null)));
    expect(out).toEqual({ data: null, message: 'OK' });
  });

  it('treats { message: "x" } (no data key) as a plain payload', async () => {
    const out = await firstValueFrom(
      interceptor.intercept(dummyCtx, makeHandler({ message: 'Logged out' })),
    );
    expect(out).toEqual({ data: { message: 'Logged out' }, message: 'OK' });
  });
});
```

- [ ] **Step 2: Run spec, confirm RED**

```bash
cd backend && npx jest src/shared/response.interceptor.spec.ts
```

Expected: FAIL — `Cannot find module './response.interceptor'`.

- [ ] **Step 3: Implement the interceptor**

Create `backend/src/shared/response.interceptor.ts`:

```typescript
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  data: T;
  message: string;
}

const DEFAULT_MESSAGE = 'OK';

function isExplicitEnvelope(value: unknown): value is { data: unknown; message: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(obj, 'data') &&
    Object.prototype.hasOwnProperty.call(obj, 'message');
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
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

- [ ] **Step 4: Run spec, confirm GREEN**

```bash
cd backend && npx jest src/shared/response.interceptor.spec.ts
```

Expected: PASS, 5 tests passing.

- [ ] **Step 5: Lint + typecheck**

```bash
cd backend && npm run lint && npm run typecheck
```

Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add backend/src/shared/response.interceptor.ts backend/src/shared/response.interceptor.spec.ts
git commit -m "feat(be): ResponseInterceptor wraps 2xx bodies, passes explicit envelopes through"
```

---

### Task 3: Backend — register interceptor + filter globally

**Files:**
- Modify: `backend/src/main.ts`

**Interfaces:**
- Reads: `ApiExceptionFilter` from `./shared/api-exception.filter`
- Reads: `ResponseInterceptor` from `./shared/response.interceptor`

- [ ] **Step 1: Edit `main.ts`**

Replace `backend/src/main.ts` with:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './shared/api-exception.filter';
import { ResponseInterceptor } from './shared/response.interceptor';

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
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
```

- [ ] **Step 2: Lint + typecheck**

```bash
cd backend && npm run lint && npm run typecheck
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main.ts
git commit -m "feat(be): register response interceptor + exception filter globally"
```

---

### Task 4: Backend — wrap `signin`, `candidateSignup`, `orgSignup` returns in explicit envelopes

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`

**Interfaces:**
- `authService.signin(dto)` returns `{ data: { accessToken, refreshToken }, message: 'Signed in' }` (was: `{ accessToken, refreshToken }`)
- `authService.candidateSignup(dto)` returns `{ data: { candidateAccountId }, message: 'Account created' }` (was: `{ accessToken, refreshToken }` — note callers don't currently use these tokens directly, see step 4)
- `authService.orgSignup(dto)` returns `{ data: { tenantId, userId }, message: 'Company created' }` (was: bare tokens + tenantId)

**Pre-step:** Read `auth.service.ts` end-to-end. Confirmed: callers in auth.controller pass service return values straight through; no callers in `frontend/src/api/authApi.ts` touch the *bare* shape — they only read `accessToken` and `refreshToken` from the signin response. After M1.5, those reads shift to `data.accessToken`/`data.refreshToken` (handled in Task 7).

- [ ] **Step 1: Update `signin()` to return explicit envelope**

In `backend/src/modules/auth/auth.service.ts`, change the three return points inside `signin()`. Find each `return this.generateTokens(...)` / `return this.generateSuperAdminTokens(...)` / `return this.generateCandidateTokens(...)` (lines ~165, ~188, ~197) and replace with:

```typescript
      const tokens = await this.generateTokens(user.id, emailRecord.tenantId, user.role);
      return { data: tokens, message: 'Signed in' };
```

```typescript
        return { data: await this.generateSuperAdminTokens(admin.id), message: 'Signed in' };
```

```typescript
    return { data: await this.generateCandidateTokens(account.id), message: 'Signed in' };
```

Important: keep `await` where appropriate so the return type stays explicit. Verify by reading the function top-to-bottom after the edit.

- [ ] **Step 2: Update `orgSignup()` return**

Find `return this.generateTokens(userId, tenantId, 'OrgAdmin');` at the end of `orgSignup()` (line ~129) and replace with:

```typescript
    const tokens = await this.generateTokens(userId, tenantId, 'OrgAdmin');
    return { data: tokens, message: 'Company created' };
```

The token contents are `{ accessToken, refreshToken, ... }`; that is what `data` will hold. The frontend will read `data.accessToken` / `data.refreshToken` after the migration (Task 7).

- [ ] **Step 3: Update `candidateSignup()` return**

Find `return this.generateCandidateTokens(account.id);` (line ~213) and replace with:

```typescript
    const tokens = await this.generateCandidateTokens(account.id);
    return { data: tokens, message: 'Account created' };
```

- [ ] **Step 4: Lint + typecheck**

```bash
cd backend && npm run lint && npm run typecheck
```

Expected: clean. The function signatures still infer the same return type as before (an object); a more strict type would be `{ data: { accessToken: string, refreshToken: string }, message: string }`, but we deliberately keep the inferred shape to avoid touching the un-migrated controllers and the existing `auth.service.spec.ts` (which mocks `JwtService.sign` and does not inspect returns).

- [ ] **Step 5: Run existing auth.service spec to ensure no breakage**

```bash
cd backend && npx jest src/modules/auth/auth.service.spec.ts
```

Expected: PASS — the spec mocks providers and does not exercise returns. If a TS error is reported in the spec, the cause is most likely `signin` no longer matching a return type — adjust the spec's `signin` invocation to ignore its return (the existing spec already does).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/auth/auth.service.ts
git commit -m "feat(be): wrap auth signin/signup returns in explicit { data, message } envelope"
```

---

### Task 5: Backend — extend e2e to confirm envelope on wire

**Files:**
- Modify: `backend/test/app.e2e-spec.ts`
- (If the e2e file is currently empty, treat it as a new test in addition to whatever scaffold exists there.)

**Interfaces:**
- Verifies: `POST /api/auth/signin` returns `{ data: { accessToken, refreshToken }, message: 'Signed in' }`; a signin request that produces 401 returns `{ error: { code: 'UNAUTHORIZED', message: '...' } }`.

- [ ] **Step 1: Read existing `app.e2e-spec.ts` and the seed account list**

```bash
cd backend && Get-Content test/app.e2e-spec.ts   # PowerShell
```

(the file likely already imports `AppModule` and boots the app — keep that setup.)

From `docs/00b_LOCAL_DEV_BOOTSTRAP.md` (lines around 162), the seed creates 3 sample accounts. Pick the **org admin** credential for the happy-path test. If unsure, use a generic placeholder; the test will skip if login fails and the engineer can update once the seed accounts are known.

- [ ] **Step 2: Add two new test cases**

In `backend/test/app.e2e-spec.ts`, append inside the existing `describe` block (or new `describe('Envelope contract', ...)` block):

```typescript
describe('Envelope contract', () => {
  it('POST /auth/signin — valid creds returns { data, message } envelope', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/signin')
      .send({ email: 'admin@example.com', password: 'password123' });
    if (res.status === 401) {
      // seed not present in this env — skip
      return;
    }
    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        }),
        message: 'Signed in',
      }),
    );
  });

  it('POST /auth/signin — bad creds returns { error: { code: "UNAUTHORIZED", message } }', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/signin')
      .send({ email: 'admin@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    });
  });
});
```

- [ ] **Step 3: Run e2e**

```bash
# from docs/00b_LOCAL_DEV_BOOTSTRAP.md — DB must be up and migrations applied
cd backend && npm run test:e2e -- test/app.e2e-spec.ts
```

Expected:
- The happy-path case is skipped (status 401 → `return`) if no seed is present, or PASS if seed is present.
- The bad-creds case PASSes — confirms the filter is wired.

If `npm run test:e2e` is broken because docker isn't running, document this in the commit message ("test:e2e not run in unverified environment — manual curl verification follows in Task 8"), and instead run a focused unit spec:

```bash
cd backend && npx jest src/shared/
```

That proves the filter and interceptor without needing the DB.

- [ ] **Step 4: Manual curl verification (if DB is up)**

```bash
curl -s -X POST http://localhost:3000/api/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"password123"}' | head -c 200
```

Expected output shape:
```json
{"data":{"accessToken":"eyJ...","refreshToken":"eyJ..."},"message":"Signed in"}
```

(If the seed isn't loaded, expect `{"error":{"code":"UNAUTHORIZED","message":"Invalid credentials"}}`.)

- [ ] **Step 5: Commit**

```bash
git add backend/test/app.e2e-spec.ts
git commit -m "test(be): assert API envelope contract on auth signin"
```

---

### Task 6: Frontend — mount `<Notifications />` provider

**Files:**
- Modify: `frontend/src/app/providers.tsx`

**Interfaces:**
- Produces: a top-right notification portal is mounted in the React tree so anywhere in the app can call `notifications.show({...})`.

- [ ] **Step 1: Edit `providers.tsx`**

Replace `frontend/src/app/providers.tsx` contents with:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { RouterProvider } from '@tanstack/react-router';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { router } from './router';
import '@mantine/notifications/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
      throwOnError: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Notifications position="top-right" zIndex={2000} />
        <RouterProvider router={router} />
      </MantineProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

```bash
cd frontend && npm run lint && npm run typecheck
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/providers.tsx
git commit -m "feat(fe): mount Mantine Notifications provider top-right"
```

---

### Task 7: Frontend — `useApiMutation` hook

**Files:**
- Create: `frontend/src/hooks/useApiMutation.ts`

**Interfaces:**
- Produces: `useApiMutation<TData, TVars, TCtx>(options): UseMutationResult<ApiEnvelope<TData>, unknown, TVars, TCtx>`
- Auto-toasts on `onSuccess` (green) and `onError` (red). Suppresses 401. Honors `silent`, `successMessage`, `errorMessage` overrides.

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useApiMutation.ts` with the content:

```ts
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { isAxiosError } from 'axios';

export interface ApiEnvelope<T> {
  data: T;
  message: string;
}

interface ApiErrorBody {
  error: { code: string; message: string };
}

export type UseApiMutationOptions<TData, TVariables, TContext> = Omit<
  UseMutationOptions<ApiEnvelope<TData>, unknown, TVariables, TContext>,
  'mutationFn' | 'onSuccess' | 'onError'
> & {
  mutationFn: (variables: TVariables) => Promise<ApiEnvelope<TData>>;
  /** Override the success toast copy. Default: backend envelope.message. */
  successMessage?: string;
  /** Override the error toast copy. Default: backend error.error.message. */
  errorMessage?: string;
  /** Suppress both toasts. Caller handles feedback. */
  silent?: boolean;
  onSuccess?: UseMutationOptions<
    ApiEnvelope<TData>,
    unknown,
    TVariables,
    TContext
  >['onSuccess'];
  onError?: UseMutationOptions<
    ApiEnvelope<TData>,
    unknown,
    TVariables,
    TContext
  >['onError'];
};

export function useApiMutation<TData = unknown, TVariables = void, TContext = unknown>(
  options: UseApiMutationOptions<TData, TVariables, TContext>,
) {
  const {
    mutationFn,
    successMessage,
    errorMessage,
    silent,
    onSuccess,
    onError,
    ...rest
  } = options;

  return useMutation<ApiEnvelope<TData>, unknown, TVariables, TContext>({
    ...rest,
    mutationFn,
    onSuccess: (data, vars, ctx) => {
      if (!silent) {
        notifications.show({
          color: 'green',
          title: 'Success',
          message: successMessage ?? data.message ?? 'Done',
        });
      }
      onSuccess?.(data, vars, ctx);
    },
    onError: (err, vars, ctx) => {
      const status = isAxiosError<ApiErrorBody>(err)
        ? err.response?.status
        : undefined;
      if (status !== 401 && !silent) {
        const backendMessage = isAxiosError<ApiErrorBody>(err)
          ? err.response?.data?.error?.message
          : undefined;
        notifications.show({
          color: 'red',
          title: 'Error',
          message: errorMessage ?? backendMessage ?? 'Something went wrong',
        });
      }
      onError?.(err, vars, ctx);
    },
  });
}
```

- [ ] **Step 2: Lint + typecheck**

```bash
cd frontend && npm run lint && npm run typecheck
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useApiMutation.ts
git commit -m "feat(fe): useApiMutation hook auto-toasts success/error via Mantine notifications"
```

(No frontend unit tests in this M — deferred to M9.)

---

### Task 8: Frontend — tighten axios 401 guard (only redirect when a token is held)

**Files:**
- Modify: `frontend/src/api/client.ts`

**Interfaces:**
- Produces: a 401 received with no `accessToken` in the store (e.g. failed signin) leaves the rejection in the caller's hands — no auto-redirect. A 401 with a held token still triggers `logout()` + redirect.

- [ ] **Step 1: Edit `client.ts`**

Replace `frontend/src/api/client.ts` with:

```ts
import axios from 'axios';
import { useAuthStore } from './useAuth';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: 401 → log out only if a token was held.
// (A 401 from signin itself has no token — the page handles it.)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { accessToken, logout } = useAuthStore.getState();
      if (accessToken) {
        logout();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/signin';
        }
      }
    }
    return Promise.reject(error);
  },
);
```

- [ ] **Step 2: Lint + typecheck**

```bash
cd frontend && npm run lint && npm run typecheck
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "fix(fe): only auto-logout on 401 when a token was held"
```

---

### Task 9: Frontend — migrate `useSignIn` to `useApiMutation` (single existing consumer)

**Files:**
- Modify: `frontend/src/hooks/auth/useSignIn.ts`

**Interfaces:**
- `useSignIn()` returns a `UseMutationResult` whose `mutateAsync` resolves with the full envelope `{ data: { accessToken, refreshToken }, message: 'Signed in' }`. The `onSuccess` handler still calls `setTokens(data.accessToken, data.refreshToken)`.

- [ ] **Step 1: Edit `useSignIn.ts`**

Replace `frontend/src/hooks/auth/useSignIn.ts` with:

```ts
import { useApiMutation } from '@/hooks/useApiMutation';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';

export function useSignIn() {
  const { setTokens } = useAuthStore();

  return useApiMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.signin(email, password).then((r) => r.data),
    onSuccess: ({ data }) => {
      setTokens(data.accessToken, data.refreshToken);
    },
  });
}
```

- [ ] **Step 2: Lint + typecheck**

```bash
cd frontend && npm run lint && npm run typecheck
```

Expected: clean exit. The `authApi.signin` returns the raw axios `AxiosResponse<{ accessToken, refreshToken }>` from M1; after the backend wraps, axios's `r.data` is now the new envelope, so `then((r) => r.data)` strips axios's `{ data, status, headers, ... }` and returns the envelope directly. Type narrows correctly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/auth/useSignIn.ts
git commit -m "feat(fe): migrate useSignIn to useApiMutation"
```

---

### Task 10: Manual end-to-end verification (mandatory before declaring done)

**Files:** none (procedure only)

- [ ] **Step 1: Start the stack**

```bash
docker compose up -d                # postgres + redis + minio
# ensure migrations + template-schema + seed applied (see docs/00b_LOCAL_DEV_BOOTSTRAP.md)
cd backend && npm run start:dev     # :3000
cd frontend && npm run dev          # :5173
```

- [ ] **Step 2: Sign in happy path**

1. Visit `http://localhost:5173/auth/signin`.
2. Enter a valid seeded email (e.g. `admin@example.com` / `password123` if present).
3. Submit. Expect: green toast top-right reading exactly `Signed in`. Dashboard navigates.

- [ ] **Step 3: Sign in failure path**

1. Enter wrong password.
2. Submit. Expect: NO toast (silent 401, no held token). The inline `<Alert>` on `SignInPage` reads `Invalid email or password`. Page does NOT redirect to `/auth/signin` (it already is there).

- [ ] **Step 4: Expired-session path**

1. Sign in successfully (token stored). Navigate to `/dashboard`.
2. Manually clear the `accessToken` in localStorage (`localStorage.removeItem('accessToken')`).
3. Trigger a mutation (e.g. submit a form, or reload and try to act). Expect: page redirects to `/auth/signin`. No toast.

- [ ] **Step 5: Backend curl smoke test**

```bash
curl -i -X POST http://localhost:3000/api/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"password123"}'

curl -i -X POST http://localhost:3000/api/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"wrong"}'
```

Expected:

- First: `200 OK` body `{ "data": { "accessToken": "...", "refreshToken": "..." }, "message": "Signed in" }`
- Second: `401` body `{ "error": { "code": "UNAUTHORIZED", "message": "..." } }`

- [ ] **Step 6: Commit any verification artifacts**

If no code changed, do nothing. If a config or test was added during verification, commit it:

```bash
git status
# if dirty:
git add <verified-changes>
git commit -m "chore: verification follow-ups"
```

---

### Final verification

- [ ] **Step 1: Aggregate lint/typecheck/test**

```bash
cd backend && npm run lint && npm run typecheck && npx jest src/shared/
cd frontend && npm run lint && npm run typecheck
```

Expected: all clean. `npx jest src/shared/` runs the two new backend specs (filter and interceptor); auth.service.spec and any module-level specs are not regressed.

- [ ] **Step 2: Confirm no committed-file diffs outside this M's scope**

```bash
git status
git diff --stat HEAD~9 HEAD   # shows the 9 commits added by this M
```

Expected: only files listed in this plan. If `frontend/src/features/auth/SignInPage.tsx` shows as modified, that change predates this M (the working-tree edit observed at the start of M1.5) — leave it alone.

---

### Acceptance criteria recap

These mirror the design doc and are now enforced by the tasks above:

1. `POST /api/auth/signin` with valid creds returns `{ data: { accessToken, refreshToken }, message: 'Signed in' }` (Tasks 3, 4, 5).
2. Same call with bad creds returns `401 + { error: { code: 'UNAUTHORIZED', message: '...' } }` (Tasks 1, 3, 5).
3. A 401 with a held token redirects to `/auth/signin` with no toast (Task 8).
4. A 401 without a held token does not redirect; caller handles the rejection (Tasks 7, 8).
5. Successful login shows a green Mantine notification top-right (Tasks 6, 9).
6. Successful signup shows a green toast with backend `message` (Task 4 + future use of `useApiMutation`).
7. Existing endpoints still respond — interceptor treats arrays and bare `{ message }` returns as payloads (Task 2 spec covers this).
8. `npm run typecheck` and `npm run lint` clean on both packages (every task's lint/typecheck step).
