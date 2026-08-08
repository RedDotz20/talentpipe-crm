# Candidate Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the candidate profile as the single source of truth — candidates edit name/email/phone/skills/resume in Settings; apply pre-fills from profile; companies are view-only with UUID-based linking and immutable application snapshots.

**Architecture:** 
- Add `candidate_account_id` UUID FK to company `candidates` (replaces email link)
- Move resume to public `candidate_accounts` (single resume per candidate)
- Add immutable snapshot columns to `applications` (name, email, phone, applied_skill_ids)
- Remove company create + company resume upload endpoints
- Rewrite candidate Settings page as editable form; remove Skills page; fix apply flow

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL schema-per-company, MinIO (S3), React 19 + TanStack Router/Query, Mantine 9

---

## Global Constraints

- **Migration order:** schema.ts → template-schema.sql → migration → seed
- **No direct Drizzle outside repositories** — all DB via repository classes
- **Error shape:** `{ "error": { "code": "...", "message": "..." } }` — codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`
- **Company context:** `companyId` from JWT only; cross-company reference → 404
- **Commit tags:** `feat(m4): topic`
- **All tests must pass before completion** — `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`

---

## File Map

| Layer | Files to Create/Modify |
|-------|------------------------|
| **Schema** | `backend/src/database/schema.ts` — add columns, drop tables; `backend/drizzle/template-schema.sql` — same; new migration |
| **Repositories** | `candidate-account.repository.ts` (resume CRUD), `candidate.repository.ts` (UUID link), `application.repository.ts` (snapshot), `candidate-skill.repository.ts` (existing) |
| **Candidate Module** | `candidate-account.controller.ts` (PUT profile, POST resume, rewritten apply), `candidate-account.service.ts`, new DTOs (`profile-update.dto.ts`, `resume-upload.dto.ts`), `dto/apply.dto.ts` (update) |
| **Company Module** | `candidates.controller.ts` (remove create/upload), `candidates.service.ts` (read-by-UUID, resume proxy) |
| **Resumes Module** | `resumes.service.ts` (candidate key scheme), `resumes.controller.ts` (candidate-only), `storage.service.ts` (candidate-resumes path) |
| **Frontend Candidate** | `SettingsPage.tsx` (editable form), `JobSearchPage.tsx` (apply modal fix), `_candidate/routes` (remove skills), `candidateApi.ts` (new hooks), `hooks/useProfile.ts`, `hooks/useSkills.ts`, `hooks/useResume.ts`, `types/index.ts` |
| **Frontend Company** | `CandidateProfile.tsx` (remove ResumeUploadInput), `useCandidates.ts` (remove create/upload hooks), `candidatesApi.ts` |
| **Tests** | Backend service specs for new/changed logic |

---

## Task Breakdown

### Task 1: Database Schema & Migration

**Files:**
- Create: `backend/drizzle/20260804_<timestamp>_candidate_profile_redesign/migration.sql`
- Modify: `backend/src/database/schema.ts` (lines 97-160, 244-274)
- Modify: `backend/drizzle/template-schema.sql` (candidates, applications, remove resumes/resume_skills)

**Interfaces:**
- Produces: New columns on `candidate_accounts`, `candidates`, `applications`; removed `resumes`, `resume_skills` tables

```bash
# Step 1: Update schema.ts
# Add to candidate_accounts (around line 244-252):
#   resumeFileUrl: varchar('resume_file_url', { length: 512 }),
#   resumeUploadedAt: timestamp('resume_uploaded_at', { withTimezone: true }),

# Add to candidates (around line 97-109):
#   candidateAccountId: uuid('candidate_account_id').references(() => candidateAccounts.id, { onDelete: 'set null' }),

# Add to applications (around line 123-145):
#   candidateName: varchar('candidate_name', { length: 255 }),
#   candidateEmail: varchar('candidate_email', { length: 255 }),
#   candidatePhone: varchar('candidate_phone', { length: 50 }),
#   appliedSkillIds: jsonb('applied_skill_ids'),

# Remove resumes table (lines 147-160) and resumeSkills table (lines 162-176)

# Step 2: Update template-schema.sql with same changes
# Step 3: Create migration file

# Step 4: Run migration manually (psql) and verify
# Step 5: Run seed to ensure dev data works
```

- [ ] **Step 1: Update schema.ts** — add columns, remove tables
```typescript
// candidate_accounts additions (after line 251):
resumeFileUrl: varchar('resume_file_url', { length: 512 }),
resumeUploadedAt: timestamp('resume_uploaded_at', { withTimezone: true }),

