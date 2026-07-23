import { Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { jobListingsIndex } from '../database/schema';

@Injectable()
export class JobListingsIndexRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findAll(search?: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
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
    } finally {
      release();
    }
  }

  async findById(tenantId: string, jobPostingId: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const rows = await db
        .select()
        .from(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.tenantId, tenantId),
            eq(jobListingsIndex.jobPostingId, jobPostingId),
          ),
        )
        .execute();
      return rows[0] ?? null;
    } finally {
      release();
    }
  }

  async upsert(data: {
    tenantId: string;
    jobPostingId: string;
    title: string;
    description: string;
    companyName: string;
    companySlug: string;
    status: string;
  }) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const existing = await db
        .select()
        .from(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.tenantId, data.tenantId),
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
              eq(jobListingsIndex.tenantId, data.tenantId),
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
    } finally {
      release();
    }
  }

  async delete(tenantId: string, jobPostingId: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db
        .delete(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.tenantId, tenantId),
            eq(jobListingsIndex.jobPostingId, jobPostingId),
          ),
        )
        .execute();
    } finally {
      release();
    }
  }
}
