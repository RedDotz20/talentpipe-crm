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
import { TenantRepository } from '../../repositories/tenant.repository';
import { SkillMatchingService } from '../skill-matching/skill-matching.service';
import { ResumesService } from '../resumes/resumes.service';
import { CacheService } from '../../common/cache/cache.service';
import { UserEmailRepository } from '../../repositories/user-email.repository';

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

const isDuplicateCandidateAccountError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;

  const errorWithCause = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };
  return [errorWithCause, errorWithCause.cause].some((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return false;
    const databaseError = candidate as {
      code?: unknown;
      constraint?: unknown;
    };
    return (
      databaseError.code === '23505' &&
      (databaseError.constraint === 'unique_candidate_account' ||
        (typeof databaseError.constraint === 'string' &&
          databaseError.constraint.includes('candidate_account_id')))
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
    private readonly tenantRepo: TenantRepository,
    private readonly skillMatching: SkillMatchingService,
    private readonly resumesService: ResumesService,
    private readonly cacheService: CacheService,
    private readonly userEmailRepo: UserEmailRepository,
  ) {}

  async getJobs(search?: string) {
    const jobs = await this.jobListingsIndexRepo.findAll(search);
    const suspendedIds = new Set(
      (await this.tenantRepo.findSuspendedIds()).map((t) => t.id),
    );
    return jobs.filter((job) => !suspendedIds.has(job.tenantId));
  }

  async getJobDetail(tenantId: string, jobPostingId: string) {
    await this.requireActiveTenant(tenantId);
    const job = await this.jobListingsIndexRepo.findOpenByTenantAndJob(
      tenantId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');
    await this.requireOpenTenantJob(tenantId, jobPostingId);
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

    const schemaName = `tenant_${tenantId}`;
    await this.requireOpenTenantJob(tenantId, jobPostingId);

    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');

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
    let createdCandidate = false;
    if (!candidate) {
      try {
        candidate = await this.candidateRepo.createFromAccount(
          candidateAccountId,
          {
            name: `${account.firstName} ${account.lastName}`,
            email: account.email,
            phone: dto.phone ?? account.phone,
          },
          schemaName,
        );
        createdCandidate = true;
      } catch (error: unknown) {
        if (!isDuplicateCandidateAccountError(error)) throw error;
        candidate = await this.candidateRepo.findByAccountId(
          candidateAccountId,
          schemaName,
        );
        if (!candidate) throw error;
      }
    }
    if (candidate && !createdCandidate) {
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
    if (!candidate) {
      throw new NotFoundException('Candidate could not be created');
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
      if (createdCandidate && candidate) {
        try {
          await this.candidateRepo.delete(candidate.id, schemaName);
        } catch {
          // Preserve the public index error while attempting the compensation.
        }
      }
      if (isDuplicateCandidateApplicationError(error)) {
        throw new ConflictException('You already applied to this application.');
      }
      throw error;
    }

    await this.cacheService.invalidateTenantDashboard(tenantId);
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

  async withdraw(candidateAccountId: string, applicationId: string) {
    const indexed =
      await this.candidateApplicationsIndexRepo.findByCandidateAndApplication(
        candidateAccountId,
        applicationId,
      );
    if (!indexed) throw new NotFoundException('Application not found');

    const schemaName = `tenant_${indexed.tenantId}`;
    await this.applicationRepo.delete(indexed.applicationId, schemaName);
    await this.candidateApplicationsIndexRepo.deleteById(indexed.id);
    await this.cacheService.invalidateTenantDashboard(indexed.tenantId);
    return { applicationId };
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
    const uniqueIds = Array.from(new Set(skillIds));
    const found = await this.skillRepo.findByIds(uniqueIds);
    if (found.length !== uniqueIds.length) {
      throw new BadRequestException('One or more skill IDs are invalid');
    }
    await this.candidateSkillRepo.replaceAll(candidateAccountId, uniqueIds);
    return { skills: uniqueIds.length };
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
    await this.requireOpenTenantJob(tenantId, jobPostingId);

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

  private async requireActiveTenant(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.status === 'suspended') {
      throw new NotFoundException('Tenant not found');
    }
  }

  private async requireOpenTenantJob(
    tenantId: string,
    jobPostingId: string,
  ): Promise<void> {
    await this.requireActiveTenant(tenantId);
    const posting = await this.jobPostingRepo.findById(
      jobPostingId,
      `tenant_${tenantId}`,
    );
    if (!posting || posting.status !== 'open') {
      throw new NotFoundException('Job posting not found');
    }
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
      const orgOwner = await this.userEmailRepo.findByEmail(dto.email);
      if (orgOwner) {
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
