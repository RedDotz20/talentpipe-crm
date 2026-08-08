# Backend SOLID Restructure — Design

**Date:** 2026-07-31
**Status:** Approved (full restructure + Zod validation, Approach A)
**Milestone context:** M1 complete. M2+ (job-postings, candidates, pipeline) will build on this foundation, so structural debt is fixed now.

## Problem Statement

The backend works but has structural debt that will slow M2+ and violates SOLID principles:

1. **God classes.** `AuthService` (369 lines) owns company provisioning, user seeding, three login flows, candidate signup, refresh rotation, logout, and three near-duplicate token generators. It does ~12 raw Drizzle calls and reads `process.env` directly.
2. **Duplicated infrastructure.** `AuthModule` and `CandidateAccountModule` each re-declare `DrizzleSchemaService` + the pool provider → **two independent `pg.Pool` instances**. Repos are also re-wired per module.
3. **Services bypass repositories.** `AuthService` and `CandidateAccountService.apply()` reach straight into `DrizzleSchemaService`. `UserRepository` exists but is dead code (`forCurrentCompany()` throws outside a company context, which signin runs in).
4. **Hidden coupling.** `CandidateAccountController` uses `AuthGuard('jwt')` without importing `AuthModule`; it only works because `AppModule` imports `AuthModule` first.
5. **Inconsistent conventions.** Repos return mixed shapes (arrays vs `rows[0] ?? null`); ~22 copies of the acquire → `SET search_path` → try/finally `release()` boilerplate; two different global-registration mechanisms; inconsistent naming (`shared/logger.ts` holds a middleware, `dto/candidate-apply.dto.ts` holds bookmark/profile schemas); dead scaffolding (`AppController`, `AppService`); zero runtime validation on most endpoints despite Zod DTOs already existing.

## Approach

**Clean feature modules + shared infrastructure (NestJS idiom).** Each feature module owns its controller + service + DTOs. Cross-cutting concerns are extracted into centrally-owned, exported shared modules/packages. No route or response-shape changes.

## Target Directory Structure

```
backend/src/
├── main.ts                          # bootstrap only (prefix, CORS)
├── app.module.ts                    # imports feature modules + global providers
│
├── common/
│   ├── context/company-context.ts    # ALS store (moved from interceptors/)
│   ├── auth/
│   │   ├── auth-core.module.ts      # NEW: owns Passport + JwtModule + JwtStrategy
│   │   └── jwt.strategy.ts          # moved from modules/auth/
│   ├── guards/                      # roles.guard.ts, candidate-auth.guard.ts (moved from shared/)
│   ├── decorators/                  # roles.decorator.ts (moved), current-user.decorator.ts (NEW)
│   ├── interceptors/                # company-context.interceptor.ts, response.interceptor.ts
│   ├── filters/                     # api-exception.filter.ts (moved from shared/)
│   ├── middlewares/                 # logger.middleware.ts (renamed from shared/logger.ts)
│   ├── pipes/                       # zod-validation.pipe.ts (NEW)
│   └── password.ts                  # moved from shared/password.ts
│
├── database/
│   ├── database.module.ts           # NEW: single owner of pool + DrizzleSchemaService
│   ├── drizzle.provider.ts          # injects ConfigService (no process.env)
│   ├── drizzle-schema.service.ts
│   └── schema.ts                    # unchanged
│
├── repositories/
│   ├── base.repository.ts           # NEW: acquire → SET search_path → try/finally release
│   ├── repositories.module.ts       # NEW: imports DatabaseModule, exports all repos
│   ├── user.repository.ts           # rewired: optional schema, single-row returns
│   ├── company.repository.ts         # standardized return shapes
│   ├── refresh-token.repository.ts  # NEW (pulled out of AuthService)
│   ├── candidate.repository.ts      # NEW (company-scoped candidates)
│   ├── application.repository.ts    # NEW (company-scoped applications)
│   ├── pipeline-stage.repository.ts # NEW (company-scoped pipeline_stages)
│   ├── super-admin.repository.ts    # NEW (super_admins)
│   ├── user-email.repository.ts     # NEW (user_emails)
│   ├── candidate-account.repository.ts
│   ├── candidate-bookmark.repository.ts
│   ├── candidate-applications-index.repository.ts
│   └── job-listings-index.repository.ts
│
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts           # imports AuthCoreModule + RepositoriesModule
│   │   ├── auth.controller.ts       # Zod DTOs via ZodValidationPipe, CurrentUser decorator
│   │   ├── auth.service.ts          # login flows only
│   │   ├── services/
│   │   │   ├── company-provisioning.service.ts   # NEW
│   │   │   └── token.service.ts                 # NEW
│   │   └── dto/                     # company-signup.dto.ts, signin.dto.ts, refresh.dto.ts, candidate-auth.dto.ts
│   ├── candidate-account/
│   │   ├── candidate-account.module.ts
│   │   ├── candidate-account.controller.ts
│   │   ├── candidate-account.service.ts         # apply() data access moved to repositories
│   │   └── dto/                     # bookmark.dto.ts, profile.dto.ts
│   └── health/
│       ├── health.module.ts         # NEW
│       └── health.controller.ts
│
└── shared/                          # REMOVED — contents redistributed to common/ or deleted
```

