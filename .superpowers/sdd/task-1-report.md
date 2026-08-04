# Task 1 Report: Lock the Phase 5b Route Boundary

## Status

DONE

## Commits

- `2ab3af0` - `fix(m5b): enforce candidate job visibility boundary`
- `32ce66e` - `fix(m5b): validate bookmarked job visibility`

## Implementation

- Added `AuthGuard('jwt')` and `CandidateAuthGuard` to candidate job list and detail routes.
- Changed candidate job detail, apply, and bookmark operations to use the existing open indexed-job lookup.
- Added candidate guard unit coverage.
- Added closed/draft/missing job visibility tests and a stale-bookmark regression test.

## Verification

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts src/common/guards/candidate-auth.guard.spec.ts
```

Result: 2 suites passed, 15 tests passed.

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts
```

Result: 1 suite passed, 13 tests passed.

```text
cd backend && npm run typecheck
```

Result: passed with no TypeScript errors.

## Concerns

None for Task 1. The generated `backend/tsconfig.tsbuildinfo` remains outside the commits.