// candidates addition (after line 103):
candidateAccountId: uuid('candidate_account_id')
  .references(() => candidateAccounts.id, { onDelete: 'set null' }),

// applications additions (after line 136):
candidateName: varchar('candidate_name', { length: 255 }),
candidateEmail: varchar('candidate_email', { length: 255 }),
candidatePhone: varchar('candidate_phone', { length: 50 }),
appliedSkillIds: jsonb('applied_skill_ids'),

// Remove resumes and resumeSkills table definitions entirely
```

- [ ] **Step 2: Update template-schema.sql** — mirror schema.ts changes
- [ ] **Step 3: Create migration file** (drizzle-kit generate or manual)
- [ ] **Step 4: Apply migration to dev DB** (`psql -f migration.sql`)
- [ ] **Step 5: Run seed** (`npm run seed`) — verify 3 accounts work
- [ ] **Step 6: Run typecheck** (`npm run typecheck`)
- [ ] **Step 7: Commit**

```bash
git add backend/src/database/schema.ts backend/drizzle/template-schema.sql backend/drizzle/20260804_*/migration.sql
git commit -m "feat(m4): schema changes for candidate profile redesign"
```

---

### Task 2: Candidate Account Repository — Resume + Profile

**Files:**
- Modify: `backend/src/repositories/candidate-account.repository.ts` (add resume + profile update methods)
- Test: `backend/src/repositories/candidate-account.repository.spec.ts`

**Interfaces:**
- Consumes: `candidateAccounts` table from schema
- Produces: `updateProfile(id, data)`, `getProfile(id)`, `uploadResume(id, fileUrl)`, `getResume(id)`, `removeResume(id)`

```typescript
// New methods in CandidateAccountRepository:
async updateProfile(id: string, data: { firstName?: string; lastName?: string; email?: string; phone?: string }) {
  return this.withDb('public', async (db) => {
    const rows = await db.update(candidateAccounts).set(data).where(eq(candidateAccounts.id, id)).returning().execute();
    return rows[0] ?? null;
  });
}

async uploadResume(id: string, fileUrl: string) {
  return this.withDb('public', async (db) => {
    const rows = await db.update(candidateAccounts)
      .set({ resumeFileUrl: fileUrl, resumeUploadedAt: new Date() })
      .where(eq(candidateAccounts.id, id))
      .returning().execute();
    return rows[0] ?? null;
  });
}

async removeResume(id: string) {
  return this.withDb('public', async (db) => {
    const rows = await db.update(candidateAccounts)
      .set({ resumeFileUrl: null, resumeUploadedAt: null })
      .where(eq(candidateAccounts.id, id))
      .returning().execute();
    return rows[0] ?? null;
  });
}
```

- [ ] **Step 1: Write failing tests** in `candidate-account.repository.spec.ts`
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement methods** in `candidate-account.repository.ts`
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Run full test suite**
- [ ] **Step 6: Commit**

---

### Task 3: Candidate Repository — UUID Link

**Files:**
- Modify: `backend/src/repositories/candidate.repository.ts` (add findByAccountId, update with UUID)
- Test: `backend/src/repositories/candidate.repository.spec.ts`

**Interfaces:**
- Consumes: `candidates` table with new `candidateAccountId`
- Produces: `findByAccountId(accountId, schema)`, `createFromAccount(accountId, data, schema)`

```typescript
async findByAccountId(accountId: string, schema = 'current') {
  return this.withDb(schema, async (db) => {
    const rows = await db.select().from(candidates).where(eq(candidates.candidateAccountId, accountId)).limit(1).execute();
    return rows[0] ?? null;
  });
}

async createFromAccount(accountId: string, data: { name: string; email: string; phone?: string }, schema = 'current') {
  return this.withDb(schema, async (db) => {
    const rows = await db.insert(candidates).values({ ...data, candidateAccountId: accountId }).returning().execute();
    return rows[0];
  });
}
```

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement methods**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

---

### Task 4: Application Repository — Snapshot Columns

**Files:**
- Modify: `backend/src/repositories/application.repository.ts` (update create, findById, selectAppRow)
- Test: `backend/src/repositories/application.repository.spec.ts`

**Interfaces:**
- Consumes: `applications` table with snapshot columns
- Produces: `create` includes snapshot fields; `findById` returns them

```typescript
// Update selectAppRow (line ~14):
const selectAppRow = {
  // ...existing fields
  candidateName: applications.candidateName,
  candidateEmail: applications.candidateEmail,
  candidatePhone: applications.candidatePhone,
  appliedSkillIds: applications.appliedSkillIds,
  matchScore: applications.matchScore,
};

