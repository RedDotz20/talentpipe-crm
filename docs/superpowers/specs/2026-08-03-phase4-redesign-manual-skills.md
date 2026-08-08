# Phase 4 Redesign — Manual Candidate Skills

**Status:** Approved for implementation
**Date:** 2026-08-03
**Milestone:** M4 (Resume + Skill Match) — Redesigned
**Supersedes:** `docs/superpowers/plans/2026-08-03-phase4-resume-skill-matching.md`
**Related verification:** `docs/superpowers/specs/2026-08-03-phase4-verification-spec.md` (to be updated)

---

## 1. Problem Statement

The original Phase 4 design extracted text from uploaded PDFs/DOCXs, matched against a seeded skill taxonomy via substring search, and auto-populated `resume_skills` + recomputed application match scores. This approach has proven fragile:

- `pdf-parse` Buffer pool bug requires runtime workaround
- Text extraction quality varies wildly (formatting, columns, encoding)
- Substring matching produces false positives (e.g., "React" matches "reaction")
- Skills are candidate credentials, not company property — they belong in candidate's cross-company profile

**Decision:** Remove automated extraction/matching. Candidates manually declare skills in their profile; match score uses self-declared skills vs job required skills. Resume becomes pure storage for recruiter review.

---

## 2. Design Overview

### 2.1 Data Model Changes

| Location | Change |
|----------|--------|
| **Public schema** | Add `candidate_skills` table (cross-company, candidate-owned) |
| **Company schema (template)** | Remove `parsedText` from `resumes`; keep `resume_skills` table but don't auto-populate |
| **Public schema** | `skills` table unchanged (taxonomy source) |

**New table: `candidate_skills` (public schema)**
```sql
CREATE TABLE candidate_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_account_id UUID NOT NULL REFERENCES candidate_accounts(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_account_id, skill_id)
);
```

### 2.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PUBLIC SCHEMA                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ candidate_   │    │ candidate_   │    │     skills       │  │
│  │ accounts     │◄───│   skills     │───►│ (taxonomy, 40+)  │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         ▲                                          │            │
│         │                                          │            │
└─────────┼──────────────────────────────────────────┼────────────┘
          │                                          │
          ▼                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      COMPANY SCHEMA (per company)                    │
