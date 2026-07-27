# Task 1 Report — Backend Restructure Auth Endpoints

## What I implemented

- **auth.controller.ts**: Restructured endpoints per the plan
  - `POST /auth/signup` → `POST /auth/org/signup` (calls `authService.orgSignup`)
  - `POST /auth/login` + `POST /auth/candidate/login` → `POST /auth/signin` (calls `authService.signin`)
  - `POST /auth/candidate/signup` → `POST /auth/signup` (calls `authService.candidateSignup`)
  - Removed `/auth/candidate/login` endpoint
  - Removed `CandidateLoginDto` import

- **auth.service.ts**: Renamed and restructured methods
  - `signup()` → `orgSignup()`
  - `login()` + `candidateLogin()` → unified `signin()` (tries org user first via `userEmails`, falls back to candidate lookup)
  - Removed `login()` and `candidateLogin()` methods
  - Removed `CandidateLoginDto` import

## What I tested

- `npm run typecheck` — passed (no errors)
- `npm run lint` — no new errors introduced (all errors are pre-existing across the codebase)

## Files changed

- `backend/src/modules/auth/auth.controller.ts` (55 lines, -9 net)
- `backend/src/modules/auth/auth.service.ts` (294 lines, -9 net)

## Self-review findings

- All pre-existing lint errors remain; no new ones introduced
- The unified `signin` correctly preserves the existing org user flow (via `userEmails` table + tenant schema lookup) before falling back to candidate login
- The `CandidateLoginDto` was removed from imports — it's no longer referenced anywhere

## Issues or concerns

- `candidate-auth.dto.ts` may still export `CandidateLoginDto` (dead code) — could clean up if desired but not required by this task
- The `generateCandidateTokens` method is not `async` in practice (no `await`) — pre-existing lint warning, not related to this change
