# Candidate Profile Redesign — Design Spec

**Date:** 2026-08-04  
**Milestone:** M4 (Phase 4 redesign)  
**Status:** Approved for implementation

---

## Problem Statement

Current state (post-Phase 4 resume/skill redesign):
- Candidates have a read-only `/candidate/settings` page showing `firstName`, `lastName`, `email`, `phone`, `resumeUrl` (always empty)
- Skills are managed on a separate `/candidate/skills` page — a `MultiSelect` that saves and redirects to dashboard with no visual feedback of what was saved
- Candidates **cannot upload their own resume** — the only resume upload endpoint is org-facing (`POST /candidates/:candidateId/resume`, roles OrgAdmin/Recruiter)
- The org candidate detail page (`CandidateProfile.tsx`) shows a `<ResumeUploadInput>` when a candidate has no resume — **orgs can upload resumes for candidates**
- Apply flow is broken: frontend posts to `/candidate/jobs/${jobId}/apply` but backend expects `/candidate/jobs/:tenantId/:jobId/apply`; `ApplyData` includes fields (firstName, lastName, email, coverLetter, resumeUrl) the backend ignores
- Candidate ↔ tenant candidate link is **by email only** (no UUID FK); changing email would break all tenant links and the same person applying to multiple tenants creates duplicate candidate rows
- Applications are not immutable — they join live candidate data, so profile edits retroactively change past applications

Desired state:
1. **Candidate profile is the single source of truth** — name, email, phone, resume, skills all live on the public `candidate_accounts` row
2. **Candidate edits profile in Settings** — editable firstName, lastName, email, phone; skills with visible selected chips; resume upload/replace with clear feedback
3. **Apply pre-fills from profile** — modal shows editable phone + skills (email read-only), cover letter; on submit, a snapshot of identity + skills is frozen into the application
4. **Orgs are view-only** — remove org create-candidate and org resume-upload endpoints; orgs only see candidates who applied; org candidate view shows read-only profile, resume link, skills, applications
5. **Email is editable safely** — UUID link replaces email link; tenant `candidates` gets `candidate_account_id` column set on apply
6. **Past applications are frozen** — snapshot columns on `applications` (name, email, phone, applied skill IDs) so later profile edits never mutate history; matchScore already frozen at apply

---

## Data Model Changes

### Public Schema (candidate-owned)

| Table | Changes |
|-------|---------|
| `candidate_accounts` | Add `resume_file_url varchar(512)`, `resume_uploaded_at timestamp with time zone` — single resume per candidate |
| `candidate_skills` | Unchanged (already public, remains the skills source) |

### MinIO Storage
- Old key scheme: `tenants/{tenantId}/resumes/{candidateId}/{uuid}.ext`
- **New key scheme:** `candidate-resumes/{candidateAccountId}/{uuid}.ext` — candidate context has no tenant, so the S3 key uses the candidate's UUID directly

### Tenant Schema (org-owned, now a linked view)

| Table | Changes |
|-------|---------|
| `candidates` | Add `candidate_account_id uuid` — nullable (set on apply). This UUID replaces email as the cross-schema key. Removes duplicate-candidate bug and allows safe email edits. |
| `applications` | Add immutable snapshot columns: `candidate_name varchar`, `candidate_email varchar`, `candidate_phone varchar`, `applied_skill_ids jsonb`. Copied at apply time. `match_score` already frozen at apply. |
| `resumes` | **Removed** — org no longer uploads; resume lives publicly |
| `resume_skills` | **Removed** — same reason |

### Migration Notes
- Update `backend/src/database/schema.ts` with all column changes and table removals
- Update `backend/drizzle/template-schema.sql` to remove `resumes` and `resume_skills` and add `candidate_account_id` to `candidates` + snapshot columns to `applications`
- For dev: existing tenant schemas must be dropped/re-created or manually altered (documented in bootstrap)
- Template clone on signup will produce clean tenant schemas going forward

---

## Backend API Changes

### Candidate Module (`/candidate/*`, JWT + Candidate role)

| Endpoint | Change |
|----------|--------|
| `GET /candidate/profile` | Expand response: include `skills` (from `candidate_skills`), `resume` (fileUrl + uploadedAt from `candidate_accounts`) |
| `PUT /candidate/profile` | **New** — editable `firstName`, `lastName`, `email`, `phone` (reuses dormant `UpdateProfileSchema`). Validates email uniqueness in `candidate_accounts`. |
| `POST /candidate/resume` | **New** — multipart upload, reuses PDF/DOCX ≤10MB validation, replaces previous resume (deletes old S3 object). |
| `PUT /candidate/skills` | Kept, now called from Settings page instead of a separate page. |
| `POST /candidate/jobs/:tenantId/:jobId/apply` | **Rewritten**: anchors on JWT `userId` (candidate account UUID). Finds/creates tenant candidate via `candidate_account_id`. Snapshots identity fields + `skillIds` into application. Computes `matchScore` from applied skills. **Duplicate apply** → 409 "You already applied to this application." |

### Org Module (`/candidates/*`, JWT + OrgAdmin/Recruiter/HiringManager)

| Endpoint | Change |
|----------|--------|
| `POST /candidates` | **Removed** — orgs cannot manually create candidates |
| `POST /candidates/:candidateId/resume` | **Removed** — orgs cannot upload resumes |
| `GET /candidates` | Kept — read-only list |
| `GET /candidates/:id` | Kept — read-only detail, now resolves profile/skills/resume via `candidate_account_id` instead of email |
| `GET /candidates/:candidateId/resume` | Kept — now a **read-only proxy** returning the candidate's public profile resume (for the "View Resume" link) |

