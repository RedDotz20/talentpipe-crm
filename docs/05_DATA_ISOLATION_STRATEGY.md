# TalentPipe — Data Isolation Strategy

**Purpose:** The single most important security spec — the 8-layer defense-in-depth that controls cross-company data access via **schema-per-company isolation** in PostgreSQL. Use this when implementing tenancy, schema provisioning, the schema-routed Drizzle client, and the CI isolation test suite. Authoritative isolation rules are mirrored in `00_PROJECT_INSTRUCTIONS.md` §7.

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

## Why This Is the Highest-Risk Part of the System

In a multi-company system, the most dangerous vulnerability class is one company accessing another company's data. The classic failure mode in shared-schema systems is a missing `WHERE company_id = X` clause. **This project eliminates that entire failure class** by using schema-per-company: each company's data lives in its own PostgreSQL schema, and queries are routed via `search_path`. It is structurally impossible for a query in schema A to see schema B's tables without explicit cross-schema qualification. The risk shifts from "forgot the WHERE clause" to "routed to the wrong schema" — which is caught by the next layer.

## Layered Defenses (Defense in Depth)

No single layer below is sufficient alone. The point is that a mistake in one layer is caught by the next.

### Layer 1 — Company identity comes from exactly one place: the JWT

`companyId` is a signed claim in the access token, set once at login. It is **never** read from the request body, query params, route params, or headers for any internal (non-SuperAdmin) route. A request that tries to pass `companyId` in its payload should have that field ignored, not merged in.

The `companyId` maps directly to a PostgreSQL schema name (e.g. `company_abc123`).

### Layer 2 — Request-scoped company context (removes "forgot to pass it" as a failure mode)

Instead of manually threading `companyId` through every function call (easy to forget one), use Node's built-in `AsyncLocalStorage` to bind it once per request:

```ts
// common/context/company-context.ts
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
  if (companyId === 'public') return 'public'; // SuperAdmin/candidate identity
  return `company_${companyId}`; // maps companyId to PG schema name
}

export function getCurrentUser(): CompanyContext {
  const ctx = asyncStorage.getStore();
  if (!ctx) throw new Error('No company context');
  return ctx;
}
```

```ts
// common/interceptors/company-context.interceptor.ts
@Injectable()
export class CompanyContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: CompanyContext }>();
    const user = request.user; // set by AuthGuard('jwt') after JWT verification

    const companyId =
      user?.role === 'SuperAdmin' || !user?.companyId ? 'public' : user.companyId;

    const ctx: CompanyContext = user
      ? { companyId, userId: user.userId, role: user.role }
      : { companyId: 'public', userId: '', role: 'anonymous' };

    return new Observable((subscriber) => {
      asyncStorage.run(ctx, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
```

Every repository method calls `getCompanyId()` (or `getSchema()`) internally rather than accepting it as a parameter from the caller — this means a service layer bug (forgetting to pass companyId) simply isn't possible, because nothing ever passes it manually in the first place.

### Layer 3 — Schema-routed Drizzle client

Instead of filtering by `companyId` in every query, the Drizzle client itself is wrapped to run in the correct schema context. Before any query executes, `search_path` is set to the company's schema:

```ts
// database/drizzle-schema.service.ts
@Injectable()
export class DrizzleSchemaService {
  constructor(@Inject(DRIZZLE_PROVIDER) private pool: Pool) {}

  async forCurrentCompany(): Promise<{ db: DrizzleDB; release: () => void }> {
    const schemaName = getSchema(); // throws if no context — Layer 2
    const client = await this.pool.connect();
    await client.query(`SET search_path TO "${schemaName}", public`);
    const db = drizzle({ client });
    return { db, release: () => client.release() };
  }

  async forSchema(schemaName: string): Promise<{ db: DrizzleDB; release: () => void }> {
    const client = await this.pool.connect();
    await client.query(`SET search_path TO "${schemaName}", public`);
    const db = drizzle({ client });
    return { db, release: () => client.release() };
  }

  async forPublic(): Promise<{ db: DrizzleDB; release: () => void }> {
    const client = await this.pool.connect();
    await client.query('SET search_path TO public');
    const db = drizzle({ client });
    return { db, release: () => client.release() };
  }
}
```

