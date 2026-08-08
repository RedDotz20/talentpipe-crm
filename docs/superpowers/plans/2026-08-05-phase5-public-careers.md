# Phase 5 Public Careers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add company-specific public careers browsing while requiring authenticated Candidate accounts for every application.

**Architecture:** Add a read-only `PublicCareersModule` backed by the public `job_listings_index`, with explicit company-schema reads for open-job details and required skills. Add public TanStack Router pages that use the existing candidate application flow; anonymous Apply actions go through unified sign-in/signup and return to the original careers detail route. Redis, anonymous apply, and rate limiting remain out of scope until Phase 6.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL schema-per-company routing, Zod, React 19, Mantine 9, TanStack Query 5, TanStack Router 1, Zustand 5, Vite 8.

## Global Constraints

- Public browsing uses company-specific routes: `/api/public/:companySlug/jobs` and `/api/public/:companySlug/jobs/:id`.
- There is no anonymous application endpoint, multipart public upload, honeypot, or public rate limiter in Phase 5.
- Applications use only `POST /api/candidate/jobs/:companyId/:jobId/apply` and require JWT role `Candidate`.
- Public jobs include only `job_listings_index` rows with `status = 'open'`; draft and closed jobs return `404` on detail.
- All database access goes through repositories; no Drizzle client is used directly by controllers or services.
- Company identity for public reads comes from the server-side slug lookup; internal candidate writes continue using verified JWT context and repository validation.
- Do not stage or commit the existing uncommitted Phase 4 files unless a task explicitly modifies one of them.
- Every task must preserve the standard `{ data, message }` success envelope and `{ error: { code, message } }` error envelope.

## File Map

### Backend

- Create `backend/src/modules/public-careers/public-careers.module.ts`: module wiring.
- Create `backend/src/modules/public-careers/public-careers.controller.ts`: unauthenticated GET routes.
- Create `backend/src/modules/public-careers/public-careers.service.ts`: company/job visibility and public response orchestration.
- Create `backend/src/modules/public-careers/public-careers.service.spec.ts`: service behavior tests.
- Modify `backend/src/repositories/job-listings-index.repository.ts`: company-scoped open listing lookups.
- Modify `backend/src/repositories/job-posting.repository.ts`: explicit-schema job lookup.
- Modify `backend/src/repositories/company.repository.ts`: remove deleted Phase 4 resume tables from new-company provisioning.
- Modify `backend/src/app.module.ts`: register `PublicCareersModule`.
- Add controller/integration coverage under the public-careers module or `backend/test/` using the repository’s existing Jest conventions.

### Frontend

- Create `frontend/src/features/public-careers/api/publicCareersApi.ts`: public careers HTTP functions and response types.
- Create `frontend/src/features/public-careers/hooks/usePublicCareers.ts`: listing/detail TanStack Query hooks.
- Create `frontend/src/features/public-careers/JobListingPage.tsx`: company job list.
- Create `frontend/src/features/public-careers/JobDetailPage.tsx`: public job detail and Apply state.
- Create `frontend/src/features/candidate-portal/applications/CandidateApplyModal.tsx`: reusable authenticated candidate apply form extracted from the candidate dashboard flow.
- Create `frontend/src/routes/careers/$companySlug/jobs.tsx`: public listing route.
- Create `frontend/src/routes/careers/$companySlug/jobs/$jobId.tsx`: public detail route.
- Modify `frontend/src/api/queryKeys.ts`: public careers query keys.
- Modify `frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx`: use the reusable apply modal without changing candidate API behavior.
- Modify `frontend/src/features/auth/SignInPage.tsx`: consume safe `returnTo` and preserve existing role redirects otherwise.
- Modify `frontend/src/features/candidate-portal/signup/SignupPage.tsx`: preserve safe `returnTo` after candidate signup.
- Modify `frontend/src/routes/auth/signin.tsx` and `frontend/src/routes/auth/signup.tsx`: validate/search-route support and safe redirect handling.

### Documentation

- Modify `docs/00_PROJECT_INSTRUCTIONS.md`, `01_TALENTPIPE_PRD_SRS.md`, `03_RECRUITMENT_ATS_ARCHITECTURE.md`, `04_ERD_DIAGRAM.md`, `05_DATA_ISOLATION_STRATEGY.md`, `06_ROLE_INTERACTIONS.md`, `07_API_ENDPOINT_DOCUMENTATION.md`, `08_FRONTEND_COMPONENT_STRUCTURE.md`, `09_IMPLEMENTATION_GUIDE.md`, `00b_LOCAL_DEV_BOOTSTRAP.md`, and `DATA_MODEL_DEFINITION.md` to match the approved Phase 4 and Phase 5 behavior.

