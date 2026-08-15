# Resume Preview + Upload Hardening — Design

**Date:** 2026-08-15
**Milestone:** M19 — Resume Preview & Upload Hardening
**Status:** Approved (brainstorming) — pending implementation plan

## 1. Overview

Candidates can upload a resume (PDF/DOCX, ≤10MB) and companies can already preview it
on the candidate detail page. Two gaps remain:

1. **Candidates cannot preview their own resume** — `SettingsPage` shows upload state but
   no View button, and there is no candidate-side file endpoint (`resumeFileUrl` is an S3
   key, not a browser-usable URL).
2. **Upload limit failures are silent** — a >10MB upload hits multer's `LIMIT_FILE_SIZE`
   with no graceful mapping (generic 500), and the frontend has no client-side pre-check.

This milestone adds candidate self-preview (new tab) and graceful 10MB/type enforcement
on both client and server. Company-side preview stays where it already works (candidate
detail page). **PDF renders in the tab; DOCX downloads on click** — browsers cannot render
`.docx` inline natively, no converter is added (`ponytail:` add LibreOffice conversion
only if previewing DOCX in-tab becomes a requirement).

## 2. Current State (verified in code)

| Surface | Endpoint | Status |
|---|---|---|
| Candidate upload | `POST /candidate/resume` (multer `fileSize: 10MB`) | Exists — type check via MIME + magic bytes (`%PDF-`, PK zip) in `ResumesService.assertSupportedType/Content` |
| Candidate remove | `DELETE /candidate/resume` | Exists |
| Company view | `GET /candidates/:candidateId/resume/file` — inline stream | Exists — `CandidateProfile.tsx` opens blob URL in new tab |
| Candidate self-view | — | **Missing** |
| >10MB error mapping | — | **Missing** (multer throws unhandled) |

Storage: MinIO/S3 bucket `resumes`, keys under `candidate-resumes/<accountId>/` (public
schema) or `companies/<companyId>/resumes/<accountId>/`. No schema changes needed.

## 3. Backend Changes

### 3.1 New endpoint: `GET /candidate/resume/file`

In `CandidateAccountController` (mirrors the company-side `ResumesController.downloadFile`):

- `@Get('resume/file')`, `AuthGuard('jwt')` + `CandidateAuthGuard`, `@SkipEnvelope()`.
- Resolves the current user's candidate account id, calls
  `resumesService.getFile(candidateAccountId)` (existing — returns buffer,
  contentType, `resume.pdf|docx` filename).
- Streams with `Content-Type: <file contentType>` and
  `Content-Disposition: inline; filename="resume.pdf"` — PDF previews in the tab,
  DOCX downloads (browser limitation, accepted).
- 404 `{ error: { code: 'NOT_FOUND', ... } }` when no resume exists (existing
  `NotFoundException` behavior).

### 3.2 Multer error handling in the existing exception filter

Extend the existing app-global `common/filters/api-exception.filter.ts` with a
`MulterError` branch (no new filter, no new error code, no registration change —
it already maps `PAYLOAD_TOO_LARGE` → 413 `VALIDATION_ERROR`):

- `LIMIT_FILE_SIZE` → **413** `{ error: { code: 'VALIDATION_ERROR', message: 'Resume must be 10MB or smaller' } }` (status + code already in the contract).
- Any other `MulterError` → 400 `VALIDATION_ERROR` (`File upload failed: <reason>`).
- Fixes the current unhandled 500 on oversized uploads; applies to this upload and any
  future file upload.

## 4. Frontend Changes (candidate Settings page only)

- `candidateApi.ts`: add `getResumeFile(): Promise<Blob>` → `GET /candidate/resume/file`
  with `responseType: 'blob'` (same pattern as `resumesApi.getFile`).
- `SettingsPage.tsx`:
  - **View button** (visible when `profile.resumeFileUrl` set, next to Remove): fetches
    the blob, `window.open(URL.createObjectURL(blob))`, revokes on a timeout.
  - **Client-side pre-check** on FileInput selection: type ∈ {`application/pdf`,
    `application/vnd...wordprocessingml.document`} and size ≤ 10MB → inline `Alert`
    on violation; upload button disabled until valid. Server remains the authority
    (both enforce; client check is UX only).
  - Show a server-error `Alert` when upload returns 413/400 (mutate error already
    surfaced — extend to render the message inline).

Company side untouched.

## 5. Testing

- **Unit:** `api-exception.filter.spec.ts` additions — `MulterError LIMIT_FILE_SIZE` →
  413 `VALIDATION_ERROR`, unknown `MulterError` → 400. `CandidateAccountController` spec:
  new route requires `CandidateAuthGuard` and calls `getFile`.
- **E2E (new `phase20.e2e-spec.ts`):** candidate uploads PDF → `GET /candidate/resume/file`
  → 200 + `application/pdf` + body matches uploaded bytes; upload >10MB → 413
  `VALIDATION_ERROR`; upload `.txt` → 400; company endpoint unchanged still returns the
  file for the same candidate.

## 6. Docs

- `07_API_ENDPOINT_DOCUMENTATION.md`: add `GET /candidate/resume/file`, note 413/400
  responses on `POST /candidate/resume`.
- `AGENTS.md`: M19 entry under Status + Build Order (`done ✅`), migration list unchanged
  (no DB migration in this milestone).

## 7. Out of Scope

- DOCX → PDF conversion for in-tab preview.
- Preview in applications/kanban/interviews/platform views.
- Resume parsing/anonymous apply (still in the "not yet built" list).