Every operation acquires a dedicated client from the shared pool, sets `search_path`, runs the query, then releases the client — no cross-request schema bleed.

```ts
// repositories/base.repository.ts
@Injectable()
export abstract class BaseRepository {
  constructor(protected readonly drizzleSchema: DrizzleSchemaService) {}

  protected async withDb<T>(
    schema: 'current' | 'public' | string,
    fn: (db: DrizzleDB) => Promise<T>,
  ): Promise<T> {
    const handle =
      schema === 'public'
        ? await this.drizzleSchema.forPublic()
        : schema === 'current'
          ? await this.drizzleSchema.forCurrentCompany()
          : await this.drizzleSchema.forSchema(schema);
    try {
      return await fn(handle.db);
    } finally {
      handle.release();
    }
  }
}
```

```ts
// repositories/job-postings.repository.ts
@Injectable()
export class JobPostingsRepository extends BaseRepository {
  async findById(id: string) {
    return this.withDb('current', (db) =>
      db.select().from(jobPostings)
        .where(eq(jobPostings.id, id))
        .then((rows) => rows[0] ?? null),
    );
    // No companyId filter needed — search_path already scopes to the company's schema
  }

  async list() {
    return this.withDb('current', (db) => db.select().from(jobPostings));
  }

  async create(data: NewJobPosting) {
    return this.withDb('current', (db) => db.insert(jobPostings).values(data));
    // No companyId injected — the target schema IS the company boundary
  }
}
```

Code review rule: **any query that uses an explicit schema-qualified table name (e.g. `company_badguys.job_postings`) instead of relying on `search_path` is a red flag.** Controllers and services should only ever talk to repositories.

### Layer 4 — PostgreSQL schema boundary (the physical isolation)

This is the strongest layer: each company has its own PostgreSQL schema. Schema A's tables are **completely invisible** to queries running in schema B. This is not an application filter — it's a database namespace guarantee.

- On company signup, the system provisions a new schema by cloning the `template` schema (`backend/drizzle/template-schema.sql`): `CREATE SCHEMA company_abc123; CREATE TABLE company_abc123.job_postings (LIKE template.job_postings INCLUDING ALL);` (see `CompanyProvisioningService`)
- The company's schema name is never exposed to the client. It's derived server-side from the JWT's `companyId` claim.
- Cross-schema access (e.g. SuperAdmin reporting) must be explicitly schema-qualified and is only possible from code paths that bypass company routing.

### Layer 5 — Post-fetch assertion (standard not-found, not company isolation)

With schema-per-company, a post-fetch company check is unnecessary — the schema boundary already prevents cross-company access. Still use a standard not-found guard for valid lookups of non-existent resources:

```ts
function assertFound<T>(row: T | null): T {
  if (!row) throw new NotFoundError();
  return row;
}
```

### Public careers reads and authenticated candidate writes

