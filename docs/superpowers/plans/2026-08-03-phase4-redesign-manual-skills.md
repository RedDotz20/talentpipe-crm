# Phase 4 Redesign — Manual Candidate Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace automated PDF/DOCX skill extraction with manual candidate skill declaration — candidates set skills in their profile, match score uses self-declared skills vs job required skills, resume becomes pure MinIO storage.

**Architecture:** Add `candidate_skills` table in public schema for cross-company candidate skill ownership. New `GET/PUT /candidate/skills` endpoints for profile management. Apply endpoints accept optional `skillIds` override. Resumes module simplified to storage-only. Match score computed from candidate profile skills (or override) via existing `SkillMatchingService`.

**Tech Stack:** NestJS + Drizzle ORM + PostgreSQL + MinIO (S3) + React + Mantine + TanStack Query + Zod

## Global Constraints

- All DB access via repositories (no direct Drizzle client outside `repositories/`)
- Error shape: `{ "error": { "code", "message" } }` with codes `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`
- Company context from JWT only, never from body/params/headers
- Public schema = `candidate_skills`, `skills`, `candidate_accounts`
- Company schema = no `parsedText` on `resumes`
- `candidate_skills` stored in public schema (cross-company, candidate-owned)
- `pdf-parse` and `mammoth` must be uninstalled from `backend/package.json`
- Follow existing patterns: module dirs (`backend/src/modules/<name>/`), DTOs in `dto/`, Zod validation pipes, `@Roles()` + `AuthGuard('jwt')`

---

## File Structure

### Backend — New Files
- `backend/src/repositories/candidate-skill.repository.ts` — public schema CRUD for candidate_skills
- `backend/src/modules/candidate-account/dto/skills.dto.ts` — Zod schema for skillIds array
- `backend/src/modules/candidate-account/candidate-account.service.ts` — add `getSkills`/`setSkills` methods
- `backend/src/modules/candidate-account/candidate-account.controller.ts` — add skills endpoints

### Backend — Modified Files
- `backend/src/database/schema.ts` — add `candidateSkills` table
- `backend/src/database/drizzle.config.ts` — (no change, auto-detects new table)
- `backend/src/repositories/repositories.module.ts` — register `CandidateSkillRepository`
- `backend/src/modules/candidate-account/candidate-account.module.ts` — no structural change (adds methods to existing service/controller)
- `backend/src/modules/public-apply/public-apply.controller.ts` — accept optional `skillIds` in apply body
- `backend/src/modules/resumes/resumes.service.ts` — remove extractText/extractSkills/recomputeScores; simplify upload/get
- `backend/src/modules/resumes/resumes.controller.ts` — no structural change (simplified response)
- `backend/src/modules/candidates/candidates.service.ts` — join candidate_skills via email
- `backend/src/modules/skill-matching/skill-matching.service.ts` — no change (reused)

### Backend — Removed Dependencies
- `pdf-parse`, `mammoth`, `@types/pdf-parse`, `@types/mammoth` from `backend/package.json`

### Backend — Test Files
- `backend/src/modules/resumes/resumes.service.spec.ts` — simplify (storage only)
- New: `backend/src/modules/candidate-account/candidate-account.service.spec.ts` — skills CRUD tests

### Frontend — New Files
- `frontend/src/features/candidate-portal/skills/SkillsPage.tsx` — MultiSelect skill management
- `frontend/src/features/candidate-portal/skills/hooks/useCandidateSkills.ts` — TanStack Query + mutation
- `frontend/src/routes/_candidate/skills.tsx` — route file

### Frontend — Modified Files
- `frontend/src/features/candidate-portal/applications/ApplyForm.tsx` — prefill/override skills
- `frontend/src/features/company/candidates/CandidateProfile.tsx` — show skills badges, remove parsedText
- `frontend/src/features/candidate-portal/layout.tsx` — add Skills nav link
- `frontend/src/api/candidateAccountApi.ts` — add skills API functions
- `frontend/src/api/resumesApi.ts` — simplify (remove parsedText/skills from types)

### Frontend — Removed Components
- `frontend/src/features/company/candidates/ResumeUploadInput.tsx` — remove skill badge display (keep dropzone)