// Update create method signature:
async create(data: { 
  candidateId: string; 
  jobPostingId: string; 
  currentStageId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string | null;
  appliedSkillIds: string[];
  matchScore: number;
}, schema = 'current') { ... }
```

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement changes**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 4: Commit**

---

### Task 5: Candidate Account Service — Profile, Resume, Apply

**Files:**
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts` (rewrite apply, add profile/resume methods)
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts` (new endpoints)
- Create: `backend/src/modules/candidate-account/dto/profile-update.dto.ts`
- Create: `backend/src/modules/candidate-account/dto/resume-upload.dto.ts`
- Test: `backend/src/modules/candidate-account/candidate-account.service.spec.ts`

**Interfaces:**
- `getProfile(userId)` → returns profile + skills + resume
- `updateProfile(userId, dto)` → validates email uniqueness, updates candidate_accounts
- `uploadResume(userId, file)` → stores to MinIO (candidate-resumes/{userId}/...), updates candidate_accounts
- `removeResume(userId)` → deletes S3 object, clears fields
- `apply(userId, companyId, jobId, { phone?, skillIds?, coverLetter? })` → resolves/creates company candidate via UUID, snapshots identity + skills, computes matchScore, inserts application + index

```typescript
// Key apply logic changes:
async apply(candidateAccountId: string, companyId: string, jobId: string, dto: ApplyJobDto) {
  const schemaName = `company_${companyId}`;
  
  // 1. Load candidate account (public)
  const account = await this.candidateAccountRepo.findById(candidateAccountId);
  if (!account) throw new NotFoundException('Candidate not found');
  
  // 2. Load job from index
  const job = await this.jobListingsIndexRepo.findById(jobId, 'public');
  if (!job) throw new NotFoundException('Job not found');
  
  // 3. Resolve or create company candidate by candidate_account_id
  let candidate = await this.candidateRepo.findByAccountId(candidateAccountId, schemaName);
  if (!candidate) {
    candidate = await this.candidateRepo.createFromAccount(candidateAccountId, {
      name: `${account.firstName} ${account.lastName}`,
      email: account.email,
      phone: dto.phone ?? account.phone,
    }, schemaName);
  } else {
    // Update snapshot fields on company candidate (name/email/phone from profile)
    await this.candidateRepo.update(candidate.id, {
      name: `${account.firstName} ${account.lastName}`,
      email: account.email,
      phone: dto.phone ?? account.phone,
    }, schemaName);
  }
  
  // 4. Resolve skill IDs for match scoring (dto.skillIds || profile skills)
  const candidateSkillIds = dto.skillIds ?? await this.candidateSkillRepo.findByCandidateAccountId(candidateAccountId);
  
  // 5. Get job required skills
  const requiredSkillIds = await this.jobPostingRepo.getRequiredSkillIds(jobId, schemaName);
  
  // 6. Compute match score
  const matchScore = this.skillMatching.computeScore(requiredSkillIds, candidateSkillIds);
  
  // 7. Create application with snapshot
  const firstStage = await this.pipelineStageRepo.getFirstStage(schemaName);
  if (!firstStage) throw new NotFoundException('No pipeline stage');
  
  const application = await this.applicationRepo.create({
    candidateId: candidate.id,
    jobPostingId: jobId,
    currentStageId: firstStage.id,
    candidateName: `${account.firstName} ${account.lastName}`,
    candidateEmail: account.email,
    candidatePhone: dto.phone ?? account.phone,
    appliedSkillIds: candidateSkillIds,
    matchScore,
  }, schemaName);
  
  // 8. Check duplicate
  if (!application) throw new ConflictException('You already applied to this application.');
  
  // 9. Index for candidate dashboard
  await this.candidateApplicationsIndexRepo.create({
    candidateAccountId,
    companyId,
    jobPostingId: jobId,
    applicationId: application.id,
    jobTitle: job.title,
  }, 'public');
  
  return { applicationId: application.id };
}
```

- [ ] **Step 1: Write failing tests** (profile update, resume upload, apply with snapshot, duplicate apply, email conflict)
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement service methods + controller endpoints**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Run full test suite**
- [ ] **Step 6: Commit**

---

### Task 6: Company Candidates Module — Remove Create/Upload, Read-Only via UUID

**Files:**
- Modify: `backend/src/modules/candidates/candidates.controller.ts` (remove POST /candidates, POST /candidates/:candidateId/resume)
- Modify: `backend/src/modules/candidates/candidates.service.ts` (findByAccountId, getOne via UUID)
- Test: `backend/src/modules/candidates/candidates.service.spec.ts`

**Interfaces:**
- `GET /candidates` — list (unchanged)
- `GET /candidates/:id` — read-only, joins public profile/skills/resume via `candidate_account_id`
- `GET /candidates/:candidateId/resume` — returns candidate's public profile resume

```typescript
// In CandidatesService.getOne:
async getOne(id: string) {
  const candidate = await this.candidateRepo.findById(id);
  if (!candidate) throw new NotFoundException('Candidate not found');
  
  // Resolve via UUID link
  const account = candidate.candidateAccountId 
    ? await this.candidateAccountRepo.findById(candidate.candidateAccountId, 'public')
    : await this.candidateAccountRepo.findByEmail(candidate.email, 'public');
  
  const skills = account ? await this.candidateSkillRepo.findByCandidateAccountId(account.id, 'public') : [];
  const resume = account ? { fileUrl: account.resumeFileUrl, uploadedAt: account.resumeUploadedAt } : null;
  
  const applications = await this.applicationRepo.findByCandidateId(id);
  
  return { ...candidate, skills, resume, applications };
}
```

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement changes**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

---

### Task 7: Resumes Service — Candidate Key Scheme

**Files:**
- Modify: `backend/src/modules/resumes/resumes.service.ts` (candidate upload key scheme)
- Modify: `backend/src/modules/common/storage/storage.service.ts` (candidate-resumes path)
- Test: `backend/src/modules/resumes/resumes.service.spec.ts`

**Interfaces:**
- `upload(candidateId, file)` in public context → MinIO key `candidate-resumes/{candidateId}/{uuid}.ext`

```typescript
// In ResumesService.upload:
async upload(candidateId: string, file: Express.Multer.File) {
  const companyId = this.companyContext.getCompanyId(); // 'public' for candidate
  const key = companyId === 'public' 
    ? `candidate-resumes/${candidateId}/${randomUUID()}.${ext}`
    : `companies/${companyId}/resumes/${candidateId}/${randomUUID()}.${ext}`;
  
  await this.storage.upload(key, file.buffer, file.mimetype);
  await this.resumeRepo.create({ candidateId, fileUrl: key });
  return this.get(candidateId);
}
```

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement changes**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

---

### Task 8: Frontend Candidate — Settings Page (Editable Profile + Skills + Resume)

**Files:**
- Modify: `frontend/src/features/candidate-portal/settings/SettingsPage.tsx` (full rewrite)
- Create: `frontend/src/features/candidate-portal/hooks/useProfile.ts` (updateProfile mutation)
- Create: `frontend/src/features/candidate-portal/hooks/useResume.ts` (upload/remove mutations)
- Modify: `frontend/src/features/candidate-portal/api/candidateApi.ts` (updateProfile, uploadResume, removeResume, expanded getProfile)
- Modify: `frontend/src/features/candidate-portal/types/index.ts` (Profile gains skills, resume)

**SettingsPage UI:**
- First Name, Last Name, Email, Phone — editable TextInputs
- Skills — MultiSelect with live selected chips (shows current selections)
- Resume — Dropzone showing current file + "Replace"/"Remove" actions
- Save button with loading/success/error states

```tsx
// SettingsPage.tsx structure:
const { data: profile } = useProfile();
const updateProfile = useUpdateProfile();
const uploadResume = useUploadResume();
const removeResume = useRemoveResume();

