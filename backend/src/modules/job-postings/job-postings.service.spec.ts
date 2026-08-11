import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/company-context';
import { JobPostingsService } from './job-postings.service';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { CompanyRepository } from '../../repositories/company.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { CacheService } from '../../common/cache/cache.service';

const runInContext = <T>(fn: () => Promise<T>): Promise<T> =>
  asyncStorage.run({ companyId: 't1', userId: 'u1', role: 'CompanyAdmin' }, fn);

describe('JobPostingsService', () => {
  let service: JobPostingsService;
  const jobPostingRepo = {
    findAll: jest.fn(),
    findPaginated: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setRequiredSkills: jest.fn(),
    getRequiredSkillIds: jest.fn(),
  };
  const skillRepo = { findByIds: jest.fn() };
  const tenantRepo = { findById: jest.fn() };
  const jobListingsIndexRepo = { upsert: jest.fn(), delete: jest.fn() };
  const applicationRepo = { countByJobPosting: jest.fn().mockResolvedValue(0) };
  const cacheService = { invalidateCompanyDashboard: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobPostingsService,
        { provide: JobPostingRepository, useValue: jobPostingRepo },
        { provide: SkillRepository, useValue: skillRepo },
        { provide: CompanyRepository, useValue: tenantRepo },
        { provide: JobListingsIndexRepository, useValue: jobListingsIndexRepo },
        { provide: ApplicationRepository, useValue: applicationRepo },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();
    service = module.get<JobPostingsService>(JobPostingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists postings via the repository', async () => {
    jobPostingRepo.findPaginated.mockResolvedValue({
      data: [{ id: 'p1' }],
      total: 1,
    });

    const result = await service.list('draft', {
      search: undefined,
      page: 1,
      pageSize: 10,
      sortBy: undefined,
      sortDir: undefined,
    });

    expect(jobPostingRepo.findPaginated).toHaveBeenCalledWith({
      search: undefined,
      page: 1,
      pageSize: 10,
      sortBy: undefined,
      sortDir: undefined,
      status: 'draft',
    });
    expect(result).toEqual({ data: [{ id: 'p1' }], total: 1 });
  });

  it('getOne throws NotFoundException when missing', async () => {
    jobPostingRepo.findById.mockResolvedValue(null);
    await expect(service.getOne('nope')).rejects.toThrow(NotFoundException);
  });

  it('getOne returns the posting with required skill ids', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', title: 'Eng' });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue(['s1', 's2']);
    await expect(service.getOne('p1')).resolves.toEqual({
      id: 'p1',
      title: 'Eng',
      requiredSkillIds: ['s1', 's2'],
    });
  });

  it('create validates skills and writes required skills', async () => {
    skillRepo.findByIds.mockResolvedValue([{ id: 's1' }]);
    jobPostingRepo.create.mockResolvedValue({ id: 'p1', title: 'Eng' });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue(['s1']);

    const result = await runInContext(() =>
      service.create(
        { companyId: 't1', userId: 'u1', role: 'CompanyAdmin' },
        {
          title: 'Eng',
          employmentType: 'full-time',
          location: 'Makati City',
          workSetup: 'hybrid',
          requiredSkillIds: ['s1'],
        },
      ),
    );

    expect(skillRepo.findByIds).toHaveBeenCalledWith(['s1']);
    expect(jobPostingRepo.create).toHaveBeenCalledWith({
      title: 'Eng',
      description: undefined,
      employmentType: 'full-time',
      location: 'Makati City',
      workSetup: 'hybrid',
      createdByUserId: 'u1',
    });
    expect(jobPostingRepo.setRequiredSkills).toHaveBeenCalledWith('p1', ['s1']);
    expect(result).toEqual({
      id: 'p1',
      title: 'Eng',
      requiredSkillIds: ['s1'],
    });
    expect(cacheService.invalidateCompanyDashboard).toHaveBeenCalledWith('t1');
  });

  it('create rejects unknown skill ids', async () => {
    skillRepo.findByIds.mockResolvedValue([{ id: 's1' }]);
    await expect(
      service.create(
        { companyId: 't1', userId: 'u1', role: 'CompanyAdmin' },
        {
          title: 'Eng',
          employmentType: 'full-time',
          location: 'Makati City',
          workSetup: 'on-site',
          requiredSkillIds: ['s1', 'missing'],
        },
      ),
    ).rejects.toThrow(NotFoundException);
    expect(cacheService.invalidateCompanyDashboard).not.toHaveBeenCalled();
  });

  it('publish only works on drafts and syncs the listing index', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'draft' });
    jobPostingRepo.update.mockResolvedValue({
      id: 'p1',
      title: 'Eng',
      description: null,
      status: 'open',
    });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
    tenantRepo.findById.mockResolvedValue({
      id: 't1',
      name: 'Acme',
      slug: 'acme',
    });

    await expect(runInContext(() => service.publish('p1'))).resolves.toEqual(
      expect.objectContaining({ id: 'p1', requiredSkillIds: [] }),
    );

    expect(jobListingsIndexRepo.upsert).toHaveBeenCalledWith({
      companyId: 't1',
      jobPostingId: 'p1',
      title: 'Eng',
      description: '',
      companyName: 'Acme',
      companySlug: 'acme',
      status: 'open',
    });
    expect(cacheService.invalidateCompanyDashboard).toHaveBeenCalledWith('t1');
  });

  it('publish rejects non-draft postings', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'open' });
    await expect(runInContext(() => service.publish('p1'))).rejects.toThrow(
      ConflictException,
    );
  });

  it('close syncs the listing index with status closed', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'open' });
    jobPostingRepo.update.mockResolvedValue({
      id: 'p1',
      title: 'Eng',
      description: null,
      status: 'closed',
    });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
    tenantRepo.findById.mockResolvedValue({
      id: 't1',
      name: 'Acme',
      slug: 'acme',
    });

    await runInContext(() => service.close('p1'));

    expect(jobListingsIndexRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'closed' }),
    );
    expect(cacheService.invalidateCompanyDashboard).toHaveBeenCalledWith('t1');
  });

  it('update resyncs the listing index for non-draft postings', async () => {
    jobPostingRepo.findById.mockResolvedValue({
      id: 'p1',
      title: 'Eng',
      description: null,
      status: 'open',
    });
    jobPostingRepo.update.mockResolvedValue({
      id: 'p1',
      title: 'Eng v2',
      description: null,
      status: 'open',
    });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
    tenantRepo.findById.mockResolvedValue({
      id: 't1',
      name: 'Acme',
      slug: 'acme',
    });

    await runInContext(() => service.update('p1', { title: 'Eng v2' }));

    expect(jobListingsIndexRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Eng v2', status: 'open' }),
    );
    expect(cacheService.invalidateCompanyDashboard).toHaveBeenCalledWith('t1');
  });

  it('update writes required skills and invalidates the dashboard without a field update', async () => {
    jobPostingRepo.findById.mockResolvedValue({
      id: 'p1',
      title: 'Eng',
      description: null,
      status: 'draft',
    });
    skillRepo.findByIds.mockResolvedValue([{ id: 's1' }]);
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue(['s1']);

    await runInContext(() =>
      service.update('p1', { requiredSkillIds: ['s1'] }),
    );

    expect(jobPostingRepo.update).not.toHaveBeenCalled();
    expect(jobPostingRepo.setRequiredSkills).toHaveBeenCalledWith('p1', ['s1']);
    expect(cacheService.invalidateCompanyDashboard).toHaveBeenCalledWith('t1');
  });

  it('update does not invalidate when no write occurs', async () => {
    jobPostingRepo.findById.mockResolvedValue({
      id: 'p1',
      title: 'Eng',
      description: null,
      status: 'draft',
    });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);

    await runInContext(() => service.update('p1', {}));

    expect(jobPostingRepo.update).not.toHaveBeenCalled();
    expect(jobPostingRepo.setRequiredSkills).not.toHaveBeenCalled();
    expect(cacheService.invalidateCompanyDashboard).not.toHaveBeenCalled();
  });

  it('update does not resync the listing index for draft postings', async () => {
    jobPostingRepo.findById.mockResolvedValue({
      id: 'p1',
      title: 'Eng',
      description: null,
      status: 'draft',
    });
    jobPostingRepo.update.mockResolvedValue({
      id: 'p1',
      title: 'Eng v2',
      description: null,
      status: 'draft',
    });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
    tenantRepo.findById.mockResolvedValue({
      id: 't1',
      name: 'Acme',
      slug: 'acme',
    });

    await runInContext(() => service.update('p1', { title: 'Eng v2' }));

    expect(jobPostingRepo.update).toHaveBeenCalledWith('p1', {
      title: 'Eng v2',
    });
    expect(jobListingsIndexRepo.upsert).not.toHaveBeenCalled();
  });

  it('remove blocks open postings and otherwise deletes listing + posting', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'open' });
    await expect(runInContext(() => service.remove('p1'))).rejects.toThrow(
      ConflictException,
    );

    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'draft' });
    await runInContext(() => service.remove('p1'));
    expect(jobPostingRepo.delete).toHaveBeenCalledWith('p1');
    expect(jobListingsIndexRepo.delete).toHaveBeenCalledWith('t1', 'p1');
    expect(cacheService.invalidateCompanyDashboard).toHaveBeenCalledWith('t1');
  });
});