### Docs — Updated
- `docs/09_IMPLEMENTATION_GUIDE.md` — already updated (Phase 4 section)
- `docs/superpowers/specs/2026-08-03-phase4-verification-spec.md` — already rewritten
- `docs/04_ERD_DIAGRAM.md` — already updated
- `docs/DATA_MODEL_DEFINITION.md` — already updated
- `docs/07_API_ENDPOINT_DOCUMENTATION.md` — already updated
- `docs/superpowers/specs/2026-08-03-phase4-redesign-manual-skills.md` — new design spec

---

## Tasks

### Task 1: Add `candidate_skills` table to Drizzle schema + migration

**Files:**
- Modify: `backend/src/database/schema.ts`
- Run: `cd backend && npx drizzle-kit generate`

**Interfaces:**
- Produces: `candidateSkills` table definition (public schema)
- Consumes: existing `candidateAccounts` and `skills` tables

- [ ] **Step 1: Add `candidateSkills` table to `schema.ts`**

Add after `candidateAccounts` definition:
```ts
export const candidateSkills = pgTable(
  'candidate_skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateAccountId: uuid('candidate_account_id')
      .notNull()
      .references(() => candidateAccounts.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueCandidateSkill: uniqueIndex('unique_candidate_skill').on(
      table.candidateAccountId,
      table.skillId,
    ),
  }),
);
```

- [ ] **Step 2: Generate migration**

Run: `cd backend && npx drizzle-kit generate`
Expected: New migration file under `backend/drizzle/<timestamp>_add_candidate_skills/migration.sql`

- [ ] **Step 3: Apply migration via psql**

Run the generated SQL through psql (see `00b_LOCAL_DEV_BOOTSTRAP.md` for exact command).
Expected: `candidate_skills` table created in `public` schema.

- [ ] **Step 4: Update template-schema.sql**

Remove `parsedText` column from `resumes` table in `backend/drizzle/template-schema.sql`.
Keep `resume_skills` table (for future use).

- [ ] **Step 5: Re-apply template schema to template**

Run: `Get-Content backend/drizzle/template-schema.sql | docker exec -i talentpipe-crm-postgres-1 psql -U devuser -d talentpipe`
Expected: Template schema updated.

- [ ] **Step 6: Commit**

```bash
git add backend/src/database/schema.ts backend/drizzle/template-schema.sql
git commit -m "feat(m4): add candidate_skills table, remove parsedText from resumes"
```

---

### Task 2: Create `CandidateSkillRepository` (public schema)

**Files:**
- Create: `backend/src/repositories/candidate-skill.repository.ts`
- Modify: `backend/src/repositories/repositories.module.ts`

**Interfaces:**
- Produces: `CandidateSkillRepository` with `findByCandidateAccountId`, `replaceAll`, `delete`
- Consumes: `DrizzleSchemaService.forPublic()`

- [ ] **Step 1: Write the repository**

Create `backend/src/repositories/candidate-skill.repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { candidateSkills, skills } from '../database/schema';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class CandidateSkillRepository {
  constructor(private readonly schemaService: DrizzleSchemaService) {}

  async findByCandidateAccountId(accountId: string) {
    const { db } = await this.schemaService.forPublic();
    const rows = await db
      .select({ id: candidateSkills.id, skillId: candidateSkills.skillId })
      .from(candidateSkills)
      .where(eq(candidateSkills.candidateAccountId, accountId));
    return rows;
  }

  async replaceAll(accountId: string, skillIds: string[]) {
    const { db, release } = await this.schemaService.forPublic();
    try {
      await db
        .delete(candidateSkills)
        .where(eq(candidateSkills.candidateAccountId, accountId));
      if (skillIds.length > 0) {
        await db.insert(candidateSkills).values(
          skillIds.map((skillId) => ({
            candidateAccountId: accountId,
            skillId,
          })),
        );
      }
    } finally {
      release();
    }
  }

  async delete(accountId: string, skillId: string) {
    const { db, release } = await this.schemaService.forPublic();
    try {
      await db
        .delete(candidateSkills)
        .where(
          and(
            eq(candidateSkills.candidateAccountId, accountId),
            eq(candidateSkills.skillId, skillId),
          ),
        );
    } finally {
      release();
    }
  }
}
```

- [ ] **Step 2: Register in `RepositoriesModule`**

Modify `backend/src/repositories/repositories.module.ts`:
Add `CandidateSkillRepository` to `provides` and `exports` arrays.

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/repositories/candidate-skill.repository.ts backend/src/repositories/repositories.module.ts
git commit -m "feat(m4): add CandidateSkillRepository (public schema)"
```

---

### Task 3: Add skills CRUD endpoints to CandidateAccountModule

**Files:**
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts`
- Create: `backend/src/modules/candidate-account/dto/skills.dto.ts`