---

### Task 1: Align Company Provisioning With Phase 4 Storage Redesign

**Files:**
- Modify: `backend/src/repositories/company.repository.ts:6-18`
- Inspect: `backend/drizzle/template-schema.sql`
- Test/verify: `backend/src/repositories/company.repository.ts`, backend typecheck/build

**Interfaces:**
- Consumes: current `CompanyRepository.provisionSchema(companyId)` and the template schema created by `backend/drizzle/template-schema.sql`.
- Produces: new company provisioning that clones exactly the current company tables: `users`, `job_postings`, `candidates`, `pipeline_stages`, `applications`, `job_required_skills`, `interviews`, `interview_feedbacks`, and `notes`.

- [ ] **Step 1: Confirm the mismatch**

Run:

```powershell
rg 'resumes|resume_skills' backend/src/repositories/company.repository.ts backend/drizzle/template-schema.sql backend/src/database/schema.ts
```

Expected: `template-schema.sql` and `schema.ts` no longer define the deleted company tables, while `COMPANY_TABLES` still references them.

- [ ] **Step 2: Remove deleted tables from provisioning**

Change `COMPANY_TABLES` to:

```ts
const COMPANY_TABLES = [
  'users',
  'job_postings',
  'candidates',
  'pipeline_stages',
  'applications',
  'job_required_skills',
  'interviews',
  'interview_feedbacks',
  'notes',
];
```

Do not reintroduce `resumes` or `resume_skills`.

- [ ] **Step 3: Verify the provisioning source and code agree**

Run:

```powershell
rg 'resumes|resume_skills' backend/src/repositories/company.repository.ts backend/drizzle/template-schema.sql
cd backend; npm run typecheck
```

Expected: the first command has no output and typecheck passes.

- [ ] **Step 4: Commit only this fix**

```powershell
git add backend/src/repositories/company.repository.ts
git commit -m "fix(m4): align company provisioning with resume redesign"
```

---

### Task 2: Add Company-Scoped Public Index Repository Operations

**Files:**
- Modify: `backend/src/repositories/job-listings-index.repository.ts`
- Modify: `backend/src/repositories/job-posting.repository.ts`
- Test: `backend/src/modules/public-careers/public-careers.service.spec.ts` in Task 3

**Interfaces:**
- Consumes: existing `JobListingsIndexRepository.findById`, `upsert`, `delete`, and `JobPostingRepository.getRequiredSkillIds(jobPostingId, schema)`.
- Produces:
  - `JobListingsIndexRepository.findOpenByCompany(companyId: string)` returning indexed open rows for one company.
  - `JobListingsIndexRepository.findOpenByCompanyAndJob(companyId: string, jobPostingId: string)` returning one row or `null`.
  - `JobPostingRepository.findById(id: string, schema = 'current')` so public detail can read a company schema explicitly.

- [ ] **Step 1: Add the repository behavior tests through the service contract**

In the service test created in Task 3, mock these exact methods and assert the service calls them with the resolved company ID and `company_<id>` schema. The test must fail until these methods exist.

- [ ] **Step 2: Implement company-filtered index methods**

Use `withDb('public', ...)`, `and`, `eq`, and `desc`:

```ts
async findOpenByCompany(companyId: string) {
  return this.withDb('public', (db) =>
    db
      .select()
      .from(jobListingsIndex)
      .where(
        and(
          eq(jobListingsIndex.companyId, companyId),
          eq(jobListingsIndex.status, 'open'),
        ),
      )
      .orderBy(desc(jobListingsIndex.createdAt))
      .execute(),
  );
}

async findOpenByCompanyAndJob(companyId: string, jobPostingId: string) {
  return this.withDb('public', async (db) => {
    const rows = await db
      .select()
      .from(jobListingsIndex)
      .where(
        and(
          eq(jobListingsIndex.companyId, companyId),
          eq(jobListingsIndex.jobPostingId, jobPostingId),
          eq(jobListingsIndex.status, 'open'),
        ),
      )
      .limit(1)
      .execute();
    return rows[0] ?? null;
  });
}
```

