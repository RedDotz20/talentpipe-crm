# TalentPipe — Technical Overview

**Purpose:** Explains the tech stack and *why* each tool was chosen — doubles as an interview cheat sheet. Use this to justify architecture decisions and onboard to the stack. Authoritative stack summary is mirrored in `00_PROJECT_INSTRUCTIONS.md` §0 and §8.

What each technology is used for, and why it was chosen. Meant to double as an interview cheat sheet — you should be able to explain every row.

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

## Frontend

| Technology | Purpose | Why this choice |
|---|---|---|
| React + TypeScript | UI framework | Existing strength; type safety catches integration bugs early |
| Vite | Build tool / dev server | Fast HMR, minimal config, standard for modern React |
| Mantine | Component library | Fully-styled components (forms, tables, notifications, modals) — saves time vs building from scratch, still themeable for distinct visual identity |
| TanStack Query | Server state / caching | Handles loading/error/cache states for API calls; enables optimistic updates on the pipeline board (drag a card, UI updates instantly, rolls back on failure) |
| TanStack Router (or React Router) | Routing | Type-safe routes, supports role-gated route trees (`/platform/*` vs `/org/*`) |
| dnd-kit | Drag-and-drop | Powers the Kanban pipeline board — accessible, well-maintained, lighter than react-beautiful-dnd |
| Zod | Schema validation | Shared validation shape between frontend forms and backend request schemas — one source of truth for "what does a valid JobPosting look like" |

## Backend

| Technology | Purpose | Why this choice |
|---|---|---|---|
| NestJS | Web framework | Mature DI container, Guards, Interceptors, decorator-driven modules — provides structure at scale without rolling your own. Module-per-domain keeps concerns isolated. Unmatched ecosystem for large TypeScript APIs |
| Drizzle ORM | Database access | SQL-first, fully typed, lightweight — avoids the magic of heavier ORMs like Prisma while staying type-safe. First-class PostgreSQL support with `drizzle-orm/pg-core` |
| PostgreSQL | Primary database | Chosen specifically for **schema-per-tenant isolation**. PG natively supports multiple schemas within one database — MySQL's "schema" = "database", making schema-per-tenant far more complex there. Uses `search_path` for per-request schema routing with a single connection pool. Additional features: `pgcrypto`, `citext`, `ROW LEVEL SECURITY` as optional defense layers |
| Redis | Cache, rate limiting, queue backing | Three distinct roles: (1) rate-limit counters for public/auth endpoints, (2) short-TTL cache for expensive dashboard aggregate queries, (3) backing store for the BullMQ job queue |
| BullMQ | Background job queue | Moves slow work (resume text extraction, skill matching, email sending) off the request/response cycle |
| Zod | Request validation | Validates incoming request bodies at the route layer before they reach services |
| jsonwebtoken (or `jose`) | Auth tokens | Issues/verifies JWT access + refresh tokens |
| bcrypt / argon2 | Password hashing | Never store plaintext passwords; argon2 is the more modern recommendation if you want the stronger interview answer |
| `AsyncLocalStorage` (Node built-in) | Request-scoped tenant context | Binds `tenantId`/`userId`/`role` once per request so repositories read it internally instead of it being manually passed (and potentially forgotten) through every function call — see `05_DATA_ISOLATION_STRATEGY.md` |

## Storage & Infra

| Technology | Purpose | Why this choice |
|---|---|---|
| AWS S3 (prod) / MinIO (local) | Resume file storage | S3-compatible API means the same client code works in both environments; MinIO avoids needing a real AWS account during development |
| Docker + Docker Compose | Local dev environment, containerized deploys | One command (`docker compose up`) brings up app + PostgreSQL + Redis + MinIO consistently on any machine |
| GitHub Actions | CI/CD | Lint → test → build → (on main) build & push image; more recognizable to reviewers than a self-hosted Jenkins setup for a portfolio piece |
| Railway / Render, or AWS (ECS/Fargate + RDS + ElastiCache) | Deployment target | Railway/Render for fast, cheap full-stack deploys during active development; AWS as a stretch goal if you want the resume line and are comfortable with the added setup cost |

## Testing

| Technology | Purpose |
|---|---|
| Vitest / Jest | Unit + integration tests (skill-matching logic, tenant-isolation checks, pipeline stage transition rules) |
| Playwright | End-to-end test that also doubles as a demo script: sign up a tenant, post a job, submit a public application, drag it through pipeline stages |
| k6 or autocannon | Load-test the public apply endpoint to visually confirm rate limiting kicks in at the configured threshold |
| Faker.js | Generates synthetic seed data (candidates, applications, resumes-as-text) — no external dataset required |

## How Redis Is Actually Used (the feature most worth being able to explain in depth)

1. **Rate limiting** — `POST /public/:tenantSlug/jobs/:id/apply` and `POST /auth/login` are the two endpoints exposed to unauthenticated/adversarial traffic. Each request increments a counter keyed by IP (and account, for login) with a TTL matching the rate-limit window; once the counter exceeds the configured threshold, the request is rejected with `429`.
2. **Caching** — dashboard aggregate queries (e.g. "applications per pipeline stage" counts for the Kanban board header) are cached with a short TTL and invalidated on write, avoiding repeated expensive `GROUP BY` queries on every page load. Cache keys are always prefixed `tenant:{tenantId}:...` so tenants never collide on the same key and one tenant's cache can be flushed independently — see `05_DATA_ISOLATION_STRATEGY.md`.
3. **Job queue** — BullMQ uses Redis under the hood to store and dispatch background jobs (resume parsing, notification emails) to worker processes, decoupling slow work from the HTTP request cycle.

## Deliberate Scope Boundaries (know these for interviews)

- **No real billing integration** — plan tiers are static config, not connected to a payment processor. Explainable as "out of scope for a portfolio demo, but the tenant/plan model is designed to support it."
- **No ML-based resume matching in v1** — keyword/taxonomy matching only, chosen so the logic is fully self-testable without external models or labeled data. A clean "here's my v2 plan" answer.
- **Single-region deployment** — no multi-region/DR requirements; reasonable to state plainly rather than over-engineer for a solo portfolio project.