│  ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌────────────┐  │
│  │candidates│   │resumes   │   │applications│   │job_req_   │  │
│  │          │   │(storage) │   │           │   │skills      │  │
│  └──────────┘   └──────────┘   └───────────┘   └────────────┘  │
│         ▲                              │              ▲         │
│         │                              │              │         │
│         │         MATCH SCORE          │              │         │
│         └──────────────┬───────────────┘              │         │
│                        ▼                              │         │
│         candidate_skills (public) ◄──────────────────┘         │
│         (candidate's declared skills)                          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow

**Candidate Profile → Skills Management:**
1. Candidate signs in → `CandidatePlatform`
2. Navigates to "Skills" tab → `GET /candidate/skills`
3. MultiSelect from skills taxonomy → `PUT /candidate/skills` with `skillIds[]`
4. Stored in `public.candidate_skills`

**Apply Flow (Public or Authenticated):**
1. Candidate applies to job (`POST /public/:slug/jobs/:id/apply` or `POST /candidate/jobs/:companyId/:jobId/apply`)
2. Body optionally includes `skillIds[]` (override)
3. If `skillIds` provided → use those
4. If omitted → fetch candidate's profile skills from `candidate_skills`
5. Compute `matchScore = matched_required / total_required`
6. Create application with `matchScore`
7. Store applied skills in `candidate_applications_index.skill_ids` (JSON) for history

**Company View:**
1. Recruiter opens candidate profile → `GET /candidates/:id` (company schema)
2. Response includes candidate's skills (fetched from public `candidate_skills` via candidate account email linkage)
3. Pipeline/ApplicationCard shows `matchScore` from application record

---

## 3. API Changes

### 3.1 New Endpoints (Candidate Account Module)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/candidate/skills` | Candidate | List candidate's declared skills |
| `PUT` | `/candidate/skills` | Candidate | Replace all skills (body: `{ skillIds: string[] }`) |

### 3.2 Modified Endpoints

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/public/:companySlug/jobs/:id/apply` | Accept optional `skillIds[]`; if omitted, use candidate profile skills (requires candidate auth or email lookup) |
| `POST` | `/candidate/jobs/:companyId/:jobId/apply` | Accept optional `skillIds[]`; default to profile skills |
| `GET` | `/candidates/:id` (company) | Include `skills` array from candidate's public profile |

### 3.3 Removed Endpoints (Resumes Module)

| Method | Path | Reason |
|--------|------|--------|
| `POST` | `/candidates/:candidateId/resume` | Keep for storage only; no extraction |
| `GET` | `/candidates/:candidateId/resume` | Returns `{ fileUrl, uploadedAt }` only — no `parsedText`, no `skills` |

---

## 4. Backend Implementation Details

### 4.1 New Repository
`CandidateSkillRepository` (public schema):
```ts
findByCandidateAccountId(accountId: string): Promise<CandidateSkill[]>
replaceAll(accountId: string, skillIds: string[]): Promise<void>
delete(accountId: string, skillId: string): Promise<void>
```

### 4.2 CandidateAccountService Changes
- Add `getSkills(accountId)` → returns skill IDs + names + categories
- Add `setSkills(accountId, skillIds)` → `replaceAll()`

### 4.3 Apply Service Changes
- Both public and candidate apply endpoints:
  - If `skillIds` in body → use directly
  - Else if authenticated candidate → fetch from `candidate_skills`
  - Else (public apply without candidate account) → `skillIds` required or match score = 0
- Compute score via existing `SkillMatchingService.computeScore(required, candidate)`
- Persist used `skillIds` to `candidate_applications_index.skill_ids` (JSONB)

### 4.4 ResumesService Simplification
- Remove: `extractText()`, `extractSkills()`, `recomputeScores()`
- `upload()`: store file in MinIO, create `resumes` row with `fileUrl` only
- `get()`: return `{ id, candidateId, fileUrl, uploadedAt }`

### 4.5 CandidatesService (Company) Changes
- `getOne(id)`: join candidate → candidate_account (via email) → candidate_skills
- Return `{ ..., skills: [{ id, name, category }] }`

---

## 5. Frontend Implementation Details

### 5.1 Candidate Portal — Skills Page
**New route:** `/skills` (under `_candidate` layout)
- `useCandidateSkills` hook: `GET/PUT /candidate/skills`
- UI: Mantine MultiSelect searching `GET /skills?search=` (public skills taxonomy)
- Save → toast "Skills updated" → invalidate query

### 5.2 ApplyForm (Both Public & Candidate)
- Prefill skills from profile (candidate apply) or empty (public apply)
- Allow add/remove before submit
- Submit includes `skillIds` in body

### 5.3 CandidateProfile (Company View)
- Shows read-only skill badges from `candidate.skills`
- Resume card: only file link + upload date (no parsed text, no extracted skills)

### 5.4 Pipeline / ApplicationCard
- Keep `MatchScoreBadge` — reads `application.matchScore` (unchanged)

### 5.5 Removed Components
- `ResumeUploadInput` skill badges display
- `parsedText` preview in CandidateProfile

---

## 6. Migration Strategy

### 6.1 Database Migration
1. Add `candidate_skills` table to `schema.ts` (public)
2. Run `drizzle-kit generate` → new migration
3. Apply migration via psql
4. Update `template-schema.sql`: remove `parsedText` from `resumes`

### 6.2 Data Migration (Optional)
- For existing resumes with `resume_skills`: could backfill to `candidate_skills` via candidate email match
- Not required for MVP — candidates can re-declare skills

### 6.3 Code Removal
- Remove `pdf-parse`, `mammoth` dependencies
- Remove `extractText`, `extractSkills`, `recomputeScores` from `ResumesService`
- Remove `parsedText` from resume DTOs/responses
- Update tests

---

## 7. Acceptance Criteria

1. **Candidate Skills CRUD:** `GET/PUT /candidate/skills` works; persists to `candidate_skills`
2. **Apply with Profile Skills:** Authenticated candidate apply without `skillIds` → uses profile skills → correct `matchScore`
3. **Apply with Override:** Any apply with `skillIds` in body → uses those → correct `matchScore`
4. **Public Apply without Skills:** Public apply without `skillIds` → `matchScore = 0` (or 400 if skills required)
5. **Company Candidate Profile:** `GET /candidates/:id` returns `skills` array from candidate's public profile
6. **Resume Storage Only:** `POST /candidates/:id/resume` stores file in MinIO; `GET` returns only `fileUrl` + `uploadedAt`
7. **Pipeline Match Score:** `ApplicationCard` and candidate profile applications table show correct `matchScore`
8. **No Text Extraction:** No `pdf-parse`/`mammoth` in bundle; no `parsedText` in DB or API

---

## 8. Files to Modify

### Backend
- `backend/src/database/schema.ts` — add `candidateSkills`
- `backend/drizzle/template-schema.sql` — remove `parsedText` from `resumes`
- `backend/src/repositories/candidate-skill.repository.ts` (new)
- `backend/src/repositories/repositories.module.ts` — register new repo
- `backend/src/modules/candidate-account/` — add skills endpoints
- `backend/src/modules/public-apply/` — accept optional `skillIds`
- `backend/src/modules/resumes/resumes.service.ts` — simplify
- `backend/src/modules/resumes/resumes.controller.ts` — simplify response
- `backend/src/modules/candidates/candidates.service.ts` — join skills

### Frontend
- `frontend/src/features/candidate-portal/skills/` (new folder: `SkillsPage.tsx`, hooks)
- `frontend/src/routes/_candidate/skills.tsx` (new route)
- `frontend/src/features/candidate-portal/applications/ApplyForm.tsx` — prefill/override skills
- `frontend/src/features/company/candidates/CandidateProfile.tsx` — show skills, remove parsedText
- `frontend/src/api/candidateAccountApi.ts` — add skills endpoints

### Config
- `backend/package.json` — remove `pdf-parse`, `mammoth`, `@types/pdf-parse`, `@types/mammoth`

---

## 9. Verification Spec Updates

See updated `docs/superpowers/specs/2026-08-03-phase4-verification-spec.md` (to be rewritten).