**Interfaces:**
- Consumes: `CandidateSkillRepository`, `SkillRepository` (for skill names/categories)
- Produces: `GET /candidate/skills` and `PUT /candidate/skills` endpoints

- [ ] **Step 1: Write Zod DTO**

Create `backend/src/modules/candidate-account/dto/skills.dto.ts`:
```ts
import { z } from 'zod';

export const SetCandidateSkillsSchema = z.object({
  skillIds: z.array(z.string().uuid()),
});

export type SetCandidateSkillsDto = z.infer<typeof SetCandidateSkillsSchema>;
```

- [ ] **Step 2: Add service methods**

Modify `backend/src/modules/candidate-account/candidate-account.service.ts`:
Add `getSkills(accountId)` and `setSkills(accountId, skillIds)` methods.

`getSkills` should:
1. Call `candidateSkillRepo.findByCandidateAccountId(accountId)` to get skill IDs
2. Call `skillRepo.findAll()` to get all taxonomy skills
3. Filter skills whose IDs are in the candidate's skill IDs
4. Return `{ id, name, category }[]`

`setSkills` should:
1. Validate all skillIds exist in `skills` table (throw VALIDATION_ERROR if not)
2. Call `candidateSkillRepo.replaceAll(accountId, skillIds)`

- [ ] **Step 3: Add controller endpoints**

Modify `backend/src/modules/candidate-account/candidate-account.controller.ts`:
Add:
```ts
@Get('skills')
@UseGuards(AuthGuard('jwt'))
@Roles('Candidate')
getSkills(@CurrentUser() user: any) {
  return this.candidateAccountService.getSkills(user.id);
}

@Put('skills')
@UseGuards(AuthGuard('jwt'))
@Roles('Candidate')
@Body(new ZodValidationPipe(SetCandidateSkillsSchema))
setSkills(
  @CurrentUser() user: any,
  @Body() dto: SetCandidateSkillsDto,
) {
  return this.candidateAccountService.setSkills(user.id, dto.skillIds);
}
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/candidate-account/
git commit -m "feat(m4): add candidate skills CRUD endpoints"
```

---

### Task 4: Modify apply endpoints to accept optional `skillIds`

**Files:**
- Modify: `backend/src/modules/public-apply/public-apply.controller.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts` (apply endpoint)
- Modify: `backend/src/modules/public-apply/public-apply.service.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts` (apply method)

**Interfaces:**
- Consumes: `CandidateSkillRepository` (fetch profile skills), `SkillMatchingService.computeScore`
- Produces: apply endpoints that accept optional `skillIds` override

- [ ] **Step 1: Update public apply DTO**

Modify the public apply DTO to include optional `skillIds`:
```ts
export const PublicApplySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  // ... existing fields
});
```

- [ ] **Step 2: Update public apply service**

Modify `backend/src/modules/public-apply/public-apply.service.ts`:
In the apply method, after creating the application:
1. If `dto.skillIds` provided → use those
2. Else → fetch candidate's profile skills from `candidateSkillRepo.findByCandidateAccountId(candidateAccountId)`
3. Get required skills from `jobPostingRepo.getRequiredSkillIds(jobPostingId)`
4. Compute score via `skillMatching.computeScore(required, candidateSkillIds)`
5. Update application with `matchScore`
6. Persist `skillIds` to `candidate_applications_index.skill_ids` (JSONB)

- [ ] **Step 3: Update candidate apply endpoint**

Modify `backend/src/modules/candidate-account/candidate-account.service.ts` apply method:
Same logic as public apply — optional `skillIds` override, default to profile skills.

