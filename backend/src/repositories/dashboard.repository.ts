import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  applications,
  candidates,
  jobPostings,
  pipelineStages,
} from '../database/schema';
import { BaseRepository } from './base.repository';

export type DashboardSummary = {
  totalApplications: number;
  totalCandidates: number;
  openJobPostings: number;
  applicationsByStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
  }>;
};

const toNumber = (value: number | string | bigint | null | undefined): number =>
  Number(value ?? 0);

@Injectable()
export class DashboardRepository extends BaseRepository {
  async findSummary(): Promise<DashboardSummary> {
    return this.withDb('current', async (db) => {
      const [applicationTotal] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(applications)
        .execute();
      const [candidateTotal] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(candidates)
        .execute();
      const [openJobTotal] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobPostings)
        .where(eq(jobPostings.status, 'open'))
        .execute();
      const byStage = await db
        .select({
          stageId: pipelineStages.id,
          stageName: pipelineStages.name,
          count: sql<number>`count(${applications.id})::int`,
        })
        .from(applications)
        .leftJoin(
          pipelineStages,
          eq(applications.currentStageId, pipelineStages.id),
        )
        .groupBy(pipelineStages.id, pipelineStages.name, pipelineStages.order)
        .orderBy(pipelineStages.order)
        .execute();

      return {
        totalApplications: toNumber(applicationTotal?.count),
        totalCandidates: toNumber(candidateTotal?.count),
        openJobPostings: toNumber(openJobTotal?.count),
        applicationsByStage: byStage.map((stage) => ({
          stageId: stage.stageId ?? 'unassigned',
          stageName: stage.stageName ?? 'Unassigned',
          count: toNumber(stage.count),
        })),
      };
    });
  }
}