### Resumes Module
- `ResumesService` shrinks to candidate-owned upload/delete + storage helpers
- Org upload logic removed
- MinIO key generation updated for candidate context (uses `candidateAccountId` instead of `getTenantId()`)

---

## Frontend Changes

### Candidate Portal

| File/Component | Change |
|----------------|--------|
| `frontend/src/routes/_candidate.tsx` | Remove `/skills` route; remove "Skills" navbar link |
| `frontend/src/routes/_candidate/skills.tsx` | **Delete** (was inline SkillsPage) |
| `frontend/src/features/candidate-portal/settings/SettingsPage.tsx` | **Full rewrite** — editable form: First Name, Last Name, Email, Phone inputs + Skills `MultiSelect` with live selected chips + Resume `Dropzone` showing current file + Replace/Remove actions. "Save" button with success/error feedback. |
| `frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx` | Apply modal: prefill name/email/phone/skills from `useProfile` (email read-only); phone/skills editable per-application; fix broken apply URL to include `tenantId`; submit full snapshot. |
| `frontend/src/features/candidate-portal/hooks/` | New: `useUpdateProfile`, `useUploadResume`, `useRemoveResume` |
| `frontend/src/features/candidate-portal/types/index.ts` | `Profile` gains `skills: Skill[]`, `resume: { fileUrl, uploadedAt }` |
| `frontend/src/features/candidate-portal/api/candidateApi.ts` | Add `updateProfile`, `uploadResume`, `removeResume`, `getProfile` (expanded); fix `applyToJob` URL |

### Org Portal

| File/Component | Change |
|----------------|--------|
| `frontend/src/features/org/candidates/CandidateProfile.tsx` | Remove `<ResumeUploadInput>`; resume as read-only link; skills as read-only badges; identity read-only |
| `frontend/src/features/org/candidates/CandidateList.tsx` | Read-only (unchanged) |
| `frontend/src/features/org/candidates/hooks/useCandidates.ts` | Remove `useCreateCandidate`, `useUploadResume` |
| `frontend/src/api/candidatesApi.ts` | No new writes; Candidate type unchanged (resume/skills still present but now sourced from public account) |

---

## Apply Flow Detail

1. Candidate browses jobs (list includes `tenantId` from `job_listings_index`)
2. Clicks "Apply" → modal opens, prefilled from `useProfile`:
   - First Name, Last Name, Email (read-only), Phone (editable)
   - Skills `MultiSelect` prefilled from profile skills, editable
   - Cover Letter (optional)
3. Candidate submits → `candidateApi.applyToJob(jobId, data)` sends `{ phone, skillIds, coverLetter }` to `POST /candidate/jobs/:tenantId/:jobId/apply`
4. Backend:
   - Resolves candidate account from JWT `userId`
   - In tenant schema: finds/creates `candidates` row via `candidate_account_id` (UUID), sets `name/email/phone` from profile (or overrides)
   - Creates `applications` row with snapshot columns + `applied_skill_ids` + computed `match_score`
   - Adds to `candidate_applications_index`
5. Response: `{ applicationId }` — same as today
6. Candidate sees success, can view in Applications page

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Duplicate apply (same candidate, same job) | 409 "You already applied to this application." |
| Email update collides with existing `candidate_accounts.email` | 409 "Email already in use" |
| No profile data at apply time | Form still lets candidate fill required fields; apply works, profile remains empty until saved in Settings |
| Resume upload replaces old S3 object | Delete old object before/after new upload; no orphan files |
| No resume on profile | Org sees "No resume" state, read-only |
| Profile edit after apply | **Never** mutates past applications (snapshot columns); resume shows latest (single-resume model) |

---

## Testing Requirements

### Backend (Jest)
- `candidate-account.service.spec.ts`:
  - Profile update (incl. email change + uniqueness)
  - Resume upload/replace/remove
  - Apply snapshot immutability (editing profile later doesn't change existing application's snapshot fields)
  - Duplicate apply returns 409
  - Email conflict returns 409
- `candidates.service.spec.ts` (org):
  - GET endpoints work via UUID link
  - Removed endpoints return 404 or 403
  - Resume proxy returns public profile resume

### Frontend
- `npm run typecheck` — no errors
- `npm run lint` — no new warnings
- `npm run build` — succeeds

---

## File Inventory (Approximate)

| Category | Files to Touch |
|----------|----------------|
| Schema & Migrations | `backend/src/database/schema.ts`, `backend/drizzle/template-schema.sql`, new migration file |
| Repositories | `backend/src/repositories/candidate.repository.ts`, `candidate-account.repository.ts`, `application.repository.ts`, `candidate-skill.repository.ts`, new `candidate-resume.repository.ts` (if separate) |
| Candidate Module | `candidate-account.controller.ts`, `candidate-account.service.ts`, new `dto/profile-update.dto.ts`, `dto/resume-upload.dto.ts` |
| Org Module | `candidates.controller.ts`, `candidates.service.ts` (remove create/upload) |
| Resumes Module | `resumes.service.ts`, `resumes.controller.ts` (candidate-only) |
| Storage | `storage.service.ts` (candidate resume key scheme) |
| Frontend Candidate | `SettingsPage.tsx`, `JobSearchPage.tsx` (apply modal), `_candidate/routes`, `candidateApi.ts`, `hooks/*`, `types/index.ts` |
| Frontend Org | `CandidateProfile.tsx`, `useCandidates.ts`, `candidatesApi.ts` |
| Tests | Backend service specs for new/changed logic |

---

## Self-Review Checklist

- [x] Placeholder scan — no TBDs
- [x] Internal consistency — UUID link enables email edit; snapshot columns freeze applications; resume single + latest
- [x] Scope check — focused on M4 redesign, no unrelated features
- [x] Ambiguity check — duplicate apply, email conflict, resume snapshot decision all explicit