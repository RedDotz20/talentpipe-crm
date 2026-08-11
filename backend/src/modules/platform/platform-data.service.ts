import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CacheService } from '../../common/cache/cache.service';
import { CompanyRepository } from '../../repositories/company.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { MoveApplicationStageDto } from './dto/move-application-stage.dto';
import { RescheduleInterviewDto } from './dto/reschedule-interview.dto';
import { CreatePlatformJobDto } from './dto/create-platform-job.dto';
import { UpdatePlatformJobDto } from './dto/update-platform-job.dto';
import {
  inMemorySearch,
  listEnvelope,
  sortAndPageInMemory,
} from '../../repositories/list-query.helper';
import type { ListQueryDto } from '../../common/dto/list-query.dto';

interface PlatformFilters {
  companyId?: string;
  status?: string;
}

@Injectable()
export class PlatformDataService {
  constructor(
    private readonly tenantRepo: CompanyRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly candidateIndexRepo: CandidateApplicationsIndexRepository,
    private readonly interviewRepo: InterviewRepository,
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
    private readonly skillRepo: SkillRepository,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService,
  ) {}

  private schemaOf(companyId: string): string {
    return `company_${companyId}`;
  }

  async listApplications(filters: PlatformFilters, query: ListQueryDto) {
    const companies = await this.tenantRepo.findAll();
    const target = filters.companyId
      ? companies.filter((t) => t.id === filters.companyId)
      : companies;
    const rows: Array<Record<string, unknown> & { companyName: string }> = [];
    for (const tenant of target) {
      const apps = await this.applicationRepo.findAll(
        undefined,
        this.schemaOf(tenant.id),
      );
      for (const app of apps) {
        rows.push({ ...app, companyName: tenant.name, companyId: tenant.id });
      }
    }
    let filtered = rows;
    if (filters.status) {
      filtered = filtered.filter((row) => row.stageName === filters.status);
    }
    filtered = inMemorySearch(filtered, query.search, [
      'candidateName',
      'jobTitle',
      'companyName',
    ]);
    const sorted = sortAndPageInMemory(
      filtered,
      query,
      (row, sortBy) =>
        String(row[sortBy as keyof typeof row] ?? '').toLowerCase(),
      'appliedAt',
      'desc',
    );
    return listEnvelope(sorted.data, sorted.total, query);
  }

  async moveApplicationStage(
    applicationId: string,
    dto: MoveApplicationStageDto,
  ) {
    // ponytail: tenant discovery couples to candidate_applications_index (rows
    // only exist for candidate-apply flow). When anonymous apply / org-side
    // application creation lands, fall back to a tenant scan like
    // rescheduleInterview instead of 404ing on a real application.
    const indexed =
      await this.candidateIndexRepo.findByApplication(applicationId);
    if (!indexed) throw new NotFoundException('Application not found');
    const schema = this.schemaOf(indexed.companyId);

    const application = await this.applicationRepo.findById(
      applicationId,
      schema,
    );
    if (!application) throw new NotFoundException('Application not found');
    const stage = await this.pipelineStageRepo.findById(dto.stageId, schema);
    if (!stage) throw new NotFoundException('Pipeline stage not found');

    const updated = await this.applicationRepo.updateStage(
      applicationId,
      dto.stageId,
      schema,
    );
    if (!updated) throw new NotFoundException('Application not found');

    const indexRow = await this.candidateIndexRepo.updateStatus(
      applicationId,
      indexed.companyId,
      stage.name,
    );
    if (application.candidateAccountId && !indexRow) {
      await this.applicationRepo.updateStage(
        applicationId,
        application.currentStageId,
        schema,
        dto.stageId,
      );
      throw new ServiceUnavailableException(
        'Candidate application status could not be synchronized',
      );
    }
    // ponytail: platform stage moves skip the BullMQ notifications queue
    // (tenant-side moves still enqueue); re-add when notifications become mail.
    await this.cacheService.invalidateCompanyDashboard(indexed.companyId);
    await this.auditService.log(
      'platform.application.stage_move',
      applicationId,
      { fromStage: application.currentStageId, toStage: stage.name },
      indexed.companyId,
    );
    return this.applicationRepo.findById(applicationId, schema);
  }

