import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { ResumesService } from '../resumes/resumes.service';

const isDuplicateCandidateApplicationError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;

  const errorWithCause = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };
  const candidates = [errorWithCause, errorWithCause.cause];

  return candidates.some((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return false;

    const databaseError = candidate as {
      code?: unknown;
      constraint?: unknown;
    };
    return (
      databaseError.code === '23505' &&
      databaseError.constraint === 'unique_candidate_application'
    );
  });
};

@Injectable()
export class CandidateAccountService {
  constructor(
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly candidateBookmarkRepo: CandidateBookmarkRepository,
    private readonly candidateApplicationsIndexRepo: CandidateApplicationsIndexRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
    private readonly candidateRepo: CandidateRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly candidateSkillRepo: CandidateSkillRepository,
    private readonly skillRepo: SkillRepository,
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly skillMatching: SkillMatchingService,
    private readonly resumesService: ResumesService,
  ) {}

  async getJobs(search?: string) {
    return this.jobListingsIndexRepo.findAll(search);
  }

  async getJobDetail(tenantId: string, jobPostingId: string) {
    const job = await this.jobListingsIndexRepo.findOpenByTenantAndJob(
      tenantId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');
    return job;
  }

  async apply(
    candidateAccountId: string,
    tenantId: string,
    jobPostingId: string,
    dto: { phone?: string; skillIds?: string[]; coverLetter?: string },
  ) {
    const job = await this.jobListingsIndexRepo.findOpenByTenantAndJob(
      tenantId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');

    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');

    const schemaName = `tenant_${tenantId}`;

    // Check for existing application
    const existing = await this.candidateApplicationsIndexRepo.findByJob(
      candidateAccountId,
      tenantId,
      jobPostingId,
    );
    if (existing) {
      throw new ConflictException('You already applied to this application.');
    }

    const selectedSkillIds = Array.from(
      new Set(
        dto.skillIds ??
          (await this.candidateSkillRepo.findByCandidateAccountId(
            candidateAccountId,
          )),
      ),
    );
    const foundSkills = await this.skillRepo.findByIds(selectedSkillIds);
    const foundSkillIds = new Set(foundSkills.map((skill) => skill.id));
    if (selectedSkillIds.some((skillId) => !foundSkillIds.has(skillId))) {
      throw new BadRequestException('One or more skill IDs are invalid');
    }

    const required = await this.jobPostingRepo.getRequiredSkillIds(
      jobPostingId,
      schemaName,
    );
    const matchScore = this.skillMatching.computeScore(
      required,
      selectedSkillIds,
    );

    // Resolve or create tenant candidate via UUID link
    let candidate = await this.candidateRepo.findByAccountId(
      candidateAccountId,
      schemaName,
    );
    if (!candidate) {
      candidate = await this.candidateRepo.createFromAccount(
        candidateAccountId,
        {
          name: `${account.firstName} ${account.lastName}`,
          email: account.email,
          phone: dto.phone ?? account.phone,
        },
        schemaName,
      );
    } else {
      // Update tenant candidate snapshot
      await this.candidateRepo.update(
        candidate.id,
        {
          name: `${account.firstName} ${account.lastName}`,
          email: account.email,
          phone: dto.phone ?? account.phone,
        },
        schemaName,
      );
    }

    const firstStage = await this.pipelineStageRepo.findFirst(schemaName);
    if (!firstStage)
      throw new NotFoundException('No pipeline stages configured');

    const application = await this.applicationRepo.create(
      {
        candidateId: candidate.id,
        jobPostingId,
        currentStageId: firstStage.id,
        candidateName: `${account.firstName} ${account.lastName}`,
        candidateEmail: account.email,
        candidatePhone: dto.phone ?? account.phone,
        appliedSkillIds: selectedSkillIds,
        coverLetter: dto.coverLetter ?? null,
        matchScore,
      },
      schemaName,
    );

    try {
      await this.candidateApplicationsIndexRepo.create({
        candidateAccountId,
        tenantId,
        jobPostingId,
        applicationId: application.id,
        jobTitle: job.title,
        companyName: job.companyName,
        status: firstStage.name,
      });
    } catch (error: unknown) {
      try {
        await this.applicationRepo.delete(application.id, schemaName);
      } catch {
        // Preserve the public index error while attempting the compensation.
      }
      if (isDuplicateCandidateApplicationError(error)) {
        throw new ConflictException('You already applied to this application.');
      }
      throw error;
    }

    return { applicationId: application.id };
  }

  async getApplications(candidateAccountId: string) {
    return this.candidateApplicationsIndexRepo.findByCandidate(
      candidateAccountId,
    );
  }

  async getApplicationDetail(
    candidateAccountId: string,
    applicationId: string,
  ) {
    const indexed =
      await this.candidateApplicationsIndexRepo.findByCandidateAndApplication(
        candidateAccountId,
        applicationId,
      );
    if (!indexed) throw new NotFoundException('Application not found');

    const application = await this.applicationRepo.findByIdForCandidate(
      applicationId,
      `tenant_${indexed.tenantId}`,
    );
    if (!application) throw new NotFoundException('Application not found');

    return {
      ...indexed,
      matchScore: application.matchScore,
      appliedSkillIds: application.appliedSkillIds,
      coverLetter: application.coverLetter,
    };
  }

  async getSkills(candidateAccountId: string) {
    const skillIds =
      await this.candidateSkillRepo.findByCandidateAccountId(
        candidateAccountId,
      );
    if (skillIds.length === 0) return [];
    const skills = await this.skillRepo.findByIds(skillIds);
    return skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
    }));
  }

  async setSkills(candidateAccountId: string, skillIds: string[]) {
    const found = await this.skillRepo.findByIds(skillIds);
    if (found.length !== skillIds.length) {
      throw new BadRequestException('One or more skill IDs are invalid');
    }
    await this.candidateSkillRepo.replaceAll(candidateAccountId, skillIds);
    return { skills: skillIds.length };
  }

  async getBookmarks(candidateAccountId: string) {
    return this.candidateBookmarkRepo.findByCandidate(candidateAccountId);
  }

  async addBookmark(
    candidateAccountId: string,
    tenantId: string,
    jobPostingId: string,
  ) {
    const job = await this.jobListingsIndexRepo.findOpenByTenantAndJob(
      tenantId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');

    const existing = await this.candidateBookmarkRepo.findByJob(
      candidateAccountId,
      tenantId,
      jobPostingId,
    );
    if (existing) return existing;

    return this.candidateBookmarkRepo.create({
      candidateAccountId,
      tenantId,
      jobPostingId,
      jobTitle: job.title,
      companyName: job.companyName,
    });
  }

  async removeBookmark(candidateAccountId: string, bookmarkId: string) {
    await this.candidateBookmarkRepo.delete(bookmarkId, candidateAccountId);
  }

  async getProfile(candidateAccountId: string) {
    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');

    const skillIds =
      await this.candidateSkillRepo.findByCandidateAccountId(
        candidateAccountId,
      );
    let skills: { id: string; name: string; category: string | null }[] = [];
    if (skillIds.length > 0) {
      const allSkills = await this.skillRepo.findByIds(skillIds);
      skills = allSkills.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
      }));
    }

    return {
      id: account.id,
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      phone: account.phone,
      resumeFileUrl: account.resumeFileUrl ?? null,
      resumeUploadedAt: account.resumeUploadedAt ?? null,
      skills,
      createdAt: account.createdAt,
      role: 'Candidate',
    };
  }

  async updateProfile(
    candidateAccountId: string,
    dto: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    },
  ) {
    if (dto.email) {
      const existing = await this.candidateAccountRepo.findByEmail(dto.email);
      if (existing && existing.id !== candidateAccountId) {
        throw new ConflictException('Email already in use');
      }
    }
    return this.candidateAccountRepo.updateProfile(candidateAccountId, dto);
  }

  async uploadResume(candidateAccountId: string, fileUrl: string) {
    return this.candidateAccountRepo.uploadResume(candidateAccountId, fileUrl);
  }

  async removeResume(candidateAccountId: string) {
    return this.resumesService.remove(candidateAccountId);
  }

  async uploadResumeFile(
    candidateAccountId: string,
    file: Express.Multer.File,
  ) {
    const result = await this.resumesService.upload(candidateAccountId, file);
    return { fileUrl: result.fileUrl, uploadedAt: result.uploadedAt };
  }
}
