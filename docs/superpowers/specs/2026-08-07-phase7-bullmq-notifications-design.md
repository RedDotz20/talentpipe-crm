# Phase 7 — BullMQ Notifications Queue (Design)

**Date:** 2026-08-07
**Status:** Approved
**Phase:** M7 — BullMQ background jobs

## Problem

Phase 7 of `docs/09_IMPLEMENTATION_GUIDE.md` requires a BullMQ `notifications`
queue with a worker (3 attempts, exponential backoff), bootstrapped at app
boot, reusing Redis from the Phase 6 provider.

The only producer available in the current codebase is pipeline stage change
(`PATCH /applications/:id/stage`). Interview reminders become a second producer
in Phase 8. Resume parsing is explicitly **not** part of the product design
(`01_TALENTPIPE_PRD_SRS.md` L60/L94/L219; `09_IMPLEMENTATION_GUIDE.md` Phase 7
step 7.3) — the M7 milestone table in `00_PROJECT_INSTRUCTIONS.md` is stale and
gets a docs fix.

FR-26 says notifications are "email, queued", but no email infrastructure
exists (no SMTP, no provider) and email is ranked "Could" in MoSCoW. **Decision:
the worker delivers by writing an `audit_logs` row + logger output.** Email
plugs in later by extending the single `deliver()` method.

## Scope

- `notifications` BullMQ queue + Nest-managed worker (3 attempts, exponential
  backoff 2s), connection from a **dedicated** ioredis client.
- Producer: `ApplicationsService.updateStage` enqueues a stage-change
  notification (fire-and-forget; enqueue failure must never fail the request).
- Delivery: `public.audit_logs` row (`action = 'notification.stage_change'`) +
  log — the first real writer of the currently dead table.
- E2E release-gate test (`backend/test/phase7.e2e-spec.ts`).
- Docs cleanup for stale resume-parsing/BullMQ wording.

## Out of scope (flagged, not forgotten)

- Real email delivery (needs SMTP/provider — add when a mailer exists).
- Interview-reminder jobs (Phase 8 producer).
- Match-score recompute background job (ERD mention; revisit when job skill
  edits need rescoring).
- Notifications API / frontend (none specified in any doc).

## Architecture

### 1. Connection

BullMQ requires `maxRetriesPerRequest: null`; the Phase 6 provider
(`common/redis/redis.provider.ts`) uses `maxRetriesPerRequest: 1` and is shared
by the limiter + cache. Phase 7 uses **one dedicated ioredis connection** for
BullMQ, shared by the queue and the worker. The existing Redis module is
untouched.

### 2. New files

| File | Purpose |
|---|---|
| `src/queues/queues.ts` | Dedicated BullMQ connection, `notificationQueue` (`Queue('notifications')` with `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 100 }`), `STAGE_CHANGE_JOB` constant, payload type |
| `src/queues/queues.module.ts` | Provides `NOTIFICATION_QUEUE` token + `NotificationWorkerService`; `onModuleDestroy` closes worker → queue → connection (mirrors `RedisModule`) |
| `src/repositories/audit-log.repository.ts` | `create({ tenantId, userId, action, resourceId?, metadata? })` via `withDb('public', ...)`; registered in `RepositoriesModule` |
| `src/workers/notification.worker.service.ts` | Nest-managed worker: `onModuleInit` creates `new Worker('notifications', processor, { connection, concurrency: 1 })`; processor calls internal `deliver(payload)` → audit row + log. The future email swap point |

### 3. Producer — `ApplicationsService.updateStage`

After index sync + dashboard cache invalidation:

```ts
try {
  await this.notificationQueue.add(STAGE_CHANGE_JOB, {
    tenantId,
    actorUserId: getCurrentUser().userId, // AsyncLocalStorage — no signature change
    applicationId: id,
    jobPostingId: application.jobPostingId,
    fromStage: application.currentStageId,
    toStage: stage.name,
    recipientEmail: application.candidateEmail, // snapshot field (schema.ts:147)
  });
} catch (error) {
  this.logger.warn(...); // fire-and-forget
}
```

Payload is self-contained — the worker needs no tenant DB access, only
`public.audit_logs`.

### 4. Deviation from the guide

Guide step 7.4 (`src/workers/bootstrap.ts` called in `main.ts`) is skipped: a
Nest-managed module gets DI (AuditLogRepository) and lifecycle (close on
destroy) for free, and e2e apps boot the worker automatically. `main.ts`
unchanged.

## Testing

- **Unit:** extend `applications.service.spec.ts` — mock `NOTIFICATION_QUEUE`
  (`{ add: jest.fn() }`), assert enqueue payload and that enqueue failure still
  resolves. Small spec for the worker's `process` method (mock
  AuditLogRepository + fake job).
- **E2E release gate:** `backend/test/phase7.e2e-spec.ts` following the
  `phase5b-phase6` scaffold (tenant → candidate → open job → apply → PATCH
  stage), then poll `public.audit_logs` (≤5s) for
  `action='notification.stage_change' AND resource_id=<applicationId>`.
  Cleanup: delete audit rows for created tenants, `bull:notifications:*` Redis
  keys, plus the existing tenant/candidate cleanup.

## Verification

```
cd backend && npm run typecheck
cd backend && npm run lint
cd backend && npm test
cd backend && npm run test:e2e   # with docker compose up
```

## Commit

`git add -A && git commit -m "phase7: BullMQ notifications queue — stage-change audit delivery"`
