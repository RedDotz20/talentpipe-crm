# TalentPipe — Product Requirements Document (PRD) & Software Requirements Specification (SRS)

**Purpose:** The product/requirements layer — what the system must do (goals, personas, scope, MoSCoW feature priorities, 26 functional requirements, 10 non-functional requirements). Use this to understand *intent* and to verify built features against FR/NFR. Authoritative requirements summary is mirrored in `00_PROJECT_INSTRUCTIONS.md` §2 and §10.

**Version:** 1.0
**Status:** Draft — portfolio project
**Author:** Carlos

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

---

# Part 1 — Product Requirements Document (PRD)

## 1. Overview

TalentPipe is a multi-tenant Applicant Tracking System (ATS) that lets recruiting teams at multiple companies each manage their own job postings, candidate pipelines, interviews, and hiring notes from a single platform — with each company's data fully isolated from every other's.

## 2. Problem Statement

Small and mid-sized companies without budget for enterprise ATS platforms (Greenhouse, Lever, etc.) typically run hiring through spreadsheets and email threads. This makes it hard to track where a candidate is in the pipeline, coordinate interviewer feedback, or measure hiring funnel health. TalentPipe solves this with a lightweight, self-serve ATS any company can sign up for and start using immediately.

## 3. Goals & Success Metrics

| Goal | Metric (as a demo/portfolio project, these are illustrative targets, not live production metrics) |
|---|---|
| A recruiter can move a candidate through the pipeline without leaving the app | Stage change completes in a single interaction (drag-and-drop) |
| Public job postings are discoverable and applyable without friction | Candidate can go from public job listing through sign-in/signup to submitted application in under 2 minutes |
| Tenant data is provably isolated | Zero cross-tenant data leakage under test |
| System protects future public/auth write endpoints | Phase 6 rate limiting can block scripted abuse without affecting public job browsing |
| Resume screening is faster than manual review | Skill match score is computed and visible within seconds of upload |

## 4. Target Users / Personas

- **Org Admin** — sets up the company account, manages recruiters, configures pipeline stages and plan settings.
- **Recruiter** — creates job postings, manages candidates through the pipeline, schedules interviews, leaves notes.
- **Hiring Manager** — reviews candidates for their open roles, leaves interview feedback, doesn't manage postings.
- **Interviewer** — sees only interviews they're assigned to, submits feedback forms.
- **Candidate** — creates an account, browses public or authenticated job listings, applies with a profile, and tracks applications.

## 5. Scope

**In scope (v1)**
- Multi-tenant company accounts with role-based access (Org Admin, Recruiter, Hiring Manager, Interviewer)
- Job posting CRUD with required-skills configuration
- Public, unauthenticated tenant careers browsing with Candidate-authenticated application submission
- Candidate/application records with a configurable pipeline (Kanban-style stage board)
- Candidate profile resume storage, manual skills, and skill-match scoring against a job posting's required skills
- Interview scheduling and feedback capture
- Notes on applications
- Redis-backed rate limiting on public/auth endpoints, caching on dashboard queries
- Background job processing for future notifications and other slow work; resume handling is storage-only in the current build
- Candidate accounts (signup/login, job search, applications history, bookmarks, profile) — **implemented**

**Out of scope (v1)**
- Real payment/billing integration (plans are static config, not billed)
- Native mobile apps
- Calendar sync (Google Calendar/Outlook) for interview scheduling — v1 stores time slots only
- AI/ML-based semantic resume matching (v1 uses keyword/taxonomy matching; noted as a future enhancement)
- Anonymous applications, anonymous resume upload, and resume text parsing are not supported in the current design

## 6. Feature List (MoSCoW)

| Priority | Feature |
|---|---|
| Must | Tenant signup, auth, RBAC |
| Must | Job posting CRUD |
| Must | Public careers page + apply flow |
| Must | Candidate/application pipeline with stage transitions |
| Must | Resume upload + skill-match scoring |
| Must | Rate limiting on public endpoints |
| Should | Interview scheduling + feedback |
| Should | Notes on applications |
| Should | Dashboard usage/analytics caching |
| Could | Email notifications on stage change |
| Could | Customizable pipeline stages per tenant |
| Won't (v1) | Billing integration, calendar sync |

