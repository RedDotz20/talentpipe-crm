import { Test, TestingModule } from '@nestjs/testing';
import { asyncStorage } from '../../common/context/company-context';
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

const runInCompany = <T>(fn: () => Promise<T>): Promise<T> =>
  asyncStorage.run({ companyId: 't1', userId: 'u1', role: 'CompanyAdmin' }, fn);

describe('DashboardService', () => {
  let service: DashboardService;
  const cache = {
    get: jest.fn(),
    getCompanyDashboardGeneration: jest.fn(),
    setCompanyDashboardIfGeneration: jest.fn(),
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
    cache.getCompanyDashboardGeneration.mockResolvedValue(0);
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInCompany(() => service.getSummary())).resolves.toEqual(
      summary,
    );
    expect(cache.setCompanyDashboardIfGeneration).toHaveBeenCalledWith(
      't1',
      0,
      summary,
      60,
    );
  });

  it('returns a cache hit without querying the repository', async () => {
    cache.get.mockResolvedValue(summary);
    cache.getCompanyDashboardGeneration.mockResolvedValue(0);

    await expect(runInCompany(() => service.getSummary())).resolves.toEqual(
      summary,
    );
    expect(repository.findSummary).not.toHaveBeenCalled();
  });

  it('falls back to the repository when the cache returns no value', async () => {
    cache.get.mockResolvedValue(null);
    cache.getCompanyDashboardGeneration.mockResolvedValue(0);
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInCompany(() => service.getSummary())).resolves.toEqual(
      summary,
    );
  });

  it('falls back to the repository when the cache read fails', async () => {
    cache.get.mockRejectedValue(new Error('Redis unavailable'));
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInCompany(() => service.getSummary())).resolves.toEqual(
      summary,
    );
  });

  it('returns the repository summary when caching the result fails', async () => {
    cache.get.mockResolvedValue(null);
    cache.getCompanyDashboardGeneration.mockResolvedValue(0);
    cache.setCompanyDashboardIfGeneration.mockRejectedValue(
      new Error('Redis unavailable'),
    );
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInCompany(() => service.getSummary())).resolves.toEqual(
      summary,
    );
  });

  it('does not cache a database result when the generation changed', async () => {
    cache.getCompanyDashboardGeneration.mockResolvedValue(2);
    cache.get.mockResolvedValue(null);
    repository.findSummary.mockResolvedValue(summary);
    cache.setCompanyDashboardIfGeneration.mockResolvedValue(false);

    await expect(runInCompany(() => service.getSummary())).resolves.toEqual(
      summary,
    );
    expect(cache.setCompanyDashboardIfGeneration).toHaveBeenCalledWith(
      't1',
      2,
      summary,
      60,
    );
  });

  it('skips cache writes when generation state is unavailable', async () => {
    cache.getCompanyDashboardGeneration.mockResolvedValue(null);
    cache.get.mockResolvedValue(null);
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInCompany(() => service.getSummary())).resolves.toEqual(
      summary,
    );
    expect(cache.setCompanyDashboardIfGeneration).not.toHaveBeenCalled();
  });

  it('falls back to the repository when generation reads fail', async () => {
    cache.getCompanyDashboardGeneration.mockRejectedValue(
      new Error('Redis unavailable'),
    );
    cache.get.mockResolvedValue(null);
    repository.findSummary.mockResolvedValue(summary);

    await expect(runInCompany(() => service.getSummary())).resolves.toEqual(
      summary,
    );
    expect(cache.setCompanyDashboardIfGeneration).not.toHaveBeenCalled();
  });
});
