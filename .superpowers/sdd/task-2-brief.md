# Task 2: CandidateAuthGuard

## Context
This is a simple NestJS guard for protecting `/candidate/*` routes. It checks that the authenticated user has `role === 'Candidate'`.

## Files
- Create: `backend/src/shared/candidate-auth.guard.ts`

## Requirements
Create a NestJS `CanActivate` guard that:
- Extracts `request.user` from the execution context
- Returns `true` if `request.user?.role === 'Candidate'`
- Returns `false` otherwise

Follow the same pattern as the existing `roles.guard.ts` in the same directory.

## Deliverables
1. Created guard file at `backend/src/shared/candidate-auth.guard.ts`
2. Commit with message: `feat: add CandidateAuthGuard`

## Report file
Write to `.superpowers/sdd/task-2-report.md` with:
- Status (DONE / NEEDS_CONTEXT / BLOCKED)
- Commits made
- Verification that the file was created correctly
- Any concerns