## Module Wiring

| Module | Provides | Exports |
|---|---|---|
| `DatabaseModule` | `drizzleProvider` (pool), `DrizzleSchemaService` | both |
| `RepositoriesModule` | all 13 repositories (extend `BaseRepository`) | all of them |
| `AuthCoreModule` | `JwtStrategy` (imports `PassportModule` + `JwtModule.registerAsync` w/ `ConfigService`) | `JwtStrategy`, `PassportModule` |
| `AuthModule` | `AuthService`, `CompanyProvisioningService`, `TokenService` | — |
| `CandidateAccountModule` | controller + service | — |
| `HealthModule` | health controller | — |

- `AppModule` imports `ConfigModule.forRoot({isGlobal:true})`, `AuthModule`, `CandidateAccountModule`, `HealthModule`.
- `AuthModule` and `CandidateAccountModule` import `AuthCoreModule` + `RepositoriesModule` explicitly — fixes the hidden coupling and the duplicate-pool bug.
- `ResponseInterceptor` + `ApiExceptionFilter` register in `AppModule` via `APP_INTERCEPTOR` / `APP_FILTER` (consistent with the company interceptor and the RolesGuard, and removes the manual re-registration in the e2e spec).
- `CompanyContextInterceptor` (`APP_INTERCEPTOR`) and `RolesGuard` (`APP_GUARD`) stay in `AppModule`.
- `LoggerMiddleware` stays applied to all routes via `configure()`.

## AuthService Decomposition (SRP)

`AuthService` (369 lines) splits into three services:

1. **`TokenService`** — one `issueTokens(user: { id, companyId, role })` that signs access + refresh (JWT secrets via `ConfigService`), hashes the refresh token with argon2, upserts via `RefreshTokenRepository`, returns `{ accessToken, refreshToken }`. Replaces the 3 near-duplicate generators. Public `logout(userId)` deletes the stored refresh token via the repo.

2. **`CompanyProvisioningService`** — `createCompany(dto)`:
   - checks slug uniqueness (`CompanyRepository.findBySlug`),
   - creates the company row (`CompanyRepository.create`),
   - `CREATE SCHEMA` + clones template tables (single `forSchema('public')` op),
   - seeds CompanyAdmin user (`UserRepository.create`, schema `company_<id>`),
   - seeds default pipeline stages (`PipelineStageRepository`),
   - records `userEmails` link (`UserEmailRepository.create`).
   Returns `{ companyId, userId }`.

