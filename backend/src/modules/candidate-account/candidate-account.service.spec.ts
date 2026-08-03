import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CandidateAccountService } from './candidate-account.service';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateBookmarkRepository } from '../../repositories/candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { CandidateSkillRepository } from '../../repositories/candidate-skill.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { SkillMatchingService } from '../skill-matching/skill-matching.service';

describe('CandidateAccountService', () => {
  let service: CandidateAccountService;
  const candidateAccountRepo = {
    findById: jest.fn(),
  };
  const candidateBookmarkRepo = {
    findByCandidate: jest.fn(),
    findByJob: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const candidateApplicationsIndexRepo = {
    findByCandidate: jest.fn(),
    create: jest.fn(),
  };
  const jobListingsIndexRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
  };
  const candidateRepo = {
    findByEmail: jest.fn(),
    create: jest.fn(),
  };
  const applicationRepo = {
    create: jest.fn(),
    updateMatchScore: jest.fn(),
  };
  const pipelineStageRepo = {
    findFirst: jest.fn(),
  };
  const candidateSkillRepo = {
    findByCandidateAccountId: jest.fn(),
    replaceAll: jest.fn(),
  };
  const skillRepo = {
    findByIds: jest.fn(),
    findAll: jest.fn(),
  };
  const jobPostingRepo = {
    getRequiredSkillIds: jest.fn(),
  };
  const skillMatching = {
    computeScore: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateAccountService,
        { provide: CandidateAccountRepository, useValue: candidateAccountRepo },
        {
          provide: CandidateBookmarkRepository,
          useValue: candidateBookmarkRepo,
        },
        {
          provide: CandidateApplicationsIndexRepository,
          useValue: candidateApplicationsIndexRepo,
        },
        { provide: JobListingsIndexRepository, useValue: jobListingsIndexRepo },
        { provide: CandidateRepository, useValue: candidateRepo },
        { provide: ApplicationRepository, useValue: applicationRepo },
        { provide: PipelineStageRepository, useValue: pipelineStageRepo },
        { provide: CandidateSkillRepository, useValue: candidateSkillRepo },
        { provide: SkillRepository, useValue: skillRepo },
        { provide: JobPostingRepository, useValue: jobPostingRepo },
        { provide: SkillMatchingService, useValue: skillMatching },
      ],
    }).compile();
    service = module.get<CandidateAccountService>(CandidateAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSkills', () => {
    it('returns skills for a candidate account', async () => {
      candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([
        's1',
        's2',
      ]);
      skillRepo.findByIds.mockResolvedValue([
        { id: 's1', name: 'TypeScript', category: 'Programming' },
        { id: 's2', name: 'React', category: 'Frontend' },
      ]);

      const result = await service.getSkills('ca1');

      expect(candidateSkillRepo.findByCandidateAccountId).toHaveBeenCalledWith(
        'ca1',
      );
      expect(skillRepo.findByIds).toHaveBeenCalledWith(['s1', 's2']);
      expect(result).toEqual([
        { id: 's1', name: 'TypeScript', category: 'Programming' },
        { id: 's2', name: 'React', category: 'Frontend' },
      ]);
    });

    it('returns empty array for candidate with no skills', async () => {
      candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([]);

      const result = await service.getSkills('ca1');

      expect(candidateSkillRepo.findByCandidateAccountId).toHaveBeenCalledWith(
        'ca1',
      );
      expect(skillRepo.findByIds).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('handles candidate with no candidate_accounts entry gracefully', async () => {
      candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([]);

      const result = await service.getSkills('nonexistent');

      expect(candidateSkillRepo.findByCandidateAccountId).toHaveBeenCalledWith(
        'nonexistent',
      );
      expect(result).toEqual([]);
    });
  });

  describe('setSkills', () => {
    it('replaces all skills successfully', async () => {
      skillRepo.findByIds.mockResolvedValue([
        { id: 's1', name: 'TypeScript', category: 'Programming' },
        { id: 's2', name: 'React', category: 'Frontend' },
      ]);
      candidateSkillRepo.replaceAll.mockResolvedValue(undefined);

      const result = await service.setSkills('ca1', ['s1', 's2']);

      expect(skillRepo.findByIds).toHaveBeenCalledWith(['s1', 's2']);
      expect(candidateSkillRepo.replaceAll).toHaveBeenCalledWith('ca1', [
        's1',
        's2',
      ]);
      expect(result).toEqual({ skills: 2 });
    });

    it('with empty array clears all skills', async () => {
      skillRepo.findByIds.mockResolvedValue([]);
      candidateSkillRepo.replaceAll.mockResolvedValue(undefined);

      const result = await service.setSkills('ca1', []);

      expect(skillRepo.findByIds).toHaveBeenCalledWith([]);
      expect(candidateSkillRepo.replaceAll).toHaveBeenCalledWith('ca1', []);
      expect(result).toEqual({ skills: 0 });
    });

    it('throws BadRequestException for non-existent skill IDs', async () => {
      skillRepo.findByIds.mockResolvedValue([
        { id: 's1', name: 'TypeScript', category: 'Programming' },
      ]);

      await expect(service.setSkills('ca1', ['s1', 'invalid'])).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.setSkills('ca1', ['s1', 'invalid'])).rejects.toThrow(
        'One or more skill IDs are invalid',
      );

      expect(skillRepo.findByIds).toHaveBeenCalledWith(['s1', 'invalid']);
      expect(candidateSkillRepo.replaceAll).not.toHaveBeenCalled();
    });
  });
});
