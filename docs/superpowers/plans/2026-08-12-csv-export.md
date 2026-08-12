# CSV Export for Admin Tables (M16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export" button to all 11 SuperAdmin/CompanyAdmin data tables that downloads the full filtered rowset as a CSV file.

**Architecture:** Backend generates the CSV (one shared `toCsv` helper in `backend/src/common/csv.helper.ts`) and serves it from 9 new `*/export` endpoints following the resume-download pattern (`@SkipEnvelope` + `@Res` + `res.send`). Repos get `findAllFiltered` variants (same where conditions, no limit/offset); platform in-memory list services get `exportX` methods that reuse the load+filter logic. Frontend gets a shared `ExportCsvButton` (axios blob download, JWT interceptor applies) wired into each page with the page's live search+filters as params.

**Tech Stack:** NestJS 11, Drizzle ORM, Zod 4, React 19, Mantine 9, TanStack Query 5, Jest, supertest.

**Semantics:** search + filters respected; pagination and sort ignored; UTF-8 BOM prefix for Excel; `\r\n` line endings; RFC 4180 escaping. Filename `{resource}-YYYY-MM-DD.csv` (UTC date).

**Reference spec:** `docs/superpowers/specs/2026-08-12-csv-export-design.md`

---

## File Structure

**Backend — create:**
- `backend/src/common/csv.helper.ts` — `toCsv(headers, rows)`, `csvFilename(resource)`
- `backend/src/common/csv.helper.spec.ts` — unit tests
- `backend/test/phase16.e2e-spec.ts` — e2e release gate

**Backend — modify:**
- `backend/src/repositories/candidate.repository.ts` — add `findAllFiltered`
- `backend/src/repositories/job-posting.repository.ts` — add `findAllFiltered`
- `backend/src/repositories/company.repository.ts` — add `findAllFiltered`
- `backend/src/repositories/interview.repository.ts` — extract `buildConditions`/`orderByFor`/`selectWithJoins`; add `findAllFiltered`
- `backend/src/modules/company/company-users.service.ts` + `company-users.controller.ts` — `GET /company/users/export`
- `backend/src/modules/job-postings/job-postings.service.ts` + `job-postings.controller.ts` — `GET /job-postings/export`
- `backend/src/modules/candidates/candidates.service.ts` + `candidates.controller.ts` — `GET /candidates/export`
- `backend/src/modules/interviews/interviews.service.ts` + `interviews.controller.ts` — `GET /interviews/export`
- `backend/src/modules/platform/platform.service.ts` + `platform.controller.ts` — `GET /platform/companies/export`
- `backend/src/modules/platform/platform-accounts.service.ts` + `platform-accounts.controller.ts` — extract `collectAllUsers`; `GET /platform/users/export`
- `backend/src/modules/platform/platform-data.service.ts` + `platform-data.controller.ts` — extract `collectApplications`/`collectInterviews`/`collectJobs`; `GET /platform/{applications,interviews,jobs}/export`

**Frontend — create:**
- `frontend/src/shared/components/ExportCsvButton.tsx`

**Frontend — modify:**
- `frontend/src/shared/components/ListControls.tsx` — optional `actions` prop
- `frontend/src/api/platformApi.ts`, `companyUsersApi.ts`, `jobPostingsApi.ts`, `candidatesApi.ts`, `interviewsApi.ts` — `exportX` methods returning `Blob`
- `frontend/src/features/admin/CompaniesPage.tsx`, `UsersPage.tsx`, `ApplicationsPage.tsx`, `JobsPage.tsx`, `CompanyDetailPage.tsx`
- `frontend/src/features/company/users/UserManagementPage.tsx`, `job-postings/JobPostingList.tsx`, `candidates/CandidateList.tsx`, `interviews/InterviewListView.tsx`

**Docs:**
- `AGENTS.md` (M16 current-state entry + build order row)
- `docs/07_API_ENDPOINT_DOCUMENTATION.md` (export endpoints section)

---

## Task 1: CSV helper + unit tests (TDD)

**Files:**
- Create: `backend/src/common/csv.helper.ts`
- Create: `backend/src/common/csv.helper.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { toCsv, csvFilename } from './csv.helper';

describe('toCsv', () => {
  it('writes headers and rows with BOM and CRLF', () => {
    const csv = toCsv(['name', 'age'], [{ name: 'Ada', age: 36 }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFname,age\r\nAda,36');
  });

  it('escapes commas, quotes, and newlines', () => {
    const csv = toCsv(
      ['a', 'b'],
      [{ a: 'x,y', b: 'say "hi"' }, { a: 'multi\nline', b: 'ok' }],
    );
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"multi\nline"');
  });

  it('renders null/undefined as empty and dates as ISO', () => {
    const csv = toCsv(
      ['a', 'b', 'c'],
      [{ a: null, b: undefined, c: new Date('2026-01-02T03:04:05.000Z') }],
    );
    expect(csv).toContain('\uFEFFa,b,c\r\n,,2026-01-02T03:04:05.000Z');
  });
});

describe('csvFilename', () => {
  it('produces resource-date.csv', () => {
    expect(csvFilename('users')).toMatch(/^users-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/common/csv.helper.spec.ts` (in `backend/`)
Expected: FAIL — `Cannot find module './csv.helper'`

- [ ] **Step 3: Implement the helper**

Create `backend/src/common/csv.helper.ts`:

```ts
export function toCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text =
      value instanceof Date ? value.toISOString() : String(value);
    const needsQuotes =
      text.includes(',') ||
      text.includes('"') ||
      text.includes('\n') ||
      text.includes('\r');
    return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function csvFilename(resource: string): string {
  return `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/common/csv.helper.spec.ts` (in `backend/`)
Expected: PASS — 4 tests green

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/csv.helper.ts backend/src/common/csv.helper.spec.ts
git commit -m "feat(m16): csv export helper"
```

---

## Task 2: SQL repo export variants

**Files:**
- Modify: `backend/src/repositories/candidate.repository.ts` (after `findPaginated`, line ~56)
- Modify: `backend/src/repositories/job-posting.repository.ts` (after `findPaginated`, line ~62)
- Modify: `backend/src/repositories/company.repository.ts` (after `findPaginated`, line ~76)
- Modify: `backend/src/repositories/interview.repository.ts` (refactor + new method)

These are the same `toWhere`/status conditions as each `findPaginated`, without `.limit/.offset/.count`. No new imports needed in candidate/job-posting/company repos (all helpers already imported).

- [ ] **Step 1: Add `findAllFiltered` to CandidateRepository**

```ts
  async findAllFiltered(query: ListQueryDto) {
    return this.withDb('current', async (db) => {
      const conditions = andConditions(
        toWhere(query, [candidates.name, candidates.email]),
      );
      return db
        .select()
        .from(candidates)
        .where(conditions)
        .orderBy(desc(candidates.createdAt))
        .execute();
    });
  }
```

- [ ] **Step 2: Add `findAllFiltered` to JobPostingRepository**

```ts
  async findAllFiltered(query: ListQueryDto & { status?: string }) {
    return this.withDb('current', async (db) => {
      const conditions = andConditions(
        query.status ? [eq(jobPostings.status, query.status)] : [],
        toWhere(query, [jobPostings.title]),
      );
      return db
        .select()
        .from(jobPostings)
        .where(conditions)
        .orderBy(desc(jobPostings.createdAt))
        .execute();
    });
  }
```

- [ ] **Step 3: Add `findAllFiltered` to CompanyRepository**

```ts
  async findAllFiltered(query: ListQueryDto & { status?: string }) {
    return this.withDb('public', async (db) => {
      const conditions = andConditions(
        query.status ? [eq(companies.status, query.status)] : [],
        toWhere(query, [companies.name, companies.slug]),
      );
      return db
        .select()
        .from(companies)
        .where(conditions)
        .orderBy(companies.createdAt)
        .execute();
    });
  }
```

- [ ] **Step 4: Refactor InterviewRepository**

Add import (line 13 area): `import type { DrizzleDB } from '../database/drizzle-schema.service';`

Replace the body of `findPaginated` (lines 61-143) and add three private helpers + `findAllFiltered`. The full resulting section:

```ts
  private buildConditions(
    filters: {
      interviewerId?: string;
      applicationId?: string;
      status?: string;
    },
    query: ListQueryDto,
  ): SQL[] {
    const conditions: SQL[] = [];
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
        ) as SQL,
      );
    }
    return conditions;
  }

  private orderByFor(query: ListQueryDto): SQL {
    const sortBy = query.sortBy ?? 'scheduledAt';
    const sortDir = query.sortDir ?? 'asc';
    return sortDir === 'asc'
      ? asc(
          sortBy === 'candidateName'
            ? candidates.name
            : interviews.scheduledAt,
        )
      : desc(
          sortBy === 'candidateName'
            ? candidates.name
            : interviews.scheduledAt,
        );
  }

  private selectWithJoins(db: DrizzleDB, conditions: SQL[], orderBy: SQL) {
    return db
      .select(selectInterviewRow)
      .from(interviews)
      .innerJoin(applications, eq(interviews.applicationId, applications.id))
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
      .innerJoin(users, eq(interviews.interviewerId, users.id))
      .leftJoin(
        interviewFeedbacks,
        eq(interviews.id, interviewFeedbacks.interviewId),
      )
      .where(and(...conditions))
      .orderBy(orderBy);
  }

  async findPaginated(
    filters: {
      interviewerId?: string;
      applicationId?: string;
      status?: string;
    },
    query: ListQueryDto,
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const conditions = this.buildConditions(filters, query);
      const { offset, limit } = toPagination(query);
      const base = () =>
        this.selectWithJoins(db, conditions, this.orderByFor(query));
      const [rows, totalRows] = await Promise.all([
        base().limit(limit).offset(offset).execute(),
        db
          .select({ value: count() })
          .from(interviews)
          .innerJoin(
            applications,
            eq(interviews.applicationId, applications.id),
          )
          .innerJoin(candidates, eq(applications.candidateId, candidates.id))
          .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
          .innerJoin(users, eq(interviews.interviewerId, users.id))
          .where(and(...conditions))
          .execute(),
      ]);
      return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
    });
  }

  async findAllFiltered(
    filters: {
      interviewerId?: string;
      applicationId?: string;
      status?: string;
    },
    query: ListQueryDto,
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const conditions = this.buildConditions(filters, query);
      return this.selectWithJoins(
        db,
        conditions,
        this.orderByFor(query),
      ).execute();
    });
  }
```

- [ ] **Step 5: Verify no behavior change + typecheck**

Run: `npx jest src/repositories --silent` — no unit tests live here; the existing interview list behavior is covered by `phase14.e2e-spec.ts` (run later in Task 5). For now verify compilation:

Run: `npm run typecheck` (in `backend/`)
Expected: no errors

Run: `npm run lint` (in `backend/`)
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/candidate.repository.ts backend/src/repositories/job-posting.repository.ts backend/src/repositories/company.repository.ts backend/src/repositories/interview.repository.ts
git commit -m "feat(m16): repo findAllFiltered export variants"
```

---

## Task 3: Company-side export endpoints

**Files:**
- Modify: `backend/src/modules/company/company-users.service.ts`, `company-users.controller.ts`
- Modify: `backend/src/modules/job-postings/job-postings.service.ts`, `job-postings.controller.ts`
- Modify: `backend/src/modules/candidates/candidates.service.ts`, `candidates.controller.ts`
- Modify: `backend/src/modules/interviews/interviews.service.ts`, `interviews.controller.ts`

### 3a. Company users (`GET /company/users/export`)

- [ ] **Step 1: Service method**

In `company-users.service.ts`, add import `import { toCsv } from '../../common/csv.helper';` and after `list()` (line 35):

```ts
  async exportCsv() {
    const rows = await this.userRepo.findAll();
    return toCsv(['email', 'role', 'status', 'createdAt'], rows);
  }
```

- [ ] **Step 2: Controller route**

In `company-users.controller.ts`, add imports:

```ts
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { csvFilename } from '../../common/csv.helper';
```

Add after `list()` (line 34), before the `@Post()`:

```ts
  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...PICKER_ROLES)
  @SkipEnvelope()
  async exportCsv(@Res() res: Response) {
    const csv = await this.orgUsersService.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('company-users')}"`,
    );
    res.send(csv);
  }
```

### 3b. Job postings (`GET /job-postings/export`)

- [ ] **Step 3: Service method**

In `job-postings.service.ts`, add import `import { toCsv } from '../../common/csv.helper';` and after `list()` (line 33):

```ts
  async exportCsv(status: string | undefined, query: ListQueryDto) {
    const rows = await this.jobPostingRepo.findAllFiltered({
      ...query,
      status,
    });
    return toCsv(['title', 'status', 'createdAt'], rows);
  }
```

- [ ] **Step 4: Controller route**

In `job-postings.controller.ts`, add imports:

```ts
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { csvFilename } from '../../common/csv.helper';
```

Add after `list()` (line 45) — **must be before `@Get(':id')`** so the `:id` param route doesn't shadow `export`:

```ts
  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @SkipEnvelope()
  async exportCsv(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('status') status?: string,
    @Res() res: Response,
  ) {
    const csv = await this.jobPostingsService.exportCsv(status, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('job-postings')}"`,
    );
    res.send(csv);
  }
```

### 3c. Candidates (`GET /candidates/export`)

- [ ] **Step 5: Service method**

In `candidates.service.ts`, add import `import { toCsv } from '../../common/csv.helper';` and after `list()` (line 25):

```ts
  async exportCsv(query: ListQueryDto) {
    const rows = await this.candidateRepo.findAllFiltered(query);
    return toCsv(['name', 'email', 'phone', 'createdAt'], rows);
  }
```

- [ ] **Step 6: Controller route**

In `candidates.controller.ts`, add imports:

```ts
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { csvFilename } from '../../common/csv.helper';
```

Add after `list()` (line 33) — **must be before `@Get(':id')`**:

```ts
  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @SkipEnvelope()
  async exportCsv(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.candidatesService.exportCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('candidates')}"`,
    );
    res.send(csv);
  }
