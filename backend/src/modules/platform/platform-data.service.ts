import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CacheService } from '../../common/cache/cache.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { MoveApplicationStageDto } from './dto/move-application-stage.dto';
import { RescheduleInterviewDto } from './dto/reschedule-interview.dto';

interface PlatformFilters {
  tenantId?: string;
  status?: string;
}

@Injectable()
export class PlatformDataService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly candidateIndexRepo: CandidateApplicationsIndexRepository,
    private readonly interviewRepo: InterviewRepository,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService,
  ) {}

  private schemaOf(tenantId: string): string {
    return `tenant_${tenantId}`;
  }

  async listApplications(filters: PlatformFilters) {
    const tenants = await this.tenantRepo.findAll();
    const target = filters.tenantId
      ? tenants.filter((t) => t.id === filters.tenantId)
      : tenants;
    const rows: Array<Record<string, unknown> & { tenantName: string }> = [];
    for (const tenant of target) {
      const apps = await this.applicationRepo.findAll(
        undefined,
        this.schemaOf(tenant.id),
      );
      for (const app of apps) {
        rows.push({ ...app, tenantName: tenant.name, tenantId: tenant.id });
      }
    }
    if (filters.status) {
      return rows.filter((row) => row.stageName === filters.status);
    }
    return rows;
  }

  async moveApplicationStage(
    applicationId: string,
    dto: MoveApplicationStageDto,
  ) {
    const indexed =
      await this.candidateIndexRepo.findByApplication(applicationId);
    if (!indexed) throw new NotFoundException('Application not found');
    const schema = this.schemaOf(indexed.tenantId);

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
      indexed.tenantId,
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
    await this.cacheService.invalidateTenantDashboard(indexed.tenantId);
    await this.auditService.log(
      'platform.application.stage_move',
      applicationId,
      { fromStage: application.currentStageId, toStage: stage.name },
      indexed.tenantId,
    );
    return this.applicationRepo.findById(applicationId, schema);
  }

  async listInterviews(filters: PlatformFilters) {
    const tenants = await this.tenantRepo.findAll();
    const target = filters.tenantId
      ? tenants.filter((t) => t.id === filters.tenantId)
      : tenants;
    const rows: Array<Record<string, unknown> & { tenantName: string }> = [];
    for (const tenant of target) {
      const interviews = await this.interviewRepo.findAll(
        undefined,
        this.schemaOf(tenant.id),
      );
      for (const interview of interviews) {
        rows.push({
          ...interview,
          tenantName: tenant.name,
          tenantId: tenant.id,
        });
      }
    }
    if (filters.status) {
      return rows.filter((row) => row.status === filters.status);
    }
    return rows;
  }

  async rescheduleInterview(interviewId: string, dto: RescheduleInterviewDto) {
    const tenants = await this.tenantRepo.findAll();
    for (const tenant of tenants) {
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
        return updated;
      }
    }
    throw new NotFoundException('Interview not found');
  }
}