> **Status:** Milestones 0–5 are implemented through the current Phase 5 branch: auth/tenancy/RBAC, CRUD, pipeline, candidate profile skills/resume storage, and tenant-specific public careers browsing with Candidate-only apply. See `09_IMPLEMENTATION_GUIDE.md` for exact progress.

## 7. Representative User Stories

- As an **Org Admin**, I want to invite recruiters to my company account so my team can collaborate on hiring.
- As a **Recruiter**, I want to post a job with required skills so the system can score incoming applicants against it.
- As a **Recruiter**, I want to drag a candidate from "Screening" to "Interview" so the pipeline reflects reality without extra clicks.
- As a **Hiring Manager**, I want to see interview feedback before making a decision so I'm not relying on verbal summaries.
- As a **Candidate**, I want to sign up for an account, browse open roles, maintain my skills and resume, and apply, so I can track my applications in one place. (Built.)
- As an **anonymous visitor**, I want to browse open jobs and be redirected to sign-in when I choose Apply, so every application is associated with a candidate profile.

## 8. Assumptions & Constraints

- Built and tested solo, with no external/real-world datasets — all demo data is self-generated (seed scripts, Faker.js).
- No real payment processor integration; plan tiers are illustrative.
- Candidate resume storage accepts PDF/DOCX files; parsing and scanned/image-only extraction are out of scope for the current implementation.
- Deployed to a single region; no multi-region/DR requirements for v1.

## 9. Release Plan (Milestones)

1. ✅ Auth, tenants, RBAC — **implemented** (M1)
2. ✅ Job postings + candidates (manual entry) — **implemented** (M2)
3. ✅ Application pipeline (Kanban) — **implemented** (M3)
4. ✅ Candidate resume storage + manual skill matching — **implemented** (M4)
5. ✅ Public careers listing/detail + Candidate-only apply (M5); ✅ Redis rate limiting/cache (M6)
6. ✅ Background jobs (BullMQ) + notifications (M7)
7. ✅ Interviews + feedback (M8)
8. ⬜ Containerization + CI/CD + deployment (M9–M10)

> Candidate accounts (signup/login, dashboard, applications, bookmarks, profile) were **built early** alongside the M1 restructure. See `00_PROJECT_INSTRUCTIONS.md` §10 and `09_IMPLEMENTATION_GUIDE.md` for status.

---

# Part 2 — Software Requirements Specification (SRS)

## 1. Introduction

### 1.1 Purpose
This SRS defines the functional and non-functional requirements for TalentPipe v1, a multi-tenant recruitment CRM/ATS, to guide implementation and serve as a reference for scoping and testing.

### 1.2 Scope
Covers backend (NestJS API), frontend (React + Mantine), data layer (PostgreSQL, Redis, S3/MinIO), and background processing (BullMQ), as defined in the accompanying architecture document.

### 1.3 Definitions / Acronyms
- **Tenant** — a company account; the unit of data isolation
- **ATS** — Applicant Tracking System
- **RBAC** — Role-Based Access Control
- **FR / NFR** — Functional Requirement / Non-Functional Requirement

## 2. Overall Description

### 2.1 Product Perspective
TalentPipe is a standalone, self-contained web application (not integrated with any third-party ATS or HR system in v1). It exposes both an authenticated internal API (for recruiters/admins) and a public, unauthenticated API (for the careers page).

### 2.2 User Classes
See PRD §4 (Org Admin, Recruiter, Hiring Manager, Interviewer, Candidate). Access is enforced by role at the API layer, and by tenant at the data layer.

### 2.3 Operating Environment
- Backend: NestJS (Node.js runtime), containerized via Docker
- Frontend: React + TypeScript SPA, served independently or via CDN
- Database: PostgreSQL 16+
- Cache/queue: Redis
- File storage: S3-compatible (AWS S3 in production, MinIO in local dev)
- Deployment target: containerized, deployable to Railway/Render or AWS (ECS/Fargate)

