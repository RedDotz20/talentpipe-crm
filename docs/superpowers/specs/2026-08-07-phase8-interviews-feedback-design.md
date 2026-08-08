# Phase 8 — Interviews & Feedback (Design)

**Date:** 2026-08-07
**Status:** Approved
**Phase:** M8 — Interviews + Feedback

## Problem

Phase 8 of `docs/09_IMPLEMENTATION_GUIDE.md` requires interview scheduling and
feedback capture. The `interviews` and `interview_feedbacks` tables already
exist in `schema.ts`, the applied migrations, the template schema, and every
provisioned company — **no schema or migration work is needed**. What is missing
is the module, repositories, frontend feature, tests, and docs.

Two structural gaps surfaced during planning:

1. **No way to create Interviewer users.** User management is Phase 9; the seed
   creates only the CompanyAdmin. Phase 8 needs at least one Interviewer account to
   be demoable. **Decision: extend the seed** with `interviewer@acme.com`
   (role `Interviewer`) and have the e2e release gate create its own
   Interviewer users via raw SQL.
2. **No company user list endpoint.** The scheduler needs an interviewer picker.
   **Decision: add `GET /company/users`** (OA/R/HM) in a small `CompanyUsersController`
   living in the interviews module — it also serves Phase 9's user management.

## Scope

- `InterviewRepository` + `InterviewFeedbackRepository` (company-scoped).
- `InterviewsModule` with 5 endpoints (docs `07` surface): list, detail,
  schedule, reschedule/cancel (PATCH), submit feedback.
- Server-side Interviewer scoping: `GET /interviews` for the Interviewer role
  is always filtered to `interviewerId = current user` (FR-21), not just
  UI-hidden. Other roles see all company interviews, with an optional
  `?assignedToMe=true` filter.
- Scheduling auto-moves the application to the company's `Interview` stage by
  reusing `ApplicationsService.updateStage` (inherits candidate-index sync,
  dashboard-cache invalidation, and the Phase 7 stage-change notification).
- Feedback is 1:1 with the interview: second submission → `409 CONFLICT`;
  submission flips the interview `status` to `completed`.
- Frontend: interviews list page, scheduler modal, feedback form, live
  Interviews tab in the application detail drawer, `/company/interviews` route.
- Seed: `interviewer@acme.com` Interviewer user (new + existing companies).
- Unit tests + `backend/test/phase8.e2e-spec.ts` release gate.
- Docs: mark M8 ✅ across the doc set.

## Out of scope (flagged, not forgotten)

- Multiple interviewers per interview — PRD FR-19 says "one or more", but the
  ERD/schema model a single `interviewerId`; v1 follows the schema.
- Interview-reminder jobs on the Phase 7 queue (the worker's `deliver()` is the
  plug-in point when a mailer exists).
- Calendar sync, video links, candidate-side interview visibility.
- User management UI (Phase 9).

## Architecture

### 1. Repositories (company-scoped, `withDb('current')`)

`backend/src/repositories/interview.repository.ts`:

- `findAll(filters?: { interviewerId?: string; applicationId?: string })` —
  join `applications` (candidate name, job title) + `users` (interviewer
  email) + leftJoin `interview_feedbacks`; ordered by `scheduledAt`.
- `findById(id)` — same join, single row.
- `create({ applicationId, interviewerId, scheduledAt })`.
- `update(id, { scheduledAt?, status? })`.

`backend/src/repositories/interview-feedback.repository.ts`:

- `findByInterviewId(interviewId)` → row | null.
- `create({ interviewId, rating, comments })`.

`backend/src/repositories/user.repository.ts` — add `findAll()` (id, email,
role) for the interviewer picker.

All three registered in `RepositoriesModule`.

### 2. InterviewsModule

```
GET   /interviews              — OA,R,HM,IV  — IV role ⇒ own only (forced server-side)
GET   /interviews/:id          — OA,R,HM,IV  — 403 if IV not the assigned interviewer
POST  /interviews              — OA,R,HM     — { applicationId, interviewerId, scheduledAt }
PATCH /interviews/:id          — OA,R,HM     — { scheduledAt?, status? } (scheduled|completed|cancelled)
POST  /interviews/:id/feedback — IV only     — verifies assignment (403); { rating: 1-5, comments? }
GET   /company/users               — OA,R,HM     — company user list (CompanyUsersController)
```

Service rules:

- `schedule()`: 404 if application or interviewer user missing → create →
  find the company's `Interview` stage; if the application is not already there,
  call `ApplicationsService.updateStage(...)` (requires exporting
  `ApplicationsService` from `ApplicationsModule`).
- `submitFeedback()`: 404 unknown interview → 403 if caller is not the
  assigned interviewer (role is Interviewer by guard, but re-verified) → 409 if
  feedback already exists → create feedback → flip status to `completed`.
- DTOs via Zod: uuids, ISO datetime for `scheduledAt`, `rating` int 1–5
  required, `status` enum, `ZodValidationPipe` on all bodies.

### 3. Frontend

- `frontend/src/api/interviewsApi.ts` (list/get/create/update/submitFeedback)
  + `frontend/src/api/companyUsersApi.ts`; `queryKeys` additions.
- `frontend/src/features/company/interviews/`:
  - `InterviewListView.tsx` — table (candidate, job, date, interviewer, status
    badge) with role-aware actions: Interviewer ⇒ Feedback button; OA/R/HM ⇒
    Schedule + Reschedule/Cancel.
  - `InterviewScheduler.tsx` — modal: application select, interviewer select,
    native `datetime-local` input (no new Mantine package).
  - `InterviewFeedbackForm.tsx` — Mantine `Rating` (1–5) + comments.
- Route `frontend/src/routes/company/interviews.tsx` (nav link already present).
- `ApplicationDetailDrawer` Interviews tab: `ApplicationsService.getOne` now
  attaches `interviews` (via `InterviewRepository.findByApplicationId`),
  matching docs `07`'s "full application detail (notes, interviews)".

### 4. Seed

`seedCompany` additionally inserts `interviewer@acme.com` (role `Interviewer`) into
the company `users` + `user_emails`, for both new and existing companies.

### 5. Tests

- Unit: `interviews.service.spec.ts` — role-filtered list, 404s (missing
  application/interviewer/interview), 403 non-assigned feedback, 409 duplicate
  feedback, status flip.
- Release gate: `backend/test/phase8.e2e-spec.ts` (pattern of phase7):
  company signup → post/publish job → candidate signup + apply → insert 2
  Interviewer users via SQL → OA schedules → assert application auto-moved to
  Interview stage + candidate index status → assigned IV sees own interview
  only and submits feedback → non-assigned IV gets 403 → OA reschedules →
  403s per role → full cleanup.

### 6. Docs

Mark M8 complete: `09_IMPLEMENTATION_GUIDE.md` (Phase 8 ✅ + deltas),
`00_PROJECT_INSTRUCTIONS.md` (milestone 8, status legend),
`07_API_ENDPOINT_DOCUMENTATION.md` (+ `GET /company/users`),
`08_FRONTEND_COMPONENT_STRUCTURE.md`, `01_TALENTPIPE_PRD_SRS.md`
(FR-19/20/21), `AGENTS.md` (status + build order).

## Verification

`npm run typecheck` + `npm run lint` + `npm test` + `npm run test:e2e`
(Postgres + Redis up) on the backend; `npm run build` + `npm run lint` on the
frontend.