- [ ] **Step 3: Allow explicit schema in job lookup**

Change the existing method signature and `withDb` call without changing current callers:

```ts
async findById(id: string, schema = 'current') {
  return this.withDb(schema, async (db) => {
    const rows = await db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.id, id))
      .limit(1)
      .execute();
    return rows[0] ?? null;
  });
}
```

- [ ] **Step 4: Run the repository-related checks**

```powershell
cd backend; npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the repository contract**

```powershell
git add backend/src/repositories/job-listings-index.repository.ts backend/src/repositories/job-posting.repository.ts
git commit -m "feat(m5): add company-scoped public job lookups"
```

---

### Task 3: Implement and Register the Public Careers Backend Module

**Files:**
- Create: `backend/src/modules/public-careers/public-careers.module.ts`
- Create: `backend/src/modules/public-careers/public-careers.controller.ts`
- Create: `backend/src/modules/public-careers/public-careers.service.ts`
- Create: `backend/src/modules/public-careers/public-careers.service.spec.ts`
- Modify: `backend/src/app.module.ts:4-31`

**Interfaces:**
- Consumes: `CompanyRepository.findBySlug`, `JobListingsIndexRepository.findOpenByCompany`, `JobListingsIndexRepository.findOpenByCompanyAndJob`, `JobPostingRepository.findById`, `JobPostingRepository.getRequiredSkillIds`, and `SkillRepository.findByIds`.
- Produces:
  - `PublicCareersService.list(companySlug: string)` returning public open listing rows.
  - `PublicCareersService.getOne(companySlug: string, jobId: string)` returning an open detail with `requiredSkills`.
  - `GET /api/public/:companySlug/jobs` and `GET /api/public/:companySlug/jobs/:id` without JWT guards.

- [ ] **Step 1: Write failing service tests**

Create mocks for the four repositories and cover the following exact behaviors:

```ts
it('lists only the requested company open jobs', async () => {
  companyRepo.findBySlug.mockResolvedValue({ id: 'company-a', slug: 'acme', name: 'Acme' });
  indexRepo.findOpenByCompany.mockResolvedValue([{
    jobPostingId: 'job-a',
    companyId: 'company-a',
    companySlug: 'acme',
    companyName: 'Acme',
    title: 'Engineer',
    description: 'Build things',
    status: 'open',
  }]);

  await expect(service.list('acme')).resolves.toEqual([
    expect.objectContaining({ id: 'job-a', companyId: 'company-a', title: 'Engineer' }),
  ]);
  expect(indexRepo.findOpenByCompany).toHaveBeenCalledWith('company-a');
});

it('throws NotFoundException for an unknown company', async () => {
  companyRepo.findBySlug.mockResolvedValue(null);
  await expect(service.list('missing')).rejects.toThrow(NotFoundException);
});

it('returns open detail with required skill metadata', async () => {
  companyRepo.findBySlug.mockResolvedValue({ id: 'company-a', slug: 'acme', name: 'Acme' });
  indexRepo.findOpenByCompanyAndJob.mockResolvedValue({
    companyId: 'company-a',
    jobPostingId: 'job-a',
    title: 'Engineer',
    description: 'Build things',
    companyName: 'Acme',
    companySlug: 'acme',
    status: 'open',
  });
  jobPostingRepo.findById.mockResolvedValue({ id: 'job-a', status: 'open' });
  jobPostingRepo.getRequiredSkillIds.mockResolvedValue(['skill-a']);
  skillRepo.findByIds.mockResolvedValue([{ id: 'skill-a', name: 'React', category: 'Frontend' }]);

  await expect(service.getOne('acme', 'job-a')).resolves.toEqual(
    expect.objectContaining({
      id: 'job-a',
      companyId: 'company-a',
      requiredSkills: [{ id: 'skill-a', name: 'React', category: 'Frontend' }],
    }),
  );
  expect(jobPostingRepo.findById).toHaveBeenCalledWith('job-a', 'company_company-a');
  expect(jobPostingRepo.getRequiredSkillIds).toHaveBeenCalledWith('job-a', 'company_company-a');
});

it('throws when the open index entry is missing', async () => {
  companyRepo.findBySlug.mockResolvedValue({ id: 'company-a', slug: 'acme' });
  indexRepo.findOpenByCompanyAndJob.mockResolvedValue(null);
  await expect(service.getOne('acme', 'job-a')).rejects.toThrow(NotFoundException);
});

