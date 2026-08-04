import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/tenant-context';
import { JobPostingsService } from './job-postings.service';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { CacheService } from '../../common/cache/cache.service';

const runInContext = <T>(fn: () => Promise<T>): Promise<T> =>
  asyncStorage.run({ tenantId: 't1', userId: 'u1', role: 'OrgAdmin' }, fn);

describe('JobPostingsService', () => {
  let service: JobPostingsService;
  const jobPostingRepo = {
    findAll: jest.fn(),
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
  const cacheService = { invalidateTenantDashboard: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobPostingsService,
        { provide: JobPostingRepository, useValue: jobPostingRepo },
        { provide: SkillRepository, useValue: skillRepo },
        { provide: TenantRepository, useValue: tenantRepo },
        { provide: JobListingsIndexRepository, useValue: jobListingsIndexRepo },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();
    service = module.get<JobPostingsService>(JobPostingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists postings via the repository', async () => {
    jobPostingRepo.findAll.mockResolvedValue([{ id: 'p1' }]);
    await expect(service.list('draft')).resolves.toEqual([{ id: 'p1' }]);
    expect(jobPostingRepo.findAll).toHaveBeenCalledWith('draft');
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

    const result = await service.create(
      { tenantId: 't1', userId: 'u1', role: 'OrgAdmin' },
      { title: 'Eng', requiredSkillIds: ['s1'] },
    );

    expect(skillRepo.findByIds).toHaveBeenCalledWith(['s1']);
    expect(jobPostingRepo.create).toHaveBeenCalledWith({
      title: 'Eng',
      description: undefined,
      createdByUserId: 'u1',
    });
    expect(jobPostingRepo.setRequiredSkills).toHaveBeenCalledWith('p1', ['s1']);
    expect(result).toEqual({
      id: 'p1',
      title: 'Eng',
      requiredSkillIds: ['s1'],
    });
  });

  it('create rejects unknown skill ids', async () => {
    skillRepo.findByIds.mockResolvedValue([{ id: 's1' }]);
    await expect(
      service.create(
        { tenantId: 't1', userId: 'u1', role: 'OrgAdmin' },
        { title: 'Eng', requiredSkillIds: ['s1', 'missing'] },
      ),
    ).rejects.toThrow(NotFoundException);
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
      tenantId: 't1',
      jobPostingId: 'p1',
      title: 'Eng',
      description: '',
      companyName: 'Acme',
      companySlug: 'acme',
      status: 'open',
    });
    expect(cacheService.invalidateTenantDashboard).toHaveBeenCalledWith('t1');
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
    expect(cacheService.invalidateTenantDashboard).toHaveBeenCalledWith('t1');
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
    expect(cacheService.invalidateTenantDashboard).toHaveBeenCalledWith('t1');
  });
});
