## Task 1: Backend repositories

**Files:**
- Create: `backend/src/repositories/job-posting.repository.ts`
- Create: `backend/src/repositories/skill.repository.ts`
- Modify: `backend/src/repositories/candidate.repository.ts` (add `findAll`, `findById`, loosen `create` email)
- Modify: `backend/src/repositories/repositories.module.ts` (register the 2 new repos)

**Interfaces:**
- Consumes: `BaseRepository`, `DrizzleSchemaService`, `jobPostings`, `jobRequiredSkills`, `skills`, `candidates` from `backend/src/database/schema.ts`.
- Produces:
  - `JobPostingRepository` — `findAll(status?: string): Promise<JobPostingRow[]>`; `findById(id): Promise<JobPostingRow | null>`; `create(data: { title: string; description?: string | null; createdByUserId?: string }): Promise<JobPostingRow>`; `update(id, data: Partial<{ title: string; description: string | null; status: string }>): Promise<JobPostingRow | null>`; `delete(id): Promise<void>`; `setRequiredSkills(jobPostingId: string, skillIds: string[]): Promise<void>`; `getRequiredSkillIds(jobPostingId: string): Promise<string[]>`.
  - `SkillRepository` — `search(query?: string): Promise<SkillRow[]>` (ILIKE on name, limit 20 with query / 50 without); `findByIds(ids: string[]): Promise<SkillRow[]>` (returns `[]` for empty input).
  - `CandidateRepository.findAll(): Promise<CandidateRow[]>` (order by createdAt desc); `findById(id): Promise<CandidateRow | null>`; `create` email param becomes `email?: string | null`.

- [ ] **Step 1: Write `job-posting.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { jobPostings, jobRequiredSkills } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class JobPostingRepository extends BaseRepository {
  async findAll(status?: string) {
    return this.withDb('current', async (db) => {
      const base = db.select().from(jobPostings);
      return status
        ? base
            .where(eq(jobPostings.status, status))
            .orderBy(desc(jobPostings.createdAt))
            .execute()
        : base.orderBy(desc(jobPostings.createdAt)).execute();
    });
  }

  async findById(id: string) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: {
    title: string;
    description?: string | null;
    createdByUserId?: string;
  }) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .insert(jobPostings)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async update(
    id: string,
    data: Partial<{ title: string; description: string | null; status: string }>,
  ) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .update(jobPostings)
        .set(data)
        .where(eq(jobPostings.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async delete(id: string) {
    return this.withDb('current', async (db) => {
      await db.delete(jobPostings).where(eq(jobPostings.id, id)).execute();
    });
  }

  async setRequiredSkills(jobPostingId: string, skillIds: string[]) {
    return this.withDb('current', async (db) => {
      await db
        .delete(jobRequiredSkills)
        .where(eq(jobRequiredSkills.jobPostingId, jobPostingId))
        .execute();
      if (skillIds.length > 0) {
        await db
          .insert(jobRequiredSkills)
          .values(skillIds.map((skillId) => ({ jobPostingId, skillId })))
          .execute();
      }
    });
  }

  async getRequiredSkillIds(jobPostingId: string) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .select({ skillId: jobRequiredSkills.skillId })
        .from(jobRequiredSkills)
        .where(eq(jobRequiredSkills.jobPostingId, jobPostingId))
        .execute();
      return rows.map((r) => r.skillId);
    });
  }
}
```

- [ ] **Step 2: Write `skill.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { ilike, inArray } from 'drizzle-orm';
import { skills } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class SkillRepository extends BaseRepository {
  async search(query?: string) {
    return this.withDb('public', async (db) => {
      if (query) {
        return db
          .select()
          .from(skills)
          .where(ilike(skills.name, `%${query}%`))
          .orderBy(skills.name)
          .limit(20)
          .execute();
      }
      return db.select().from(skills).orderBy(skills.name).limit(50).execute();
    });
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.withDb('public', async (db) => {
      return db.select().from(skills).where(inArray(skills.id, ids)).execute();
    });
  }
}
```

- [ ] **Step 3: Modify `candidate.repository.ts`** — add `desc` to imports; add `findAll` and `findById`; change `create` signature `email: string` → `email?: string | null`. New file body:

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { candidates } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateRepository extends BaseRepository {
  async findAll() {
    return this.withDb('current', async (db) => {
      return db
        .select()
        .from(candidates)
        .orderBy(desc(candidates.createdAt))
        .execute();
    });
  }

  async findById(id: string) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async findByEmail(email: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(
    data: { name: string; email?: string | null; phone?: string | null },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(candidates)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
```

- [ ] **Step 4: Register repos in `repositories.module.ts`** — add `JobPostingRepository` and `SkillRepository` to imports, the `REPOSITORIES` array, and `exports` (exports uses the same `REPOSITORIES` array, so just add both to the array).

- [ ] **Step 5: Typecheck** — run `cd backend && npm run typecheck` from repo root. Expected: PASS (no new errors).

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories
git commit -m "feat(m2): job-posting and skill repositories + candidate list/find"
```