it('throws when the source posting is draft', async () => {
  companyRepo.findBySlug.mockResolvedValue({ id: 'company-a', slug: 'acme' });
  indexRepo.findOpenByCompanyAndJob.mockResolvedValue({ jobPostingId: 'job-a', status: 'open' });
  jobPostingRepo.findById.mockResolvedValue({ id: 'job-a', status: 'draft' });
  await expect(service.getOne('acme', 'job-a')).rejects.toThrow(NotFoundException);
});

it('throws when the source posting is closed', async () => {
  companyRepo.findBySlug.mockResolvedValue({ id: 'company-a', slug: 'acme' });
  indexRepo.findOpenByCompanyAndJob.mockResolvedValue({ jobPostingId: 'job-a', status: 'open' });
  jobPostingRepo.findById.mockResolvedValue({ id: 'job-a', status: 'closed' });
  await expect(service.getOne('acme', 'job-a')).rejects.toThrow(NotFoundException);
});
```

Each not-found test must reset mocks in `beforeEach` so the cases remain independent.

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
cd backend; npx jest src/modules/public-careers/public-careers.service.spec.ts --runInBand
```

Expected: FAIL because the module/service files and methods do not exist yet.

- [ ] **Step 3: Implement the service**

Implement the following behavior:

```ts
async list(companySlug: string) {
  const company = await this.companyRepo.findBySlug(companySlug);
  if (!company) throw new NotFoundException('Company not found');
  const rows = await this.indexRepo.findOpenByCompany(company.id);
  return rows.map((row) => ({
    id: row.jobPostingId,
    companyId: company.id,
    companySlug: company.slug,
    companyName: row.companyName,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

async getOne(companySlug: string, jobId: string) {
  const company = await this.companyRepo.findBySlug(companySlug);
  if (!company) throw new NotFoundException('Job posting not found');

  const indexed = await this.indexRepo.findOpenByCompanyAndJob(company.id, jobId);
  if (!indexed) throw new NotFoundException('Job posting not found');

  const schema = `company_${company.id}`;
  const posting = await this.jobPostingRepo.findById(jobId, schema);
  if (!posting || posting.status !== 'open') {
    throw new NotFoundException('Job posting not found');
  }

  const requiredSkillIds = await this.jobPostingRepo.getRequiredSkillIds(jobId, schema);
  const requiredSkills = await this.skillRepo.findByIds(requiredSkillIds);
  return {
    id: indexed.jobPostingId,
    companyId: company.id,
    companySlug: company.slug,
    companyName: indexed.companyName,
    title: indexed.title,
    description: indexed.description,
    createdAt: indexed.createdAt,
    updatedAt: indexed.updatedAt,
    requiredSkills: requiredSkills.map(({ id, name, category }) => ({ id, name, category })),
  };
}
```

Use explicit return types if the repository’s inferred Drizzle types make the public shape unclear; do not use `any`.

- [ ] **Step 4: Implement controller and module wiring**

```ts
@Controller('public/:companySlug/jobs')
export class PublicCareersController {
  constructor(private readonly service: PublicCareersService) {}

  @Get()
  list(@Param('companySlug') companySlug: string) {
    return this.service.list(companySlug);
  }

  @Get(':id')
  getOne(@Param('companySlug') companySlug: string, @Param('id') id: string) {
    return this.service.getOne(companySlug, id);
  }
}
```

The module imports `RepositoriesModule`, provides `PublicCareersService`, and declares `PublicCareersController`. Add `PublicCareersModule` to `AppModule` after `SkillsModule`.

- [ ] **Step 5: Run focused and application checks**

```powershell
cd backend; npx jest src/modules/public-careers/public-careers.service.spec.ts --runInBand
cd backend; npm run typecheck
cd backend; npm run build
```

Expected: all commands pass.

- [ ] **Step 6: Commit the backend public careers module**

```powershell
git add backend/src/modules/public-careers backend/src/app.module.ts
git commit -m "feat(m5): add public careers read API"
```

---

### Task 4: Add Public Careers API Types, Query Hooks, and Routes

**Files:**
- Create: `frontend/src/features/public-careers/api/publicCareersApi.ts`
- Create: `frontend/src/features/public-careers/hooks/usePublicCareers.ts`
- Modify: `frontend/src/api/queryKeys.ts:1-29`
- Create: `frontend/src/routes/careers/$companySlug/jobs.tsx`
- Create: `frontend/src/routes/careers/$companySlug/jobs/$jobId.tsx`