### 2.4 Constraints
- Single developer, solo-built and solo-tested — requirements are scoped to what's independently verifiable without external QA or real user data.
- No real billing/payment processor.

### 2.5 Assumptions & Dependencies
- Redis and PostgreSQL are available and reachable by the API at runtime.
- Resume files are text-extractable (native PDF/DOCX, not scanned images).

## 3. Functional Requirements

### 3.1 Authentication & Tenancy ✅ (implemented)

| ID | Requirement |
|---|---|
| FR-1 | The system shall allow a new user to sign up, which creates a new Tenant and an Org Admin user. (✅ `POST /api/auth/org/signup`) |
| FR-2 | The system shall issue JWT access + refresh tokens on login. (✅ `POST /api/auth/signin`, unified for org users and candidates) |
| FR-3 | The system shall derive `tenantId` for every authenticated request from the verified JWT, never from client-supplied parameters. (✅ `TenantContextInterceptor`) |
| FR-4 | The system shall reject any data access attempt where the resource's `tenantId` does not match the authenticated user's `tenantId`. (✅ schema-per-tenant → cross-tenant reference returns 404) |
| FR-5 | The system shall support role assignment (Org Admin, Recruiter, Hiring Manager, Interviewer) per user within a tenant. (✅ `RolesGuard`, `super_admins` + `users.role`) |

### 3.1b Candidate Accounts ✅ (implemented early)

| ID | Requirement |
|---|---|
| FR-1b | The system shall allow a candidate to create an account (`POST /api/auth/signup`) and sign in via the unified `POST /api/auth/signin`. |
| FR-2b | The system shall let a candidate browse open jobs across tenants (`GET /api/candidate/jobs` from `job_listings_index`), apply (`POST /api/candidate/jobs/:tenantId/:jobId/apply`), view application history, bookmark jobs, and manage their profile via `/api/candidate/*`. |

### 3.2 Job Postings

| ID | Requirement |
|---|---|
| FR-6 | The system shall allow Recruiters and Org Admins to create, edit, publish, and close job postings. |
| FR-7 | Each job posting shall support a list of required skills used for match scoring. |
| FR-8 | Published job postings shall appear on the tenant's public careers page; closed/draft postings shall not. |

### 3.3 Candidates & Applications

| ID | Requirement |
|---|---|
| FR-9 | The public careers page shall allow unauthenticated browsing, but Apply shall require a Candidate account and redirect anonymous visitors to unified sign-in/signup. ✅ M5 |
| FR-10 | Each application shall be associated with exactly one candidate and one job posting, scoped to a tenant. |
| FR-11 | The system shall support configurable, ordered pipeline stages per tenant (default: Applied → Screening → Interview → Offer → Hired/Rejected). |
| FR-12 | Recruiters and Hiring Managers shall be able to move an application between pipeline stages. |
| FR-13 | The system shall allow authorized users to attach free-text notes to an application. |

### 3.4 Resume Handling & Skill Matching

| ID | Requirement |
|---|---|
| FR-14 | The system shall allow an authenticated Candidate to upload a PDF/DOCX resume to their profile with size/type validation. ✅ M4 |
| FR-15 | The system shall allow an authenticated Candidate to manually declare skills from the shared taxonomy. ✅ M4 |
| FR-16 | The system shall compute a match score from the job's required skills and the Candidate's declared skills or per-application override. ✅ M4 |
| FR-17 | The system shall persist the skills used for an application so the score is explainable in the tenant pipeline. ✅ M4 |
| FR-18 | The system shall not create candidate, application, or resume records for anonymous visitors. ✅ M5 |

### 3.5 Interviews

| ID | Requirement |
|---|---|
| FR-19 | The system shall allow scheduling an interview for an application, assigned to one or more interviewers. ✅ M8 (v1: single `interviewerId` per interview per ERD/schema) |
| FR-20 | The system shall allow an assigned interviewer to submit structured feedback (rating + comments) after an interview. ✅ M8 |
| FR-21 | Interviewers shall only see interviews they are assigned to. ✅ M8 (server-side filter) |

