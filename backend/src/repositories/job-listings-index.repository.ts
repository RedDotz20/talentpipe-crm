import { Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { jobListingsIndex } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class JobListingsIndexRepository extends BaseRepository {
  async findAll(search?: string) {
    return this.withDb('public', async (db) => {
      const results = await db
        .select()
        .from(jobListingsIndex)
        .where(eq(jobListingsIndex.status, 'open'))
        .orderBy(desc(jobListingsIndex.createdAt))
        .execute();

      if (search) {
        const lowerSearch = search.toLowerCase();
        return results.filter(
          (r) =>
            r.title.toLowerCase().includes(lowerSearch) ||
            r.companyName.toLowerCase().includes(lowerSearch),
        );
      }

      return results;
    });
  }

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

  async findById(companyId: string, jobPostingId: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, companyId),
            eq(jobListingsIndex.jobPostingId, jobPostingId),
          ),
        )
        .execute();
      return rows[0] ?? null;
    });
  }

  async upsert(data: {
    companyId: string;
    jobPostingId: string;
    title: string;
    description: string;
    companyName: string;
    companySlug: string;
    status: string;
  }) {
    return this.withDb('public', async (db) => {
      const existing = await db
        .select()
        .from(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, data.companyId),
            eq(jobListingsIndex.jobPostingId, data.jobPostingId),
          ),
        )
        .execute();

      if (existing.length > 0) {
        const rows = await db
          .update(jobListingsIndex)
          .set({
            title: data.title,
            description: data.description,
            companyName: data.companyName,
            companySlug: data.companySlug,
            status: data.status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(jobListingsIndex.companyId, data.companyId),
              eq(jobListingsIndex.jobPostingId, data.jobPostingId),
            ),
          )
          .returning()
          .execute();
        return rows[0];
      } else {
        const rows = await db
          .insert(jobListingsIndex)
          .values(data)
          .returning()
          .execute();
        return rows[0];
      }
    });
  }

  async delete(companyId: string, jobPostingId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, companyId),
            eq(jobListingsIndex.jobPostingId, jobPostingId),
          ),
        )
        .execute(),
    );
  }

  async deleteByCompany(companyId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(jobListingsIndex)
        .where(eq(jobListingsIndex.companyId, companyId))
        .execute(),
    );
  }
}
