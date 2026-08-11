# M15 — Backend-Driven Search, Filter, Sort & Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend-driven search, filter, sorting and server-side pagination to all 13 list endpoints across candidate, company, platform and public-careers surfaces.

**Architecture:** One shared Zod `ListQuerySchema` (`search`, `page`, `pageSize`, `sortBy`, `sortDir`) validated via the existing `ZodValidationPipe` on `@Query()`. Single-schema lists run search/sort/page in SQL through small pure helpers (`toWhere`, `toOrderBy`, `toPagination`, `listEnvelope`) in a new `list-query.helper.ts`. Platform lists (which aggregate N company schemas) apply search/sort/page in-memory in the service. Every upgraded endpoint returns `{ data, total, page, pageSize }`. Frontend gets one shared `useListQuery` hook + one `ListControls` component; all pages switch to server-driven `Pagination`.

**Tech Stack:** NestJS 11, Drizzle ORM (rc4), Zod 4, React 19, Mantine 9 (`@mantine/hooks` — `useDebouncedValue`), TanStack Query 5.

## Global Constraints

- Sort columns are **whitelisted per endpoint** — never pass user input into `orderBy`. Unknown `sortBy` falls back to the endpoint default.
- All upgraded list endpoints return the envelope `{ data, total, page, pageSize }` — shape change is breaking; frontend updated in the same milestone.
- `pageSize` cap: 50. `page` minimum: 1. `search` trimmed, max 100 chars.
- `GET /applications` (company) is the **one exception**: search + filters only, **no pagination** (PipelineBoard kanban + InterviewScheduler need full lists; response stays a plain array).
- SQL search uses `ilike %term%` (matches the `skill.repository.ts` precedent). No new migrations, no new indexes.
- Envelope keys named exactly `data`, `total`, `page`, `pageSize` (backend) and `ListQueryParams`/`Paginated<T>` (frontend).
- Commit tags: `feat(m15): <topic>`; docs commits: `docs(m15): <topic>`.
- Every task ends with its own commit after tests/typecheck pass.

---

### Task 1: Shared ListQuery DTO + list-query helper + unit tests

**Files:**
- Create: `backend/src/common/dto/list-query.dto.ts`
- Create: `backend/src/repositories/list-query.helper.ts`
- Test: `backend/src/repositories/list-query.helper.spec.ts`

**Interfaces:**
- Produces: `ListQuerySchema`, `ListQueryDto` (used by every controller task), and helpers `toWhere`, `toOrderBy`, `toPagination`, `listEnvelope`, `inMemorySearch`, `sortAndPageInMemory` (used by every repo/service task).

- [ ] **Step 1: Write the DTO**

Create `backend/src/common/dto/list-query.dto.ts`:

```ts
import { z } from 'zod';

export const ListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z.string().trim().max(50).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type ListQueryDto = z.infer<typeof ListQuerySchema>;
```

Note: `sortDir` is optional so per-endpoint defaults can differ (interviews default `asc`, platform users default `asc`, everything else `desc`).

- [ ] **Step 2: Write the helper**

Create `backend/src/repositories/list-query.helper.ts`:

```ts
import { and, asc, desc, ilike, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { ListQueryDto } from '../common/dto/list-query.dto';

export interface ListQuerySortOptions {
  sortMap: Record<string, PgColumn>;
  defaultSortBy: string;
  defaultSortDir?: 'asc' | 'desc';
}

export const toWhere = (
  query: ListQueryDto,
  searchColumns: PgColumn[],
): SQL[] => {
  if (!query.search || searchColumns.length === 0) return [];
  const pattern = `%${query.search}%`;
  return [
    or(
      ...searchColumns.map((column) => ilike(column, pattern)),
    ) as SQL,
  ];
};

export const toOrderBy = (
  query: ListQueryDto,
  options: ListQuerySortOptions,
) => {
  const column =
    options.sortMap[query.sortBy ?? ''] ?? options.sortMap[options.defaultSortBy];
  const dir = query.sortDir ?? options.defaultSortDir ?? 'desc';
  return dir === 'asc' ? asc(column) : desc(column);
};

export const toPagination = (query: ListQueryDto) => ({
  offset: (query.page - 1) * query.pageSize,
  limit: query.pageSize,
});

export const listEnvelope = <T>(
  data: T[],
  total: number,
  query: ListQueryDto,
) => ({
  data,
  total,
  page: query.page,
  pageSize: query.pageSize,
});

export const inMemorySearch = <T>(
  rows: T[],
  search: string | undefined,
  fields: readonly (keyof T)[],
): T[] => {
  if (!search) return rows;
  const term = search.toLowerCase();
  return rows.filter((row) =>
    fields.some((field) =>
      String((row as Record<keyof T, unknown>)[field] ?? '')
        .toLowerCase()
        .includes(term),
    ),
  );
};

export const sortAndPageInMemory = <T>(
  rows: T[],
  query: ListQueryDto,
  valueOf: (row: T, sortBy: string) => string | number | Date | null,
  defaultSortBy: string,
  defaultSortDir: 'asc' | 'desc' = 'desc',
): { data: T[]; total: number } => {
  const sortBy = query.sortBy ?? defaultSortBy;
  const dir = (query.sortDir ?? defaultSortDir) === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    const av = valueOf(a, sortBy) ?? '';
    const bv = valueOf(b, sortBy) ?? '';
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return 0;
  });
  const total = sorted.length;
  const start = (query.page - 1) * query.pageSize;
  return { data: sorted.slice(start, start + query.pageSize), total };
};

export const andConditions = (...groups: SQL[][]): SQL | undefined => {
  const flattened = groups.flat();
  return flattened.length > 0 ? and(...flattened) : undefined;
};
```

- [ ] **Step 3: Write the unit tests**

Create `backend/src/repositories/list-query.helper.spec.ts`:

```ts
import {
  andConditions,
  inMemorySearch,
  listEnvelope,
  sortAndPageInMemory,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import { eq } from 'drizzle-orm';
import { jobListingsIndex } from '../database/schema';

const baseQuery = {
  search: undefined,
  page: 1,
  pageSize: 10,
  sortBy: undefined,
  sortDir: undefined as 'asc' | 'desc' | undefined,
};

describe('list-query.helper', () => {
  describe('toPagination', () => {
    it('computes offset/limit from page and pageSize', () => {
      expect(toPagination({ ...baseQuery, page: 3, pageSize: 25 })).toEqual({
        offset: 50,
        limit: 25,
      });
    });
  });

  describe('toWhere', () => {
    it('returns an empty array when no search', () => {
      expect(
        toWhere(baseQuery, [jobListingsIndex.title]),
      ).toEqual([]);
    });

    it('builds an ilike OR condition for the searchable columns', () => {
      const conditions = toWhere(
        { ...baseQuery, search: 'engineer' },
        [jobListingsIndex.title, jobListingsIndex.companyName],
      );
      expect(conditions).toHaveLength(1);
      expect(JSON.stringify(conditions[0])).toContain('ilike');
    });
  });

  describe('toOrderBy', () => {
    const options = {
      sortMap: {
        createdAt: jobListingsIndex.createdAt,
        title: jobListingsIndex.title,
      },
      defaultSortBy: 'createdAt',
    };

    it('falls back to the default column for unknown sortBy', () => {
      const sql = toOrderBy({ ...baseQuery, sortBy: 'DROP TABLE x' }, options);
      expect(JSON.stringify(sql)).toContain('"job_listings_index"."created_at"');
    });

    it('honours sortDir asc', () => {
      const sql = toOrderBy(
        { ...baseQuery, sortBy: 'title', sortDir: 'asc' },
        options,
      );
      expect(JSON.stringify(sql)).toContain('asc');
    });
  });

  describe('listEnvelope', () => {
    it('returns data, total, page, pageSize', () => {
      expect(listEnvelope([{ id: 1 }], 42, { ...baseQuery, page: 2 })).toEqual({
        data: [{ id: 1 }],
        total: 42,
        page: 2,
        pageSize: 10,
      });
    });
  });

  describe('inMemorySearch', () => {
    const rows = [
      { name: 'Alice Smith', company: 'Acme' },
      { name: 'Bob Jones', company: 'Globex' },
    ];

    it('returns all rows when no search', () => {
      expect(inMemorySearch(rows, undefined, ['name'])).toHaveLength(2);
    });

    it('filters case-insensitively across the given fields', () => {
      expect(inMemorySearch(rows, 'acme', ['name', 'company'])).toEqual([
        { name: 'Alice Smith', company: 'Acme' },
      ]);
    });
  });

  describe('sortAndPageInMemory', () => {
    const rows = [
      { id: 'a', appliedAt: '2026-01-01' },
      { id: 'b', appliedAt: '2026-02-01' },
      { id: 'c', appliedAt: '2026-03-01' },
    ];
    const valueOf = (row: { appliedAt: string }, sortBy: string) =>
      sortBy === 'appliedAt' ? row.appliedAt : '';

    it('sorts desc by default and pages', () => {
      const result = sortAndPageInMemory(
        rows,
        { ...baseQuery, page: 1, pageSize: 2 },
        valueOf,
        'appliedAt',
      );
      expect(result.total).toBe(3);
      expect(result.data.map((r) => r.id)).toEqual(['c', 'b']);
    });

    it('sorts asc when requested', () => {
      const result = sortAndPageInMemory(
        rows,
        { ...baseQuery, page: 1, pageSize: 10, sortDir: 'asc' },
        valueOf,
        'appliedAt',
      );
      expect(result.data.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('andConditions', () => {
    it('returns undefined when no conditions', () => {
      expect(andConditions([], [])).toBeUndefined();
    });

    it('flattens groups into one AND', () => {
      const result = andConditions(
        [eq(jobListingsIndex.companyId, 'c1')],
        [eq(jobListingsIndex.status, 'open')],
      );
      expect(result).toBeDefined();
    });
  });
});
```

- [ ] **Step 4: Run the unit tests**

Run: `cd backend && npx jest src/repositories/list-query.helper.spec.ts`
Expected: all pass.

- [ ] **Step 5: Verify typecheck + lint**

Run: `cd backend && npm run typecheck && npm run lint`
Expected: clean (no errors).

- [ ] **Step 6: Commit**

```bash
git add backend/src/common/dto/list-query.dto.ts backend/src/repositories/list-query.helper.ts backend/src/repositories/list-query.helper.spec.ts
git commit -m "feat(m15): shared list-query DTO and helpers"
```

---

### Task 2: Candidate jobs endpoint (`GET /candidate/jobs`)

Search/filter/sort/pagination move into SQL; the JS post-filter (suspended/deleted companies) moves into the WHERE clause so `total` is correct.