```

### 3d. Interviews (`GET /interviews/export`)

- [ ] **Step 7: Service method**

In `interviews.service.ts`, add import `import { toCsv } from '../../common/csv.helper';` and after `list()` (line 45):

```ts
  async exportCsv(
    user: CompanyContext,
    query: ListQueryDto & { status?: string; assignedToMe?: string },
  ) {
    const ownOnly =
      user.role === 'Interviewer' || query.assignedToMe === 'true';
    const filters = {
      ...(ownOnly ? { interviewerId: user.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const rows = await this.interviewRepo.findAllFiltered(filters, query);
    return toCsv(
      ['candidateName', 'jobTitle', 'scheduledAt', 'interviewerEmail', 'status'],
      rows,
    );
  }
```

- [ ] **Step 8: Controller route**

In `interviews.controller.ts`, add imports:

```ts
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { csvFilename } from '../../common/csv.helper';
```

Add after `list()` (line 58) — **must be before `@Get(':id')`**:

```ts
  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @SkipEnvelope()
  async exportCsv(
    @CurrentUser() user: CompanyContext,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('status') status?: string,
    @Query('assignedToMe') assignedToMe?: string,
    @Res() res: Response,
  ) {
    const csv = await this.interviewsService.exportCsv(user, {
      ...query,
      status,
      assignedToMe,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('interviews')}"`,
    );
    res.send(csv);
  }
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run lint` (in `backend/`)
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/company backend/src/modules/job-postings backend/src/modules/candidates backend/src/modules/interviews
git commit -m "feat(m16): company-side csv export endpoints"
```

---

## Task 4: Platform export endpoints

**Files:**
- Modify: `backend/src/modules/platform/platform.service.ts`, `platform.controller.ts`
- Modify: `backend/src/modules/platform/platform-accounts.service.ts`, `platform-accounts.controller.ts`
- Modify: `backend/src/modules/platform/platform-data.service.ts`, `platform-data.controller.ts`

### 4a. Companies (`GET /platform/companies/export`)

- [ ] **Step 1: Service method**

In `platform.service.ts`, add `import { toCsv } from '../../common/csv.helper';` and after `listCompanies` (line 23):

```ts
  async exportCompanies(query: ListQueryDto & { status?: string }) {
    const rows = await this.tenantRepo.findAllFiltered(query);
    return toCsv(['name', 'slug', 'plan', 'status', 'createdAt'], rows);
  }
```

- [ ] **Step 2: Controller route**

In `platform.controller.ts`, add imports:

```ts
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { csvFilename } from '../../common/csv.helper';
```

Insert between `listCompanies` and `getCompany` (lines 22-29) — **must be before `@Get('companies/:id')`**:

```ts
  @Get('companies/export')
  @SkipEnvelope()
  async exportCompanies(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('status') status?: string,
    @Res() res: Response,
  ) {
    const csv = await this.platformService.exportCompanies({
      ...query,
      status,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('companies')}"`,
    );
    res.send(csv);
  }
```

(Class-level `@UseGuards(AuthGuard('jwt'))` + `@Roles('SuperAdmin')` already apply.)

### 4b. Users (`GET /platform/users/export`)

- [ ] **Step 3: Extract `collectAllUsers` + add `exportAllUsers`**

In `platform-accounts.service.ts`, add `import { toCsv } from '../../common/csv.helper';`.

Replace the body of `listAllUsers` (lines 273-341) with:

```ts
  private async collectAllUsers() {
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
    return [
      ...companyUsers,
      ...candidateRows,
    ] as Array<(typeof companyUsers)[number] | (typeof candidateRows)[number]>;
  }

  async listAllUsers(
    query: ListQueryDto & { type?: string; companyId?: string; role?: string },
  ) {
    const rows = await this.collectAllUsers();
    let filtered = rows;
    if (query.type) filtered = filtered.filter((row) => row.type === query.type);
    if (query.companyId)
      filtered = filtered.filter((row) => row.companyId === query.companyId);
    if (query.role) filtered = filtered.filter((row) => row.role === query.role);
    filtered = inMemorySearch(filtered, query.search, [
      'email',
      'firstName',
      'lastName',
      'companyName',
    ]);
    const sorted = sortAndPageInMemory(
      filtered,
      query,
      (row, sortBy) =>
        sortBy === 'createdAt' ? row.createdAt : row.email.toLowerCase(),
      'email',
      'asc',
    );
    return listEnvelope(sorted.data, sorted.total, query);
  }

  async exportAllUsers(
    query: ListQueryDto & { type?: string; companyId?: string; role?: string },
  ) {
    const rows = await this.collectAllUsers();
    let filtered = rows;
    if (query.type) filtered = filtered.filter((row) => row.type === query.type);
    if (query.companyId)
      filtered = filtered.filter((row) => row.companyId === query.companyId);
    if (query.role) filtered = filtered.filter((row) => row.role === query.role);
    filtered = inMemorySearch(filtered, query.search, [
      'email',
      'firstName',
      'lastName',
      'companyName',
    ]);
    const displayRows = filtered.map((row) => ({
      name:
        row.type === 'candidate'
          ? `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim()
          : row.email,
      email: row.email,
      type: row.type,
      company: row.companyName ?? '',
      role: row.role,
      status: row.status ?? '',
      createdAt: row.createdAt,
    }));
    return toCsv(
      ['name', 'email', 'type', 'company', 'role', 'status', 'createdAt'],
      displayRows,
    );
  }
```

- [ ] **Step 4: Controller route**

In `platform-accounts.controller.ts`, add imports:

```ts
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { csvFilename } from '../../common/csv.helper';
```

Add after `listCompanyStages` (line 97), before `@Get('users')`:

```ts
  @Get('users/export')
  @SkipEnvelope()
  async exportAllUsers(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('type') type?: string,
    @Query('companyId') companyId?: string,
    @Query('role') role?: string,
    @Res() res: Response,
  ) {
    const csv = await this.accountsService.exportAllUsers({
      ...query,
      type,
      companyId,
      role,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('users')}"`,
    );
    res.send(csv);
  }
```

### 4c. Applications / Interviews / Jobs (`GET /platform/{applications,interviews,jobs}/export`)

- [ ] **Step 5: Extract collectors + add export methods**

In `platform-data.service.ts`, add `import { toCsv } from '../../common/csv.helper';`.

Refactor `listApplications` (lines 63-95) — extract the load loop into a private collector and add `exportApplications`:

```ts
  private async collectApplications(filters: PlatformFilters) {
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
    return rows;
  }

  async listApplications(filters: PlatformFilters, query: ListQueryDto) {
    const rows = await this.collectApplications(filters);
    let filtered = rows;
    if (filters.status) {
      filtered = filtered.filter((row) => row.stageName === filters.status);
    }
    filtered = inMemorySearch(filtered, query.search, [
      'candidateName',
      'jobTitle',
      'companyName',
    ]);
    const sorted = sortAndPageInMemory(
      filtered,
      query,
      (row, sortBy) => this.rowSortValue(row, sortBy),
      'appliedAt',
      'desc',
    );
    return listEnvelope(sorted.data, sorted.total, query);
  }

  async exportApplications(filters: PlatformFilters, search?: string) {
    const rows = await this.collectApplications(filters);
    let filtered = rows;
    if (filters.status) {
      filtered = filtered.filter((row) => row.stageName === filters.status);
    }
    filtered = inMemorySearch(filtered, search, [
      'candidateName',
      'jobTitle',
      'companyName',
    ]);
    const displayRows = filtered.map((row) => ({
      candidate: row.candidateName,
      company: row.companyName,
      job: row.jobTitle,
      stage: row.stageName,
      appliedAt: row.appliedAt,
      matchScore: row.matchScore ?? '',
    }));
    return toCsv(
      ['candidate', 'company', 'job', 'stage', 'appliedAt', 'matchScore'],
      displayRows,
    );
  }
```

- [ ] **Step 6: Same extraction for interviews**

Extract the load loop from `listInterviews` (lines ~150-171 — the `companies`/`target`/`rows` block, identical structure to applications) into `collectInterviews(filters: PlatformFilters)` returning the pushed `{ ...interview, companyName, companyId }` rows, then rewrite `listInterviews` to use it (keeping its status filter, search, `sortAndPageInMemory` with `'scheduledAt'`/`'asc'`, and envelope exactly as today), and add:

```ts
  async exportInterviews(filters: PlatformFilters, search?: string) {
    const rows = await this.collectInterviews(filters);
    let filtered = rows;
    if (filters.status) {
      filtered = filtered.filter((row) => row.status === filters.status);
    }
    filtered = inMemorySearch(filtered, search, [
      'candidateName',
      'jobTitle',
      'companyName',
    ]);
    const displayRows = filtered.map((row) => ({
      candidate: row.candidateName,
      job: row.jobTitle,
      interviewer: row.interviewerEmail,
      scheduledAt: row.scheduledAt,
      status: row.status,
    }));
    return toCsv(
      ['candidate', 'job', 'interviewer', 'scheduledAt', 'status'],
      displayRows,
    );
  }
```

- [ ] **Step 7: Same extraction for jobs**

Extract the load loop from `listJobs` (lines 222-236) into `collectJobs(filters: PlatformFilters)`, rewrite `listJobs` to use it (keeping search + `sortAndPageInMemory` with `'createdAt'`/`'desc'` + envelope), and add:

```ts
  async exportJobs(filters: PlatformFilters, search?: string) {
    const rows = await this.collectJobs(filters);
    const filtered = inMemorySearch(rows, search, ['title', 'companyName']);
    const displayRows = filtered.map((row) => ({
      company: row.companyName,
      title: row.title,
      employmentType: row.employmentType ?? '',
      location: row.location ?? '',
      workSetup: row.workSetup ?? '',
      status: row.status,
      createdAt: row.createdAt,
    }));
    return toCsv(
      ['company', 'title', 'employmentType', 'location', 'workSetup', 'status', 'createdAt'],
      displayRows,
    );
  }
```

- [ ] **Step 8: Controller routes**

In `platform-data.controller.ts`, add imports:

```ts
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { csvFilename } from '../../common/csv.helper';
```

Add `exportApplications` right after `listApplications` (line 52):

```ts
  @Get('applications/export')
  @SkipEnvelope()
  async exportApplications(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('status') status?: string,
    @Res() res: Response,
  ) {
    const csv = await this.dataService.exportApplications(
      { companyId: companyId || undefined, status: status || undefined },
      query.search,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('applications')}"`,
    );
    res.send(csv);
  }
```

Add `exportInterviews` right after `listInterviews` (line 74):

```ts
  @Get('interviews/export')
  @SkipEnvelope()
  async exportInterviews(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('status') status?: string,
    @Res() res: Response,
  ) {
    const csv = await this.dataService.exportInterviews(
      { companyId: companyId || undefined, status: status || undefined },
      query.search,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('interviews')}"`,
    );
    res.send(csv);
  }
```

Add `exportJobs` **between** `listJobs` and `getJob` (lines 85-98) — **must be before `@Get('jobs/:id')`**:

```ts
  @Get('jobs/export')
  @SkipEnvelope()
  async exportJobs(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('status') status?: string,
    @Res() res: Response,
  ) {
    const csv = await this.dataService.exportJobs(
      { companyId: companyId || undefined, status: status || undefined },
      query.search,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('jobs')}"`,
    );
    res.send(csv);
  }
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run lint` (in `backend/`)
Expected: no errors

Run: `npx jest src/modules/platform` (in `backend/`) — existing `platform-data.service.spec.ts` / `platform-accounts.service.spec.ts` must stay green after the collector extraction.
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/platform
git commit -m "feat(m16): platform csv export endpoints"
```

