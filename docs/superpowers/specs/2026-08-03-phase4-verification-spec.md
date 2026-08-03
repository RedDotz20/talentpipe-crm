# Phase 4 — Resume Storage & Manual Skill Matching Verification Spec

**Status:** Ready for verification
**Date:** 2026-08-03
**Milestone:** M4 (Resume + Skill Match) — Redesigned
**Related design:** `docs/superpowers/specs/2026-08-03-phase4-redesign-manual-skills.md`
**Supersedes:** Original verification spec for automated extraction

---

## 1. Verification prerequisites

- [ ] `docker compose up -d` — postgres + redis + minio healthy
- [ ] Backend migrations applied (including new `candidate_skills` table)
- [ ] Template schema updated (no `parsedText` in `resumes`)
- [ ] `cd backend && npm run seed` — seeded accounts exist
- [ ] `cd backend && npm run start:dev` — server running on :3000
- [ ] `cd frontend && npm run dev` — dev server on :5173
- [ ] Quick health check: `Invoke-WebRequest http://localhost:3000/api/health` → `200`

---

## 2. Automated verification

Run each from the repo root.

### Backend
```pwsh
cd backend
npm run typecheck   # expect: PASS
npm test            # expect: all tests PASS
npm run lint        # expect: clean (no errors)
```

### Frontend
```pwsh
cd frontend
npm run typecheck   # expect: PASS
npm run lint        # expect: clean (oxlint; 3 pre-existing react(only-export-components) warnings OK)
npm run build       # expect: PASS
```

### Infrastructure
```pwsh
docker compose up -d   # postgres + redis + minio healthy
```

---

## 3. Manual API smoke test

Requires a running backend and a seeded DB. Sign in as seeded org admin and candidate.

### 3.1 Sign in as Org Admin
```pwsh
$body = @{ email = 'admin@acme.com'; password = 'Admin123!' } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signin" -Method Post -Body $body -ContentType "application/json"
$orgToken = $r.data.accessToken
$orgHeaders = @{ Authorization = "Bearer $orgToken" }
```

**Expect:** `200`, body contains `data.accessToken`.

### 3.2 Sign in as Candidate
```pwsh
$body = @{ email = 'candidate@test.com'; password = 'Candidate123!' } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signin" -Method Post -Body $body -ContentType "application/json"
$candToken = $r.data.accessToken
$candHeaders = @{ Authorization = "Bearer $candToken" }
```

**Expect:** `200`, role = `Candidate`.

### 3.3 Candidate Skills CRUD
```pwsh
# Get skills (initially empty)
curl.exe -s -H "Authorization: Bearer $candToken" "http://localhost:3000/api/candidate/skills"

# Set skills (use seeded skill IDs - first get them)
$skills = (Invoke-RestMethod -Uri "http://localhost:3000/api/skills" -Headers $candHeaders).data
# Pick React, TypeScript, SQL skill IDs
$skillIds = ($skills | Where-Object { 'React','TypeScript','SQL' -contains $_.name } | Select-Object -ExpandProperty id) -join ','
$body = @{ skillIds = $skillIds.Split(',') } | ConvertTo-Json
curl.exe -s -X PUT -H "Authorization: Bearer $candToken" -H "Content-Type: application/json" -Body $body "http://localhost:3000/api/candidate/skills"

# Verify
curl.exe -s -H "Authorization: Bearer $candToken" "http://localhost:3000/api/candidate/skills"
```
**Expect:** Skills returned with correct names/categories.

### 3.4 Create a Job Posting with Required Skills (Org Admin)
```pwsh
# Get skill IDs for React, TypeScript, Kubernetes
$skills = (Invoke-RestMethod -Uri "http://localhost:3000/api/skills" -Headers $orgHeaders).data
$reqIds = ($skills | Where-Object { 'React','TypeScript','Kubernetes' -contains $_.name } | Select-Object -ExpandProperty id) -join ','

$body = @{
  title = "Senior Frontend Engineer"
  description = "We need React/TypeScript expertise"
  requiredSkillIds = $reqIds.Split(',')
} | ConvertTo-Json

$job = Invoke-RestMethod -Uri "http://localhost:3000/api/job-postings" -Method Post -Headers $orgHeaders -ContentType "application/json" -Body $body
$jobId = $job.data.id
```
**Expect:** Job created with required skills.

### 3.5 Apply as Candidate (using profile skills)
```pwsh
$applyBody = @{
  # No skillIds provided → should use profile skills (React, TypeScript, SQL)
} | ConvertTo-Json

$app = Invoke-RestMethod -Uri "http://localhost:3000/api/candidate/jobs/acme/$jobId/apply" -Method Post -Headers $candHeaders -ContentType "application/json" -Body $applyBody
$appId = $app.data.applicationId
```
**Expect:** `200`, application created. Match score should be `2/3 = 0.67` (React + TypeScript match, Kubernetes missing).

### 3.6 Apply with Skill Override
```pwsh
# Candidate adds Kubernetes for this specific application
$overrideBody = @{
  skillIds = ($skills | Where-Object { 'React','TypeScript','Kubernetes' -contains $_.name } | Select-Object -ExpandProperty id)
} | ConvertTo-Json

$app2 = Invoke-RestMethod -Uri "http://localhost:3000/api/candidate/jobs/acme/$jobId/apply" -Method Post -Headers $candHeaders -ContentType "application/json" -Body $overrideBody
```
**Expect:** Match score = `1.0` (all 3 required skills present).

