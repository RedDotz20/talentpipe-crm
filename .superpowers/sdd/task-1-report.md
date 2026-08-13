# Task 1 Report — Permission catalog constants

## Status: DONE

## What was implemented

Created `backend/src/common/permissions/permissions.ts` (verbatim from brief):

- `INTERNAL_ROLES` — 4 internal roles (`CompanyAdmin`, `Recruiter`, `HiringManager`, `Interviewer`) as a const tuple
- `InternalRole` type derived from the tuple
- `Permission` union type — all 17 permission keys
- `ALL_PERMISSIONS: Permission[]` — all 17 keys
- `ROLE_PERMISSIONS: Record<InternalRole, Permission[]>` — role default presets (CA: 17, Recruiter: 11, HM: 8, Interviewer: 3)
- `isInternalRole(role): role is InternalRole` type guard
- `isPermission(value): value is Permission` type guard
- `defaultPresetFor(role)` — returns a fresh copy of the preset (defensive: callers can mutate safely)
- `permissionsSubsetOfRole(role, permissions)` — type guard validating a permission list is a subset of a role's preset

Test file `backend/src/common/permissions/permissions.spec.ts` written verbatim from the brief (6 tests).

## TDD evidence

### RED

Command (from `backend/`): `npx jest src/common/permissions/permissions.spec.ts`

```
FAIL src/common/permissions/permissions.spec.ts
  ● Test suite failed to run
    src/common/permissions/permissions.spec.ts:8:8 - error TS2307: Cannot find module './permissions' or its corresponding type declarations.
    8 } from './permissions';
Test Suites: 1 failed, 1 total
Tests:       0 total
```

### GREEN

Command (from `backend/`): `npx jest src/common/permissions/permissions.spec.ts`

```
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

## Verification (full backend checks)

All run from `backend/`:

- `npm run typecheck` → PASS (tsc --noEmit, no output)
- `npm run lint` → PASS (eslint --fix, no errors)
- `npm test` → 33 suites passed, **305 tests passed** (299 existing + 6 new); the `[ApiExceptionFilter] Error: db exploded / Unhandled exception: weird` lines are intentional log output from `api-exception.filter.spec.ts` (it tests the error filter), not failures.

## Files changed

- `backend/src/common/permissions/permissions.ts` (new)
- `backend/src/common/permissions/permissions.spec.ts` (new)

Commit: `decfb3a feat(m18): permission catalog constants` — 2 files changed, 157 insertions. Verified via `git status` that only the `permissions/` directory was staged; pre-existing modified files (schema.ts, auth/*, etc.) were untouched.

## Self-review

- **Completeness vs brief:** All 9 required exports present and named exactly as specified; test file byte-for-byte per the brief; interfaces (produces) match.
- **Quality:** Pure functional module, no OOP, no dependencies, no side effects. Type guards give narrowing for later guard/endpoint tasks.
- **YAGNI:** Nothing extra added — no unused exports, no comments beyond what the code states.
- **Test hygiene:** 6 focused tests covering: catalog size/roles, subset+non-empty invariants, seniority ordering (CA > Recruiter > HM > Interviewer), CA management permissions, fresh-copy semantics, and both type guards. `permissionsSubsetOfRole` has no dedicated test — the brief's test file omits it; flagged as a possible follow-up if a later task wants coverage.

## Concerns

- None blocking. Minor notes:
  - Git reported benign `LF will be replaced by CRLF` warnings on commit (Windows autocrlf) — no content impact.
  - `permissionsSubsetOfRole` is untested (brief-specified test file doesn't cover it); it's exercised indirectly by nothing yet since no consumer exists until Task 2+.