---

## Task 5: E2E release gate (`phase16.e2e-spec.ts`)

**Files:**
- Create: `backend/test/phase16.e2e-spec.ts`

Model this file on `backend/test/phase14.e2e-spec.ts` (same helpers: `verifyInfrastructure`, `httpServer`, `signIn`, `createTenant`, `createSuperAdmin`, `createPlatformJob`, `publishJob`, `createPlatformCandidate`, `createInterviewer`, `cleanupDatabase`, `cleanupRedisKeys` — rename prefixes `phase14` → `phase16` and use `runId`). The seed data in the local DB is NOT assumed — everything is created in `beforeAll`.

- [ ] **Step 1: Write the spec**

Setup in `beforeAll` (mirroring phase14):
- superadmin + tenantA + tenantB
- jobA1 (published), jobA2 (left **draft**)
- candidate → apply to jobA1

The describe blocks and tests:

```ts
  describe('company users export', () => {
    it('downloads a CSV with BOM, header, and the current user rows', async () => {
      const response = await request(httpServer())
        .get('/api/company/users/export')
        .set('Authorization', `Bearer ${tenantA.token}`);
      assertStatus(response, 200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toMatch(/company-users-\d{4}-\d{2}-\d{2}\.csv/);
      const body = response.text as string;
      expect(body.startsWith('\uFEFF')).toBe(true);
      expect(body).toContain('email,role,status,createdAt');
      expect(body).toContain(tenantA.email);
    });
  });

  describe('company job-postings export', () => {
    it('respects the status filter', async () => {
      const response = await request(httpServer())
        .get('/api/job-postings/export')
        .query({ status: 'open' })
        .set('Authorization', `Bearer ${tenantA.token}`);
      assertStatus(response, 200);
      const body = response.text as string;
      expect(body).toContain('title,status,createdAt');
      expect(body).toContain(jobA1.title);
      expect(body).not.toContain(jobA2.title);
    });
  });

  describe('platform users export', () => {
    it('is scoped by company filter', async () => {
      const response = await request(httpServer())
        .get('/api/platform/users/export')
        .query({ type: 'company', companyId: tenantA.companyId })
        .set('Authorization', `Bearer ${superAdminToken()}`);
      assertStatus(response, 200);
      const body = response.text as string;
      expect(body).toContain('name,email,type,company,role,status,createdAt');
      expect(body).toContain(tenantA.email);
      expect(body).not.toContain(tenantB.email);
    });
  });

  describe('platform companies export', () => {
    it('matches the search filter', async () => {
      const response = await request(httpServer())
        .get('/api/platform/companies/export')
        .query({ search: runId })
        .set('Authorization', `Bearer ${superAdminToken()}`);
      assertStatus(response, 200);
      const body = response.text as string;
      expect(body).toContain('name,slug,plan,status,createdAt');
      expect(body).toContain(tenantA.name);
      expect(body).toContain(tenantB.name);
      const dataLines = body
        .split('\r\n')
        .filter((line) => line.startsWith('Phase 16'));
      expect(dataLines).toHaveLength(2);
    });
  });
```

