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

@Injectable()
export class JobPostingRepository extends BaseRepository {
  async findAll(status?: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const base = db.select().from(jobPostings);
      return status
        ? base
            .where(eq(jobPostings.status, status))
            .orderBy(desc(jobPostings.createdAt))
            .execute()
        : base.orderBy(desc(jobPostings.createdAt)).execute();
    });
  }

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

  async create(
    data: {
      title: string;
      description?: string | null;
      employmentType?: string | null;
      location?: string | null;
      workSetup?: string | null;
      createdByUserId?: string;
    },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
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
    data: Partial<{
      title: string;
      description: string | null;
      employmentType: string | null;
      location: string | null;
      workSetup: string | null;
      status: string;
    }>,
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(jobPostings)
        .set(data)
        .where(eq(jobPostings.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async delete(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      await db.delete(jobPostings).where(eq(jobPostings.id, id)).execute();
    });
  }

  async setRequiredSkills(
    jobPostingId: string,
    skillIds: string[],
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
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

  async getRequiredSkillIds(jobPostingId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select({ skillId: jobRequiredSkills.skillId })
        .from(jobRequiredSkills)
        .where(eq(jobRequiredSkills.jobPostingId, jobPostingId))
        .execute();
      return rows.map((r) => r.skillId);
    });
  }
}
