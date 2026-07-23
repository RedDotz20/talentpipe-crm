# Backend Focus

You are working on the **TalentPipe backend** only. Follow these constraints:

## Stack Constraints

- **NestJS 11** — controller → service → repository layering. Use `@Injectable()`, `@Controller()`, `@Module()`. NestJS DI for all dependencies.
- **Drizzle ORM (rc4)** — use `drizzle-orm` with PostgreSQL 16. All queries via Drizzle query builder, NOT raw SQL. Migrations via `drizzle-kit rc4`.
- **PostgreSQL 16** — schemas: `public` (global tables) + `tenant_<id>` (per-tenant tables). No `tenant_id` columns — schema boundary is the isolation.
- **Zod 4** — DTO validation in controllers. Shared validation with frontend.
- **eslint** — run `npm run lint` (eslint --fix). NOT oxlint.
- **Jest** — unit tests (`*.spec.ts` alongside source) via Jest. NOT Vitest. E2E tests in `backend/test/` via supertest.

## Schema Isolation Rules

- `DrizzleSchemaService.forCurrentTenant()` for tenant-scoped queries.
- `DrizzleSchemaService.forPublic()` for global/public table queries.
- `DrizzleSchemaService.forSchema(name)` for cross-schema operations.
- `tenantId` from **JWT only** — never from body, params, or headers via `TenantContextInterceptor`.
- Cross-tenant resource reference → **404 Not Found** (never 403).
- SuperAdmin operates in `public` schema with unscoped repos, guarded by `requireRole('SuperAdmin')`.

## Repository Pattern

- **All DB access via repositories** in `backend/src/repositories/` — one file per entity.
- No direct Drizzle client usage outside repositories.
- Repositories use `forCurrentTenant()` or `forPublic()` appropriately.

## Validation

- Run `cd backend && npm run typecheck` (tsc --noEmit) before claiming work is complete.
- Run `cd backend && npm run lint` (eslint --fix).
- Run `cd backend && npm test` (Jest) to verify unit tests pass.
- Error shape: `{ "error": { "code": "...", "message": "..." } }` with codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.