**Files:**
- Modify: `backend/src/repositories/job-listings-index.repository.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts` (getJobs, lines 105-115)
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts` (lines 39-43)
- Test: `backend/src/modules/candidate-account/candidate-account.service.spec.ts` (job search block, lines 368-399)

**Interfaces:**
- Consumes: `ListQueryDto`, `toWhere`, `toOrderBy`, `toPagination`, `listEnvelope`, `andConditions`
- Produces: `JobListingsIndexRepository.findAll(query: ListQueryDto & { employmentType?: string; workSetup?: string }): Promise<{ data: JobListingsIndexRow[]; total: number }>`; `CandidateAccountService.getJobs(query): Promise<{ data; total }>`; controller accepts `search`, `page`, `pageSize`, `sortBy`, `sortDir`, `employmentType`, `workSetup`.

- [ ] **Step 1: Update the repository**

In `backend/src/repositories/job-listings-index.repository.ts`, replace the imports and the `findAll` method:

Imports — add `count`, `inArray`, `eq` (already there), and the helper + companies table:

```ts
import { Injectable } from '@nestjs/common';
import { eq, and, desc, count, inArray } from 'drizzle-orm';
import { jobListingsIndex, companies } from '../database/schema';
import { BaseRepository } from './base.repository';
import {
  andConditions,
  listEnvelope,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';
```

Replace `findAll` (lines 8-28):

```ts
async findAll(query: ListQueryDto & { employmentType?: string; workSetup?: string }) {
  return this.withDb('public', async (db) => {
    const searchColumns = [
      jobListingsIndex.title,
      jobListingsIndex.companyName,
      jobListingsIndex.location,
    ];
    const conditions = andConditions(
      [
        eq(jobListingsIndex.status, 'open'),
        // SQL-side exclusion keeps pagination totals correct: index rows of
        // suspended (or hard-deleted) companies never match.
        inArray(
          jobListingsIndex.companyId,
          db
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.status, 'active')),
        ),
      ],
      query.employmentType
        ? [eq(jobListingsIndex.employmentType, query.employmentType)]
        : [],
      query.workSetup ? [eq(jobListingsIndex.workSetup, query.workSetup)] : [],
      toWhere(query, searchColumns),
    );
    const sortOptions = {
      sortMap: {
        createdAt: jobListingsIndex.createdAt,
        title: jobListingsIndex.title,
        companyName: jobListingsIndex.companyName,
      },
      defaultSortBy: 'createdAt',
    };
    const { offset, limit } = toPagination(query);
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(jobListingsIndex)
        .where(conditions)
        .orderBy(toOrderBy(query, sortOptions))
        .limit(limit)
        .offset(offset)
        .execute(),
      db
        .select({ value: count() })
        .from(jobListingsIndex)
        .where(conditions)
        .execute(),
    ]);
    return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
  });
}
```

Note: `findOpenByCompany` gets its query param in Task 8 — leave it untouched for now.

- [ ] **Step 2: Update the service**

In `backend/src/modules/candidate-account/candidate-account.service.ts`:
- Add import: `import type { ListQueryDto } from '../../common/dto/list-query.dto';`
- Replace `getJobs` (lines 105-115):

```ts
async getJobs(query: ListQueryDto & { employmentType?: string; workSetup?: string }) {
  // Filtering (suspended/deleted companies) now lives in the repo WHERE clause.
  return this.jobListingsIndexRepo.findAll(query);
}
```

- [ ] **Step 3: Update the controller**

In `backend/src/modules/candidate-account/candidate-account.controller.ts`:
- Add imports:

```ts
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';
```

(`ZodValidationPipe` is already imported — reuse the existing import line.)

- Replace the `listJobs` handler (lines 39-43):

```ts
@Get('jobs')
@UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
async listJobs(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('employmentType') employmentType?: string,
  @Query('workSetup') workSetup?: string,
) {
  return this.candidateAccountService.getJobs({
    ...query,
    employmentType,
    workSetup,
  });
}
```

- [ ] **Step 4: Update the service spec**

In `backend/src/modules/candidate-account/candidate-account.service.spec.ts`, replace the whole `describe('job search', ...)` block (lines 368-399) with:

```ts
describe('job search', () => {
  it('returns the repository envelope and passes the query through', async () => {
    jobListingsIndexRepo.findAll.mockResolvedValue({
      data: [{ companyId: 't1', jobPostingId: 'j1', title: 'Live job' }],
      total: 1,
    });

    const jobs = await service.getJobs({
      search: 'engineer',
      page: 1,
      pageSize: 10,
      sortBy: 'title',
      sortDir: 'asc',
      employmentType: 'full-time',
      workSetup: 'hybrid',
    });

    expect(jobListingsIndexRepo.findAll).toHaveBeenCalledWith({
      search: 'engineer',
      page: 1,
      pageSize: 10,
      sortBy: 'title',
      sortDir: 'asc',
      employmentType: 'full-time',
      workSetup: 'hybrid',
    });
    expect(jobs).toEqual({
      data: [{ companyId: 't1', jobPostingId: 'j1', title: 'Live job' }],
      total: 1,
    });
  });
});
```

Note: the old tests asserted the JS suspended/deleted filter. That logic now lives in SQL (repo), so `tenantRepo.findAll` is no longer called by `getJobs` — the mock remains available for other tests.

- [ ] **Step 5: Run unit tests, typecheck, lint**

Run: `cd backend && npx jest src/modules/candidate-account/candidate-account.service.spec.ts src/repositories/list-query.helper.spec.ts && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/job-listings-index.repository.ts backend/src/modules/candidate-account/
git commit -m "feat(m15): candidate jobs search/filter/sort/pagination"
```

---

### Task 3: Candidate applications + bookmarks endpoints

**Files:**
- Modify: `backend/src/repositories/candidate-applications-index.repository.ts` (findByCandidate, lines 8-19)
- Modify: `backend/src/repositories/candidate-bookmark.repository.ts` (findByCandidate, lines 8-16)
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts` (getApplications line 321-325, getBookmarks line 413-415)
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts` (lines 74-78, 136-140)

**Interfaces:**
- Consumes: `ListQueryDto`, helper functions from Task 1
- Produces: `CandidateApplicationsIndexRepository.findByCandidate(candidateAccountId: string, query: ListQueryDto & { status?: string }): Promise<{ data; total }>`; `CandidateBookmarkRepository.findByCandidate(candidateAccountId: string, query: ListQueryDto): Promise<{ data; total }>`.

- [ ] **Step 1: Update candidate applications index repository**

In `backend/src/repositories/candidate-applications-index.repository.ts`:
- Add imports:

```ts
import { eq, desc, and, count } from 'drizzle-orm';
import {
  andConditions,
  listEnvelope,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';
```

- Replace `findByCandidate` (lines 8-19):

```ts
async findByCandidate(
  candidateAccountId: string,
  query: ListQueryDto & { status?: string },
) {
  return this.withDb('public', async (db) => {
    const conditions = andConditions(
      [
        eq(candidateApplicationsIndex.candidateAccountId, candidateAccountId),
      ],
      query.status ? [eq(candidateApplicationsIndex.status, query.status)] : [],
      toWhere(query, [
        candidateApplicationsIndex.jobTitle,
        candidateApplicationsIndex.companyName,
      ]),
    );
    const sortOptions = {
      sortMap: {
        appliedAt: candidateApplicationsIndex.appliedAt,
        jobTitle: candidateApplicationsIndex.jobTitle,
        companyName: candidateApplicationsIndex.companyName,
      },
      defaultSortBy: 'appliedAt',
    };
    const { offset, limit } = toPagination(query);
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(candidateApplicationsIndex)
        .where(conditions)
        .orderBy(toOrderBy(query, sortOptions))
        .limit(limit)
        .offset(offset)
        .execute(),
      db
        .select({ value: count() })
        .from(candidateApplicationsIndex)
        .where(conditions)
        .execute(),
    ]);
    return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
  });
}
```

- [ ] **Step 2: Update candidate bookmark repository**

In `backend/src/repositories/candidate-bookmark.repository.ts`:
- Add imports:

```ts
import { eq, and, count } from 'drizzle-orm';
import {
  andConditions,
  listEnvelope,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';
```

- Replace `findByCandidate` (lines 8-16):

```ts
async findByCandidate(candidateAccountId: string, query: ListQueryDto) {
  return this.withDb('public', async (db) => {
    const conditions = andConditions(
      [eq(candidateBookmarks.candidateAccountId, candidateAccountId)],
      toWhere(query, [
        candidateBookmarks.jobTitle,
        candidateBookmarks.companyName,
      ]),
    );
    const sortOptions = {
      sortMap: {
        createdAt: candidateBookmarks.createdAt,
        jobTitle: candidateBookmarks.jobTitle,
        companyName: candidateBookmarks.companyName,
      },
      defaultSortBy: 'createdAt',
    };
    const { offset, limit } = toPagination(query);
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(candidateBookmarks)
        .where(conditions)
        .orderBy(toOrderBy(query, sortOptions))
        .limit(limit)
        .offset(offset)
        .execute(),
      db
        .select({ value: count() })
        .from(candidateBookmarks)
        .where(conditions)
        .execute(),
    ]);
    return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
  });
}
```

- [ ] **Step 3: Update the service**

In `backend/src/modules/candidate-account/candidate-account.service.ts`:

Replace `getApplications` (lines 321-325):

```ts
async getApplications(
  candidateAccountId: string,
  query: ListQueryDto & { status?: string },
) {
  return this.candidateApplicationsIndexRepo.findByCandidate(
    candidateAccountId,
    query,
  );
}
```

Replace `getBookmarks` (lines 413-415):

```ts
async getBookmarks(candidateAccountId: string, query: ListQueryDto) {
  return this.candidateBookmarkRepo.findByCandidate(candidateAccountId, query);
}
```

- [ ] **Step 4: Update the controller**

In `backend/src/modules/candidate-account/candidate-account.controller.ts`:

Replace the `getApplications` handler (lines 74-78):

```ts
@Get('applications')
@UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
async getApplications(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('status') status?: string,
  @CurrentUser() user: CompanyContext,
) {
  return this.candidateAccountService.getApplications(user.userId, {
    ...query,
    status,
  });
}
```

Replace the `getBookmarks` handler (lines 136-140):

```ts
@Get('bookmarks')
@UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
async getBookmarks(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @CurrentUser() user: CompanyContext,
) {
  return this.candidateAccountService.getBookmarks(user.userId, query);
}
```

- [ ] **Step 5: Run unit tests, typecheck, lint**

Run: `cd backend && npx jest src/modules/candidate-account/ && npm run typecheck && npm run lint`
Expected: all pass (existing spec mocks `findByCandidate`/`findByCandidateAndApplication` with `mockResolvedValue`, which is arg-agnostic).

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/candidate-applications-index.repository.ts backend/src/repositories/candidate-bookmark.repository.ts backend/src/modules/candidate-account/
git commit -m "feat(m15): candidate applications + bookmarks search/sort/pagination"
```

---

### Task 4: Company job-postings + candidates endpoints

**Files:**
- Modify: `backend/src/repositories/job-posting.repository.ts` (add `findPaginated`, keep `findAll`)
- Modify: `backend/src/repositories/candidate.repository.ts` (add `findPaginated`, keep `findAll`)
- Modify: `backend/src/modules/job-postings/job-postings.service.ts` (list)
- Modify: `backend/src/modules/job-postings/job-postings.controller.ts` (list)
- Modify: `backend/src/modules/candidates/candidates.service.ts` (list)
- Modify: `backend/src/modules/candidates/candidates.controller.ts` (list)
- Test: `backend/src/modules/job-postings/job-postings.service.spec.ts` (list test), `backend/src/modules/candidates/candidates.service.spec.ts` (list test)

**Interfaces:**
- Consumes: `ListQueryDto`, helpers
- Produces: `JobPostingRepository.findPaginated(query: ListQueryDto & { status?: string }, schema = 'current'): Promise<{ data; total }>`; `CandidateRepository.findPaginated(query: ListQueryDto, schema = 'current'): Promise<{ data; total }>`.

- [ ] **Step 1: Add findPaginated to job-posting repository**

In `backend/src/repositories/job-posting.repository.ts`:
- Update imports:

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc, count } from 'drizzle-orm';
import { jobPostings, jobRequiredSkills } from '../database/schema';
import { BaseRepository } from './base.repository';
import {
  andConditions,
  listEnvelope,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';
```

- Add this method after `findAll` (line 18):

```ts
async findPaginated(
  query: ListQueryDto & { status?: string },
  schema = 'current',
) {
  return this.withDb(schema, async (db) => {
    const conditions = andConditions(
      query.status ? [eq(jobPostings.status, query.status)] : [],
      toWhere(query, [jobPostings.title]),
    );
    const sortOptions = {
      sortMap: {
        createdAt: jobPostings.createdAt,
        title: jobPostings.title,
      },
      defaultSortBy: 'createdAt',
    };
    const { offset, limit } = toPagination(query);
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(jobPostings)
        .where(conditions)
        .orderBy(toOrderBy(query, sortOptions))
        .limit(limit)
        .offset(offset)
        .execute(),
      db
        .select({ value: count() })
        .from(jobPostings)
        .where(conditions)
        .execute(),
    ]);
    return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
  });
}
```

- [ ] **Step 2: Add findPaginated to candidate repository**

In `backend/src/repositories/candidate.repository.ts`:
- Update imports:

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc, count } from 'drizzle-orm';
import { candidates } from '../database/schema';
import { BaseRepository } from './base.repository';
import {
  andConditions,
  listEnvelope,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';
```

- Add this method after `findAll` (line 16):