### 3.7 Public Apply without Candidate Account
```pwsh
$publicBody = @{
  name = "Jane Public"
  email = "jane@public.com"
  # skillIds required for match score, or omit for 0
  skillIds = ($skills | Where-Object { 'React','SQL' -contains $_.name } | Select-Object -ExpandProperty id)
} | ConvertTo-Json

$pubApp = Invoke-RestMethod -Uri "http://localhost:3000/api/public/acme/jobs/$jobId/apply" -Method Post -ContentType "application/json" -Body $publicBody
```
**Expect:** Application created, match score = `2/3 = 0.67`.

### 3.8 Resume Upload (Storage Only)
```pwsh
# Create test PDF
cd backend; node -e "const PDFDoc=require('pdfkit');const d=new PDFDocument();const s=require('fs').createWriteStream('../test-resume.pdf');d.pipe(s);d.text('Senior React Developer');d.end();" ; cd ..

# Upload as Org Admin for a candidate
$cands = (Invoke-RestMethod -Uri "http://localhost:3000/api/candidates" -Headers $orgHeaders).data
$candidateId = ($cands | Select-Object -First 1).id

curl.exe -s -X POST -H "Authorization: Bearer $orgToken" `
  -F "file=@C:\Users\Carlos\Documents\Projects\talentpipe-crm\test-resume.pdf;type=application/pdf" `
  "http://localhost:3000/api/candidates/$candidateId/resume"
```
**Expect:** `200`, response contains `{ id, candidateId, fileUrl, uploadedAt }` — **no `parsedText`, no `skills`**.

```pwsh
# Read back
curl.exe -s -H "Authorization: Bearer $orgToken" "http://localhost:3000/api/candidates/$candidateId/resume"
```
**Expect:** Same minimal response.

### 3.9 Org Candidate Profile Includes Skills
```pwsh
curl.exe -s -H "Authorization: Bearer $orgToken" "http://localhost:3000/api/candidates/$candidateId"
```
**Expect:** `data.skills` array populated with candidate's profile skills (React, TypeScript, SQL).

### 3.10 Negative Cases
| Call | Expect |
|------|--------|
| `POST /candidate/skills` with invalid skill ID | `400` VALIDATION_ERROR |
| `POST /candidate/skills` without auth | `401` UNAUTHORIZED |
| `POST /candidates/:id/resume` with `.txt` file | `400` VALIDATION_ERROR |
| `POST /candidates/:id/resume` >10MB | `400` (multer limit) |
| `GET /candidates/:id/resume` non-existent candidate | `404` NOT_FOUND |
| Resume endpoints without auth | `401` UNAUTHORIZED |

### 3.11 MinIO Console
Open `http://localhost:9001` (minioadmin / minioadmin). Browse `resumes` bucket.

**Expect:** Object at `tenants/{tenantId}/resumes/{candidateId}/{uuid}.pdf`, matching `fileUrl` from API.

---

## 4. Manual UI smoke test

1. `cd backend && npm run start:dev` and `cd frontend && npm run dev`.
2. Open `http://localhost:5173`, sign in as `candidate@test.com` / `Candidate123!`.
3. Navigate to **Skills** (sidebar) → MultiSelect shows taxonomy skills → select React, TypeScript, SQL → Save → green toast.
4. Go to **Dashboard** → search for the job "Senior Frontend Engineer" → Apply.
5. Apply form prefilled with profile skills → Submit → success page.
6. Sign out, sign in as `admin@acme.com` / `Admin123!`.
7. Go to **Candidates** → open the candidate profile.
8. Verify: skill badges show React, TypeScript, SQL; resume shows file link only (no parsed text).
9. Go to **Pipeline** (`/org/pipeline`) → application card shows match score badge `67%` (yellow).
10. Reload candidate profile — skills + match scores persist.

---

## 5. Acceptance criteria

1. `npm run typecheck` + `npm test` + `npm run lint` pass in `backend/`.
2. `npm run typecheck` + `npm run lint` + `npm run build` pass in `frontend/`.
3. `GET/PUT /candidate/skills` works — candidate can manage their skill list.
4. Candidate apply without `skillIds` → uses profile skills → correct `matchScore`.
5. Candidate apply with `skillIds` override → uses override → correct `matchScore`.
6. Public apply with `skillIds` → correct `matchScore`; without → `0`.
7. `POST /candidates/:id/resume` stores file in MinIO; returns only `{ id, candidateId, fileUrl, uploadedAt }`.
8. `GET /candidates/:id/resume` returns same minimal metadata.
9. `GET /candidates/:id` (org) returns `skills` array from candidate's public profile.
10. Pipeline `ApplicationCard` and candidate profile applications table show correct `matchScore` badge.
11. No `pdf-parse`, `mammoth` in `backend/package.json`; no `parsedText` in DB or API responses.
12. Error shapes: 400/401/404 with `{ "error": { "code", "message" } }`.
13. Resume stored in MinIO under tenant-scoped server-generated key.

---

## 6. Cleanup after verification

- [ ] Delete `test-resume.pdf` from repo root.
- [ ] Verify no `pdf-parse`/`mammoth` in `node_modules` or `package.json`.
- [ ] Re-run `backend/npm run typecheck && npm test` to confirm green.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `candidate_skills` relation does not exist | Migration not applied. Run `drizzle-kit generate` + apply via psql. |
| Match score always 0 | Candidate skills not saved, or apply not using profile skills. Check `candidate_skills` table and apply service logic. |
| `skills` missing from org candidate profile | `CandidatesService.getOne` not joining `candidate_skills` via email. |
| Resume upload returns `parsedText`/`skills` | Old code not removed. Check `ResumesService.upload()` and `get()`. |
| `pdf-parse` error in logs | Dependency not uninstalled. Run `npm uninstall pdf-parse mammoth`. |