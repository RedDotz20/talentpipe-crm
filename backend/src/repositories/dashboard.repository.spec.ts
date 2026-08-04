import {
  DrizzleDB,
  DrizzleSchemaService,
} from '../database/drizzle-schema.service';
import { DashboardRepository } from './dashboard.repository';

describe('DashboardRepository', () => {
  const forCurrentTenant = jest.fn();
  const drizzleSchema = {
    forCurrentTenant,
  } as unknown as DrizzleSchemaService;
  let repository: DashboardRepository;

  it('aggregates only the current tenant data and normalizes count values', async () => {
    const applicationTotalExecute = jest
      .fn()
      .mockResolvedValue([{ count: '7' }]);
    const candidateTotalExecute = jest
      .fn()
      .mockResolvedValue([{ count: '5' }]);
    const openJobTotalExecute = jest
      .fn()
      .mockResolvedValue([{ count: '2' }]);
    const byStageExecute = jest.fn().mockResolvedValue([
      { stageId: 'stage-1', stageName: 'Screening', count: '4' },
      { stageId: null, stageName: null, count: '1' },
    ]);

    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({ execute: applicationTotalExecute }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({ execute: candidateTotalExecute }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({ execute: openJobTotalExecute }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              groupBy: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockReturnValue({ execute: byStageExecute }),
              }),
            }),
          }),
        }),
    } as unknown as DrizzleDB;
    const release = jest.fn();
    forCurrentTenant.mockResolvedValue({ db, release });
    repository = new DashboardRepository(drizzleSchema);

    await expect(repository.findSummary()).resolves.toEqual({
      totalApplications: 7,
      totalCandidates: 5,
      openJobPostings: 2,
      applicationsByStage: [
        { stageId: 'stage-1', stageName: 'Screening', count: 4 },
        { stageId: 'unassigned', stageName: 'Unassigned', count: 1 },
      ],
    });
    expect(forCurrentTenant).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
