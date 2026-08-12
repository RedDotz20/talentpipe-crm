import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { CompanyRepository } from '../../repositories/company.repository';
import { PublicCareersService } from './public-careers.service';

describe('PublicCareersService', () => {
  let service: PublicCareersService;
  const tenantRepo = { findBySlug: jest.fn() };
  const indexRepo = {
    findAll: jest.fn(),
    findOpenByCompany: jest.fn(),
    findOpenByCompanyAndJob: jest.fn(),
  };
  const jobPostingRepo = {
    findById: jest.fn(),
    getRequiredSkillIds: jest.fn(),
  };
  const skillRepo = { findByIds: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicCareersService,
        { provide: CompanyRepository, useValue: tenantRepo },
        { provide: JobListingsIndexRepository, useValue: indexRepo },
        { provide: JobPostingRepository, useValue: jobPostingRepo },
        { provide: SkillRepository, useValue: skillRepo },
      ],
    }).compile();
    service = module.get<PublicCareersService>(PublicCareersService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('lists only the requested tenant open jobs', async () => {
    tenantRepo.findBySlug.mockResolvedValue({
      id: 'tenant-a',
      slug: 'acme',
      name: 'Acme',
    });
    indexRepo.findOpenByCompany.mockResolvedValue({
      data: [
        {
          jobPostingId: 'job-a',
          companyId: 'tenant-a',
          companySlug: 'acme',
          companyName: 'Acme',
          title: 'Engineer',
          description: 'Build things',
          status: 'open',
          createdAt: new Date('2026-08-01'),
          updatedAt: new Date('2026-08-01'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    await expect(
      service.list('acme', { page: 1, pageSize: 10 }),
    ).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: 'job-a',
          companyId: 'tenant-a',
          companySlug: 'acme',
          title: 'Engineer',
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    expect(indexRepo.findOpenByCompany).toHaveBeenCalledWith('tenant-a', {
      page: 1,
      pageSize: 10,
    });
  });

  it('lists open jobs across all companies with meta fields', async () => {
    indexRepo.findAll.mockResolvedValue({
      data: [
        {
          jobPostingId: 'job-a',
          companyId: 'tenant-a',
          companySlug: 'acme',
          companyName: 'Acme',
          title: 'Engineer',
          description: 'Build things',
          employmentType: 'full-time',
          location: 'Remote',
          workSetup: 'work-from-home',
          status: 'open',
          createdAt: new Date('2026-08-01'),
          updatedAt: new Date('2026-08-01'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    await expect(
      service.listAll({ page: 1, pageSize: 10, employmentType: 'full-time' }),
    ).resolves.toEqual({
      data: [
        {
          id: 'job-a',
          companyId: 'tenant-a',
          companySlug: 'acme',
          companyName: 'Acme',
          title: 'Engineer',
          description: 'Build things',
          employmentType: 'full-time',
          location: 'Remote',
          workSetup: 'work-from-home',
          createdAt: new Date('2026-08-01'),
          updatedAt: new Date('2026-08-01'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    expect(indexRepo.findAll).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      employmentType: 'full-time',
    });
  });

  it('throws NotFoundException for an unknown tenant', async () => {
    tenantRepo.findBySlug.mockResolvedValue(null);

    await expect(
      service.list('missing', { page: 1, pageSize: 10 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns open detail with required skill metadata', async () => {
    tenantRepo.findBySlug.mockResolvedValue({
      id: 'tenant-a',
      slug: 'acme',
      name: 'Acme',
    });
    indexRepo.findOpenByCompanyAndJob.mockResolvedValue({
      companyId: 'tenant-a',
      jobPostingId: 'job-a',
      title: 'Engineer',
      description: 'Build things',
      companyName: 'Acme',
      companySlug: 'acme',
      status: 'open',
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });
    jobPostingRepo.findById.mockResolvedValue({ id: 'job-a', status: 'open' });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue(['skill-a']);
    skillRepo.findByIds.mockResolvedValue([
      { id: 'skill-a', name: 'React', category: 'Frontend' },
    ]);

    await expect(service.getOne('acme', 'job-a')).resolves.toEqual(
      expect.objectContaining({
        id: 'job-a',
        companyId: 'tenant-a',
        requiredSkills: [
          { id: 'skill-a', name: 'React', category: 'Frontend' },
        ],
      }),
    );
    expect(jobPostingRepo.findById).toHaveBeenCalledWith(
      'job-a',
      'company_tenant-a',
    );
    expect(jobPostingRepo.getRequiredSkillIds).toHaveBeenCalledWith(
      'job-a',
      'company_tenant-a',
    );
  });

  it('throws when the open index entry is missing', async () => {
    tenantRepo.findBySlug.mockResolvedValue({ id: 'tenant-a', slug: 'acme' });
    indexRepo.findOpenByCompanyAndJob.mockResolvedValue(null);

    await expect(service.getOne('acme', 'job-a')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when the source posting is draft', async () => {
    tenantRepo.findBySlug.mockResolvedValue({ id: 'tenant-a', slug: 'acme' });
    indexRepo.findOpenByCompanyAndJob.mockResolvedValue({
      jobPostingId: 'job-a',
      status: 'open',
    });
    jobPostingRepo.findById.mockResolvedValue({ id: 'job-a', status: 'draft' });

    await expect(service.getOne('acme', 'job-a')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when the source posting is closed', async () => {
    tenantRepo.findBySlug.mockResolvedValue({ id: 'tenant-a', slug: 'acme' });
    indexRepo.findOpenByCompanyAndJob.mockResolvedValue({
      jobPostingId: 'job-a',
      status: 'open',
    });
    jobPostingRepo.findById.mockResolvedValue({
      id: 'job-a',
      status: 'closed',
    });

    await expect(service.getOne('acme', 'job-a')).rejects.toThrow(
      NotFoundException,
    );
  });
});