3. **`AuthService`** — orchestration only, no raw Drizzle, no `process.env`, no argon2:
   - `companySignup(dto)` → `companyProvisioning.createCompany(dto)` → `tokenService.issueTokens(...)`.
   - `signin(dto)` → resolve email via `userEmails` lookup → company schema user → `verifyPassword` → `issueTokens`; fall back to candidate account → superadmin. Returns envelope.
   - `candidateSignup(dto)` → `CandidateAccountRepository.create` → `issueTokens`.
   - `refresh(dto)` → verify refresh token via `JwtService`, check stored hash + expiry via `RefreshTokenRepository`, re-issue.

**OCP:** signin resolves the role, then delegates token issuance per role; adding a new login type adds a strategy, not an edit to a branching chain.

**Repo schema scoping:** `forCurrentCompany()` throws outside a company context, which killed `UserRepository`. Fix: `BaseRepository` helpers accept an explicit schema name OR fall back to the ALS current-company context. Repos that need cross-company reads (signin) pass the schema explicitly; company-context reads use the default.

## BaseRepository & Consistent Shapes

- `BaseRepository` constructor injects `DrizzleSchemaService`; exposes `withDb(schema, fn)` that acquires a client, sets `search_path`, runs `fn(db)`, and releases in `finally`. Default schema resolution: explicit arg > current-company (ALS) > public.
- **Return convention:** singletons → `T | null`; lists → `T[]`. All repos updated to match.
- `CandidateAccountService.apply()` moves its raw `forSchema()` block into `CandidateRepository` (find-or-create), `PipelineStageRepository` (first stage), `ApplicationRepository` (insert). The service keeps orchestration; index write stays via `CandidateApplicationsIndexRepository`.

## Validation (Zod)

- **`ZodValidationPipe`** — param pipe attached as `@Body(new ZodValidationPipe(Schema))`; validates, parses, and returns typed data; throws `BadRequestException` (→ `VALIDATION_ERROR` via the existing filter) on failure.
- `AuthController`: replace inline body types with `CompanySignupSchema`, `SigninSchema`, `RefreshSchema` (new DTOs), and enforce the existing `CandidateSignupSchema`.
- `CandidateAccountController`: replace inline `BookmarkJobSchema.parse()` with `@Body(new ZodValidationPipe(BookmarkJobSchema))`; add `@Body(new ZodValidationPipe(UpdateProfileSchema))` to the profile update route.
- Remove unused `CandidateLoginSchema`.

## Cleanup & Consistency

- **Delete** `AppController`, `AppService`, `app.controller.spec.ts` (dead scaffolding).
- **`CurrentUser` decorator** — reads typed `req.user` (`{ userId, companyId, role }`); replaces `@Request() req: any` (auth controller) and `getCurrentUser()` ALS import (candidate controller).
- Rename `shared/logger.ts` → `common/middlewares/logger.middleware.ts`; split misnamed `dto/candidate-apply.dto.ts` into `bookmark.dto.ts` + `profile.dto.ts`; fix the double-quoted import in `app.module.ts`.
- **`ConfigService`** injected into `drizzleProvider` and `TokenService`; zero `process.env` reads in business code.
- `CompanyContext` + accessors move to `common/context/company-context.ts`; interceptor imports from there.

## Testing

- New/updated unit specs: `token.service.spec.ts`, `company-provisioning.service.spec.ts`, `zod-validation.pipe.spec.ts`, updated `auth.service.spec.ts` / `auth.controller.spec.ts` / `candidate-account.controller.spec.ts` (if present).
- e2e spec: drop manual filter/interceptor re-registration.
- Verification: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, plus a manual signup → signin smoke test against a real DB. Frontend untouched.

## Out of Scope

- **Migrations / schema layout** — the `public` schema holding template-table clones is a latent hazard but restructuring it would break the existing DB bootstrap. Flagged, not fixed.
- `updateProfile` stub behavior — DTO validation enforced, full profile-update logic stays out of M1 scope.
- No route, response-shape, or behavior changes beyond validation enforcement.