  async listInterviews(filters: PlatformFilters, query: ListQueryDto) {
    const companies = await this.tenantRepo.findAll();
    const target = filters.companyId
      ? companies.filter((t) => t.id === filters.companyId)
      : companies;
    const rows: Array<Record<string, unknown> & { companyName: string }> = [];
    for (const tenant of target) {
      const interviews = await this.interviewRepo.findAll(
        undefined,
        this.schemaOf(tenant.id),
      );
      for (const interview of interviews) {
        rows.push({
          ...interview,
          companyName: tenant.name,
          companyId: tenant.id,
        });
      }
    }
    let filtered = rows;
    if (filters.status) {
      filtered = filtered.filter((row) => row.status === filters.status);
    }
    filtered = inMemorySearch(filtered, query.search, [
      'candidateName',
      'jobTitle',
      'companyName',
    ]);
    const sorted = sortAndPageInMemory(
      filtered,
      query,
      (row, sortBy) =>
        String(row[sortBy as keyof typeof row] ?? '').toLowerCase(),
      'scheduledAt',
      'asc',
    );
    return listEnvelope(sorted.data, sorted.total, query);
  }

  async rescheduleInterview(interviewId: string, dto: RescheduleInterviewDto) {
    const companies = await this.tenantRepo.findAll();
    for (const tenant of companies) {
      const schema = this.schemaOf(tenant.id);
      const interview = await this.interviewRepo.findById(interviewId, schema);
      if (interview) {
        const data: { scheduledAt?: Date; status?: string } = {};
        if (dto.scheduledAt !== undefined) {
          data.scheduledAt = new Date(dto.scheduledAt);
        }
        if (dto.status !== undefined) data.status = dto.status;
        const updated = await this.interviewRepo.update(
          interviewId,
          data,
          schema,
        );
        await this.auditService.log(
          'platform.interview.update',
          interviewId,
          {
            ...dto,
            scheduledAt: data.scheduledAt?.toISOString() ?? dto.scheduledAt,
          },
          tenant.id,
        );
        return updated ?? interview;
      }
    }
    throw new NotFoundException('Interview not found');
  }

  async listJobs(filters: PlatformFilters, query: ListQueryDto) {
    const companies = await this.tenantRepo.findAll();
    const target = filters.companyId
      ? companies.filter((t) => t.id === filters.companyId)
      : companies;
    const rows: Array<Record<string, unknown> & { companyName: string }> = [];
    for (const tenant of target) {
      const jobs = await this.jobPostingRepo.findAll(
        filters.status,
        this.schemaOf(tenant.id),
      );
      for (const job of jobs) {
        rows.push({ ...job, companyName: tenant.name, companyId: tenant.id });
      }
    }
    const filtered = inMemorySearch(rows, query.search, [
      'title',
      'companyName',
    ]);
    const sorted = sortAndPageInMemory(
      filtered,
      query,
      (row, sortBy) =>
        String(row[sortBy as keyof typeof row] ?? '').toLowerCase(),
      'createdAt',
      'desc',
    );
    return listEnvelope(sorted.data, sorted.total, query);
  }

  async getJob(jobId: string) {
    const found = await this.findJobWithSchema(jobId);
    const requiredSkillIds = await this.jobPostingRepo.getRequiredSkillIds(
      jobId,
      found.schema,
    );
    return {
      ...found.job,
      companyName: found.tenant.name,
      companyId: found.tenant.id,
      requiredSkillIds,
    };
  }

  async createJob(dto: CreatePlatformJobDto) {
    const tenant = await this.tenantRepo.findById(dto.companyId);
    if (!tenant) throw new NotFoundException('Company not found');
    await this.assertSkillsExist(dto.requiredSkillIds ?? []);
    const schema = this.schemaOf(tenant.id);
    const posting = await this.jobPostingRepo.create(
      {
        title: dto.title,
        description: dto.description ?? null,
        employmentType: dto.employmentType,
        location: dto.location,
        workSetup: dto.workSetup,
      },
      schema,
    );
    if (dto.requiredSkillIds?.length) {
      await this.jobPostingRepo.setRequiredSkills(
        posting.id,
        dto.requiredSkillIds,
        schema,
      );
    }
    await this.syncListing(tenant, posting);
    await this.cacheService.invalidateCompanyDashboard(tenant.id);
    await this.auditService.log(
      'platform.job.create',
      posting.id,
      { title: posting.title, companyId: tenant.id },
      tenant.id,
    );
    return this.getJob(posting.id);
  }