**Interfaces:**
- Consumes: backend GET endpoints from Task 3 and the existing `apiClient`/`ApiEnvelope` pattern.
- Produces:
  - `PublicJobListing` with `id`, `companyId`, `companySlug`, `companyName`, `title`, `description`, `createdAt`, and `updatedAt`.
  - `PublicJobDetail` extending the listing shape with `requiredSkills: PublicSkill[]`.
  - `publicCareersApi.getJobs(companySlug: string)` and `publicCareersApi.getJob(companySlug: string, jobId: string)`.
  - `usePublicJobs(companySlug)` and `usePublicJob(companySlug, jobId)`.

- [ ] **Step 1: Add query keys and API functions**

Add this query-key shape:

```ts
publicCareers: {
  jobs: (companySlug: string) => ['public-careers', 'jobs', companySlug],
  job: (companySlug: string, jobId: string) => ['public-careers', 'jobs', companySlug, jobId],
},
```

Unwrap the standard API response exactly as `candidateApi` does:

```ts
const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const publicCareersApi = {
  async getJobs(companySlug: string): Promise<PublicJobListing[]> {
    const { data } = await apiClient.get(`/public/${companySlug}/jobs`);
    return unwrap(data as ApiEnvelope<PublicJobListing[]>);
  },
  async getJob(companySlug: string, jobId: string): Promise<PublicJobDetail> {
    const { data } = await apiClient.get(`/public/${companySlug}/jobs/${jobId}`);
    return unwrap(data as ApiEnvelope<PublicJobDetail>);
  },
};
```

- [ ] **Step 2: Add query hooks**

Use `useQuery` with `enabled: Boolean(companySlug)` and the exact public query keys. Do not attach auth requirements to these hooks.

- [ ] **Step 3: Implement the listing page and route**

The route reads `companySlug` from `Route.useParams()` and renders `JobListingPage`. The page must render loading, error, empty, and loaded states; each job links to `/careers/$companySlug/jobs/$jobId`.

- [ ] **Step 4: Implement the detail page and route shell**

The route reads `companySlug` and `jobId` from `Route.useParams()` and renders `JobDetailPage`. The page must render loading, error, and not-found states, then display title, company, description, required skill badges, and an Apply action supplied by Task 5.

- [ ] **Step 5: Regenerate/check TanStack route output**

Run the frontend’s existing route generation mechanism by running the typecheck/build command; the Vite TanStack Router plugin updates `frontend/src/routeTree.gen.ts` when the route files are present.

```powershell
cd frontend; npm run typecheck
```

Expected: PASS with generated route types.

- [ ] **Step 6: Commit the public frontend browsing surface**

```powershell
git add frontend/src/features/public-careers frontend/src/api/queryKeys.ts frontend/src/routes/careers frontend/src/routeTree.gen.ts
git commit -m "feat(m5): add public careers pages"
```

---

### Task 5: Extract Candidate Apply UI and Add Safe Auth Return Flow

**Files:**
- Create: `frontend/src/features/candidate-portal/applications/CandidateApplyModal.tsx`
- Modify: `frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx`
- Modify: `frontend/src/features/public-careers/JobDetailPage.tsx`
- Modify: `frontend/src/routes/auth/signin.tsx`
- Modify: `frontend/src/routes/auth/signup.tsx`
- Modify: `frontend/src/features/auth/SignInPage.tsx`
- Modify: `frontend/src/features/candidate-portal/signup/SignupPage.tsx`

**Interfaces:**
- Consumes: existing `useApply`, `useProfile`, `useAllSkills`, `ApplyData`, `useAuthStore`, and candidate API.
- Produces:
  - Reusable `CandidateApplyModal` props: `{ opened: boolean; onClose: () => void; job: { id: string; companyId: string; title: string; companyName: string } }`.
  - `isSafeCareerReturnTo(value: unknown): value is string` and `getCareerReturnTo(value: unknown): string | null` behavior local to auth navigation or a focused utility.
  - Sign-in/signup redirects to the safe return route after successful Candidate auth.

- [ ] **Step 1: Extract the existing candidate apply modal without changing behavior**