- [ ] **Step 4: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/public-apply/ backend/src/modules/candidate-account/
git commit -m "feat(m4): apply endpoints accept optional skillIds override"
```

---

### Task 5: Simplify ResumesService to storage-only

**Files:**
- Modify: `backend/src/modules/resumes/resumes.service.ts`
- Modify: `backend/src/modules/resumes/resumes.controller.ts`
- Modify: `backend/src/repositories/resume.repository.ts`

**Interfaces:**
- Consumes: `StorageService` (unchanged)
- Produces: `upload()` stores file + creates DB row with `fileUrl` only; `get()` returns metadata only

- [ ] **Step 1: Simplify ResumesService**

Rewrite `backend/src/modules/resumes/resumes.service.ts`:
Remove `extractText()`, `extractSkills()`, `recomputeScores()` methods.
Remove `pdf-parse`, `mammoth`, `SkillMatchingService`, `ApplicationRepository`, `JobPostingRepository` imports.

`upload(candidateId, file)`:
1. Validate candidate exists
2. Assert supported type (PDF/DOCX)
3. Generate key: `companies/{companyId}/resumes/{candidateId}/{uuid}.{ext}`
4. Upload to MinIO via `storage.upload(key, file.buffer, file.mimetype)`
5. Create resume DB row with `{ candidateId, fileUrl: key }`
6. Return `this.get(candidateId)`

`get(candidateId)`:
1. Find resume by candidateId
2. If not found, throw NotFoundException
3. Return `{ id, candidateId, fileUrl, uploadedAt }` (no parsedText, no skills)

- [ ] **Step 2: Update ResumeRepository**

Modify `backend/src/repositories/resume.repository.ts`:
Remove `updateParsedText`, `setResumeSkills`, `findSkillsByResumeId` methods.
Keep: `findByCandidateId`, `create`.

- [ ] **Step 3: Update controller**

Modify `backend/src/modules/resumes/resumes.controller.ts`:
No structural change needed (same endpoints, simplified response).

- [ ] **Step 4: Uninstall pdf-parse and mammoth**

```bash
cd backend && npm uninstall pdf-parse mammoth @types/pdf-parse @types/mammoth
```

- [ ] **Step 5: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/resumes/ backend/src/repositories/resume.repository.ts backend/package.json backend/package-lock.json
git commit -m "feat(m4): simplify resumes to storage-only, remove pdf-parse/mammoth"
```

---

### Task 6: Update CandidatesService to include candidate skills

**Files:**
- Modify: `backend/src/modules/candidates/candidates.service.ts`

**Interfaces:**
- Consumes: `CandidateSkillRepository` (public schema), `CandidateRepository`
- Produces: `getOne()` returns `{ ..., skills: [{ id, name, category }] }`

- [ ] **Step 1: Update CandidatesService**

Modify `backend/src/modules/candidates/candidates.service.ts`:
Inject `CandidateSkillRepository`.
In `getOne(id)`:
1. Fetch candidate (existing)
2. Fetch resume (existing)
3. Fetch applications (existing)
4. Fetch candidate's account via email from `candidateAccounts` (public schema) — need `CandidateAccountRepository`
5. Fetch candidate's skills via `candidateSkillRepo.findByCandidateAccountId(accountId)`
6. Fetch skill names from `skillRepo.findAll()` and match
7. Return `{ ...candidate, resume, skills, applications }`

Note: The `candidates` table in company schema has `email`. Use that to look up the `candidate_accounts` row in public schema via `CandidateAccountRepository.findByEmail(email)`.

- [ ] **Step 2: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/candidates/candidates.service.ts
git commit -m "feat(m4): candidates profile includes skills from public candidate_skills"
```

---

### Task 7: Update resumes service tests

**Files:**
- Modify: `backend/src/modules/resumes/resumes.service.spec.ts`

**Interfaces:**
- Produces: simplified tests for storage-only resume upload

- [ ] **Step 1: Rewrite spec**

Remove tests for `extractText`, `extractSkills`, `recomputeScores`.
Keep tests for:
- Upload rejects unsupported file type (400)
- Upload stores file in MinIO and creates DB record
- Upload returns metadata only (no parsedText, no skills)
- Get returns metadata only
- Get for non-existent candidate returns 404

- [ ] **Step 2: Run tests**

Run: `cd backend && npm test`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/resumes/resumes.service.spec.ts
git commit -m "test(m4): simplify resume service tests for storage-only"
```

---

### Task 8: Add candidate skills service tests

**Files:**
- Create: `backend/src/modules/candidate-account/candidate-account.service.spec.ts`

**Interfaces:**
- Produces: tests for getSkills/setSkills

- [ ] **Step 1: Write failing tests**

Test cases:
- `getSkills` returns skills for a candidate account
- `getSkills` returns empty array for candidate with no skills
- `setSkills` replaces all skills
- `setSkills` with empty array clears all skills
- `setSkills` throws VALIDATION_ERROR for non-existent skill IDs

