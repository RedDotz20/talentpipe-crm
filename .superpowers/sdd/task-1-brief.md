## Task 1: Lock the Phase 5b Route Boundary

**Files:**
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts:38-49`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts:37-47`
- Modify: `backend/src/repositories/job-listings-index.repository.ts:46-62`
- Test: `backend/src/modules/candidate-account/candidate-account.service.spec.ts`
- Test: `backend/src/common/guards/candidate-auth.guard.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `AuthGuard('jwt')`, `CandidateAuthGuard`, `JobListingsIndexRepository.findOpenByTenantAndJob(tenantId, jobPostingId)`.
- Produces: Candidate job list/detail routes that reject unauthenticated users and candidate detail that returns only open indexed jobs.

- [ ] **Step 1: Add failing service tests for closed and draft candidate jobs.**

Add cases to `candidate-account.service.spec.ts` that configure `jobListingsIndexRepo.findOpenByTenantAndJob` to return `null` for a closed or draft row and assert `service.getJobDetail('t1', 'j1')` rejects with `NotFoundException`. Add a case asserting an open row is returned.

```ts
it('hides non-open jobs from candidate detail', async () => {
  jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue(null);

  await expect(service.getJobDetail('t1', 'j1')).rejects.toThrow(
    NotFoundException,
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts
```

Expected: FAIL because `getJobDetail` currently uses `findById` without requiring `status = 'open'`.

- [ ] **Step 3: Implement the open-job lookup.**

Use the existing repository method:

```ts
async findOpenByTenantAndJob(tenantId: string, jobPostingId: string) {
  return this.withDb('public', async (db) => {
    const rows = await db
      .select()
      .from(jobListingsIndex)
      .where(
        and(
          eq(jobListingsIndex.tenantId, tenantId),
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

Change `getJobDetail` to call `findOpenByTenantAndJob` and throw `NotFoundException('Job posting not found')` for `null`. Use the same open lookup in bookmark creation and apply rather than relying on a possibly stale non-open index row.

- [ ] **Step 4: Add guards to candidate job list and detail routes.**

Apply both guards to `GET /candidate/jobs` and `GET /candidate/jobs/:tenantId/:jobId`:

```ts
@Get('jobs')
@UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
async listJobs(@Query('search') search?: string) {
  return this.candidateAccountService.getJobs(search);
}
```

Use the same decorator order and guard pattern already used by the protected candidate routes.

- [ ] **Step 5: Run focused tests and commit the boundary fix.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts src/common/guards/candidate-auth.guard.spec.ts
```

Expected: PASS. Commit:

```text
git add backend/src/modules/candidate-account backend/src/repositories/job-listings-index.repository.ts backend/src/common/guards/candidate-auth.guard.spec.ts
git commit -m "fix(m5b): enforce candidate job visibility boundary"
```

---

