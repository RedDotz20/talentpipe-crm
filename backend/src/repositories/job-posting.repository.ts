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