Move the modal state/form currently in `JobSearchPage` into `CandidateApplyModal`. Preserve these existing behaviors: phone prefill from profile, profile skills prefill, optional skill override, cover letter, success state, error state, and `useApply` submission payload `{ phone, coverLetter, skillIds }`.

The modal must use the job’s `companyId` and `id` props when calling `useApply`.

- [ ] **Step 2: Update the candidate dashboard to use the shared modal**

Remove duplicated modal JSX/state from `JobSearchPage`; keep only selected job state and pass the selected job to `CandidateApplyModal`. Run the frontend typecheck before proceeding.

- [ ] **Step 3: Add Apply behavior to public detail**

In `JobDetailPage`:

```ts
const { isAuthenticated, role } = useAuthStore();

const returnTo = `/careers/${companySlug}/jobs/${jobId}`;
if (!isAuthenticated()) {
  navigate({ to: '/auth/signin', search: { returnTo } });
} else if (role === 'Candidate') {
  setApplyOpened(true);
} else {
  setCandidateRequired(true);
}
```

Pass the detail’s `id`, `companyId`, `title`, and `companyName` to `CandidateApplyModal`. Do not call `candidateApi.applyToJob` for anonymous or non-Candidate users.

- [ ] **Step 4: Add safe search validation to auth routes**

Use the installed Zod package with TanStack Router search validation. Accept only an optional string `returnTo`; normalize it to `null` unless it starts with `/careers/`, does not contain a scheme/host, and does not contain a backslash. The accepted value is an internal path, not an absolute URL.

The sign-in route’s existing authenticated-user redirect must remain, but include the validated search object in the route component.

- [ ] **Step 5: Preserve return path through sign-in and candidate signup**

After successful candidate authentication:

```ts
if (safeReturnTo) {
  window.location.assign(safeReturnTo);
} else if (currentRole === 'Candidate') {
  await navigate({ to: '/dashboard' });
}
```

For the candidate signup link from sign-in, pass the same safe search value to `/auth/signup`. For the sign-in link from candidate signup, pass it back to `/auth/signin`. Existing company/superadmin redirects remain unchanged when no safe return path exists. `window.location.assign` is safe here because `safeReturnTo` has already been restricted to a same-origin `/careers/...` path and avoids forcing a dynamic string through TanStack Router's route union.

- [ ] **Step 6: Verify frontend behavior statically**

```powershell
cd frontend; npm run typecheck
cd frontend; npm run lint
```

Expected: both pass with no unused state/imports.

- [ ] **Step 7: Commit authenticated Apply and redirect behavior**

```powershell
git add frontend/src/features/candidate-portal/applications frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx frontend/src/features/public-careers/JobDetailPage.tsx frontend/src/routes/auth frontend/src/features/auth/SignInPage.tsx frontend/src/features/candidate-portal/signup/SignupPage.tsx frontend/src/routeTree.gen.ts
git commit -m "feat(m5): require candidate account for public apply"
```

---

### Task 6: Update Canonical Documentation For Phase 0-5

**Files:**
- Modify: `docs/00_PROJECT_INSTRUCTIONS.md`
- Modify: `docs/01_TALENTPIPE_PRD_SRS.md`
- Modify: `docs/03_RECRUITMENT_ATS_ARCHITECTURE.md`
- Modify: `docs/04_ERD_DIAGRAM.md`
- Modify: `docs/05_DATA_ISOLATION_STRATEGY.md`
- Modify: `docs/06_ROLE_INTERACTIONS.md`
- Modify: `docs/07_API_ENDPOINT_DOCUMENTATION.md`
- Modify: `docs/08_FRONTEND_COMPONENT_STRUCTURE.md`
- Modify: `docs/09_IMPLEMENTATION_GUIDE.md`
- Modify: `docs/00b_LOCAL_DEV_BOOTSTRAP.md`
- Modify: `docs/DATA_MODEL_DEFINITION.md`

**Interfaces:**
- Consumes: implemented Phase 4 working-tree behavior and Phase 5 endpoints/routes from Tasks 1-5.
- Produces: documentation that does not describe anonymous apply, resume parsing, company `resumes` tables, or Phase 5 Redis work.

- [ ] **Step 1: Update Phase 4 implementation facts**

Every affected document must describe these current facts consistently:

- Candidate skills live in public `candidate_skills` and are manually declared.
- Match score uses profile skills or application override.
- Resumes are storage-only and attached to candidate profile metadata in `candidate_accounts`.
- Company `resumes` and `resume_skills` tables are removed from the current schema/template.
- Applications store candidate snapshot fields and applied skill IDs where implemented.
- Candidate application index status is synchronized on stage changes.
- Job listings index is synchronized on publish/close/delete.

- [ ] **Step 2: Update the Phase 5 contract**

Replace stale anonymous-apply requirements with:

```text
GET /api/public/:companySlug/jobs       public open-job listing
GET /api/public/:companySlug/jobs/:id   public open-job detail
POST /api/candidate/jobs/:companyId/:jobId/apply  Candidate-only application write
```

State that anonymous visitors are redirected to unified sign-in, candidate signup is available there, and the original careers detail path is restored after authentication.

- [ ] **Step 3: Move Redis/rate-limiting claims to Phase 6**

Phase 5 documentation must not claim an implemented Redis provider or public apply rate limiter. Keep the Phase 6 plan as future work and explicitly state that Phase 5 has no anonymous write endpoint to rate-limit.

- [ ] **Step 4: Update bootstrap and migration guidance**

Document the current migration `backend/drizzle/20260804101500_candidate_profile_redesign/migration.sql`, the template’s nine current company tables, and the requirement to apply schema changes before provisioning new companies. Remove instructions that expect company `resumes` or `resume_skills` tables.

- [ ] **Step 5: Search for stale statements**

```powershell
rg -n "anonymous.*apply|apply.*anonymous|parsedText|extractText|extractSkills|resume_skills|company.*resumes|Phase 5.*Redis|rate limit.*public apply" docs --glob "*.md"
```

Review every match. Retain historical design context only when it is clearly labeled as superseded; canonical status and implementation instructions must describe the current behavior.

- [ ] **Step 6: Commit documentation changes**

```powershell
git add docs/00_PROJECT_INSTRUCTIONS.md docs/01_TALENTPIPE_PRD_SRS.md docs/03_RECRUITMENT_ATS_ARCHITECTURE.md docs/04_ERD_DIAGRAM.md docs/05_DATA_ISOLATION_STRATEGY.md docs/06_ROLE_INTERACTIONS.md docs/07_API_ENDPOINT_DOCUMENTATION.md docs/08_FRONTEND_COMPONENT_STRUCTURE.md docs/09_IMPLEMENTATION_GUIDE.md docs/00b_LOCAL_DEV_BOOTSTRAP.md docs/DATA_MODEL_DEFINITION.md
git commit -m "docs(m5): align phase history and public careers contract"
```

---

### Task 7: Run Full Verification And Review The Branch

**Files:**
- Verify: all Phase 5 files and documentation above.
- Do not modify: unrelated pre-existing Phase 4 working-tree changes.

**Interfaces:**
- Consumes: completed backend, frontend, and documentation tasks.
- Produces: verified Phase 5 branch ready for user review and later merge to `dev`.

- [ ] **Step 1: Run backend verification**

```powershell
cd backend; npm run typecheck
cd backend; npm run lint
cd backend; npm test -- --runInBand
cd backend; npm run build
```

Expected: all commands pass. If lint modifies files, inspect the diff and stage only intended Phase 5 files.

- [ ] **Step 2: Run frontend verification**

```powershell
cd frontend; npm run typecheck
cd frontend; npm run lint
cd frontend; npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Run targeted public API checks when local infrastructure is available**

With PostgreSQL, template schema, seeded company, and backend running:

```powershell
curl http://localhost:3000/api/public/acme/jobs
curl http://localhost:3000/api/public/acme/jobs/<open-job-id>
curl http://localhost:3000/api/public/acme/jobs/<draft-job-id>
curl -X POST http://localhost:3000/api/candidate/jobs/<company-id>/<open-job-id>/apply -H "Content-Type: application/json" -d "{}"
```

Expected: public listing/detail return the standard success envelope; draft detail returns `404`; candidate apply without JWT returns `401`.

- [ ] **Step 4: Inspect the complete branch diff**

```powershell
git status --short --branch
```

Confirm every committed Phase 5 file is intentional and the existing uncommitted Phase 4 files are still present but not included in Phase 5 commits.

- [ ] **Step 5: Report completion without merging**

Provide the user with the branch name, commit list, implementation summary, verification results, and any infrastructure-dependent checks that could not run. Do not merge into `dev` until explicitly requested.