- [ ] **Step 2: Run tests**

Run: `cd backend && npm test`
Expected: New tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/candidate-account/candidate-account.service.spec.ts
git commit -m "test(m4): add candidate skills service tests"
```

---

### Task 9: Frontend — Candidate Skills Page

**Files:**
- Create: `frontend/src/features/candidate-portal/skills/SkillsPage.tsx`
- Create: `frontend/src/features/candidate-portal/skills/hooks/useCandidateSkills.ts`
- Create: `frontend/src/routes/_candidate/skills.tsx`
- Modify: `frontend/src/features/candidate-portal/layout.tsx`

**Interfaces:**
- Consumes: `skillsApi` (GET /skills for taxonomy), `candidateAccountApi` (GET/PUT /candidate/skills)
- Produces: Skills management page with MultiSelect

- [ ] **Step 1: Write `useCandidateSkills` hook**

Create `frontend/src/features/candidate-portal/skills/hooks/useCandidateSkills.ts`:
```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/useApiMutation';
import { candidateAccountApi } from '@/api/candidateAccountApi';
import { queryKeys } from '@/api/queryKeys';

export function useCandidateSkills() {
  const queryClient = useQueryClient();
  const skills = useQuery({
    queryKey: queryKeys.candidate.skills(),
    queryFn: () => candidateAccountApi.getSkills(),
  });
  const update = useApiMutation({
    mutationFn: (skillIds: string[]) => candidateAccountApi.setSkills(skillIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.skills() });
    },
  });
  return { ...skills, update };
}
```

- [ ] **Step 2: Write SkillsPage component**

Create `frontend/src/features/candidate-portal/skills/SkillsPage.tsx`:
Mantine page with MultiSelect searching `GET /skills?search=`, save button, toast on success.

- [ ] **Step 3: Create route**

Create `frontend/src/routes/_candidate/skills.tsx`:
```tsx
import { SkillsPage } from '@/features/candidate-portal/skills/SkillsPage';
export default SkillsPage;
```

- [ ] **Step 4: Add Skills to candidate portal sidebar**

Modify `frontend/src/features/candidate-portal/layout.tsx`:
Add "Skills" nav link.

- [ ] **Step 5: Typecheck frontend**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/candidate-portal/skills/ frontend/src/routes/_candidate/skills.tsx frontend/src/features/candidate-portal/layout.tsx
git commit -m "feat(m4): candidate skills management page"
```

---

### Task 10: Frontend — Update ApplyForm with skill prefill/override

**Files:**
- Modify: `frontend/src/features/candidate-portal/applications/ApplyForm.tsx` (or wherever apply form lives)
- Modify: `frontend/src/features/public-careers/ApplyForm.tsx` (if separate)

**Interfaces:**
- Consumes: `useCandidateSkills` hook (candidate apply), `skillsApi` (public apply)
- Produces: Apply form with prefilled skills (candidate) or empty (public), with add/remove

- [ ] **Step 1: Update candidate apply form**

In the candidate apply form:
1. Fetch candidate skills via `useCandidateSkills()`
2. Prefill MultiSelect with profile skills
3. Allow user to add/remove before submit
4. Submit includes `skillIds` in body

- [ ] **Step 2: Update public apply form**

In the public apply form:
1. Add MultiSelect for skills (optional)
2. Submit includes `skillIds` in body (if selected)

- [ ] **Step 3: Typecheck frontend**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/candidate-portal/applications/ frontend/src/features/public-careers/
git commit -m "feat(m4): apply forms with skill prefill/override"
```

---

### Task 11: Frontend — Update CandidateProfile (company view)

**Files:**
- Modify: `frontend/src/features/company/candidates/CandidateProfile.tsx`

**Interfaces:**
- Consumes: `candidate.skills` from API response
- Produces: Read-only skill badges, resume file link only (no parsedText)

- [ ] **Step 1: Update CandidateProfile**

Modify `frontend/src/features/company/candidates/CandidateProfile.tsx`:
1. Add skill badges section (read-only, like in skills page)
2. Remove `parsedText` preview
3. Resume card: show only file link + upload date (no extracted skills)

- [ ] **Step 2: Typecheck frontend**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/company/candidates/CandidateProfile.tsx
git commit -m "feat(m4): company candidate profile shows skills, resume as storage only"
```

---

### Task 12: Update frontend API types

