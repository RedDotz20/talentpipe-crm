import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { PublicCareersService } from './public-careers.service';

describe('PublicCareersService', () => {
  let service: PublicCareersService;
  const tenantRepo = { findBySlug: jest.fn() };
  const indexRepo = {
    findOpenByTenant: jest.fn(),
    findOpenByTenantAndJob: jest.fn(),
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
        { provide: TenantRepository, useValue: tenantRepo },
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
    indexRepo.findOpenByTenant.mockResolvedValue([
      {
        jobPostingId: 'job-a',
        tenantId: 'tenant-a',
        companySlug: 'acme',
        companyName: 'Acme',
        title: 'Engineer',
        description: 'Build things',
        status: 'open',
        createdAt: new Date('2026-08-01'),
        updatedAt: new Date('2026-08-01'),
      },
    ]);

    await expect(service.list('acme')).resolves.toEqual([
      expect.objectContaining({
        id: 'job-a',
        tenantId: 'tenant-a',
        tenantSlug: 'acme',
        title: 'Engineer',
      }),
    ]);
    expect(indexRepo.findOpenByTenant).toHaveBeenCalledWith('tenant-a');
  });

  it('throws NotFoundException for an unknown tenant', async () => {
    tenantRepo.findBySlug.mockResolvedValue(null);

    await expect(service.list('missing')).rejects.toThrow(NotFoundException);
  });

  it('returns open detail with required skill metadata', async () => {
    tenantRepo.findBySlug.mockResolvedValue({
      id: 'tenant-a',
      slug: 'acme',
      name: 'Acme',
    });
    indexRepo.findOpenByTenantAndJob.mockResolvedValue({
      tenantId: 'tenant-a',
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
        tenantId: 'tenant-a',
        requiredSkills: [
          { id: 'skill-a', name: 'React', category: 'Frontend' },
        ],
      }),
    );
    expect(jobPostingRepo.findById).toHaveBeenCalledWith(
      'job-a',
      'tenant_tenant-a',
    );
    expect(jobPostingRepo.getRequiredSkillIds).toHaveBeenCalledWith(
      'job-a',
      'tenant_tenant-a',
    );
  });

  it('throws when the open index entry is missing', async () => {
    tenantRepo.findBySlug.mockResolvedValue({ id: 'tenant-a', slug: 'acme' });
    indexRepo.findOpenByTenantAndJob.mockResolvedValue(null);

    await expect(service.getOne('acme', 'job-a')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when the source posting is draft', async () => {
    tenantRepo.findBySlug.mockResolvedValue({ id: 'tenant-a', slug: 'acme' });
    indexRepo.findOpenByTenantAndJob.mockResolvedValue({
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
    indexRepo.findOpenByTenantAndJob.mockResolvedValue({
      jobPostingId: 'job-a',
      status: 'open',
    });
    jobPostingRepo.findById.mockResolvedValue({ id: 'job-a', status: 'closed' });

    await expect(service.getOne('acme', 'job-a')).rejects.toThrow(
      NotFoundException,
    );
  });
});
