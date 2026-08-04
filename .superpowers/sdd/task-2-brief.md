## Task 2: Complete Candidate Application Integrity and Detail

**Files:**
- Modify: `backend/src/database/schema.ts:281-326` and tenant `applications` definition
- Modify: `backend/drizzle/template-schema.sql:7`
- Create: generated migration under `backend/drizzle/` from `npx drizzle-kit generate`
- Modify: `backend/src/modules/candidate-account/dto/apply.dto.ts`
- Modify: `backend/src/repositories/application.repository.ts`
- Modify: `backend/src/repositories/candidate-applications-index.repository.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts`
- Test: `backend/src/modules/candidate-account/candidate-account.service.spec.ts`
- Test: `backend/src/repositories/candidate-applications-index.repository.spec.ts` (create if absent)

**Interfaces:**
- Consumes: Open indexed job lookup and explicit tenant repository calls.
- Produces: `GET /candidate/applications/:id`, validated application overrides, persisted cover letters, candidate ownership checks, and a database-enforced duplicate boundary.

- [ ] **Step 1: Add failing unit tests for ownership, skill validation, and cover-letter propagation.**

Add mocks and tests proving:

```ts
it('rejects an application detail not owned by the candidate', async () => {
  candidateApplicationsIndexRepo.findByCandidateAndApplication.mockResolvedValue(null);

  await expect(service.getApplicationDetail('candidate-a', 'app-a')).rejects.toThrow(
    NotFoundException,
  );
});

it('rejects unknown override skills before creating an application', async () => {
  jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
    tenantId: 't1',
    jobPostingId: 'j1',
    status: 'open',
    title: 'Engineer',
    companyName: 'Acme',
  });
  candidateAccountRepo.findById.mockResolvedValue({
    id: 'candidate-a',
    email: 'candidate@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
  });
  candidateApplicationsIndexRepo.findByJob.mockResolvedValue(null);
  skillRepo.findByIds.mockResolvedValue([{ id: 'known-skill' }]);

  await expect(
    service.apply('candidate-a', 't1', 'j1', { skillIds: ['known-skill', 'missing'] }),
  ).rejects.toThrow(BadRequestException);
  expect(applicationRepo.create).not.toHaveBeenCalled();
});
```

Add an apply success assertion that `applicationRepo.create` receives `coverLetter: 'Interested in the role'`.

- [ ] **Step 2: Run the focused tests and verify the new cases fail.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts
```

Expected: FAIL because the detail method, ownership lookup, skill validation, and cover-letter field do not exist yet.

- [ ] **Step 3: Extend the schema and migration inputs.**

Add the tenant application column:

```ts
coverLetter: text('cover_letter'),
```

Add the same column to `backend/drizzle/template-schema.sql` indirectly by keeping the template created with `LIKE public.applications INCLUDING ALL`; the public Drizzle schema must define the column before the template is recreated.

Add a unique index to `candidateApplicationsIndex`:

```ts
uniqueCandidateApplication: uniqueIndex(
  'unique_candidate_application',
).on(
  table.candidateAccountId,
  table.tenantId,
  table.jobPostingId,
),
```

Update `ApplicationRepository.create` input and `selectAppRow` to include `coverLetter`.

Generate the migration:

```text
cd backend && npx drizzle-kit generate
```

Inspect the generated SQL. It must add `cover_letter` to every existing `tenant_%` applications table and `template.applications`, and add the unique public index. Apply it through the local bootstrap procedure before integration tests.

- [ ] **Step 4: Add index ownership and tenant-scoped status methods.**

Add these repository methods:

```ts
async findByCandidateAndApplication(candidateAccountId: string, applicationId: string) {
  return this.withDb('public', async (db) => {
    const rows = await db
      .select()
      .from(candidateApplicationsIndex)
      .where(
        and(
          eq(candidateApplicationsIndex.candidateAccountId, candidateAccountId),
          eq(candidateApplicationsIndex.applicationId, applicationId),
        ),
      )
      .limit(1)
      .execute();
    return rows[0] ?? null;
  });
}

async updateStatus(applicationId: string, tenantId: string, status: string) {
  return this.withDb('public', async (db) => {
    const rows = await db
      .update(candidateApplicationsIndex)
      .set({ status })
      .where(
        and(
          eq(candidateApplicationsIndex.applicationId, applicationId),
          eq(candidateApplicationsIndex.tenantId, tenantId),
        ),
      )
      .returning()
      .execute();
    return rows[0] ?? null;
  });
}
```

Add `findByIdForCandidate(applicationId, schema)` to `ApplicationRepository`, using the existing joined select but returning the cover letter and no notes. The service will supply the schema only after the public ownership lookup succeeds. Add this compensating method for a failed public-index insert:

```ts
async delete(id: string, schema = 'current') {
  return this.withDb(schema, (db) =>
    db.delete(applications).where(eq(applications.id, id)).execute(),
  );
}
```

- [ ] **Step 5: Implement validated apply and candidate application detail.**

Update `ApplyJobSchema` to bound cover letters:

```ts
export const ApplyJobSchema = z.object({
  phone: z.string().max(50).optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  coverLetter: z.string().max(5000).optional(),
});
```

In `CandidateAccountService.apply`:

1. Resolve the job with `findOpenByTenantAndJob`.
2. Resolve the candidate account.
3. Check `findByJob(candidateAccountId, tenantId, jobPostingId)`.
4. Choose `dto.skillIds` or profile skills.
5. Deduplicate the chosen IDs and call `skillRepo.findByIds`.
6. Throw `BadRequestException('One or more skill IDs are invalid')` unless every ID exists.
7. Create the tenant candidate/application with `coverLetter` and the computed score.
8. Create the public application index row.
9. If the index insert fails after the tenant application is created, delete the created tenant application and rethrow.

Add:

```ts
async getApplicationDetail(candidateAccountId: string, applicationId: string) {
  const indexed = await this.candidateApplicationsIndexRepo.findByCandidateAndApplication(
    candidateAccountId,
    applicationId,
  );
  if (!indexed) throw new NotFoundException('Application not found');

  const application = await this.applicationRepo.findByIdForCandidate(
    applicationId,
    `tenant_${indexed.tenantId}`,
  );
  if (!application) throw new NotFoundException('Application not found');

  return {
    ...indexed,
    matchScore: application.matchScore,
    appliedSkillIds: application.appliedSkillIds,
    coverLetter: application.coverLetter,
  };
}
```

Add `@Get('applications/:id')` with the same candidate guards as the collection endpoint and pass `user.userId` to the service.

- [ ] **Step 6: Run the focused tests and verify they pass.**

Run:

```text
cd backend && npm test -- --runInBand src/modules/candidate-account/candidate-account.service.spec.ts
cd backend && npm run typecheck
```

Expected: all focused tests pass and TypeScript reports no errors. Commit:

```text
git add backend/src/database/schema.ts backend/drizzle/template-schema.sql backend/drizzle backend/src/modules/candidate-account backend/src/repositories/application.repository.ts backend/src/repositories/candidate-applications-index.repository.ts
git commit -m "feat(m5b): harden candidate applications and ownership"
```

---