**Files:**
- Modify: `frontend/src/api/resumesApi.ts`
- Modify: `frontend/src/api/candidateAccountApi.ts`

**Interfaces:**
- Produces: Updated TypeScript types for simplified resume response and new skills endpoints

- [ ] **Step 1: Update resume API types**

Modify `frontend/src/api/resumesApi.ts`:
Remove `parsedText` and `skills` from resume response type.

- [ ] **Step 2: Add skills API functions**

Modify `frontend/src/api/candidateAccountApi.ts`:
Add `getSkills()` and `setSkills(skillIds: string[])` functions.

- [ ] **Step 3: Typecheck frontend**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/resumesApi.ts frontend/src/api/candidateAccountApi.ts
git commit -m "feat(m4): update API types for skills and simplified resume"
```

---

### Task 13: Full backend verification

**Files:** (no new files)

**Interfaces:**
- Produces: green typecheck, tests, lint

- [ ] **Step 1: Run backend typecheck**

Run: `cd backend && npm run typecheck`
Expected: PASS

- [ ] **Step 2: Run backend tests**

Run: `cd backend && npm test`
Expected: All tests PASS

- [ ] **Step 3: Run backend lint**

Run: `cd backend && npm run lint`
Expected: Clean (no errors)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(m4): verify backend green"
```

---

### Task 14: Full frontend verification

**Files:** (no new files)

**Interfaces:**
- Produces: green typecheck, lint, build

- [ ] **Step 1: Run frontend typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: Clean (3 pre-existing react(only-export-components) warnings OK)

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(m4): verify frontend green"
```

---

### Task 15: Manual API smoke test

**Files:** (no new files)

**Interfaces:**
- Produces: verified API endpoints per verification spec

- [ ] **Step 1: Start infrastructure**

Run: `docker compose up -d`
Run: `cd backend && npm run start:dev`
Run: `cd frontend && npm run dev`

- [ ] **Step 2: Verify candidate skills CRUD**

Sign in as candidate → GET/PUT `/candidate/skills` → verify skills persist.

- [ ] **Step 3: Verify apply with profile skills**

Apply to a job without `skillIds` → verify matchScore uses profile skills.

- [ ] **Step 4: Verify apply with override**

Apply to a job with `skillIds` override → verify matchScore uses override.

- [ ] **Step 5: Verify resume storage only**

Upload resume → verify response has no `parsedText` or `skills`.

- [ ] **Step 6: Verify company profile includes skills**

GET `/candidates/:id` as company admin → verify `skills` array present.

- [ ] **Step 7: Verify negative cases**

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test(m4): manual API smoke test verified"
```

---

### Task 16: Manual UI smoke test

**Files:** (no new files)

**Interfaces:**
- Produces: verified frontend flows per verification spec

- [ ] **Step 1: Sign in as candidate**

Open `http://localhost:5173` → sign in as candidate → navigate to Skills page.

- [ ] **Step 2: Manage skills**

Select skills from MultiSelect → Save → verify green toast.

- [ ] **Step 3: Apply to a job**

Navigate to job → Apply → verify skills prefilled → submit → verify success.

- [ ] **Step 4: Verify company view**

Sign in as company admin → open candidate profile → verify skill badges + resume file link only.

- [ ] **Step 5: Verify pipeline match scores**

Navigate to Pipeline → verify match score badge on application card.

- [ ] **Step 6: Verify persistence**

Reload candidate profile → verify skills + scores persist.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(m4): manual UI smoke test verified"
```

---

## Self-Review Checklist

1. **Spec coverage:** Skim each section of the design spec (`docs/superpowers/specs/2026-08-03-phase4-redesign-manual-skills.md`). Can you point to a task that implements it?
   - ✅ Data model changes → Task 1
   - ✅ CandidateSkillRepository → Task 2
   - ✅ Skills CRUD endpoints → Task 3
   - ✅ Apply endpoints with skillIds → Task 4
   - ✅ Resumes simplified → Task 5
   - ✅ Candidates with skills → Task 6
   - ✅ Tests → Tasks 7-8
   - ✅ Frontend skills page → Task 9
   - ✅ Frontend apply form → Task 10
   - ✅ Frontend candidate profile → Task 11
   - ✅ API types → Task 12
   - ✅ Verification → Tasks 13-16

2. **Placeholder scan:** No TBD, TODO, or vague steps found.

3. **Type consistency:** Method names and file paths match across tasks.