const handleSave = async () => {
  await updateProfile.mutateAsync({ firstName, lastName, email, phone });
  if (newSkillIds) await setSkills.mutateAsync(newSkillIds);
  // resume handled separately via upload
};
```

- [ ] **Step 1: Update Profile type** (add skills, resume)
- [ ] **Step 2: Add candidateApi methods** (updateProfile, uploadResume, removeResume, expanded getProfile)
- [ ] **Step 3: Add hooks** (useUpdateProfile, useUploadResume, useRemoveResume)
- [ ] **Step 4: Rewrite SettingsPage** with editable form + skills chips + resume dropzone
- [ ] **Step 5: Run frontend typecheck + lint + build**
- [ ] **Step 6: Commit**

---

### Task 9: Frontend Candidate — Remove Skills Page, Fix Apply Modal

**Files:**
- Delete: `frontend/src/routes/_candidate/skills.tsx`
- Modify: `frontend/src/routes/_candidate.tsx` (remove skills route)
- Modify: `frontend/src/features/candidate-portal/layout.tsx` (remove "Skills" navbar link)
- Modify: `frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx` (fix apply modal)

**Apply Modal Fixes:**
- Prefill from `useProfile()` (firstName, lastName, email read-only, phone, skills)
- Fix URL: `candidateApi.applyToJob(companyId, jobId, data)` — include companyId
- Send `{ phone, skillIds, coverLetter }` (email/name from profile)

```tsx
// JobSearchPage.tsx apply changes:
const openApplyModal = (job: Job) => {
  const profile = useProfileState.getState(); // or useProfile()
  setSelectedJobId(job.id);
  setApplyFirstName(profile.firstName);
  setApplyLastName(profile.lastName);
  setApplyEmail(profile.email); // read-only in UI
  setApplyPhone(profile.phone);
  setApplySkillIds(profile.skills?.map(s => s.id) ?? []);
  setApplyModalOpen(true);
};