```ts
async findPaginated(query: ListQueryDto, schema = 'current') {
  return this.withDb(schema, async (db) => {
    const conditions = andConditions(
      toWhere(query, [candidates.name, candidates.email]),
    );
    const sortOptions = {
      sortMap: {
        name: candidates.name,
        createdAt: candidates.createdAt,
      },
      defaultSortBy: 'createdAt',
    };
    const { offset, limit } = toPagination(query);
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(candidates)
        .where(conditions)
        .orderBy(toOrderBy(query, sortOptions))
        .limit(limit)
        .offset(offset)
        .execute(),
      db
        .select({ value: count() })
        .from(candidates)
        .where(conditions)
        .execute(),
    ]);
    return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
  });
}
```

- [ ] **Step 3: Update job-postings service + controller**

`backend/src/modules/job-postings/job-postings.service.ts` — replace `list` (line 31):

```ts
list(status: string | undefined, query: ListQueryDto) {
  return this.jobPostingRepo.findPaginated({ ...query, status });
}
```

Add import: `import type { ListQueryDto } from '../../common/dto/list-query.dto';`

`backend/src/modules/job-postings/job-postings.controller.ts` — replace the `list` handler (lines 35-40):

```ts
@Get()
@UseGuards(AuthGuard('jwt'))
@Roles(...VIEW_ROLES)
list(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('status') status?: string,
) {
  return this.jobPostingsService.list(status, query);
}
```

Add import: `import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';` (`ZodValidationPipe` already imported).

- [ ] **Step 4: Update candidates service + controller**

`backend/src/modules/candidates/candidates.service.ts` — replace `list` (lines 22-24):

```ts
list(query: ListQueryDto) {
  return this.candidateRepo.findPaginated(query);
}
```

Add import: `import type { ListQueryDto } from '../../common/dto/list-query.dto';`

`backend/src/modules/candidates/candidates.controller.ts` — replace the `list` handler (lines 26-31):

```ts
@Get()
@UseGuards(AuthGuard('jwt'))
@Roles(...VIEW_ROLES)
list(@Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto) {
  return this.candidatesService.list(query);
}
```

Add imports: `import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';` and `import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';`

- [ ] **Step 5: Update the two service specs**

`backend/src/modules/job-postings/job-postings.service.spec.ts` — find the `list` test (around lines 50-56) and replace:

```ts
it('lists job postings', async () => {
  jobPostingRepo.findPaginated.mockResolvedValue({
    data: [{ id: 'p1' }],
    total: 1,
  });

  const result = await service.list('draft', {
    search: undefined,
    page: 1,
    pageSize: 10,
    sortBy: undefined,
    sortDir: undefined,
  });

  expect(jobPostingRepo.findPaginated).toHaveBeenCalledWith({
    search: undefined,
    page: 1,
    pageSize: 10,
    sortBy: undefined,
    sortDir: undefined,
    status: 'draft',
  });
  expect(result).toEqual({ data: [{ id: 'p1' }], total: 1 });
});
```

`backend/src/modules/candidates/candidates.service.spec.ts` — find the `list` test (around line 55-60) and replace:

```ts
it('lists candidates', async () => {
  candidateRepo.findPaginated.mockResolvedValue({
    data: [{ id: 'c1' }],
    total: 1,
  });

  const result = await service.list({
    search: undefined,
    page: 1,
    pageSize: 10,
    sortBy: undefined,
    sortDir: undefined,
  });

  expect(candidateRepo.findPaginated).toHaveBeenCalledWith({
    search: undefined,
    page: 1,
    pageSize: 10,
    sortBy: undefined,
    sortDir: undefined,
  });
  expect(result).toEqual({ data: [{ id: 'c1' }], total: 1 });
});
```

If the specs use a differently-shaped mock object (check the top of each spec for the mock constructor), adapt the `mockResolvedValue` shape accordingly. If the old test asserted `findAll` was called with `'draft'`, delete that assertion.

- [ ] **Step 6: Run unit tests, typecheck, lint**

Run: `cd backend && npx jest src/modules/job-postings/ src/modules/candidates/ && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/repositories/job-posting.repository.ts backend/src/repositories/candidate.repository.ts backend/src/modules/job-postings/ backend/src/modules/candidates/
git commit -m "feat(m15): company job-postings + candidates search/sort/pagination"
```

---

### Task 5: Company interviews + applications endpoints

`GET /applications` gets search + sort only (no pagination, plain array stays — PipelineBoard/Scheduler depend on it).

**Files:**
- Modify: `backend/src/repositories/interview.repository.ts` (add `findPaginated`, keep `findAll`)
- Modify: `backend/src/repositories/application.repository.ts` (add `findAllFiltered`, keep `findAll`)
- Modify: `backend/src/modules/interviews/interviews.service.ts` (list)
- Modify: `backend/src/modules/interviews/interviews.controller.ts` (list)
- Modify: `backend/src/modules/applications/applications.service.ts` (list)
- Modify: `backend/src/modules/applications/applications.controller.ts` (list)
- Test: `backend/src/modules/interviews/interviews.service.spec.ts` (list tests), `backend/src/modules/applications/applications.service.spec.ts` (list test)

**Interfaces:**
- Consumes: `ListQueryDto`, helpers
- Produces: `InterviewRepository.findPaginated(filters: { interviewerId?: string; applicationId?: string; status?: string }, query: ListQueryDto, schema = 'current'): Promise<{ data; total }>`; `ApplicationRepository.findAllFiltered(filters: { jobPostingId?: string; stageId?: string; search?: string; sortBy?: string; sortDir?: 'asc' | 'desc' }, schema = 'current'): Promise<ApplicationRow[]>` (plain array).

- [ ] **Step 1: Add findPaginated to interview repository**

In `backend/src/repositories/interview.repository.ts`:
- Update imports:

```ts
import { Injectable } from '@nestjs/common';
import { eq, asc, and, count, ilike, or } from 'drizzle-orm';
```

Add:

```ts
import { listEnvelope, toPagination } from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';
```

- Add this method after `findAll` (line 57):

```ts
async findPaginated(
  filters: { interviewerId?: string; applicationId?: string; status?: string },
  query: ListQueryDto,
  schema = 'current',
) {
  return this.withDb(schema, async (db) => {
    const conditions = [];
    if (filters?.interviewerId) {
      conditions.push(eq(interviews.interviewerId, filters.interviewerId));
    }
    if (filters?.applicationId) {
      conditions.push(eq(interviews.applicationId, filters.applicationId));
    }
    if (filters?.status) {
      conditions.push(eq(interviews.status, filters.status));
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(candidates.name, `%${query.search}%`),
          ilike(jobPostings.title, `%${query.search}%`),
        ),
      );
    }
    const sortBy = query.sortBy ?? 'scheduledAt';
    const sortDir = query.sortDir ?? 'asc';
    const orderBy =
      sortDir === 'asc'
        ? asc(sortBy === 'candidateName' ? candidates.name : interviews.scheduledAt)
        : desc(sortBy === 'candidateName' ? candidates.name : interviews.scheduledAt);
    const { offset, limit } = toPagination(query);
    const base = (withWhere: boolean) => {
      let stmt = db
        .select(selectInterviewRow)
        .from(interviews)
        .innerJoin(applications, eq(interviews.applicationId, applications.id))
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .innerJoin(users, eq(interviews.interviewerId, users.id))
        .leftJoin(
          interviewFeedbacks,
          eq(interviews.id, interviewFeedbacks.interviewId),
        );
      if (withWhere) stmt = stmt.where(and(...conditions));
      return stmt;
    };
    const [rows, totalRows] = await Promise.all([
      base(true)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset)
        .execute(),
      base(true)
        .select({ value: count() })
        .from(interviews)
        .innerJoin(applications, eq(interviews.applicationId, applications.id))
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .innerJoin(users, eq(interviews.interviewerId, users.id))
        .where(and(...conditions))
        .execute(),
    ]);
    return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
  });
}
```

Note: joins are all 1:1 (interviews→applications→candidates/jobPostings, interviewFeedbacks 1:1), so `count()` over the joined rows is exact. The count query intentionally omits the feedback join (1:1 anyway — omitted for clarity).

- [ ] **Step 2: Add findAllFiltered to application repository**

