import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { NoteRepository } from '../../repositories/note.repository';
import { SkillMatchingService } from '../skill-matching/skill-matching.service';
import { ResumesService } from '../../modules/resumes/resumes.service';
import { CacheService } from '../../common/cache/cache.service';

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
    findByJob: jest.fn(),
    findByCandidateAndApplication: jest.fn(),
    deleteById: jest.fn(),
  };
  const jobListingsIndexRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findOpenByTenantAndJob: jest.fn(),
  };
  const candidateRepo = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findByAccountId: jest.fn(),
    createFromAccount: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const applicationRepo = {
    create: jest.fn(),
    findByIdForCandidate: jest.fn(),
    delete: jest.fn(),
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
    findById: jest.fn(),
    getRequiredSkillIds: jest.fn(),
  };
  const skillMatching = {
    computeScore: jest.fn(),
  };
  const resumesService = {
    upload: jest.fn(),
  };
  const tenantRepo = {
    findById: jest.fn().mockResolvedValue({ status: 'active' }),
    findSuspendedIds: jest.fn().mockResolvedValue([]),
  };
  const userEmailRepo = {
    findByEmail: jest.fn().mockResolvedValue(null),
  };
  const interviewRepo = {
    findAll: jest.fn(),
  };
  const noteRepo = {
    findByApplicationId: jest.fn(),
  };
  const cacheService = { invalidateTenantDashboard: jest.fn() };

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
        { provide: TenantRepository, useValue: tenantRepo },
        { provide: UserEmailRepository, useValue: userEmailRepo },
        { provide: InterviewRepository, useValue: interviewRepo },
        { provide: NoteRepository, useValue: noteRepo },
        { provide: SkillMatchingService, useValue: skillMatching },
        { provide: ResumesService, useValue: resumesService },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();
    service = module.get<CandidateAccountService>(CandidateAccountService);
    jobPostingRepo.findById.mockResolvedValue({ status: 'open' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('job visibility', () => {
    it('hides closed jobs from candidate detail', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue(null);

      await expect(service.getJobDetail('t1', 'j1')).rejects.toThrow(
        NotFoundException,
      );
      expect(jobListingsIndexRepo.findOpenByTenantAndJob).toHaveBeenCalledWith(
        't1',
        'j1',
      );
      expect(jobListingsIndexRepo.findById).not.toHaveBeenCalled();
      expect(jobPostingRepo.findById).not.toHaveBeenCalled();
    });

    it('hides draft jobs from candidate detail', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue(null);

      await expect(service.getJobDetail('t1', 'j1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns an open job from candidate detail', async () => {
      const job = {
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
        title: 'Backend Engineer',
      };
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue(job);

      await expect(service.getJobDetail('t1', 'j1')).resolves.toEqual(job);
      expect(jobPostingRepo.findById).toHaveBeenCalledWith('j1', 'tenant_t1');
    });

    it('hides closed jobs from candidate applications', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue(null);

      await expect(
        service.apply('candidate-1', 't1', 'j1', {}),
      ).rejects.toThrow(NotFoundException);
      expect(jobListingsIndexRepo.findOpenByTenantAndJob).toHaveBeenCalledWith(
        't1',
        'j1',
      );
      expect(jobListingsIndexRepo.findById).not.toHaveBeenCalled();
    });

    it('hides closed jobs from candidate bookmarks', async () => {
      candidateBookmarkRepo.findByJob.mockResolvedValue(null);
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue(null);

      await expect(
        service.addBookmark('candidate-1', 't1', 'j1'),
      ).rejects.toThrow(NotFoundException);
      expect(jobListingsIndexRepo.findOpenByTenantAndJob).toHaveBeenCalledWith(
        't1',
        'j1',
      );
      expect(jobListingsIndexRepo.findById).not.toHaveBeenCalled();
    });

    it('rejects an existing bookmark when its job is no longer open', async () => {
      const existingBookmark = {
        id: 'bookmark-1',
        candidateAccountId: 'candidate-1',
        tenantId: 't1',
        jobPostingId: 'j1',
      };
      candidateBookmarkRepo.findByJob.mockResolvedValue(existingBookmark);
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue(null);

      await expect(
        service.addBookmark('candidate-1', 't1', 'j1'),
      ).rejects.toThrow(NotFoundException);
      expect(jobListingsIndexRepo.findOpenByTenantAndJob).toHaveBeenCalledWith(
        't1',
        'j1',
      );
      expect(candidateBookmarkRepo.create).not.toHaveBeenCalled();
    });

    it('hides a stale open index when the tenant posting is closed', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
      });
      jobPostingRepo.findById.mockResolvedValue({ status: 'closed' });

      await expect(service.getJobDetail('t1', 'j1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects apply when the tenant posting is no longer open', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
      });
      jobPostingRepo.findById.mockResolvedValue({ status: 'closed' });

      await expect(
        service.apply('candidate-1', 't1', 'j1', {}),
      ).rejects.toThrow(NotFoundException);
      expect(candidateAccountRepo.findById).not.toHaveBeenCalled();
    });

    it('rejects bookmarking when the tenant posting is no longer open', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
      });
      jobPostingRepo.findById.mockResolvedValue({ status: 'closed' });

      await expect(
        service.addBookmark('candidate-1', 't1', 'j1'),
      ).rejects.toThrow(NotFoundException);
      expect(candidateBookmarkRepo.findByJob).not.toHaveBeenCalled();
    });
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

  describe('application integrity and detail', () => {
    it('rejects an application detail not owned by the candidate', async () => {
      candidateApplicationsIndexRepo.findByCandidateAndApplication.mockResolvedValue(
        null,
      );

      await expect(
        service.getApplicationDetail('candidate-a', 'app-a'),
      ).rejects.toThrow(NotFoundException);
      expect(
        candidateApplicationsIndexRepo.findByCandidateAndApplication,
      ).toHaveBeenCalledWith('candidate-a', 'app-a');
      expect(applicationRepo.findByIdForCandidate).not.toHaveBeenCalled();
    });

    it('rejects unknown override skills before creating an application', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
        title: 'Engineer',
        companyName: 'Acme',
      });
      candidateAccountRepo.findById.mockResolvedValue({
        id: 'candidate-a',
        email: 'candidate@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });
      candidateApplicationsIndexRepo.findByJob.mockResolvedValue(null);
      skillRepo.findByIds.mockResolvedValue([{ id: 'known-skill' }]);

      await expect(
        service.apply('candidate-a', 't1', 'j1', {
          skillIds: ['known-skill', 'missing'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(applicationRepo.create).not.toHaveBeenCalled();
    });

    it('deduplicates and persists valid override skills and the cover letter', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
        title: 'Engineer',
        companyName: 'Acme',
      });
      candidateAccountRepo.findById.mockResolvedValue({
        id: 'candidate-a',
        email: 'candidate@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });
      candidateApplicationsIndexRepo.findByJob.mockResolvedValue(null);
      candidateRepo.findByAccountId.mockResolvedValue({
        id: 'candidate-tenant',
      });
      pipelineStageRepo.findFirst.mockResolvedValue({
        id: 'stage-1',
        name: 'Applied',
      });
      skillRepo.findByIds.mockResolvedValue([
        { id: 'known-skill' },
        { id: 'second-skill' },
      ]);
      jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
      skillMatching.computeScore.mockReturnValue(1);
      applicationRepo.create.mockResolvedValue({ id: 'app-a' });

      await service.apply('candidate-a', 't1', 'j1', {
        skillIds: ['known-skill', 'known-skill', 'second-skill'],
        coverLetter: 'Interested in the role',
      });

      expect(skillRepo.findByIds).toHaveBeenCalledWith([
        'known-skill',
        'second-skill',
      ]);
      expect(applicationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          appliedSkillIds: ['known-skill', 'second-skill'],
          coverLetter: 'Interested in the role',
        }),
        'tenant_t1',
      );
      expect(cacheService.invalidateTenantDashboard).toHaveBeenCalledWith('t1');
    });

    it('deletes the tenant application when the public index insert fails', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
        title: 'Engineer',
        companyName: 'Acme',
      });
      candidateAccountRepo.findById.mockResolvedValue({
        id: 'candidate-a',
        email: 'candidate@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });
      candidateApplicationsIndexRepo.findByJob.mockResolvedValue(null);
      candidateRepo.findByAccountId.mockResolvedValue({
        id: 'candidate-tenant',
      });
      pipelineStageRepo.findFirst.mockResolvedValue({
        id: 'stage-1',
        name: 'Applied',
      });
      candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([]);
      skillRepo.findByIds.mockResolvedValue([]);
      jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
      skillMatching.computeScore.mockReturnValue(0);
      applicationRepo.create.mockResolvedValue({ id: 'app-a' });
      candidateApplicationsIndexRepo.create.mockRejectedValue(
        new Error('index unavailable'),
      );

      await expect(
        service.apply('candidate-a', 't1', 'j1', {}),
      ).rejects.toThrow('index unavailable');
      expect(applicationRepo.delete).toHaveBeenCalledWith('app-a', 'tenant_t1');
    });

    it('converts duplicate application index violations into a conflict', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
        title: 'Engineer',
        companyName: 'Acme',
      });
      candidateAccountRepo.findById.mockResolvedValue({
        id: 'candidate-a',
        email: 'candidate@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });
      candidateApplicationsIndexRepo.findByJob.mockResolvedValue(null);
      candidateRepo.findByAccountId.mockResolvedValue({
        id: 'candidate-tenant',
      });
      pipelineStageRepo.findFirst.mockResolvedValue({
        id: 'stage-1',
        name: 'Applied',
      });
      candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([]);
      skillRepo.findByIds.mockResolvedValue([]);
      jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
      skillMatching.computeScore.mockReturnValue(0);
      applicationRepo.create.mockResolvedValue({ id: 'app-a' });
      candidateApplicationsIndexRepo.create.mockRejectedValue({
        code: '23505',
        constraint: 'unique_candidate_application',
      });

      const applicationPromise = service.apply('candidate-a', 't1', 'j1', {});

      await expect(applicationPromise).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(applicationPromise).rejects.toThrow(
        'You already applied to this application.',
      );
      expect(applicationRepo.delete).toHaveBeenCalledWith('app-a', 'tenant_t1');
    });

    it('converts wrapped duplicate application violations into a conflict after compensation', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
        title: 'Engineer',
        companyName: 'Acme',
      });
      candidateAccountRepo.findById.mockResolvedValue({
        id: 'candidate-a',
        email: 'candidate@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });
      candidateApplicationsIndexRepo.findByJob.mockResolvedValue(null);
      candidateRepo.findByAccountId.mockResolvedValue({
        id: 'candidate-tenant',
      });
      pipelineStageRepo.findFirst.mockResolvedValue({
        id: 'stage-1',
        name: 'Applied',
      });
      candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([]);
      skillRepo.findByIds.mockResolvedValue([]);
      jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
      skillMatching.computeScore.mockReturnValue(0);
      applicationRepo.create.mockResolvedValue({ id: 'app-a' });
      candidateApplicationsIndexRepo.create.mockRejectedValue({
        cause: {
          code: '23505',
          constraint: 'unique_candidate_application',
        },
      });

      const applicationPromise = service.apply('candidate-a', 't1', 'j1', {});

      await expect(applicationPromise).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(applicationPromise).rejects.toThrow(
        'You already applied to this application.',
      );
      expect(applicationRepo.delete).toHaveBeenCalledWith('app-a', 'tenant_t1');
    });

    it('reloads the winner after a concurrent candidate-account insert', async () => {
      jobListingsIndexRepo.findOpenByTenantAndJob.mockResolvedValue({
        tenantId: 't1',
        jobPostingId: 'j1',
        status: 'open',
        title: 'Engineer',
        companyName: 'Acme',
      });
      candidateAccountRepo.findById.mockResolvedValue({
        id: 'candidate-a',
        email: 'candidate@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });
      candidateApplicationsIndexRepo.findByJob.mockResolvedValue(null);
      candidateSkillRepo.findByCandidateAccountId.mockResolvedValue([]);
      skillRepo.findByIds.mockResolvedValue([]);
      jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
      skillMatching.computeScore.mockReturnValue(0);
      candidateRepo.findByAccountId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'winner-candidate' });
      candidateRepo.createFromAccount.mockRejectedValue({
        code: '23505',
        constraint: 'unique_candidate_account',
      });
      pipelineStageRepo.findFirst.mockResolvedValue({
        id: 'stage-1',
        name: 'Applied',
      });
      applicationRepo.create.mockResolvedValue({ id: 'app-a' });
      candidateApplicationsIndexRepo.create.mockResolvedValue({
        id: 'index-a',
      });

      await expect(
        service.apply('candidate-a', 't1', 'j1', {}),
      ).resolves.toEqual({
        applicationId: 'app-a',
      });
      expect(candidateRepo.findByAccountId).toHaveBeenLastCalledWith(
        'candidate-a',
        'tenant_t1',
      );
      expect(applicationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ candidateId: 'winner-candidate' }),
        'tenant_t1',
      );
    });

    it('returns candidate-owned application detail from the tenant schema', async () => {
      const indexed = {
        id: 'index-a',
        candidateAccountId: 'candidate-a',
        tenantId: 't1',
        applicationId: 'app-a',
        status: 'Applied',
      };
      candidateApplicationsIndexRepo.findByCandidateAndApplication.mockResolvedValue(
        indexed,
      );
      applicationRepo.findByIdForCandidate.mockResolvedValue({
        matchScore: 0.5,
        appliedSkillIds: ['skill-a'],
        coverLetter: 'Interested in the role',
      });

      await expect(
        service.getApplicationDetail('candidate-a', 'app-a'),
      ).resolves.toEqual({
        ...indexed,
        matchScore: 0.5,
        appliedSkillIds: ['skill-a'],
        coverLetter: 'Interested in the role',
      });
      expect(applicationRepo.findByIdForCandidate).toHaveBeenCalledWith(
        'app-a',
        'tenant_t1',
      );
    });
  });

  describe('withdraw', () => {
    it('deletes the application and its index row', async () => {
      candidateApplicationsIndexRepo.findByCandidateAndApplication.mockResolvedValue(
        { id: 'idx1', tenantId: 'tenant-a', applicationId: 'app1' },
      );
      interviewRepo.findAll.mockResolvedValue([]);
      noteRepo.findByApplicationId.mockResolvedValue([]);

      const result = await service.withdraw('candidate-a', 'app1');

      expect(interviewRepo.findAll).toHaveBeenCalledWith(
        { applicationId: 'app1' },
        'tenant_tenant-a',
      );
      expect(noteRepo.findByApplicationId).toHaveBeenCalledWith(
        'app1',
        'tenant_tenant-a',
      );
      expect(applicationRepo.delete).toHaveBeenCalledWith(
        'app1',
        'tenant_tenant-a',
      );
      expect(candidateApplicationsIndexRepo.deleteById).toHaveBeenCalledWith(
        'idx1',
      );
      expect(cacheService.invalidateTenantDashboard).toHaveBeenCalledWith(
        'tenant-a',
      );
      expect(result).toEqual({ applicationId: 'app1' });
    });

    it('404s for an application the candidate does not own', async () => {
      candidateApplicationsIndexRepo.findByCandidateAndApplication.mockResolvedValue(
        null,
      );

      await expect(service.withdraw('candidate-a', 'app1')).rejects.toThrow(
        NotFoundException,
      );
      expect(interviewRepo.findAll).not.toHaveBeenCalled();
      expect(noteRepo.findByApplicationId).not.toHaveBeenCalled();
      expect(applicationRepo.delete).not.toHaveBeenCalled();
      expect(candidateApplicationsIndexRepo.deleteById).not.toHaveBeenCalled();
    });

    it('409s when the application has interviews or notes', async () => {
      candidateApplicationsIndexRepo.findByCandidateAndApplication.mockResolvedValue(
        { id: 'idx1', tenantId: 'tenant-a', applicationId: 'app1' },
      );
      interviewRepo.findAll.mockResolvedValue([{ id: 'iv1' }]);
      noteRepo.findByApplicationId.mockResolvedValue([]);

      await expect(service.withdraw('candidate-a', 'app1')).rejects.toThrow(
        ConflictException,
      );
      expect(applicationRepo.delete).not.toHaveBeenCalled();
      expect(candidateApplicationsIndexRepo.deleteById).not.toHaveBeenCalled();
      expect(cacheService.invalidateTenantDashboard).not.toHaveBeenCalled();
    });

    it('still 409s on a foreign-key violation from delete as belt-and-suspenders', async () => {
      candidateApplicationsIndexRepo.findByCandidateAndApplication.mockResolvedValue(
        { id: 'idx1', tenantId: 'tenant-a', applicationId: 'app1' },
      );
      interviewRepo.findAll.mockResolvedValue([]);
      noteRepo.findByApplicationId.mockResolvedValue([]);
      applicationRepo.delete.mockRejectedValue({ code: '23503' });

      await expect(service.withdraw('candidate-a', 'app1')).rejects.toThrow(
        ConflictException,
      );
      expect(candidateApplicationsIndexRepo.deleteById).not.toHaveBeenCalled();
      expect(cacheService.invalidateTenantDashboard).not.toHaveBeenCalled();
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
