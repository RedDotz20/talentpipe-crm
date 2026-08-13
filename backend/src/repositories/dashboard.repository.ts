import { Injectable } from '@nestjs/common';
import { desc, eq, ilike, sql } from 'drizzle-orm';
import {
  applications,
  candidates,
  interviews,
  jobPostings,
  pipelineStages,
} from '../database/schema';
import type { DrizzleDB } from '../database/drizzle-schema.service';
import { timeBucketedCounts } from './time-series.helper';
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
  applicationsOverTime: Record<
    'day' | 'week' | 'month',
    Array<{ label: string; count: number }>
  >;
  topJobsByApplications: Array<{ title: string; count: number }>;
  interviewStatusBreakdown: Array<{ status: string; count: number }>;
  jobsByStatus: Array<{ status: string; count: number }>;
  jobsByEmploymentType: Array<{ type: string; count: number }>;
  rejection: { rejected: number; total: number };
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
      const [
        overTime,
        topJobs,
        interviewStatuses,
        jobsStatus,
        jobsType,
        rejection,
      ] = await Promise.all([
        this.applicationsOverTime(db),
        this.topJobsByApplications(db),
        this.interviewStatusBreakdown(db),
        this.jobsByStatus(db),
        this.jobsByEmploymentType(db),
        this.rejectionStats(db),
      ]);

      const totalApplications = toNumber(applicationTotal?.count);
      return {
        totalApplications,
        totalCandidates: toNumber(candidateTotal?.count),
        openJobPostings: toNumber(openJobTotal?.count),
        applicationsByStage: byStage.map((stage) => ({
          stageId: stage.stageId ?? 'unassigned',
          stageName: stage.stageName ?? 'Unassigned',
          count: toNumber(stage.count),
        })),
        applicationsOverTime: overTime,
        topJobsByApplications: topJobs,
        interviewStatusBreakdown: interviewStatuses,
        jobsByStatus: jobsStatus,
        jobsByEmploymentType: jobsType,
        rejection: { rejected: rejection, total: totalApplications },
      };
    });
  }

  private async applicationsOverTime(
    db: DrizzleDB,
  ): Promise<DashboardSummary['applicationsOverTime']> {
    return timeBucketedCounts(db, 'applications', 'applied_at');
  }

  private async topJobsByApplications(
    db: DrizzleDB,
  ): Promise<DashboardSummary['topJobsByApplications']> {
    const rows = await db
      .select({ title: jobPostings.title, count: sql<number>`count(*)::int` })
      .from(applications)
      .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
      .groupBy(jobPostings.id, jobPostings.title)
      .orderBy(desc(sql`count(*)`))
      .limit(8)
      .execute();
    return rows.map((row) => ({
      title: row.title,
      count: toNumber(row.count),
    }));
  }

  private async interviewStatusBreakdown(
    db: DrizzleDB,
  ): Promise<DashboardSummary['interviewStatusBreakdown']> {
    const rows = await db
      .select({ status: interviews.status, count: sql<number>`count(*)::int` })
      .from(interviews)
      .groupBy(interviews.status)
      .execute();
    return rows.map((row) => ({
      status: row.status,
      count: toNumber(row.count),
    }));
  }

  private async jobsByStatus(
    db: DrizzleDB,
  ): Promise<DashboardSummary['jobsByStatus']> {
    const rows = await db
      .select({ status: jobPostings.status, count: sql<number>`count(*)::int` })
      .from(jobPostings)
      .groupBy(jobPostings.status)
      .execute();
    return rows.map((row) => ({
      status: row.status,
      count: toNumber(row.count),
    }));
  }

  private async jobsByEmploymentType(
    db: DrizzleDB,
  ): Promise<DashboardSummary['jobsByEmploymentType']> {
    const rows = await db
      .select({
        type: jobPostings.employmentType,
        count: sql<number>`count(*)::int`,
      })
      .from(jobPostings)
      .groupBy(jobPostings.employmentType)
      .execute();
    return rows.map((row) => ({
      type: row.type ?? 'Not specified',
      count: toNumber(row.count),
    }));
  }

  private async rejectionStats(db: DrizzleDB): Promise<number> {
    const [row] = await db
      .select({ rejected: sql<number>`count(*)::int` })
      .from(applications)
      .innerJoin(
        pipelineStages,
        eq(applications.currentStageId, pipelineStages.id),
      )
      // ponytail: name-based heuristic, `stage_type` column when stage management exists
      .where(ilike(pipelineStages.name, '%reject%'))
      .execute();
    return toNumber(row?.rejected);
  }
}
