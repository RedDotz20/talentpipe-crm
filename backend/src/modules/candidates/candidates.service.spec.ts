import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { CandidateSkillRepository } from '../../repositories/candidate-skill.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { CacheService } from '../../common/cache/cache.service';
import { asyncStorage } from '../../common/context/company-context';

const runInContext = <T>(fn: () => Promise<T>): Promise<T> =>
  asyncStorage.run({ companyId: 't1', userId: 'u1', role: 'CompanyAdmin' }, fn);

describe('CandidatesService', () => {
  let service: CandidatesService;
  const candidateRepo = {
    findAll: jest.fn(),
    findPaginated: jest.fn(),
    findById: jest.fn(),
    findByAccountId: jest.fn(),
    create: jest.fn(),
    createFromAccount: jest.fn(),
    update: jest.fn(),
  };
  const applicationRepo = { findByCandidateId: jest.fn() };
  const candidateSkillRepo = {
    findByCandidateAccountId: jest.fn(),
  };
  const candidateAccountRepo = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
  };
  const skillRepo = {
    findAll: jest.fn(),
  };
  const cacheService = { invalidateCompanyDashboard: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        { provide: CandidateRepository, useValue: candidateRepo },
        { provide: ApplicationRepository, useValue: applicationRepo },
        { provide: CandidateSkillRepository, useValue: candidateSkillRepo },
        { provide: CandidateAccountRepository, useValue: candidateAccountRepo },
        { provide: SkillRepository, useValue: skillRepo },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();
    service = module.get<CandidatesService>(CandidatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists candidates', async () => {
    candidateRepo.findPaginated.mockResolvedValue({
      data: [{ id: 'c1' }],
      total: 1,
    });

    const result = await service.list({
      search: undefined,
      page: 1,
      pageSize: 10,
      sortBy: undefined,
      sortDir: undefined,
    });

    expect(candidateRepo.findPaginated).toHaveBeenCalledWith({
      search: undefined,
      page: 1,
      pageSize: 10,
      sortBy: undefined,
      sortDir: undefined,
    });
    expect(result).toEqual({ data: [{ id: 'c1' }], total: 1 });
  });

  it('getOne throws NotFoundException when missing', async () => {
    candidateRepo.findById.mockResolvedValue(null);
    await expect(service.getOne('nope')).rejects.toThrow(NotFoundException);
  });

  it('getOne resolves via candidate_account_id when link exists', async () => {
    candidateRepo.findById.mockResolvedValue({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      phone: '555-1234',
      candidateAccountId: 'acc-1',
    });
    candidateAccountRepo.findById.mockResolvedValue({
      id: 'acc-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '555-1234',
      resumeFileUrl: 'candidate-resumes/acc-1/uuid.pdf',
      resumeUploadedAt: new Date('2026-08-04T12:00:00Z'),
      avatarUrl: 'https://cdn.example/avatar.png',
    });
    candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([]);
    applicationRepo.findByCandidateId.mockResolvedValue([]);

    await expect(service.getOne('c1')).resolves.toEqual({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      phone: '555-1234',
      candidateAccountId: 'acc-1',
      avatarUrl: 'https://cdn.example/avatar.png',
      resume: {
        fileUrl: 'candidate-resumes/acc-1/uuid.pdf',
        uploadedAt: new Date('2026-08-04T12:00:00Z'),
      },
      skills: [],
      applications: [],
    });
  });

  it('getOne falls back to email lookup for legacy candidates without UUID link', async () => {
    candidateRepo.findById.mockResolvedValue({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      candidateAccountId: null,
    });
    candidateAccountRepo.findByEmail.mockResolvedValue({
      id: 'acc-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      resumeFileUrl: null,
      resumeUploadedAt: null,
    });
    candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([]);
    applicationRepo.findByCandidateId.mockResolvedValue([]);

    await expect(service.getOne('c1')).resolves.toEqual({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      candidateAccountId: null,
      avatarUrl: null,
      resume: { fileUrl: null, uploadedAt: null },
      skills: [],
      applications: [],
    });
  });

  it('getOne returns empty skills when no account found', async () => {
    candidateRepo.findById.mockResolvedValue({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      candidateAccountId: null,
    });
    candidateAccountRepo.findByEmail.mockResolvedValue(null);
    applicationRepo.findByCandidateId.mockResolvedValue([]);

    await expect(service.getOne('c1')).resolves.toEqual({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      candidateAccountId: null,
      avatarUrl: null,
      resume: null,
      skills: [],
      applications: [],
    });
  });

  it('getOne returns skills when candidate accounts entry has resume', async () => {
    candidateRepo.findById.mockResolvedValue({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      candidateAccountId: 'acc-1',
    });
    candidateAccountRepo.findById.mockResolvedValue({
      id: 'acc-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      resumeFileUrl: 'candidate-resumes/acc-1/uuid.pdf',
      resumeUploadedAt: new Date('2026-08-04T12:00:00Z'),
    });
    candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([
      'skill1',
      'skill2',
    ]);
    skillRepo.findAll.mockResolvedValue([
      { id: 'skill1', name: 'TypeScript', category: 'Language' },
      { id: 'skill2', name: 'React', category: 'Framework' },
      { id: 'skill3', name: 'Python', category: 'Language' },
    ]);
    applicationRepo.findByCandidateId.mockResolvedValue([]);

    const result = await service.getOne('c1');
    expect(result.skills).toEqual([
      { id: 'skill1', name: 'TypeScript', category: 'Language' },
      { id: 'skill2', name: 'React', category: 'Framework' },
    ]);
    expect(result.resume).toEqual({
      fileUrl: 'candidate-resumes/acc-1/uuid.pdf',
      uploadedAt: new Date('2026-08-04T12:00:00Z'),
    });
  });

  it('getOne returns null resume when candidate has no resume', async () => {
    candidateRepo.findById.mockResolvedValue({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      candidateAccountId: 'acc-1',
    });
    candidateAccountRepo.findById.mockResolvedValue({
      id: 'acc-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      resumeFileUrl: null,
      resumeUploadedAt: null,
    });
    candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([]);
    applicationRepo.findByCandidateId.mockResolvedValue([]);

    const result = await service.getOne('c1');
    expect(result.resume).toEqual({ fileUrl: null, uploadedAt: null });
  });

  it('create delegates to the repository', async () => {
    candidateRepo.create.mockResolvedValue({ id: 'c1', name: 'Jane' });
    await expect(
      runInContext(() =>
        service.create({ name: 'Jane', email: 'jane@example.com' }),
      ),
    ).resolves.toEqual({ id: 'c1', name: 'Jane' });
    expect(candidateRepo.create).toHaveBeenCalledWith({
      name: 'Jane',
      email: 'jane@example.com',
      phone: undefined,
    });
    expect(cacheService.invalidateCompanyDashboard).toHaveBeenCalledWith('t1');
  });
});