Notes:
- Use `jest.setTimeout(30000)` at the describe level (phase14 line 395).
- Cleanup arrays (`createdCompanyIds`, `createdOrgUserIds`, `createdSuperAdminIds`, `createdCandidateIds`, `createdInterviewerIds`) must be tracked exactly as phase14 so `cleanupDatabase` removes everything.
- `applyToJob` requires jobA1 published; jobA2 stays draft for the status-filter assertion.

- [ ] **Step 2: Run the e2e suite**

Run: `npx jest --config test/jest-e2e.json --testPathPattern phase16` (in `backend/`)
Expected: all tests PASS

- [ ] **Step 3: Run the full backend gates**

Run: `npm test && npm run typecheck && npm run lint` (in `backend/`)
Expected: all green

- [ ] **Step 4: Commit**

```bash
git add backend/test/phase16.e2e-spec.ts
git commit -m "feat(m16): csv export e2e release gate"
```

---

## Task 6: Frontend shared pieces

**Files:**
- Create: `frontend/src/shared/components/ExportCsvButton.tsx`
- Modify: `frontend/src/shared/components/ListControls.tsx`
- Modify: `frontend/src/api/platformApi.ts`, `companyUsersApi.ts`, `jobPostingsApi.ts`, `candidatesApi.ts`, `interviewsApi.ts`

- [ ] **Step 1: Create `ExportCsvButton`**

```tsx
import { useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';

interface ExportCsvButtonProps {
  resource: string;
  request: () => Promise<Blob>;
}

export function ExportCsvButton({ resource, request }: ExportCsvButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    setError(false);
    try {
      const blob = await request();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Group gap="xs">
      <Button
        variant="light"
        size="xs"
        loading={loading}
        leftSection={<IconDownload size="1rem" />}
        onClick={handleClick}
      >
        Export
      </Button>
      {error && (
        <Text size="xs" c="red">
          Export failed
        </Text>
      )}
    </Group>
  );
}
```

- [ ] **Step 2: Add `actions` prop to `ListControls`**

Add `import type { ReactNode } from 'react';` at the top. Change the props interface (after `onToggleSortDir`):

```ts
  onToggleSortDir: () => void;
  actions?: ReactNode;
```

Destructure `actions` and render it at the end of the `Group` (after the sort-dir `ActionIcon`, line 77):

```tsx
      {actions}
```

- [ ] **Step 3: Add export methods to api modules**

In `frontend/src/api/platformApi.ts`, inside the `platformApi` object (after `listCompanies`, line 115):

```ts
  exportCompanies: async (params?: { search?: string; status?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/companies/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  exportUsers: async (params?: { search?: string; type?: string; companyId?: string; role?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/users/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  exportApplications: async (params?: { search?: string; companyId?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/applications/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  exportInterviews: async (params?: { search?: string; companyId?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/interviews/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  exportJobs: async (params?: { search?: string; companyId?: string; status?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/jobs/export', { params, responseType: 'blob' });
    return data as Blob;
  },
```

In `frontend/src/api/companyUsersApi.ts`, inside the `companyUsersApi` object (after `list`, line 33):

```ts
  exportCsv: async (): Promise<Blob> => {
    const { data } = await apiClient.get('/company/users/export', { responseType: 'blob' });
    return data as Blob;
  },
```

In `frontend/src/api/jobPostingsApi.ts`, inside the `jobPostingsApi` object (after `list`, line 42):