const handleApply = () => {
  apply({ jobId: selectedJobId, data: { phone: applyPhone, skillIds: applySkillIds, coverLetter: applyCoverLetter } });
};
```

- [ ] **Step 1: Delete skills route file**
- [ ] **Step 2: Remove skills from _candidate routes + navbar**
- [ ] **Step 3: Fix JobSearchPage apply modal** (prefill, companyId in URL, send snapshot)
- [ ] **Step 4: Update candidateApi.applyToJob signature** to include companyId
- [ ] **Step 5: Run frontend typecheck + lint + build**
- [ ] **Step 6: Commit**

---

### Task 10: Frontend Company — Read-Only Candidate View

**Files:**
- Modify: `frontend/src/features/company/candidates/CandidateProfile.tsx` (remove ResumeUploadInput)
- Modify: `frontend/src/features/company/candidates/hooks/useCandidates.ts` (remove useCreateCandidate, useUploadResume)
- Test: Manual verification

**CandidateProfile.tsx:**
- Remove `<ResumeUploadInput candidateId={candidate.id} />` block
- Show resume as read-only link (from `resume.fileUrl`)
- Skills as read-only badges (already)
- Identity fields read-only (already)

- [ ] **Step 1: Remove ResumeUploadInput** from CandidateProfile
- [ ] **Step 2: Remove create/upload hooks** from useCandidates.ts
- [ ] **Step 3: Run frontend typecheck + lint + build**
- [ ] **Step 4: Commit**

---

### Task 11: Full Verification & Edge Cases

**Commands:**
```bash
cd backend && npm run typecheck && npm run lint && npm test
cd ../frontend && npm run typecheck && npm run lint && npm run build
```

**Manual smoke test (after starting backend + frontend):**
1. Sign in as candidate → Settings → edit name/phone/email → save → verify persisted
2. Settings → add skills via MultiSelect → see chips → save → verify skills in profile
3. Settings → upload resume (PDF) → see file link → replace → verify replaced
4. Dashboard → apply to job → prefill works → phone/skills editable → submit → success
5. Sign in as company → Candidates → click candidate → read-only profile, resume link, skills, applications
6. Duplicate apply → "You already applied to this application."
7. Email change → future applications use new email; past apps show old email (snapshot)

- [ ] **Step 1: Run all verification commands**
- [ ] **Step 2: Manual smoke test**
- [ ] **Step 3: Fix any failures**
- [ ] **Step 4: Final commit**

---

## Self-Review Checklist

- [ ] Spec coverage: Every requirement in design spec maps to a task
- [ ] Placeholder scan: No TBDs, all steps have exact code
- [ ] Type consistency: DTO names, method signatures, types match across tasks
- [ ] Migration order: schema.ts → template-schema.sql → migration → seed
- [ ] Test-first: Each backend task starts with failing tests

---

**Plan saved to:** `docs/superpowers/plans/2026-08-04-candidate-profile-redesign-plan.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints

**Which approach?**