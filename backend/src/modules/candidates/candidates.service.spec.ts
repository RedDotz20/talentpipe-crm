import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ResumeRepository } from '../../repositories/resume.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { CandidateSkillRepository } from '../../repositories/candidate-skill.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { SkillRepository } from '../../repositories/skill.repository';

describe('CandidatesService', () => {
  let service: CandidatesService;
  const candidateRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };
  const resumeRepo = {
    findByCandidateId: jest.fn(),
  };
  const applicationRepo = { findByCandidateId: jest.fn() };
  const candidateSkillRepo = {
    findByCandidateAccountId: jest.fn(),
  };
  const candidateAccountRepo = {
    findByEmail: jest.fn(),
  };
  const skillRepo = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        { provide: CandidateRepository, useValue: candidateRepo },
        { provide: ResumeRepository, useValue: resumeRepo },
        { provide: ApplicationRepository, useValue: applicationRepo },
        { provide: CandidateSkillRepository, useValue: candidateSkillRepo },
        { provide: CandidateAccountRepository, useValue: candidateAccountRepo },
        { provide: SkillRepository, useValue: skillRepo },
      ],
    }).compile();
    service = module.get<CandidatesService>(CandidatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists candidates', async () => {
    candidateRepo.findAll.mockResolvedValue([{ id: 'c1' }]);
    await expect(service.list()).resolves.toEqual([{ id: 'c1' }]);
  });

  it('getOne throws NotFoundException when missing', async () => {
    candidateRepo.findById.mockResolvedValue(null);
    await expect(service.getOne('nope')).rejects.toThrow(NotFoundException);
  });

  it('getOne returns the candidate enriched with resume, skills, and applications', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1', name: 'Jane' });
    resumeRepo.findByCandidateId.mockResolvedValue({
      id: 'r1',
      fileUrl: 'k',
    });
    applicationRepo.findByCandidateId.mockResolvedValue([{ id: 'a1' }]);
    candidateAccountRepo.findByEmail.mockResolvedValue(null);

    await expect(service.getOne('c1')).resolves.toEqual({
      id: 'c1',
      name: 'Jane',
      resume: { id: 'r1', fileUrl: 'k' },
      skills: [],
      applications: [{ id: 'a1' }],
    });
  });

  it('getOne returns null resume when the candidate has none', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1', name: 'Jane' });
    resumeRepo.findByCandidateId.mockResolvedValue(null);
    applicationRepo.findByCandidateId.mockResolvedValue([]);
    candidateAccountRepo.findByEmail.mockResolvedValue(null);

    await expect(service.getOne('c1')).resolves.toEqual({
      id: 'c1',
      name: 'Jane',
      resume: null,
      skills: [],
      applications: [],
    });
  });

  it('getOne returns skills when candidate has a candidate_accounts entry', async () => {
    candidateRepo.findById.mockResolvedValue({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
    });
    resumeRepo.findByCandidateId.mockResolvedValue(null);
    applicationRepo.findByCandidateId.mockResolvedValue([]);
    candidateAccountRepo.findByEmail.mockResolvedValue({ id: 'acc1' });
    candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([
      'skill1',
      'skill2',
    ]);
    skillRepo.findAll.mockResolvedValue([
      { id: 'skill1', name: 'TypeScript', category: 'Language' },
      { id: 'skill2', name: 'React', category: 'Framework' },
      { id: 'skill3', name: 'Python', category: 'Language' },
    ]);

    await expect(service.getOne('c1')).resolves.toEqual({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      resume: null,
      skills: [
        { id: 'skill1', name: 'TypeScript', category: 'Language' },
        { id: 'skill2', name: 'React', category: 'Framework' },
      ],
      applications: [],
    });
  });

  it('getOne returns empty skills when candidate has no candidate_accounts entry', async () => {
    candidateRepo.findById.mockResolvedValue({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
    });
    resumeRepo.findByCandidateId.mockResolvedValue(null);
    applicationRepo.findByCandidateId.mockResolvedValue([]);
    candidateAccountRepo.findByEmail.mockResolvedValue(null);

    await expect(service.getOne('c1')).resolves.toEqual({
      id: 'c1',
      name: 'Jane',
      email: 'jane@example.com',
      resume: null,
      skills: [],
      applications: [],
    });
  });

  it('getOne returns empty skills when candidate has no email', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1', name: 'Jane' });
    resumeRepo.findByCandidateId.mockResolvedValue(null);
    applicationRepo.findByCandidateId.mockResolvedValue([]);

    await expect(service.getOne('c1')).resolves.toEqual({
      id: 'c1',
      name: 'Jane',
      resume: null,
      skills: [],
      applications: [],
    });
  });

  it('create delegates to the repository', async () => {
    candidateRepo.create.mockResolvedValue({ id: 'c1', name: 'Jane' });
    await expect(
      service.create({ name: 'Jane', email: 'jane@example.com' }),
    ).resolves.toEqual({ id: 'c1', name: 'Jane' });
    expect(candidateRepo.create).toHaveBeenCalledWith({
      name: 'Jane',
      email: 'jane@example.com',
      phone: undefined,
    });
  });
});