```ts
  exportCsv: async (params?: { search?: string; status?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/job-postings/export', { params, responseType: 'blob' });
    return data as Blob;
  },
```

In `frontend/src/api/candidatesApi.ts`, inside the `candidatesApi` object (after `list`, line 31):

```ts
  exportCsv: async (params?: { search?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/candidates/export', { params, responseType: 'blob' });
    return data as Blob;
  },
```

In `frontend/src/api/interviewsApi.ts`, inside the `interviewsApi` object (after `list`, line 47):

```ts
  exportCsv: async (params?: { search?: string; status?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/interviews/export', { params, responseType: 'blob' });
    return data as Blob;
  },
```

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint` (in `frontend/`)
Expected: build succeeds, oxlint clean

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/components/ExportCsvButton.tsx frontend/src/shared/components/ListControls.tsx frontend/src/api
git commit -m "feat(m16): frontend export button and api methods"
```

---

## Task 7: Wire platform pages

**Files:**
- Modify: `frontend/src/features/admin/CompaniesPage.tsx`, `UsersPage.tsx`, `ApplicationsPage.tsx`, `JobsPage.tsx`, `CompanyDetailPage.tsx`

The pattern: pass the page's live `listQuery.search` + filter state to the api export method, render `<ExportCsvButton>` in `ListControls` `actions` (main pages) or the header `Group` (CompanyDetail tabs).

- [ ] **Step 1: CompaniesPage**

Add imports:

```ts
import { platformApi } from '@/api/platformApi'
import { ExportCsvButton } from '@/shared/components/ExportCsvButton'
```

Pass `actions` to the page's `ListControls` (after `onToggleSortDir` prop):

```tsx
        onToggleSortDir={listQuery.toggleSortDir}
        actions={
          <ExportCsvButton
            resource="companies"
            request={() =>
              platformApi.exportCompanies({
                search: listQuery.search || undefined,
                status: statusFilter ?? undefined,
              })
            }
          />
        }
```

- [ ] **Step 2: UsersPage**

Add `import { ExportCsvButton } from '@/shared/components/ExportCsvButton'` (platformApi already imported).

Pass `actions` to `ListControls`:

```tsx
        onToggleSortDir={listQuery.toggleSortDir}
        actions={
          <ExportCsvButton
            resource="users"
            request={() =>
              platformApi.exportUsers({
                search: listQuery.search || undefined,
                type: typeFilter ?? undefined,
                companyId: companyFilter ?? undefined,
                role: roleFilter ?? undefined,
              })
            }
          />
        }
```

- [ ] **Step 3: ApplicationsPage**

Add imports:

```ts
import { platformApi } from '@/api/platformApi'
import { ExportCsvButton } from '@/shared/components/ExportCsvButton'
```

Pass `actions` to `ListControls`:

```tsx
        onToggleSortDir={listQuery.toggleSortDir}
        actions={
          <ExportCsvButton
            resource="applications"
            request={() =>
              platformApi.exportApplications({
                search: listQuery.search || undefined,
                companyId: companyFilter ?? undefined,
              })
            }
          />
        }
```

- [ ] **Step 4: JobsPage**

Add `import { ExportCsvButton } from '@/shared/components/ExportCsvButton'` (platformApi already imported).

Pass `actions` to `ListControls`:

```tsx
        onToggleSortDir={listQuery.toggleSortDir}
        actions={
          <ExportCsvButton
            resource="jobs"
            request={() =>
              platformApi.exportJobs({
                search: listQuery.search || undefined,
                companyId: companyFilter ?? undefined,
                status: statusFilter ?? undefined,
              })
            }
          />
        }
```

- [ ] **Step 5: CompanyDetailPage — UsersTab (line ~136)**

Add `import { ExportCsvButton } from '@/shared/components/ExportCsvButton'` (platformApi already imported at top — verify; if not, add `import { platformApi } from '@/api/platformApi'`).

Replace the header Group (lines 162-167):

```tsx
      <Group justify="space-between" mb="md">
        <Title order={4}>Team</Title>
        <Group gap="xs">
          <ExportCsvButton
            resource="users"
            request={() => platformApi.exportUsers({ companyId })}
          />
          <Button size="xs" onClick={() => setCreateOpen(true)}>
            Add user
          </Button>
        </Group>
      </Group>
```

- [ ] **Step 6: CompanyDetailPage — ApplicationsTab (line ~373)**

Find the tab's header block and add an `ExportCsvButton` into its header `Group` (platformApi already imported):

```tsx
        <ExportCsvButton
          resource="applications"
          request={() => platformApi.exportApplications({ companyId })}
        />
```

- [ ] **Step 7: CompanyDetailPage — InterviewsTab (line ~472)**

Same — add into the tab's header `Group`:

```tsx
        <ExportCsvButton
          resource="interviews"
          request={() => platformApi.exportInterviews({ companyId })}
        />
```

