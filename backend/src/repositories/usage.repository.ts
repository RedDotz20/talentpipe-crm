import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  applications,
  jobPostings,
  pipelineStages,
  users,
} from '@/database/schema';
import { BaseRepository } from '@/repositories/base.repository';

@Injectable()
export class UsageRepository extends BaseRepository {
  async countUsers(schema: string) {
    return this.withDb(schema, async (db) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .execute();
      return Number(row?.count ?? 0);
    });
  }

  async countApplications(schema: string) {
    return this.withDb(schema, async (db) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(applications)
        .execute();
      return Number(row?.count ?? 0);
    });
  }

  async countJobsByStatus(schema: string) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select({
          status: jobPostings.status,
          count: sql<number>`count(*)::int`,
        })
        .from(jobPostings)
        .groupBy(jobPostings.status)
        .execute();
      return rows.map((row) => ({
        status: row.status,
        count: Number(row.count ?? 0),
      }));
    });
  }

  async countApplicationsByStage(schema: string) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select({
          stageName: pipelineStages.name,
          count: sql<number>`count(*)::int`,
        })
        .from(applications)
        .innerJoin(
          pipelineStages,
          eq(applications.currentStageId, pipelineStages.id),
        )
        .groupBy(pipelineStages.name, pipelineStages.order)
        .orderBy(pipelineStages.order)
        .execute();
      return rows.map((row) => ({
        stageName: row.stageName,
        count: Number(row.count ?? 0),
      }));
    });
  }
}