  async updateJob(jobId: string, dto: UpdatePlatformJobDto) {
    const found = await this.findJobWithSchema(jobId);
    if (dto.requiredSkillIds) {
      await this.assertSkillsExist(dto.requiredSkillIds);
    }
    let didWrite = false;
    const patch: Partial<{
      title: string;
      description: string | null;
      employmentType: string;
      location: string;
      workSetup: string;
      status: string;
    }> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.employmentType !== undefined)
      patch.employmentType = dto.employmentType;
    if (dto.location !== undefined) patch.location = dto.location;
    if (dto.workSetup !== undefined) patch.workSetup = dto.workSetup;
    if (Object.keys(patch).length > 0) {
      const updated = await this.jobPostingRepo.update(
        jobId,
        patch,
        found.schema,
      );
      if (updated && found.job.status !== 'draft') {
        await this.syncListing(found.tenant, updated);
      }
      didWrite = true;
    }
    if (dto.requiredSkillIds) {
      await this.jobPostingRepo.setRequiredSkills(
        jobId,
        dto.requiredSkillIds,
        found.schema,
      );
      didWrite = true;
    }
    if (didWrite) {
      await this.cacheService.invalidateCompanyDashboard(found.tenant.id);
    }
    await this.auditService.log(
      'platform.job.update',
      jobId,
      { title: dto.title ?? found.job.title, companyId: found.tenant.id },
      found.tenant.id,
    );
    return this.getJob(jobId);
  }

  async publishJob(jobId: string) {
    const found = await this.findJobWithSchema(jobId);
    if (found.job.status !== 'draft') {
      throw new ConflictException('Only draft postings can be published');
    }
    const updated = await this.jobPostingRepo.update(
      jobId,
      { status: 'open' },
      found.schema,
    );
    if (updated) {
      await this.syncListing(found.tenant, updated);
      await this.cacheService.invalidateCompanyDashboard(found.tenant.id);
    }
    await this.auditService.log(
      'platform.job.publish',
      jobId,
      { title: found.job.title, companyId: found.tenant.id },
      found.tenant.id,
    );
    return this.getJob(jobId);
  }

  async closeJob(jobId: string) {
    const found = await this.findJobWithSchema(jobId);
    if (found.job.status === 'closed') return this.getJob(jobId);
    const updated = await this.jobPostingRepo.update(
      jobId,
      { status: 'closed' },
      found.schema,
    );
    if (updated) {
      await this.syncListing(found.tenant, updated);
      await this.cacheService.invalidateCompanyDashboard(found.tenant.id);
    }
    await this.auditService.log(
      'platform.job.close',
      jobId,
      { title: found.job.title, companyId: found.tenant.id },
      found.tenant.id,
    );
    return this.getJob(jobId);
  }

  async deleteJob(jobId: string) {
    const found = await this.findJobWithSchema(jobId);
    if (found.job.status === 'open') {
      throw new ConflictException(
        'Open postings must be closed before deletion',
      );
    }
    const applicationCount = await this.applicationRepo.countByJobPosting(
      jobId,
      found.schema,
    );
    if (applicationCount > 0) {
      throw new ConflictException(
        'Cannot delete a job posting that has applications',
      );
    }
    await this.jobPostingRepo.delete(jobId, found.schema);
    await this.jobListingsIndexRepo.delete(found.tenant.id, jobId);
    await this.cacheService.invalidateCompanyDashboard(found.tenant.id);
    await this.auditService.log(
      'platform.job.delete',
      jobId,
      { title: found.job.title, companyId: found.tenant.id },
      found.tenant.id,
    );
    return { id: jobId };
  }

  private async findJobWithSchema(jobId: string) {
    const companies = await this.tenantRepo.findAll();
    for (const tenant of companies) {
      const schema = this.schemaOf(tenant.id);
      const job = await this.jobPostingRepo.findById(jobId, schema);
      if (job) return { job, tenant, schema };
    }
    throw new NotFoundException('Job posting not found');
  }

  private async assertSkillsExist(skillIds: string[]) {
    const found = await this.skillRepo.findByIds(skillIds);
    if (found.length !== skillIds.length) {
      throw new BadRequestException('One or more skills do not exist');
    }
  }

  private async syncListing(
    tenant: { id: string; name: string; slug: string },
    posting: {
      id: string;
      title: string;
      description: string | null;
      employmentType: string | null;
      location: string | null;
      workSetup: string | null;
      status: string;
    },
  ) {
    await this.jobListingsIndexRepo.upsert({
      companyId: tenant.id,
      jobPostingId: posting.id,
      title: posting.title,
      description: posting.description ?? '',
      employmentType: posting.employmentType,
      location: posting.location,
      workSetup: posting.workSetup,
      companyName: tenant.name,
      companySlug: tenant.slug,
      status: posting.status,
    });
  }
}