(If a tab's header lacks a `Group justify="space-between"`, wrap its `Title` and the button in one, matching the UsersTab shape.)

- [ ] **Step 8: Verify**

Run: `npm run build && npm run lint` (in `frontend/`)
Expected: build succeeds, oxlint clean

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/admin
git commit -m "feat(m16): export buttons on platform pages"
```

---

## Task 8: Wire company-admin pages

**Files:**
- Modify: `frontend/src/features/company/users/UserManagementPage.tsx`
- Modify: `frontend/src/features/company/job-postings/JobPostingList.tsx`
- Modify: `frontend/src/features/company/candidates/CandidateList.tsx`
- Modify: `frontend/src/features/company/interviews/InterviewListView.tsx`

- [ ] **Step 1: UserManagementPage**

Add imports:

```ts
import { ExportCsvButton } from '@/shared/components/ExportCsvButton'
import { companyUsersApi } from '@/api/companyUsersApi'
```

Replace the header Group (lines 88-91):

```tsx
      <Group justify="space-between" mb="md">
        <Title order={3}>Team members</Title>
        <Group gap="xs">
          <ExportCsvButton resource="company-users" request={companyUsersApi.exportCsv} />
          <Button onClick={() => setCreateOpen(true)}>Add team member</Button>
        </Group>
      </Group>
```

- [ ] **Step 2: JobPostingList**

Add imports:

```ts
import { jobPostingsApi } from '@/api/jobPostingsApi'
import { ExportCsvButton } from '@/shared/components/ExportCsvButton'
```

Pass `actions` to `ListControls` (after `onToggleSortDir`):

```tsx
        onToggleSortDir={listQuery.toggleSortDir}
        actions={
          <ExportCsvButton
            resource="job-postings"
            request={() =>
              jobPostingsApi.exportCsv({
                search: listQuery.search || undefined,
                status: statusFilter ?? undefined,
              })
            }
          />
        }
```

- [ ] **Step 3: CandidateList**

Add imports:

```ts
import { candidatesApi } from '@/api/candidatesApi'
import { ExportCsvButton } from '@/shared/components/ExportCsvButton'
```

Wrap the `Title` (line 29) in a header Group:

```tsx
      <Group justify="space-between">
        <Title order={2}>Candidates</Title>
        <ExportCsvButton
          resource="candidates"
          request={() =>
            candidatesApi.exportCsv({
              search: listQuery.search || undefined,
            })
          }
        />
      </Group>
```

- [ ] **Step 4: InterviewListView**

Add imports:

```ts
import { interviewsApi } from '@/api/interviewsApi'
import { ExportCsvButton } from '@/shared/components/ExportCsvButton'
```

Pass `actions` to `ListControls` (after `onToggleSortDir`):

```tsx
        onToggleSortDir={listQuery.toggleSortDir}
        actions={
          <ExportCsvButton
            resource="interviews"
            request={() =>
              interviewsApi.exportCsv({
                search: listQuery.search || undefined,
                status: statusFilter ?? undefined,
              })
            }
          />
        }
```

- [ ] **Step 5: Verify**

Run: `npm run build && npm run lint` (in `frontend/`)
Expected: build succeeds, oxlint clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/company
git commit -m "feat(m16): export buttons on company pages"
```

---

## Task 9: Docs + full verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/07_API_ENDPOINT_DOCUMENTATION.md`

- [ ] **Step 1: Update AGENTS.md**

In "Current State", after the M15 bullet, add:

```markdown
- **M16:** CSV export for admin tables — 9 backend export endpoints (`/platform/{companies,users,applications,jobs,interviews}/export` with `companyId` scope for the CompanyDetail tabs, `/company/{users,job-postings,candidates,interviews}/export`) sharing `toCsv` (RFC 4180 escaping, UTF-8 BOM, CRLF) + `csvFilename` in `common/csv.helper.ts`; repo `findAllFiltered` variants (same where, no pagination) and platform in-memory `exportX` methods (search + filters respected, sort/pagination ignored); shared `ExportCsvButton` wired into all 11 admin table pages via `ListControls.actions` (main pages) or header groups (CompanyDetail tabs). E2e: `phase16.e2e-spec.ts`.
```

Add the M16 row to the Build Order table (after M15):

```markdown
| M16 | CSV Export | Export button on all admin tables downloads filtered CSV — done ✅ |
```

- [ ] **Step 2: Update API docs**

In `docs/07_API_ENDPOINT_DOCUMENTATION.md`, add a short section listing the 9 export endpoints (method, path, query params, response: `text/csv` attachment with `filename={resource}-YYYY-MM-DD.csv`, BOM-prefixed RFC 4180 body, search+filters respected, pagination/sort ignored).

- [ ] **Step 3: Full verification**

Backend (in `backend/`):

```sh
npm run typecheck && npm run lint && npm test
npx jest --config test/jest-e2e.json --testPathPattern phase16
```

Expected: all green.

Frontend (in `frontend/`):

```sh
npm run build && npm run lint
```

Expected: build succeeds, oxlint clean.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/07_API_ENDPOINT_DOCUMENTATION.md
git commit -m "docs(m16): csv export endpoints and status"
```

---

## Self-review notes

- **Spec coverage:** all 11 tables mapped — platform 4 (Task 7) + CompanyDetail 3 (Task 7) + company 4 (Task 8); 9 endpoints (Task 3 + Task 4); semantics (filters respected, pagination ignored) enforced in repo/service layer; BOM/escaping in Task 1.
- **Route ordering hazards covered:** `export` routes declared before `:id` routes in job-postings, candidates, interviews, platform jobs, platform companies controllers.
- **Type consistency:** `findAllFiltered` takes `(query)` or `(filters, query)` matching each repo's `findPaginated` shape; `exportX` service methods return `string` (CSV) — consumed by controllers via `res.send(csv)`; frontend api methods return `Promise<Blob>` matching `ExportCsvButton.request`.
- **No new dependencies.**