Public careers requests have no JWT and therefore run in the public context, but they are not cross-company queries. `GET /public/:companySlug/jobs` resolves the slug through `public.companies` and filters `public.job_listings_index` by that company ID and `status = 'open'`. `GET /public/:companySlug/jobs/:id` performs the same index check, then reads required skills from the explicitly resolved `company_<id>` schema and the shared public skill taxonomy. Unknown, draft, closed, and **suspended-company** jobs return `404` (a suspended company's careers pages disappear from the outside).

There is no anonymous application endpoint. The frontend redirects an anonymous Apply action to unified sign-in/signup with a validated same-origin careers return path. Only a JWT-authenticated Candidate can call `/candidate/jobs/:companyId/:jobId/apply`; that service validates the public index entry before writing company application data and the public application index.

### Layer 6 — Namespacing outside the relational database

- **Redis keys:** always prefixed `company:{companyId}:...` for company-scoped cache/write features — prevents key collisions and makes it trivial to audit or flush one company's cache. Rate limiting is a Phase 6 concern.
- **S3/MinIO object keys:** generated server-side for candidate profile resumes or company application contexts; never accept a client-supplied storage path. Current candidate profile uploads use a generated `candidate-resumes/{candidateAccountId}/...` key, while company-scoped keys use `companies/{companyId}/...`.

### Layer 7 — Automated isolation test suite (release gate, not optional)

For every resource, one test that:
1. Creates two PostgreSQL schemas: `company_a` and `company_b`, each with the same table definitions
2. Seeds identical test data in both schemas
3. Authenticates as a user in Company A (which sets `search_path` to `company_a`)
4. Asserts that `list()` returns only Company A's row
5. Asserts that a query can never access Company B's schema without explicit qualification — it should throw a schema-not-found or return no results

```ts
describe('company isolation: job postings', () => {
  it('runs queries in the correct schema scope', async () => {
    // Given: schema_a and schema_b exist with identical tables
    // When: search_path is set to schema_a
    // Then: select from job_postings only returns schema_a's data
  });
  it('cannot access another company schema via search_path', async () => {
    // When: search_path is set to schema_a
    // Then: accessing schema_b's table throws or returns empty
  });
});
```

Run this suite in CI on every PR — treat a failure here as equivalent to a broken build, not a warning.

### Layer 8 — Audit logging for sensitive actions

Log `{ companyId, userId, action, resourceId, timestamp }` for actions like role changes, data exports, and company-settings changes. This is both a real security control and a good artifact to show in an interview — it demonstrates you thought about post-incident investigation, not just prevention.

## The SuperAdmin Exception — Handle It Explicitly, Not Implicitly

SuperAdmin operates outside the schema-per-company model. Do **not** route SuperAdmin requests through company-scoped repositories. Instead:

- SuperAdmin routes (`/platform/*`) use the global `RolesGuard` with `@Roles('SuperAdmin')`; the `CompanyContextInterceptor` maps a SuperAdmin (or company-less) identity to `companyId: 'public'`, and `getSchema()` returns `'public'` for it.
- SuperAdmin's Drizzle client operates in the `public` schema (via `withDb('public', ...)`) where cross-company data lives (the `Company` records, platform-wide `Skill` taxonomy, `super_admins`, audit logs).
- Repos that touch the `public` schema (e.g. `CompanyRepository`, `SuperAdminRepository`) are the platform/global ones — company-scoped repos always use `withDb('current', ...)`.
- Keep `/platform/*` in its own module, never nested in a company-scoped route group, so it's visually obvious in code review which code path you're in.
- **One sanctioned exception (M9):** platform usage stats (company detail `users`/`applications` counts and `GET /platform/stats` totals) read explicit `company_<id>` schemas via `forSchema` from `UsageRepository` — a deliberate, role-guarded cross-schema read. Everything else stays inside the schema-per-company boundary.

## Implementation Checklist

- [x] `companyId` extracted only from the verified JWT, never from client-supplied input
- [x] `AsyncLocalStorage`-based request context with `getSchema()` helper, applied via NestJS interceptor
- [x] `DrizzleSchemaService` wraps the Drizzle client to set `search_path` per request
- [x] All DB access goes through repository functions; no direct Drizzle client or schema-qualified queries outside `/repositories` (platform usage counts are the documented `forSchema` exception)
- [x] Company schema is provisioned on signup (template schema cloned or DDL executed)
- [x] Redis keys and S3 object keys consistently namespaced by `companyId`
- [x] One isolation test per resource across schemas, run in CI (release-gate e2e suites; CI added M9)
- [x] SuperAdmin routes bypass company context and operate in `public` schema with explicitly-named platform repositories (`modules/platform/`)
- [x] Audit logging in place for role changes, data exports, and company-settings changes (`common/audit/audit.service.ts`; data export has no call site yet)