### 3.6 Rate Limiting & Abuse Prevention

| ID | Requirement |
|---|---|
| FR-22 | Future public/authenticated write endpoints shall be rate-limited per IP/account within a configurable time window. ⬜ Planned M6 |
| FR-23 | The system shall rate-limit and temporarily lock out login attempts after a configurable number of consecutive failures per account/IP. |
| FR-24 | The system shall return HTTP 429 with a `Retry-After` header when a rate limit is exceeded. |

### 3.7 Background Processing

| ID | Requirement |
|---|---|
| FR-25 | Future slow processing shall be handled asynchronously via a background job queue; current resume handling is storage-only and match scoring is synchronous from declared skills. |
| FR-26 | The system shall send a notification (email, queued) when an application's pipeline stage changes. |

## 4. Non-Functional Requirements

| Category | ID | Requirement |
|---|---|---|
| Performance | NFR-1 | Authenticated dashboard list endpoints (job postings, applications) shall respond within 300ms under normal load, excluding cold-start. |
| Performance | NFR-2 | Public careers GET requests shall not perform resume processing; future background processing is reserved for explicitly introduced asynchronous work. |
| Security | NFR-3 | Passwords shall be stored hashed (bcrypt/argon2), never in plaintext. |
| Security | NFR-4 | API keys/tokens shall never be logged in plaintext. |
| Security | NFR-5 | Cross-tenant data access shall be blocked by multiple independent layers: request-scoped tenant context (not client-supplied), schema-per-tenant isolation (`search_path` routing per request, no `tenant_id` columns), and repository-level scoping — and shall be provably blocked by an automated test suite (one isolation test per tenant-scoped table) run in CI as a release gate. See `05_DATA_ISOLATION_STRATEGY.md` for the full specification. |
| Scalability | NFR-6 | Rate limit counters shall be stored in Redis (not in-process memory) so limits remain correct across multiple API instances. |
| Reliability | NFR-7 | A failed background job (e.g. resume parse failure) shall be retried a configurable number of times before being marked failed, without crashing the worker process. |
| Maintainability | NFR-8 | Each domain module shall separate route/controller, service, and data-access layers (controller → service → repository). |
| Usability | NFR-9 | The pipeline board shall reflect a stage change optimistically in the UI before backend confirmation, with rollback on failure. |
| Portability | NFR-10 | The full stack (API, PostgreSQL, Redis, object storage) shall run locally via a single `docker compose up`. |

## 5. External Interface Requirements

### 5.1 User Interfaces
- Internal dashboard (authenticated): job postings management, Kanban pipeline board, candidate profiles, interview scheduling, org/user settings
- Candidate portal (authenticated): job search, applications history, bookmarks, profile (✅ implemented)
- Public careers page (implemented M5): tenant-specific job listing and detail; Apply redirects anonymous visitors to Candidate sign-in/signup

### 5.2 API Interfaces
- RESTful JSON API served by the NestJS backend; internal routes require a Bearer JWT, public routes under `/public/*` do not
- See the accompanying architecture document for the representative endpoint list and module breakdown

### 5.3 Data Storage Interfaces
- PostgreSQL for all relational/tenant-scoped entities
- Redis for rate-limit counters, cache, and job queue
- S3-compatible storage for candidate resume files, referenced by metadata on `candidate_accounts`

## 6. Data Requirements

See the accompanying architecture document (`03_RECRUITMENT_ATS_ARCHITECTURE.md`) for the full entity model (Tenant, User, JobPosting, Candidate, Application, PipelineStage, CandidateAccount, CandidateSkill, Skill, Interview, Note) and multi-tenancy enforcement pattern.

## 7. Traceability Note

Every FR above maps to a module in the architecture document's module breakdown (e.g. FR-14–FR-18 → Resume + Skill Matching modules; FR-22–FR-24 → rate-limit middleware). When implementing, keep this SRS and the architecture doc side by side — this document defines *what* the system must do; the architecture doc defines *where* that logic lives.