In `backend/src/repositories/application.repository.ts`:
- Update imports:

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc, and, count, ilike, or } from 'drizzle-orm';
```

- Add this method after `findAll` (line 82):

```ts
async findAllFiltered(
  filters: {
    jobPostingId?: string;
    stageId?: string;
    search?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  },
  schema = 'current',
) {
  return this.withDb(schema, async (db) => {
    const conditions = [];
    if (filters?.jobPostingId) {
      conditions.push(eq(applications.jobPostingId, filters.jobPostingId));
    }
    if (filters?.stageId) {
      conditions.push(eq(applications.currentStageId, filters.stageId));
    }
    if (filters?.search) {
      conditions.push(
        or(
          ilike(candidates.name, `%${filters.search}%`),
          ilike(jobPostings.title, `%${filters.search}%`),
        ),
      );
    }
    const sortDir = filters?.sortDir ?? 'desc';
    const orderBy =
      filters?.sortBy === 'candidateName'
        ? sortDir === 'asc'
          ? asc(candidates.name)
          : desc(candidates.name)
        : sortDir === 'asc'
          ? asc(applications.appliedAt)
          : desc(applications.appliedAt);
    return db
      .select(selectAppRow)
      .from(applications)
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
      .leftJoin(
        pipelineStages,
        eq(applications.currentStageId, pipelineStages.id),
      )
      .where(and(...conditions))
      .orderBy(orderBy)
      .execute();
  });
}
```

Add `asc` to the drizzle import line (`eq, desc, and, count, ilike, or, asc`).

- [ ] **Step 3: Update interviews service + controller**

`backend/src/modules/interviews/interviews.service.ts` — replace `list` (lines 33-38):

```ts
list(
  user: CompanyContext,
  query: ListQueryDto & { status?: string; assignedToMe?: string },
) {
  const ownOnly = user.role === 'Interviewer' || query.assignedToMe === 'true';
  const filters = {
    ...(ownOnly ? { interviewerId: user.userId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  return this.interviewRepo.findPaginated(filters, query);
}
```

Add import: `import type { ListQueryDto } from '../../common/dto/list-query.dto';`

`backend/src/modules/interviews/interviews.controller.ts` — replace the `list` handler (lines 43-51):

```ts
@Get()
@UseGuards(AuthGuard('jwt'))
@Roles(...VIEW_ROLES)
list(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('status') status?: string,
  @Query('assignedToMe') assignedToMe?: string,
  @CurrentUser() user: CompanyContext,
) {
  return this.interviewsService.list(user, {
    ...query,
    status,
    assignedToMe,
  });
}
```

Add import: `import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';`

- [ ] **Step 4: Update applications service + controller**

`backend/src/modules/applications/applications.service.ts` — replace `list` (lines 41-43):

```ts
list(
  filters?: { jobPostingId?: string; stageId?: string },
  query?: ListQueryDto,
) {
  return this.applicationRepo.findAllFiltered({
    ...filters,
    search: query?.search,
    sortBy: query?.sortBy,
    sortDir: query?.sortDir,
  });
}
```

Add import: `import type { ListQueryDto } from '../../common/dto/list-query.dto';`

`backend/src/modules/applications/applications.controller.ts` — replace the `list` handler (lines 27-36):

```ts
@Get()
@UseGuards(AuthGuard('jwt'))
@Roles(...VIEW_ROLES)
list(
  @Query('jobPostingId', new ParseUUIDPipe({ optional: true }))
  jobPostingId?: string,
  @Query('stageId', new ParseUUIDPipe({ optional: true })) stageId?: string,
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
) {
  return this.applicationsService.list({ jobPostingId, stageId }, query);
}
```

- [ ] **Step 5: Update the two service specs**

`backend/src/modules/interviews/interviews.service.spec.ts` — replace the `list` tests (lines ~60-78) with:

```ts
it('scopes to the current user when they are an Interviewer', async () => {
  interviewRepo.findPaginated.mockResolvedValue({
    data: [{ id: 'iv1' }],
    total: 1,
  });

  await service.list(
    { userId: 'u1', role: 'Interviewer' } as never,
    { page: 1, pageSize: 10 },
  );

  expect(interviewRepo.findPaginated).toHaveBeenCalledWith(
    { interviewerId: 'u1' },
    { page: 1, pageSize: 10 },
  );
});

it('lists all interviews for non-interviewers', async () => {
  interviewRepo.findPaginated.mockResolvedValue({
    data: [{ id: 'iv2' }],
    total: 1,
  });

  await service.list(
    { userId: 'u2', role: 'Recruiter' } as never,
    { page: 1, pageSize: 10 },
  );

  expect(interviewRepo.findPaginated).toHaveBeenCalledWith(
    {},
    { page: 1, pageSize: 10 },
  );
});
```

(Adapt the `user` shape to whatever the spec's existing fixtures use.)

`backend/src/modules/applications/applications.service.spec.ts` — find the `list` test (around lines 50-58) and replace:

```ts
it('lists applications', async () => {
  applicationRepo.findAllFiltered.mockResolvedValue([{ id: 'a1' }]);

  const result = await service.list(
    { jobPostingId: 'j1' },
    { search: 'alice', page: 1, pageSize: 10, sortBy: 'appliedAt', sortDir: 'desc' },
  );

  expect(applicationRepo.findAllFiltered).toHaveBeenCalledWith({
    jobPostingId: 'j1',
    search: 'alice',
    sortBy: 'appliedAt',
    sortDir: 'desc',
  });
  expect(result).toEqual([{ id: 'a1' }]);
});
```

- [ ] **Step 6: Run unit tests, typecheck, lint**

Run: `cd backend && npx jest src/modules/interviews/ src/modules/applications/ && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/repositories/interview.repository.ts backend/src/repositories/application.repository.ts backend/src/modules/interviews/ backend/src/modules/applications/
git commit -m "feat(m15): company interviews search/sort/pagination + applications search"
```

---

### Task 6: Platform companies + users endpoints

`/platform/companies` (single public-schema table → SQL). `/platform/users` (merged company+candidate rows → in-memory).

**Files:**
- Modify: `backend/src/repositories/company.repository.ts` (add `findPaginated`, keep `findAll`)
- Modify: `backend/src/modules/platform/platform.service.ts` (listCompanies)
- Modify: `backend/src/modules/platform/platform.controller.ts` (listCompanies)
- Modify: `backend/src/modules/platform/platform-accounts.service.ts` (listAllUsers)
- Modify: `backend/src/modules/platform/platform-accounts.controller.ts` (listAllUsers)

**Interfaces:**
- Consumes: `ListQueryDto`, helpers
- Produces: `CompanyRepository.findPaginated(query: ListQueryDto & { status?: string }): Promise<{ data; total }>`; `PlatformAccountsService.listAllUsers(query: ListQueryDto & { type?: string; companyId?: string; role?: string }): Promise<{ data; total }>`.

- [ ] **Step 1: Add findPaginated to company repository**

In `backend/src/repositories/company.repository.ts`:
- Update imports:

```ts
import { Injectable } from '@nestjs/common';
import { eq, count } from 'drizzle-orm';
import { companies } from '../database/schema';
import { BaseRepository } from './base.repository';
import {
  andConditions,
  listEnvelope,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';
```

- Add this method after `findAll` (line 35):

```ts
async findPaginated(query: ListQueryDto & { status?: string }) {
  return this.withDb('public', async (db) => {
    const conditions = andConditions(
      query.status ? [eq(companies.status, query.status)] : [],
      toWhere(query, [companies.name, companies.slug]),
    );
    const sortOptions = {
      sortMap: {
        name: companies.name,
        createdAt: companies.createdAt,
      },
      defaultSortBy: 'createdAt',
    };
    const { offset, limit } = toPagination(query);
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(companies)
        .where(conditions)
        .orderBy(toOrderBy(query, sortOptions))
        .limit(limit)
        .offset(offset)
        .execute(),
      db
        .select({ value: count() })
        .from(companies)
        .where(conditions)
        .execute(),
    ]);
    return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
  });
}
```

- [ ] **Step 2: Update platform companies service + controller**

`backend/src/modules/platform/platform.service.ts` — replace `listCompanies` (lines 20-22):

```ts
async listCompanies(query: ListQueryDto & { status?: string }) {
  return this.tenantRepo.findPaginated(query);
}
```

Add import: `import type { ListQueryDto } from '../../common/dto/list-query.dto';`

`backend/src/modules/platform/platform.controller.ts` — replace `listCompanies` (lines 19-22):

```ts
@Get('companies')
listCompanies(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('status') status?: string,
) {
  return this.platformService.listCompanies({ ...query, status });
}
```

Add imports: `import { Query } from '@nestjs/common';` (extend existing import) and `import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';` and `import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';`

- [ ] **Step 3: Update platform users service**

In `backend/src/modules/platform/platform-accounts.service.ts`:
- Add imports:

```ts
import {
  inMemorySearch,
  sortAndPageInMemory,
} from '../../repositories/list-query.helper';
import type { ListQueryDto } from '../../common/dto/list-query.dto';
```

- Replace `listAllUsers` (lines 267-314) — keep the aggregation loop, add filters + in-memory search/sort/page at the end:

```ts
async listAllUsers(
  query: ListQueryDto & { type?: string; companyId?: string; role?: string },
) {
  const companies = await this.tenantRepo.findAll();
  const companyUsers: Array<{
    type: 'company';
    id: string;
    email: string;
    role: string;
    status: string;
    companyId: string;
    companyName: string;
    firstName: null;
    lastName: null;
    createdAt: Date;
  }> = [];
  for (const tenant of companies) {
    const users = await this.userRepo.findAll(this.schemaOf(tenant.id));
    for (const user of users) {
      companyUsers.push({
        type: 'company',
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        companyId: tenant.id,
        companyName: tenant.name,
        firstName: null,
        lastName: null,
        createdAt: user.createdAt,
      });
    }
  }
  const candidates = await this.candidateAccountRepo.findAll();
  const candidateRows = candidates.map((c) => ({
    type: 'candidate' as const,
    id: c.id,
    email: c.email,
    role: 'Candidate',
    status: null,
    companyId: null,
    companyName: null,
    firstName: c.firstName,
    lastName: c.lastName,
    createdAt: c.createdAt,
  }));
  let rows: Array<(typeof companyUsers)[number] | (typeof candidateRows)[number]> =
    [...companyUsers, ...candidateRows];
  if (query.type) rows = rows.filter((row) => row.type === query.type);
  if (query.companyId) rows = rows.filter((row) => row.companyId === query.companyId);
  if (query.role) rows = rows.filter((row) => row.role === query.role);
  rows = inMemorySearch(rows, query.search, [
    'email',
    'firstName',
    'lastName',
    'companyName',
  ]);
  return sortAndPageInMemory(
    rows,
    query,
    (row, sortBy) =>
      sortBy === 'createdAt' ? row.createdAt : row.email.toLowerCase(),
    'email',
    'asc',
  );
}
```

- [ ] **Step 4: Update platform users controller**

`backend/src/modules/platform/platform-accounts.controller.ts` — replace `listAllUsers` (lines 97-100):

```ts
@Get('users')
listAllUsers(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('type') type?: string,
  @Query('companyId') companyId?: string,
  @Query('role') role?: string,
) {
  return this.accountsService.listAllUsers({ ...query, type, companyId, role });
}
```

Add imports: `import { Query } from '@nestjs/common';` and `import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';`

- [ ] **Step 5: Run unit tests, typecheck, lint**

Run: `cd backend && npx jest src/modules/platform/ && npm run typecheck && npm run lint`
Expected: pass. Note `platform-accounts.service.spec.ts` has a `listAllUsers` test that asserts a plain array + email sort — update it: mock `tenantRepo.findAll` and `candidateAccountRepo.findAll`, assert `result.data` array and that `total` equals the merged count. If the spec's assertion is `expect(rows.map(r => r.email))` on the direct return, wrap with `.data`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/company.repository.ts backend/src/modules/platform/
git commit -m "feat(m15): platform companies + users search/filter/sort/pagination"
```

---

### Task 7: Platform applications + jobs + interviews endpoints

In-memory search/sort/page on the aggregated rows (the per-company aggregation loop stays).

**Files:**
- Modify: `backend/src/modules/platform/platform-data.service.ts` (listApplications 47-66, listInterviews 124-147, listJobs 180-198)
- Modify: `backend/src/modules/platform/platform-data.controller.ts` (listApplications 40-50, listInterviews 61-71, listJobs 82-92)
- Test: `backend/src/modules/platform/platform-data.service.spec.ts` (any sort-order assertions in listJobs — search/sort now via helper)

**Interfaces:**
- Consumes: `ListQueryDto`, `inMemorySearch`, `sortAndPageInMemory`
- Produces: `PlatformDataService.listApplications(filters, query)`, `listInterviews(filters, query)`, `listJobs(filters, query)` — all return `{ data, total }`.

- [ ] **Step 1: Update platform-data service**

In `backend/src/modules/platform/platform-data.service.ts`:
- Add imports:

```ts
import {
  inMemorySearch,
  sortAndPageInMemory,
} from '../../repositories/list-query.helper';
import type { ListQueryDto } from '../../common/dto/list-query.dto';
```

- Replace `listApplications` (lines 47-66):

```ts
async listApplications(filters: PlatformFilters, query: ListQueryDto) {
  const companies = await this.tenantRepo.findAll();
  const target = filters.companyId
    ? companies.filter((t) => t.id === filters.companyId)
    : companies;
  const rows: Array<Record<string, unknown> & { companyName: string }> = [];
  for (const tenant of target) {
    const apps = await this.applicationRepo.findAll(
      undefined,
      this.schemaOf(tenant.id),
    );
    for (const app of apps) {
      rows.push({ ...app, companyName: tenant.name, companyId: tenant.id });
    }
  }
  let filtered = rows;
  if (filters.status) {
    filtered = filtered.filter((row) => row.stageName === filters.status);
  }
  filtered = inMemorySearch(filtered, query.search, [
    'candidateName',
    'jobTitle',
    'companyName',
  ]);
  return sortAndPageInMemory(
    filtered,
    query,
    (row, sortBy) =>
      String(row[sortBy as keyof typeof row] ?? '').toLowerCase(),
    'appliedAt',
    'desc',
  );
}
```

- Replace `listInterviews` (lines 124-147):

```ts
async listInterviews(filters: PlatformFilters, query: ListQueryDto) {
  const companies = await this.tenantRepo.findAll();
  const target = filters.companyId
    ? companies.filter((t) => t.id === filters.companyId)
    : companies;
  const rows: Array<Record<string, unknown> & { companyName: string }> = [];
  for (const tenant of target) {
    const interviews = await this.interviewRepo.findAll(
      undefined,
      this.schemaOf(tenant.id),
    );
    for (const interview of interviews) {
      rows.push({
        ...interview,
        companyName: tenant.name,
        companyId: tenant.id,
      });
    }
  }
  let filtered = rows;
  if (filters.status) {
    filtered = filtered.filter((row) => row.status === filters.status);
  }
  filtered = inMemorySearch(filtered, query.search, [
    'candidateName',
    'jobTitle',
    'companyName',
  ]);
  return sortAndPageInMemory(
    filtered,
    query,
    (row, sortBy) =>
      String(row[sortBy as keyof typeof row] ?? '').toLowerCase(),
    'scheduledAt',
    'asc',
  );
}
```

- Replace `listJobs` (lines 180-198):

```ts
async listJobs(filters: PlatformFilters, query: ListQueryDto) {
  const companies = await this.tenantRepo.findAll();
  const target = filters.companyId
    ? companies.filter((t) => t.id === filters.companyId)
    : companies;
  const rows: Array<Record<string, unknown> & { companyName: string }> = [];
  for (const tenant of target) {
    const jobs = await this.jobPostingRepo.findAll(
      filters.status,
      this.schemaOf(tenant.id),
    );
    for (const job of jobs) {
      rows.push({ ...job, companyName: tenant.name, companyId: tenant.id });
    }
  }
  const filtered = inMemorySearch(rows, query.search, [
    'title',
    'companyName',
  ]);
  return sortAndPageInMemory(
    filtered,
    query,
    (row, sortBy) =>
      String(row[sortBy as keyof typeof row] ?? '').toLowerCase(),
    'createdAt',
    'desc',
  );
}
```

- [ ] **Step 2: Update platform-data controller**

In `backend/src/modules/platform/platform-data.controller.ts`:
- Add imports: `import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';` (`ZodValidationPipe` already imported)

- Replace `listApplications` (lines 40-50):

```ts
@Get('applications')
listApplications(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('companyId', new ParseUUIDPipe({ optional: true }))
  companyId?: string,
  @Query('status') status?: string,
) {
  return this.dataService.listApplications(
    { companyId: companyId || undefined, status: status || undefined },
    query,
  );
}
```

- Replace `listInterviews` (lines 61-71):

```ts
@Get('interviews')
listInterviews(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('companyId', new ParseUUIDPipe({ optional: true }))
  companyId?: string,
  @Query('status') status?: string,
) {
  return this.dataService.listInterviews(
    { companyId: companyId || undefined, status: status || undefined },
    query,
  );
}
```

- Replace `listJobs` (lines 82-92):

```ts
@Get('jobs')
listJobs(
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('companyId', new ParseUUIDPipe({ optional: true }))
  companyId?: string,
  @Query('status') status?: string,
) {
  return this.dataService.listJobs(
    { companyId: companyId || undefined, status: status || undefined },
    query,
  );
}
```

- [ ] **Step 3: Fix platform-data service spec**

In `backend/src/modules/platform/platform-data.service.spec.ts`:
- Any test asserting `listApplications`/`listInterviews`/`listJobs` return values or call shapes must pass a `query` object as the second arg. Add `query: { page: 1, pageSize: 10 }` (search/sortBy/sortDir optional) to those calls and assert `result.data` instead of `result` where needed.
- The `listJobs` spec asserts a `createdAt`-desc sort (lines ~286-299): with the helper, `createdAt` is compared as a lowercase string — ISO timestamps sort correctly. Keep the assertion; if it fails, adapt the mock dates to ISO strings (`new Date(...).toISOString()`).
- Run and adjust until green.

- [ ] **Step 4: Run unit tests, typecheck, lint**

Run: `cd backend && npx jest src/modules/platform/ && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/platform/platform-data.service.ts backend/src/modules/platform/platform-data.controller.ts backend/src/modules/platform/platform-data.service.spec.ts
git commit -m "feat(m15): platform applications/jobs/interviews search/filter/sort/pagination"
```

---

### Task 8: Public careers endpoint

**Files:**
- Modify: `backend/src/repositories/job-listings-index.repository.ts` (findOpenByCompany, lines 30-44)
- Modify: `backend/src/modules/public-careers/public-careers.service.ts` (list)
- Modify: `backend/src/modules/public-careers/public-careers.controller.ts` (list)

**Interfaces:**
- Consumes: `ListQueryDto`, helpers
- Produces: `JobListingsIndexRepository.findOpenByCompany(companyId: string, query: ListQueryDto & { employmentType?: string; workSetup?: string }): Promise<{ data; total }>`; `PublicCareersService.list(companySlug: string, query): Promise<{ data; total }>`.

- [ ] **Step 1: Update findOpenByCompany in the repository**

In `backend/src/repositories/job-listings-index.repository.ts`, replace `findOpenByCompany` (lines 30-44):

```ts
async findOpenByCompany(
  companyId: string,
  query: ListQueryDto & { employmentType?: string; workSetup?: string },
) {
  return this.withDb('public', async (db) => {
    const conditions = andConditions(
      [
        eq(jobListingsIndex.companyId, companyId),
        eq(jobListingsIndex.status, 'open'),
      ],
      query.employmentType
        ? [eq(jobListingsIndex.employmentType, query.employmentType)]
        : [],
      query.workSetup ? [eq(jobListingsIndex.workSetup, query.workSetup)] : [],
      toWhere(query, [jobListingsIndex.title]),
    );
    const sortOptions = {
      sortMap: {
        createdAt: jobListingsIndex.createdAt,
        title: jobListingsIndex.title,
      },
      defaultSortBy: 'createdAt',
    };
    const { offset, limit } = toPagination(query);
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(jobListingsIndex)
        .where(conditions)
        .orderBy(toOrderBy(query, sortOptions))
        .limit(limit)
        .offset(offset)
        .execute(),
      db
        .select({ value: count() })
        .from(jobListingsIndex)
        .where(conditions)
        .execute(),
    ]);
    return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
  });
}
```

- [ ] **Step 2: Update the service**

`backend/src/modules/public-careers/public-careers.service.ts` — read the file first; replace the `list` method body so it passes the query to the repo:

```ts
async list(
  companySlug: string,
  query: ListQueryDto & { employmentType?: string; workSetup?: string },
) {
  const tenant = await this.tenantRepo.findBySlug(companySlug);
  if (!tenant || tenant.status === 'suspended') {
    throw new NotFoundException('Company not found');
  }
  return this.indexRepo.findOpenByCompany(tenant.id, query);
}
```

Add import: `import type { ListQueryDto } from '../../common/dto/list-query.dto';`

- [ ] **Step 3: Update the controller**

`backend/src/modules/public-careers/public-careers.controller.ts` — replace `list` (lines 8-11):

```ts
@Get()
list(
  @Param('companySlug') companySlug: string,
  @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  @Query('employmentType') employmentType?: string,
  @Query('workSetup') workSetup?: string,
) {
  return this.service.list(companySlug, { ...query, employmentType, workSetup });
}
```

Add imports: `import { Query } from '@nestjs/common';` and `import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';` and `import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';`

- [ ] **Step 4: Run unit tests, typecheck, lint**

Run: `cd backend && npx jest src/modules/public-careers/ src/repositories/ && npm run typecheck && npm run lint`
Expected: all pass. If `public-careers.service.spec.ts` asserts `list` return shape or call args, update to the envelope (`result.data`) and pass a query object.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/job-listings-index.repository.ts backend/src/modules/public-careers/
git commit -m "feat(m15): public careers search/filter/sort/pagination"
```

---

### Task 9: Frontend shared — ListQueryParams, useListQuery, ListControls, queryKeys

**Files:**
- Create: `frontend/src/shared/types/listQuery.ts`
- Create: `frontend/src/shared/hooks/useListQuery.ts`
- Create: `frontend/src/shared/components/ListControls.tsx`
- Modify: `frontend/src/api/queryKeys.ts`

**Interfaces:**
- Produces:
  - `ListQueryParams` `{ search?: string; page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc' }`
  - `Paginated<T>` `{ data: T[]; total: number; page: number; pageSize: number }`
  - `useListQuery(initial?: { sortBy?: string; sortDir?: 'asc' | 'desc'; pageSize?: number })` returns `{ search, setSearch, page, setPage, sortBy, setSortBy, sortDir, toggleSortDir, params }` where `params` is `ListQueryParams` (includes `pageSize`, omits empty `search`/`sortBy`).
  - `ListControls` props: `searchPlaceholder?`, `searchValue`, `onSearchChange`, `filters?` (array of `{ key, placeholder, searchable?, data, value, onChange }`), `sortOptions` (`{ value, label }[]`), `sortBy`, `onSortByChange`, `sortDir`, `onToggleSortDir`.
  - Updated `queryKeys` signatures (below) used by Tasks 10-13.

- [ ] **Step 1: Create the types**

Create `frontend/src/shared/types/listQuery.ts`:

```ts
export interface ListQueryParams {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 2: Create the hook**

Create `frontend/src/shared/hooks/useListQuery.ts`:

```ts
import { useMemo, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import type { ListQueryParams } from '@/shared/types/listQuery';

export interface UseListQueryOptions {
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  pageSize?: number;
}

export function useListQuery(options: UseListQueryOptions = {}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | null>(options.sortBy ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    options.sortDir ?? 'desc',
  );

  const params = useMemo<Required<Pick<ListQueryParams, 'page' | 'pageSize' | 'sortDir'>> & ListQueryParams>(() => {
    const value: ListQueryParams & {
      page: number;
      pageSize: number;
      sortDir: 'asc' | 'desc';
    } = {
      page,
      pageSize: options.pageSize ?? 10,
      sortDir,
    };
    const term = debouncedSearch.trim();
    if (term) value.search = term;
    if (sortBy) value.sortBy = sortBy;
    return value;
  }, [debouncedSearch, page, sortBy, sortDir, options.pageSize]);

  const toggleSortDir = () =>
    setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));

  return {
    search,
    setSearch,
    page,
    setPage,
    sortBy,
    setSortBy,
    sortDir,
    toggleSortDir,
    params,
  };
}
```

- [ ] **Step 3: Create ListControls**

Create `frontend/src/shared/components/ListControls.tsx`:

```tsx
import { ActionIcon, Group, Select, TextInput } from '@mantine/core';
import {
  IconSortAscending,
  IconSortDescending,
  IconSearch,
} from '@tabler/icons-react';

export interface ListControlFilter {
  key: string;
  placeholder: string;
  searchable?: boolean;
  data: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}

interface ListControlsProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: ListControlFilter[];
  sortOptions: { value: string; label: string }[];
  sortBy: string | null;
  onSortByChange: (value: string | null) => void;
  sortDir: 'asc' | 'desc';
  onToggleSortDir: () => void;
}

export function ListControls({
  searchPlaceholder = 'Search…',
  searchValue,
  onSearchChange,
  filters = [],
  sortOptions,
  sortBy,
  onSortByChange,
  sortDir,
  onToggleSortDir,
}: ListControlsProps) {
  return (
    <Group mb="md" wrap="wrap">
      <TextInput
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(event) => onSearchChange(event.currentTarget.value)}
        leftSection={<IconSearch size="1rem" />}
        style={{ minWidth: 200 }}
      />
      {filters.map((filter) => (
        <Select
          key={filter.key}
          placeholder={filter.placeholder}
          clearable
          searchable={filter.searchable}
          data={filter.data}
          value={filter.value}
          onChange={filter.onChange}
        />
      ))}
      <Select
        placeholder="Sort by"
        clearable
        data={sortOptions}
        value={sortBy}
        onChange={onSortByChange}
      />
      <ActionIcon
        variant="light"
        onClick={onToggleSortDir}
        aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
      >
        {sortDir === 'asc' ? (
          <IconSortAscending size="1rem" />
        ) : (
          <IconSortDescending size="1rem" />
        )}
      </ActionIcon>
    </Group>
  );
}
```

- [ ] **Step 4: Update queryKeys**

Replace `frontend/src/api/queryKeys.ts` with:

```ts
import type { ListQueryParams } from '@/shared/types/listQuery';

export interface CompanyJobPostingsParams extends ListQueryParams {
  status?: string;
}

export interface CompanyInterviewsParams extends ListQueryParams {
  status?: string;
}

export interface PlatformAppsJobsParams extends ListQueryParams {
  companyId?: string;
  status?: string;
}

export interface PlatformUsersParams extends ListQueryParams {
  type?: string;
  companyId?: string;
  role?: string;
}

export interface PlatformCompaniesParams extends ListQueryParams {
  status?: string;
}

export interface CandidateJobsParams extends ListQueryParams {
  employmentType?: string;
  workSetup?: string;
}

export const queryKeys = {
  skills: {
    all: () => ['skills', 'all'],
  },
  candidate: {
    jobs: (params?: CandidateJobsParams) => ['candidate', 'jobs', params],
    jobDetail: (companyId: string, jobId: string) => ['candidate', 'jobs', companyId, jobId],
    applications: (params?: ListQueryParams & { status?: string }) => ['candidate', 'applications', params],
    application: (applicationId: string) => ['candidate', 'applications', applicationId],
    bookmarks: (params?: ListQueryParams) => ['candidate', 'bookmarks', params],
    profile: () => ['candidate', 'profile'],
    skills: () => ['candidate', 'skills'],
  },
  publicCareers: {
    jobs: (companySlug: string, params?: ListQueryParams) => ['public-careers', 'jobs', companySlug, params],
    job: (companySlug: string, jobId: string) => [
      'public-careers',
      'jobs',
      companySlug,
      jobId,
    ],
  },
  auth: {
    me: () => ['auth', 'me'],
  },
  company: {
    dashboardSummary: () => ['company', 'dashboard', 'summary'],
    jobPostings: (params?: CompanyJobPostingsParams) => ['company', 'job-postings', params],
    jobPosting: (id: string) => ['company', 'job-postings', id],
    candidates: (params?: ListQueryParams) => ['company', 'candidates', params],
    candidate: (id: string) => ['company', 'candidates', id],
    skills: (search?: string) => ['company', 'skills', { search }],
    applications: (filters?: { jobPostingId?: string; stageId?: string; search?: string; sortBy?: string; sortDir?: 'asc' | 'desc' }) => [
      'company',
      'applications',
      filters,
    ],
    application: (id: string) => ['company', 'applications', id],
    notes: (applicationId: string) => ['company', 'applications', applicationId, 'notes'],
    pipelineStages: () => ['company', 'pipeline-stages'],
    resume: (candidateId: string) => ['company', 'candidates', candidateId, 'resume'],
    interviews: (params?: CompanyInterviewsParams) => ['company', 'interviews', params],
    interview: (id: string) => ['company', 'interviews', id],
    companyUsers: () => ['company', 'users'],
    companySettings: () => ['company', 'settings'],
  },
  platform: {
    companies: (params?: PlatformCompaniesParams) => ['platform', 'companies', params],
    company: (id: string) => ['platform', 'companies', id],
    companyUsers: (companyId: string) => ['platform', 'companies', companyId, 'users'],
    companyStages: (companyId: string) => ['platform', 'companies', companyId, 'stages'],
    candidates: () => ['platform', 'candidates'],
    applications: (params?: PlatformAppsJobsParams) => [
      'platform',
      'applications',
      params,
    ],
    interviews: (params?: PlatformAppsJobsParams) => [
      'platform',
      'interviews',
      params,
    ],
    jobs: (params?: PlatformAppsJobsParams) => [
      'platform',
      'jobs',
      params,
    ],
    stats: () => ['platform', 'stats'],
    users: (params?: PlatformUsersParams) => ['platform', 'users', params],
  },
} as const;

export type QueryKeys = typeof queryKeys;
```

Note: mutation invalidations (`invalidateQueries({ queryKey: ['platform', 'users'] })`) keep working — TanStack Query prefix-matches `['platform', 'users', params]`.

- [ ] **Step 5: Verify frontend typecheck**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -40`
Expected: errors ONLY in files the next tasks update (candidate/company/admin/public-careers pages + api modules referencing the old keys). If there are none, run `npm run build` anyway to confirm the only errors are the expected ones.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/types/listQuery.ts frontend/src/shared/hooks/useListQuery.ts frontend/src/shared/components/ListControls.tsx frontend/src/api/queryKeys.ts
git commit -m "feat(m15): frontend shared list-query hook, controls, query keys"
```

---

### Task 10: Candidate pages (job search, applications, bookmarks)

**Files:**
- Modify: `frontend/src/features/candidate-portal/api/candidateApi.ts` (getJobs, getApplications, getBookmarks)
- Modify: `frontend/src/features/candidate-portal/hooks/useJobs.ts`, `useApplications.ts`, `useBookmarks.ts`
- Modify: `frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx`
- Modify: `frontend/src/features/candidate-portal/applications/ApplicationsPage.tsx`
- Modify: `frontend/src/features/candidate-portal/bookmarks/BookmarksPage.tsx`
- Modify: `frontend/src/features/candidate-portal/types/index.ts` (add `Paginated` usage — types unchanged otherwise)

**Interfaces:**
- Consumes: `ListQueryParams`, `Paginated<T>`, `useListQuery`, `ListControls`, updated `queryKeys`
- Produces: `candidateApi.getJobs(params?: CandidateJobsParams): Promise<Paginated<NormalizedCandidateJob>>`, `getApplications(params?): Promise<Paginated<Application>>`, `getBookmarks(params?): Promise<Paginated<Bookmark>>`; hooks return the `Paginated` object as `data`.

- [ ] **Step 1: Update candidateApi**

In `frontend/src/features/candidate-portal/api/candidateApi.ts`:
- Add imports: `import type { ListQueryParams } from '@/shared/types/listQuery';` and `import type { Paginated } from '@/shared/types/listQuery';`
- Replace `getJobs`:

```ts
getJobs: async (params?: ListQueryParams & { employmentType?: string; workSetup?: string }): Promise<Paginated<NormalizedCandidateJob>> => {
  const { data } = await apiClient.get('/candidate/jobs', { params });
  const body = unwrap(data as ApiEnvelope<Paginated<CandidateJobRow>>);
  return { ...body, data: body.data.map(normalizeJob) };
},
```

- Replace `getApplications`:

```ts
getApplications: async (params?: ListQueryParams & { status?: string }): Promise<Paginated<Application>> => {
  const { data } = await apiClient.get('/candidate/applications', { params });
  return unwrap(data as ApiEnvelope<Paginated<Application>>);
},
```

- Replace `getBookmarks`:

```ts
getBookmarks: async (params?: ListQueryParams): Promise<Paginated<Bookmark>> => {
  const { data } = await apiClient.get('/candidate/bookmarks', { params });
  return unwrap(data as ApiEnvelope<Paginated<Bookmark>>);
},
```

- [ ] **Step 2: Update the hooks**

`useJobs.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys, type CandidateJobsParams } from '@/api/queryKeys';

export function useJobs(params?: CandidateJobsParams) {
  return useQuery({
    queryKey: queryKeys.candidate.jobs(params),
    queryFn: () => candidateApi.getJobs(params),
    enabled: typeof window !== 'undefined',
  });
}
```

`useApplications.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import type { ListQueryParams } from '@/shared/types/listQuery';

export function useApplications(params?: ListQueryParams & { status?: string }) {
  return useQuery({
    queryKey: queryKeys.candidate.applications(params),
    queryFn: () => candidateApi.getApplications(params),
    enabled: typeof window !== 'undefined',
  });
}
```

`useBookmarks.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import type { ListQueryParams } from '@/shared/types/listQuery';

export function useBookmarks(params?: ListQueryParams) {
  return useQuery({
    queryKey: queryKeys.candidate.bookmarks(params),
    queryFn: () => candidateApi.getBookmarks(params),
    enabled: typeof window !== 'undefined',
  });
}
```

- [ ] **Step 3: Rewrite JobSearchPage controls + pagination**

In `frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx`:

- Imports to add:

```ts
import { Pagination } from '@mantine/core';
import { ListControls } from '@/shared/components/ListControls';
import { useListQuery } from '@/shared/hooks/useListQuery';
```

- Replace the hook call + state (lines 31-36):

```ts
const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
const { data: jobsResult = { data: [], total: 0 }, isLoading: jobsLoading, error: jobsError } = useJobs({
  ...listQuery.params,
  employmentType: employmentTypeFilter ?? undefined,
  workSetup: workSetupFilter ?? undefined,
});
const jobs = jobsResult.data;
const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string | null>(null);
const [workSetupFilter, setWorkSetupFilter] = useState<string | null>(null);
```

(Note: the `useApplications`/`useBookmarks` calls for applied/bookmarked state stay — they now need an explicit `pageSize: 50` param to still cover the visible page: `useApplications({ pageSize: 50 })` and `useBookmarks({ pageSize: 50 })`.)

- Add the controls + pagination to the JSX, right after the `<Title order={2}>Job Search</Title>` line:

```tsx
<ListControls
  searchPlaceholder="Search title, company, or location"
  searchValue={listQuery.search}
  onSearchChange={(value) => { listQuery.setSearch(value); listQuery.setPage(1); }}
  filters={[
    {
      key: 'employmentType',
      placeholder: 'Employment type',
      data: [
        { value: 'full-time', label: 'Full-time' },
        { value: 'part-time', label: 'Part-time' },
        { value: 'contract', label: 'Contract' },
        { value: 'intern', label: 'Intern' },
      ],
      value: employmentTypeFilter,
      onChange: (value) => { setEmploymentTypeFilter(value); listQuery.setPage(1); },
    },
    {
      key: 'workSetup',
      placeholder: 'Work setup',
      data: [
        { value: 'on-site', label: 'On-site' },
        { value: 'hybrid', label: 'Hybrid' },
        { value: 'work-from-home', label: 'Work from home' },
      ],
      value: workSetupFilter,
      onChange: (value) => { setWorkSetupFilter(value); listQuery.setPage(1); },
    },
  ]}
  sortOptions={[
    { value: 'createdAt', label: 'Date posted' },
    { value: 'title', label: 'Title' },
    { value: 'companyName', label: 'Company' },
  ]}
  sortBy={listQuery.sortBy}
  onSortByChange={(value) => { listQuery.setSortBy(value); listQuery.setPage(1); }}
  sortDir={listQuery.sortDir}
  onToggleSortDir={listQuery.toggleSortDir}
/>
```

- After the `</SimpleGrid>` add:

```tsx
<Group justify="center" mt="md">
  <Pagination
    total={Math.max(1, Math.ceil(jobsResult.total / (listQuery.params.pageSize ?? 10)))}
    value={listQuery.page}
    onChange={listQuery.setPage}
    size="sm"
  />
</Group>
```

- The `jobs.length === 0` empty state text becomes `No jobs match your filters.`

- [ ] **Step 4: Update ApplicationsPage**

In `frontend/src/features/candidate-portal/applications/ApplicationsPage.tsx`:

- Add imports: `Pagination`, `ListControls`, `useListQuery`.
- Replace the hook call with:

```ts
const listQuery = useListQuery({ sortBy: 'appliedAt', sortDir: 'desc' });
const { data: result = { data: [], total: 0 } } = useApplications({
  ...listQuery.params,
  status: statusFilter ?? undefined,
});
const applications = result.data;
const [statusFilter, setStatusFilter] = useState<string | null>(null);
```

- Derive status options from the current page (v1 — pagination reset surfaces other statuses):

```ts
const statusOptions = useMemo(() => {
  const names = new Set(applications.map((app) => app.status));
  return [...names].sort().map((name) => ({ value: name, label: name }));
}, [applications]);
```

- Render `<ListControls>` above the table with the status filter + sort options `[{ value: 'appliedAt', label: 'Applied date' }, { value: 'jobTitle', label: 'Job title' }, { value: 'companyName', label: 'Company' }]`.
- After the table, render `<Pagination total={Math.max(1, Math.ceil(result.total / 10))} value={listQuery.page} onChange={listQuery.setPage} size="sm" />`.

- [ ] **Step 5: Update BookmarksPage**

In `frontend/src/features/candidate-portal/bookmarks/BookmarksPage.tsx`:

- Add imports: `Pagination`, `ListControls`, `useListQuery`.
- Replace the hook call with:

```ts
const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
const { data: result = { data: [], total: 0 } } = useBookmarks(listQuery.params);
const bookmarks = result.data;
```

- Render `<ListControls>` (search only) with sort options `[{ value: 'createdAt', label: 'Date bookmarked' }, { value: 'jobTitle', label: 'Job title' }, { value: 'companyName', label: 'Company' }]`.
- After the card stack, render `<Pagination total={Math.max(1, Math.ceil(result.total / 10))} value={listQuery.page} onChange={listQuery.setPage} size="sm" />`.

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build`
Expected: compiles.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/candidate-portal/
git commit -m "feat(m15): candidate pages search/filter/sort/pagination"
```

---

### Task 11: Company pages (job postings, candidates, interviews, pipeline)

**Files:**
- Modify: `frontend/src/api/jobPostingsApi.ts` (list)
- Modify: `frontend/src/api/candidatesApi.ts` (list)
- Modify: `frontend/src/api/interviewsApi.ts` (list)
- Modify: `frontend/src/api/applicationsApi.ts` (list)
- Modify: `frontend/src/features/company/job-postings/hooks/useJobPostings.ts`
- Modify: `frontend/src/features/company/candidates/hooks/useCandidates.ts`
- Modify: `frontend/src/features/company/interviews/hooks/useInterviews.ts`
- Modify: `frontend/src/features/company/pipeline/hooks/usePipeline.ts` (ApplicationFiltersInput gains `search`/`sortBy`/`sortDir`)
- Modify: `frontend/src/features/company/job-postings/JobPostingList.tsx`
- Modify: `frontend/src/features/company/candidates/CandidateList.tsx`
- Modify: `frontend/src/features/company/interviews/InterviewListView.tsx`
- Modify: `frontend/src/features/company/pipeline/PipelineBoard.tsx`

**Interfaces:**
- Consumes: `ListQueryParams`, `Paginated<T>`, `useListQuery`, `ListControls`, updated `queryKeys`
- Produces: `jobPostingsApi.list(params?: CompanyJobPostingsParams): Promise<Paginated<JobPosting>>`; `candidatesApi.list(params?: ListQueryParams): Promise<Paginated<Candidate>>`; `interviewsApi.list(params?: CompanyInterviewsParams): Promise<Paginated<Interview>>`; `applicationsApi.list` stays returning `Application[]` (now accepts `search`, `sortBy`, `sortDir`).

- [ ] **Step 1: Update the api modules**

`frontend/src/api/jobPostingsApi.ts` — add `Paginated`/`ListQueryParams` imports; replace `list`:

```ts
list: async (params?: ListQueryParams & { status?: string }): Promise<Paginated<JobPosting>> => {
  const { data } = await apiClient.get('/job-postings', { params });
  return unwrap(data as ApiEnvelope<Paginated<JobPosting>>);
},
```

`frontend/src/api/candidatesApi.ts` — replace `list`:

```ts
list: async (params?: ListQueryParams): Promise<Paginated<Candidate>> => {
  const { data } = await apiClient.get('/candidates', { params });
  return unwrap(data as ApiEnvelope<Paginated<Candidate>>);
},
```

`frontend/src/api/interviewsApi.ts` — replace `list`:

```ts
list: async (params?: ListQueryParams & { status?: string }): Promise<Paginated<Interview>> => {
  const { data } = await apiClient.get('/interviews', { params });
  return unwrap(data as ApiEnvelope<Paginated<Interview>>);
},
```

`frontend/src/api/applicationsApi.ts` — extend `ApplicationFilters` and keep array return:

```ts
export interface ApplicationFilters {
  jobPostingId?: string;
  stageId?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}
```

`list` stays as-is (it already passes `params: filters`).

- [ ] **Step 2: Update the hooks**

`useJobPostings.ts`:

```ts
import type { ListQueryParams } from '@/shared/types/listQuery';
import type { CompanyJobPostingsParams } from '@/api/queryKeys';

export function useJobPostings(params?: CompanyJobPostingsParams) {
  return useQuery({
    queryKey: queryKeys.company.jobPostings(params),
    queryFn: () => jobPostingsApi.list(params),
  });
}
```

(Remove the old `status?: string` param; invalidations elsewhere still use `queryKeys.company.jobPostings()` — prefix match works.)

`useCandidates.ts`:

```ts
import type { ListQueryParams } from '@/shared/types/listQuery';

export function useCandidates(params?: ListQueryParams) {
  return useQuery({
    queryKey: queryKeys.company.candidates(params),
    queryFn: () => candidatesApi.list(params),
  });
}
```

`useInterviews.ts` — replace `useInterviews`:

```ts
import type { ListQueryParams } from '@/shared/types/listQuery';

export function useInterviews(params?: ListQueryParams & { status?: string }) {
  return useQuery({
    queryKey: queryKeys.company.interviews(params),
    queryFn: () => interviewsApi.list(params),
  });
}
```

`usePipeline.ts` — extend `ApplicationFiltersInput`:

```ts
export interface ApplicationFiltersInput {
  jobPostingId?: string;
  stageId?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}
```

- [ ] **Step 3: Update JobPostingList**

Add imports `Pagination`, `ListControls`, `useListQuery`; replace the data hook:

```ts
const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
const [statusFilter, setStatusFilter] = useState<string | null>(null);
const { data: result = { data: [], total: 0 }, isLoading } = useJobPostings({
  ...listQuery.params,
  status: statusFilter ?? undefined,
});
const data = result.data;
```

Render `<ListControls>` under the header Group with a status filter (`draft/open/closed`) and sort options `[{ value: 'createdAt', label: 'Date created' }, { value: 'title', label: 'Title' }]`; render `<Pagination>` under the table using `result.total` and `listQuery.page`/`setPage`.

- [ ] **Step 4: Update CandidateList**

Same pattern: `useListQuery({ sortBy: 'createdAt', sortDir: 'desc' })`, `useCandidates(listQuery.params)`, `data = result.data`, `<ListControls>` with sort options `[{ value: 'name', label: 'Name' }, { value: 'createdAt', label: 'Date created' }]`, `<Pagination>` below.

- [ ] **Step 5: Update InterviewListView**

Same pattern: `useListQuery({ sortBy: 'scheduledAt', sortDir: 'asc' })`, status filter (`scheduled/completed/cancelled`), `useInterviews({ ...listQuery.params, status: statusFilter ?? undefined })`, sort options `[{ value: 'scheduledAt', label: 'Date' }, { value: 'candidateName', label: 'Candidate' }]`, `<Pagination>` below the table.

- [ ] **Step 6: Update PipelineBoard**

Read `frontend/src/features/company/pipeline/PipelineBoard.tsx` first. Add a `TextInput` (search, debounced via `useDebouncedValue` from `@mantine/hooks`) above the stage columns and pass it through to `useApplications({ search: debouncedSearch })`. The board keeps receiving the plain array — no pagination. Empty search passes `undefined`:

```ts
const [search, setSearch] = useState('');
const [debouncedSearch] = useDebouncedValue(search, 300);
const { data: applications, isLoading: appsLoading } = useApplications(
  debouncedSearch.trim() ? { search: debouncedSearch.trim() } : undefined,
);
```

- [ ] **Step 7: Verify build**

Run: `cd frontend && npm run build`
Expected: compiles.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/jobPostingsApi.ts frontend/src/api/candidatesApi.ts frontend/src/api/interviewsApi.ts frontend/src/api/applicationsApi.ts frontend/src/features/company/
git commit -m "feat(m15): company pages search/filter/sort/pagination"
```

---

### Task 12: Admin pages (companies, applications, jobs, users) + CompanyDetailPage

**Files:**
- Modify: `frontend/src/api/platformApi.ts` (listCompanies, listUsers, listApplications, listInterviews, listJobs)
- Modify: `frontend/src/features/admin/hooks/usePlatform.ts` (hook signatures)
- Modify: `frontend/src/features/admin/CompaniesPage.tsx`
- Modify: `frontend/src/features/admin/ApplicationsPage.tsx`
- Modify: `frontend/src/features/admin/JobsPage.tsx`
- Modify: `frontend/src/features/admin/UsersPage.tsx`
- Modify: `frontend/src/features/admin/CompanyDetailPage.tsx` (interviews call site)

**Interfaces:**
- Consumes: `ListQueryParams`, `Paginated<T>`, `useListQuery`, `ListControls`, updated `queryKeys`
- Produces: `platformApi.listCompanies(params?): Promise<Paginated<PlatformCompany>>`, `listUsers(params?): Promise<Paginated<PlatformUser>>`, `listApplications(params?): Promise<Paginated<PlatformApplication>>`, `listInterviews(params?): Promise<Paginated<PlatformInterview>>`, `listJobs(params?): Promise<Paginated<PlatformJob>>`.

- [ ] **Step 1: Update platformApi**

Add imports `ListQueryParams`/`Paginated`. Replace the five list functions with the envelope pattern (identical shape to Task 10):

```ts
listCompanies: async (params?: ListQueryParams & { status?: string }): Promise<Paginated<PlatformCompany>> => {
  const { data } = await apiClient.get('/platform/companies', { params });
  return unwrap(data as ApiEnvelope<Paginated<PlatformCompany>>);
},
listUsers: async (params?: ListQueryParams & { type?: string; companyId?: string; role?: string }): Promise<Paginated<PlatformUser>> => {
  const { data } = await apiClient.get('/platform/users', { params });
  return unwrap(data as ApiEnvelope<Paginated<PlatformUser>>);
},
listApplications: async (params?: ListQueryParams & { companyId?: string; status?: string }): Promise<Paginated<PlatformApplication>> => {
  const { data } = await apiClient.get('/platform/applications', { params });
  return unwrap(data as ApiEnvelope<Paginated<PlatformApplication>>);
},
listInterviews: async (params?: ListQueryParams & { companyId?: string; status?: string }): Promise<Paginated<PlatformInterview>> => {
  const { data } = await apiClient.get('/platform/interviews', { params });
  return unwrap(data as ApiEnvelope<Paginated<PlatformInterview>>);
},
listJobs: async (params?: ListQueryParams & { companyId?: string; status?: string }): Promise<Paginated<PlatformJob>> => {
  const { data } = await apiClient.get('/platform/jobs', { params });
  return unwrap(data as ApiEnvelope<Paginated<PlatformJob>>);
},
```

- [ ] **Step 2: Update usePlatform hooks**

Update the five query hooks to accept the params objects defined in queryKeys and return `Paginated` (data flows through unchanged — TanStack Query just carries the new type):

```ts
export function usePlatformCompanies(params?: PlatformCompaniesParams) {
  return useQuery({
    queryKey: queryKeys.platform.companies(params),
    queryFn: () => platformApi.listCompanies(params),
  });
}

export function usePlatformUsers(params?: PlatformUsersParams) {
  return useQuery({
    queryKey: queryKeys.platform.users(params),
    queryFn: () => platformApi.listUsers(params),
  });
}

export function usePlatformApplications(params?: PlatformAppsJobsParams) {
  return useQuery({
    queryKey: queryKeys.platform.applications(params),
    queryFn: () => platformApi.listApplications(params),
  });
}

export function usePlatformInterviews(params?: PlatformAppsJobsParams) {
  return useQuery({
    queryKey: queryKeys.platform.interviews(params),
    queryFn: () => platformApi.listInterviews(params),
  });
}

export function usePlatformJobs(params?: PlatformAppsJobsParams) {
  return useQuery({
    queryKey: queryKeys.platform.jobs(params),
    queryFn: () => platformApi.listJobs(params),
  });
}
```

Add imports: `import type { PlatformAppsJobsParams, PlatformCompaniesParams, PlatformUsersParams } from '@/api/queryKeys';`

- [ ] **Step 3: Rewrite CompaniesPage filtering**

Remove the `filtered`/`PAGE_SIZE`/`rows` client logic (lines 27, 42-58). Replace with:

```ts
const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
const [statusFilter, setStatusFilter] = useState<string | null>(null);
const companiesQuery = usePlatformCompanies({
  ...listQuery.params,
  status: statusFilter ?? undefined,
});
const companies = companiesQuery.data?.data ?? [];
const total = companiesQuery.data?.total ?? 0;
```

Render `<ListControls>` (search placeholder "Search name or slug", status filter Select `active/suspended`, sort options `[{ value: 'createdAt', label: 'Date created' }, { value: 'name', label: 'Name' }]`). Empty state condition changes from `filtered.length === 0` to `companies.length === 0`. Replace the bottom `Pagination` with server-driven `total={Math.max(1, Math.ceil(total / 10))}` + `listQuery.page`/`setPage`. Delete the `PAGE_SIZE` const and `useMemo` import if unused.

- [ ] **Step 4: Rewrite ApplicationsPage filtering**

Remove client `filtered`/`rows` (lines 25, 44-48, 50-68). New logic:

```ts
const listQuery = useListQuery({ sortBy: 'appliedAt', sortDir: 'desc' });
const [companyFilter, setCompanyFilter] = useState<string | null>(null);
const [stageFilter, setStageFilter] = useState<string | null>(null);
const applicationsQuery = usePlatformApplications({
  ...listQuery.params,
  companyId: companyFilter ?? undefined,
  status: stageFilter ?? undefined,
});
const applications = applicationsQuery.data?.data ?? [];
const total = applicationsQuery.data?.total ?? 0;
```

Delete the `stages` useMemo (stage filter now hits `status` server-side with fixed options derived from `INTERNAL` stages — use a static list of common stage names is NOT possible; instead keep a free-text approach: replace the Stage `Select` with the `TextInput`-backed search only and drop the stage filter, since stage names are company-specific. Concretely: remove the Stage Select; the search field covers candidate/job/company and the Company filter stays).

Render `<ListControls>` (search + company filter `searchable`), sort options `[{ value: 'appliedAt', label: 'Applied date' }, { value: 'jobTitle', label: 'Job title' }, { value: 'companyName', label: 'Company' }]`. Server-driven `Pagination` as in Task 10. The `usePlatformStages`/`moveTarget` modal logic is untouched.

- [ ] **Step 5: Rewrite JobsPage**

Replace the `filters` state + client slice (lines 63-90) with:

```ts
const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
const [companyFilter, setCompanyFilter] = useState<string | null>(null);
const [statusFilter, setStatusFilter] = useState<string | null>(null);
const jobsQuery = usePlatformJobs({
  ...listQuery.params,
  companyId: companyFilter ?? undefined,
  status: statusFilter ?? undefined,
});
const jobs = jobsQuery.data?.data ?? [];
const total = jobsQuery.data?.total ?? 0;
```

Delete the `pageCount`/`rows` computation and the `useEffect` page-reset (the hook resets page via `listQuery.setPage(1)` on filter change). Render `<ListControls>` (company `searchable` Select, status Select `draft/open/closed`, sort options `[{ value: 'createdAt', label: 'Date created' }, { value: 'title', label: 'Title' }, { value: 'companyName', label: 'Company' }]`); table maps over `jobs`; server-driven `Pagination`.

- [ ] **Step 6: Rewrite UsersPage**

Replace client `filtered`/`rows` (lines 33, 116-139) with:

```ts
const listQuery = useListQuery({ sortBy: 'email', sortDir: 'asc' });
const [typeFilter, setTypeFilter] = useState<string | null>(null);
const [companyFilter, setCompanyFilter] = useState<string | null>(null);
const [roleFilter, setRoleFilter] = useState<string | null>(null);
const usersQuery = usePlatformUsers({
  ...listQuery.params,
  type: typeFilter ?? undefined,
  companyId: companyFilter ?? undefined,
  role: roleFilter ?? undefined,
});
const users = usersQuery.data?.data ?? [];
const total = usersQuery.data?.total ?? 0;
```

Render `<ListControls>` with three filters (Type `company/candidate`, Company `searchable`, Role from `INTERNAL_USER_ROLES`), sort options `[{ value: 'email', label: 'Email' }, { value: 'createdAt', label: 'Date created' }]`. Table maps over `users`; server-driven `Pagination`.

- [ ] **Step 7: Update CompanyDetailPage interviews call**

In `frontend/src/features/admin/CompanyDetailPage.tsx` (line ~442), change:

```ts
const interviewsQuery = usePlatformInterviews({ companyId, pageSize: 50 });
```

and where it consumes the list, unwrap `.data?.data ?? []`. No pagination UI on the detail page.

- [ ] **Step 8: Verify build**

Run: `cd frontend && npm run build`
Expected: compiles.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/platformApi.ts frontend/src/features/admin/
git commit -m "feat(m15): admin pages search/filter/sort/pagination"
```

---

### Task 13: Public careers page

**Files:**
- Modify: `frontend/src/features/public-careers/api/publicCareersApi.ts` (getJobs)
- Modify: `frontend/src/features/public-careers/hooks/usePublicCareers.ts`
- Modify: `frontend/src/features/public-careers/JobListingPage.tsx`

**Interfaces:**
- Consumes: `ListQueryParams`, `Paginated<T>`, `useListQuery`, `ListControls`, updated `queryKeys`
- Produces: `publicCareersApi.getJobs(companySlug, params?): Promise<Paginated<PublicJobListing>>`.

- [ ] **Step 1: Update api + hook**

`publicCareersApi.ts` — add imports; replace `getJobs`:

```ts
async getJobs(
  companySlug: string,
  params?: ListQueryParams & { employmentType?: string; workSetup?: string },
): Promise<Paginated<PublicJobListing>> {
  const { data } = await apiClient.get(
    `/public/${encodeURIComponent(companySlug)}/jobs`,
    { params },
  );
  return unwrap(data as ApiEnvelope<Paginated<PublicJobListing>>);
}
```

`usePublicCareers.ts`:

```ts
export function usePublicJobs(
  companySlug: string,
  params?: ListQueryParams & { employmentType?: string; workSetup?: string },
) {
  return useQuery<Paginated<PublicJobListing>>({
    queryKey: queryKeys.publicCareers.jobs(companySlug, params),
    queryFn: () => publicCareersApi.getJobs(companySlug, params),
    enabled: Boolean(companySlug),
  });
}
```

- [ ] **Step 2: Update JobListingPage**

Add `useListQuery`, `ListControls`, `Pagination`; replace the data hook:

```ts
const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string | null>(null);
const [workSetupFilter, setWorkSetupFilter] = useState<string | null>(null);
const { data: result = { data: [], total: 0 }, isLoading, error } = usePublicJobs(companySlug, {
  ...listQuery.params,
  employmentType: employmentTypeFilter ?? undefined,
  workSetup: workSetupFilter ?? undefined,
});
const jobs = result.data;
```

Render `<ListControls>` under the "Open positions" header (employmentType + workSetup filters, sort options `[{ value: 'createdAt', label: 'Date posted' }, { value: 'title', label: 'Title' }]`), and `<Pagination total={Math.max(1, Math.ceil(result.total / 10))} value={listQuery.page} onChange={listQuery.setPage} size="sm" />` after the list. Empty state text: `There are no open positions matching your filters.`

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/public-careers/
git commit -m "feat(m15): public careers search/filter/sort/pagination"
```

---

### Task 14: phase14 e2e spec

**Files:**
- Create: `backend/test/phase14.e2e-spec.ts`

**Interfaces:**
- Consumes: all 13 endpoints from Tasks 2-8 (envelope shapes)

- [ ] **Step 1: Scaffold the spec**

Copy the scaffolding from `backend/test/phase13.e2e-spec.ts` (imports, `ApiEnvelope`, `assertStatus`, `assertEnvelope`, `verifyInfrastructure`, app bootstrap, superadmin token, company signup helper, candidate signup helper, seed helpers for skills, cleanup in `afterAll`). Read the full phase13 spec first and mirror its helpers (signup, platform job creation, publish, apply, bookmark, interview scheduling, cleanup) exactly.

- [ ] **Step 2: Write the tests**

Add these test groups (adapt exact payloads to what the phase13 helpers produce):

```ts
describe('candidate jobs list query', () => {
  // setup: two companies A and B; publish 3 jobs via platform (varied titles,
  // employmentTypes, workSetups); suspend company B.
  it('searches by title and company', () => { /* GET /candidate/jobs?search=<title fragment> → data length 1 */ });
  it('filters by employmentType', () => { /* ?employmentType=contract → only contract rows */ });
  it('sorts and paginates', () => {
    // ?sortBy=title&sortDir=asc&pageSize=2 → 2 rows, total 3, page 2 returns the rest
  });
  it('excludes suspended companies with correct total', () => {
    // company B suspended; ?pageSize=1&page=1 → total reflects only A's jobs
  });
  it('falls back to default sort for injection attempts', () => {
    // ?sortBy=1;DROP TABLE job_listings_index-- → 200, sorted by createdAt
  });
});

describe('candidate applications list query', () => {
  // candidate applies to 2 jobs in A, 1 job in B
  it('searches jobTitle and filters by status', () => { /* ?search=...&status=<firstStageName> */ });
  it('paginates and returns total', () => { /* ?pageSize=2 → data 2, total 3 */ });
});

describe('candidate bookmarks list query', () => {
  it('searches jobTitle and sorts by title', () => { /* bookmark 2 jobs, ?sortBy=jobTitle&sortDir=asc */ });
});

describe('company job-postings list query', () => {
  it('searches, filters by status, paginates', () => {
    // company A: 2 draft + 2 open postings → ?status=draft&search=...&pageSize=2
  });
});

describe('company candidates + interviews + applications list query', () => {
  it('searches candidates by name', () => { /* ?search=<name fragment> */ });
  it('searches interviews by candidate and filters by status', () => {
    // schedule an interview, ?search=<candidate>&status=scheduled
  });
  it('searches applications without pagination (array return)', () => {
    // GET /applications?search=... → plain array, sorted desc by appliedAt
  });
});

describe('platform list queries', () => {
  it('companies: search + status filter + pagination', () => { /* ?search=&status=suspended */ });
  it('users: type filter + company filter + pagination', () => {
    // ?type=company&companyId=<A>&pageSize=1 → data 1, total = A user count
  });
  it('jobs: company filter + sort', () => { /* ?companyId=<A>&sortBy=title&sortDir=asc */ });
  it('applications: search + company filter', () => { /* ?search=<candidate>&companyId=<A> */ });
});

describe('public careers list query', () => {
  it('searches and filters by employmentType with pagination', () => {
    // GET /public/<slugA>/jobs?search=...&employmentType=full-time&pageSize=1
  });
});
```

Assert the envelope shape in every case: `data` array, `total` number, `page` equals the requested page, `pageSize` echoed.

- [ ] **Step 3: Run the e2e suite (docker must be up)**

Run: `cd backend && npm run test:e2e -- --runTestsByPath test/phase14.e2e-spec.ts`
Expected: all pass. If any assertion fails, fix the test (verify the endpoint actually returns what the matrix says) — do NOT weaken assertions to force green.

- [ ] **Step 4: Run the full e2e suite**

Run: `cd backend && npm run test:e2e`
Expected: all phases pass (phase 13 must still pass — candidate jobs total changed; if phase13 asserted an array response for `/candidate/jobs`, update its assertion to the envelope).

- [ ] **Step 5: Commit**

```bash
git add backend/test/phase14.e2e-spec.ts backend/test/
git commit -m "test(m15): phase14 e2e for search/filter/sort/pagination"
```

---

### Task 15: Docs + full verification

**Files:**
- Modify: `docs/07_API_ENDPOINT_DOCUMENTATION.md`
- Modify: `docs/08_FRONTEND_COMPONENT_STRUCTURE.md`
- Modify: `AGENTS.md`
- Modify: `docs/09_IMPLEMENTATION_GUIDE.md` (optional one-liner in the milestone table)

- [ ] **Step 1: Update API docs**

In `docs/07_API_ENDPOINT_DOCUMENTATION.md`, for each of the 13 upgraded endpoints add a **Query parameters** section: `search`, `page` (default 1), `pageSize` (default 10, max 50), `sortBy` (allowed values), `sortDir` (`asc`/`desc`), plus endpoint-specific filters (`employmentType`, `workSetup`, `status`, `companyId`, `type`, `role`, `stageId`, `jobPostingId`, `assignedToMe`). Note the response shape change to `{ data, total, page, pageSize }` and that `GET /applications` (company) returns a plain array with `search`/`sortBy`/`sortDir` support (no pagination).

- [ ] **Step 2: Update frontend docs**

In `docs/08_FRONTEND_COMPONENT_STRUCTURE.md`, add entries for `shared/components/ListControls.tsx` and `shared/hooks/useListQuery.ts` (brief description + props/return), and note that all list pages use server-driven pagination.

- [ ] **Step 3: Update AGENTS.md**

Update the **Current State** section: append an M15 paragraph (backend-driven search/filter/sort/pagination on all list endpoints, `{ data, total, page, pageSize }` envelope, `ListQuerySchema` + `list-query.helper`, `ListControls`/`useListQuery` frontend, phase14 e2e). Update the Build Order table row: `| M15 | List Search/Filter/Sort/Pagination | ... — done ✅ |` and the migration-order note if applicable (no migrations this milestone).

- [ ] **Step 4: Full verification**

Run (backend): `cd backend && npm run lint && npm run typecheck && npm test`
Run (frontend): `cd frontend && npm run lint && npm run build`
Run (e2e, docker up): `cd backend && npm run test:e2e`
Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add docs/07_API_ENDPOINT_DOCUMENTATION.md docs/08_FRONTEND_COMPONENT_STRUCTURE.md docs/09_IMPLEMENTATION_GUIDE.md AGENTS.md
git commit -m "docs(m15): search/filter/sort/pagination"
```

---

## Self-Review Notes

- **Spec coverage:** every row of the endpoint matrix maps to a task (Tasks 2, 3, 4, 5, 6, 7, 8); the no-pagination exception is Task 5 (`findAllFiltered`); suspended-company SQL fix is Task 2; frontend shared pieces Task 9; page conversions Tasks 10-13; e2e Task 14; docs Task 15. The admin `InterviewsPage` nonexistence is handled in Task 12 Step 7 (CompanyDetailPage only).
- **Type consistency:** `ListQueryDto`/`ListQuerySchema` defined once (Task 1) and imported everywhere; helper names `toWhere`/`toOrderBy`/`toPagination`/`listEnvelope`/`inMemorySearch`/`sortAndPageInMemory`/`andConditions` consistent across all tasks; frontend `ListQueryParams`/`Paginated<T>`/`useListQuery`/`ListControls` consistent across Tasks 9-13; queryKeys types `CandidateJobsParams`, `CompanyJobPostingsParams`, `CompanyInterviewsParams`, `PlatformAppsJobsParams`, `PlatformUsersParams`, `PlatformCompaniesParams` used in both api modules and hooks.
- **Known mid-milestone breakage:** frontend does not compile between Task 9 and Task 13 — expected; tasks are sequenced backend-first so the API is stable before pages convert.
