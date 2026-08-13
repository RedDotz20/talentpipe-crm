import {
  DrizzleDB,
  DrizzleSchemaService,
} from '../database/drizzle-schema.service';
import { pipelineStages } from '../database/schema';
import { DashboardRepository } from './dashboard.repository';

describe('DashboardRepository', () => {
  const forCurrentCompany = jest.fn();
  const drizzleSchema = {
    forCurrentCompany,
  } as unknown as DrizzleSchemaService;
  let repository: DashboardRepository;

  it('aggregates only the current tenant data and normalizes count values', async () => {
    const applicationTotalExecute = jest
      .fn()
      .mockResolvedValue([{ count: '7' }]);
    const candidateTotalExecute = jest.fn().mockResolvedValue([{ count: '5' }]);
    const openJobTotalExecute = jest.fn().mockResolvedValue([{ count: '2' }]);
    const byStageExecute = jest.fn().mockResolvedValue([
      { stageId: 'stage-1', stageName: 'Screening', count: '4' },
      { stageId: null, stageName: null, count: '1' },
    ]);
    const topJobsExecute = jest
      .fn()
      .mockResolvedValue([{ title: 'Engineer', count: '3' }]);
    const interviewStatusExecute = jest
      .fn()
      .mockResolvedValue([{ status: 'scheduled', count: '2' }]);
    const jobsStatusExecute = jest
      .fn()
      .mockResolvedValue([{ status: 'open', count: '1' }]);
    const jobsTypeExecute = jest
      .fn()
      .mockResolvedValue([{ type: 'full-time', count: '1' }]);
    const rejectionExecute = jest.fn().mockResolvedValue([{ rejected: '1' }]);
    const overTimeExecute = jest
      .fn()
      .mockResolvedValue({ rows: [{ label: '2026-08-12', count: 2 }] });
    const byStageGroupBy = jest.fn().mockReturnValue({
      orderBy: jest.fn().mockReturnValue({ execute: byStageExecute }),
    });

    const chain = (leaves: Record<string, unknown>) => {
      const obj = { ...leaves };
      obj.from ??= jest.fn().mockReturnValue(obj);
      obj.leftJoin ??= jest.fn().mockReturnValue(obj);
      obj.innerJoin ??= jest.fn().mockReturnValue(obj);
      obj.groupBy ??= jest.fn().mockReturnValue(obj);
      obj.where ??= jest.fn().mockReturnValue(obj);
      obj.orderBy ??= jest.fn().mockReturnValue(obj);
      obj.limit ??= jest.fn().mockReturnValue(obj);
      return obj;
    };

    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(chain({ execute: applicationTotalExecute }))
        .mockReturnValueOnce(chain({ execute: candidateTotalExecute }))
        .mockReturnValueOnce(chain({ execute: openJobTotalExecute }))
        .mockReturnValueOnce(
          chain({
            groupBy: byStageGroupBy,
          }),
        )
        .mockReturnValueOnce(chain({ execute: topJobsExecute }))
        .mockReturnValueOnce(chain({ execute: interviewStatusExecute }))
        .mockReturnValueOnce(chain({ execute: jobsStatusExecute }))
        .mockReturnValueOnce(chain({ execute: jobsTypeExecute }))
        .mockReturnValueOnce(chain({ execute: rejectionExecute })),
      execute: overTimeExecute,
    } as unknown as DrizzleDB;
    const release = jest.fn();
    forCurrentCompany.mockResolvedValue({ db, release });
    repository = new DashboardRepository(drizzleSchema);

    await expect(repository.findSummary()).resolves.toEqual({
      totalApplications: 7,
      totalCandidates: 5,
      openJobPostings: 2,
      applicationsByStage: [
        { stageId: 'stage-1', stageName: 'Screening', count: 4 },
        { stageId: 'unassigned', stageName: 'Unassigned', count: 1 },
      ],
      applicationsOverTime: {
        day: [{ label: '2026-08-12', count: 2 }],
        week: [{ label: '2026-08-12', count: 2 }],
        month: [{ label: '2026-08-12', count: 2 }],
      },
      topJobsByApplications: [{ title: 'Engineer', count: 3 }],
      interviewStatusBreakdown: [{ status: 'scheduled', count: 2 }],
      jobsByStatus: [{ status: 'open', count: 1 }],
      jobsByEmploymentType: [{ type: 'full-time', count: 1 }],
      rejection: { rejected: 1, total: 7 },
    });
    expect(byStageGroupBy).toHaveBeenCalledWith(
      pipelineStages.id,
      pipelineStages.name,
      pipelineStages.order,
    );
    expect(forCurrentCompany).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
