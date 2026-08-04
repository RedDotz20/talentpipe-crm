import { Test, TestingModule } from '@nestjs/testing';
import { asyncStorage } from '../../common/context/tenant-context';
import { CacheService } from '../../common/cache/cache.service';
import { DashboardRepository } from '../../repositories/dashboard.repository';
import { DashboardService } from './dashboard.service';

type DashboardSummary = {
  totalApplications: number;
  totalCandidates: number;
  openJobPostings: number;
  applicationsByStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
  }>;
};

const runInTenant = <T>(fn: () => Promise<T>): Promise<T> =>
  asyncStorage.run({ tenantId: 't1', userId: 'u1', role: 'OrgAdmin' }, fn);

describe('DashboardService', () => {
  let service: DashboardService;
  const cache = {
    get: jest.fn(),
    set: jest.fn(),
  };
  const repository = {
    findSummary: jest.fn(),
  };
  const summary: DashboardSummary = {
    totalApplications: 4,
    totalCandidates: 3,
    openJobPostings: 2,
    applicationsByStage: [
      { stageId: 'stage-1', stageName: 'Screening', count: 2 },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: CacheService, useValue: cache },
        { provide: DashboardRepository, useValue: repository },
      ],
    }).compile();
    service = module.get<DashboardService>(DashboardService);
  });

  it('queries and caches on a miss', async () => {
    cache.get.mockResolvedValue(null);
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInTenant(() => service.getSummary())).resolves.toEqual(
      summary,
    );
    expect(cache.set).toHaveBeenCalledWith(
      'tenant:t1:dashboard:summary:v1',
      summary,
      60,
    );
  });

  it('returns a cache hit without querying the repository', async () => {
    cache.get.mockResolvedValue(summary);

    await expect(runInTenant(() => service.getSummary())).resolves.toEqual(
      summary,
    );
    expect(repository.findSummary).not.toHaveBeenCalled();
  });

  it('falls back to the repository when the cache returns no value', async () => {
    cache.get.mockResolvedValue(null);
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInTenant(() => service.getSummary())).resolves.toEqual(
      summary,
    );
  });

  it('falls back to the repository when the cache read fails', async () => {
    cache.get.mockRejectedValue(new Error('Redis unavailable'));
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInTenant(() => service.getSummary())).resolves.toEqual(
      summary,
    );
  });

  it('returns the repository summary when caching the result fails', async () => {
    cache.get.mockResolvedValue(null);
    cache.set.mockRejectedValue(new Error('Redis unavailable'));
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInTenant(() => service.getSummary())).resolves.toEqual(
      summary,
    );
  });
});
