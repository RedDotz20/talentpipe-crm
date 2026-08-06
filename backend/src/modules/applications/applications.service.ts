import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { NoteRepository } from '../../repositories/note.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import {
  getCurrentUser,
  getTenantId,
  TenantContext,
} from '../../common/context/tenant-context';
import { CacheService } from '../../common/cache/cache.service';
import {
  NOTIFICATION_QUEUE,
  STAGE_CHANGE_JOB,
  StageChangeNotificationPayload,
} from '../../queues/queues';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateNoteDto } from './dto/create-note.dto';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly noteRepo: NoteRepository,
    private readonly candidateApplicationsIndexRepo: CandidateApplicationsIndexRepository,
    private readonly cacheService: CacheService,
    @Inject(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue<StageChangeNotificationPayload>,
  ) {}

  list(filters?: { jobPostingId?: string; stageId?: string }) {
    return this.applicationRepo.findAll(filters);
  }

  async getOne(id: string) {
    const application = await this.applicationRepo.findById(id);
    if (!application) throw new NotFoundException('Application not found');
    const notes = await this.noteRepo.findByApplicationId(id);
    return { ...application, notes };
  }

  async updateStage(id: string, dto: UpdateStageDto, tenantId: string) {
    const application = await this.applicationRepo.findById(id);
    if (!application) throw new NotFoundException('Application not found');
    const stage = await this.pipelineStageRepo.findById(dto.stageId);
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    const updated = await this.applicationRepo.updateStage(id, dto.stageId);
    if (!updated) throw new NotFoundException('Application not found');
    const indexed = await this.candidateApplicationsIndexRepo.updateStatus(
      id,
      tenantId,
      stage.name,
    );
    if (application.candidateAccountId && !indexed) {
      await this.applicationRepo.updateStage(id, application.currentStageId);
      throw new ServiceUnavailableException(
        'Candidate application status could not be synchronized',
      );
    }
    await this.cacheService.invalidateTenantDashboard(getTenantId());

    try {
      await this.notificationQueue.add(STAGE_CHANGE_JOB, {
        tenantId,
        actorUserId: getCurrentUser().userId,
        applicationId: id,
        jobPostingId: application.jobPostingId,
        fromStage: application.currentStageId,
        toStage: stage.name,
        recipientEmail: application.candidateEmail,
      });
    } catch (error) {
      // fire-and-forget: a queue hiccup must never fail the stage change
      this.logger.warn(
        `Failed to enqueue stage-change notification for application ${id}`,
        error instanceof Error ? error.message : String(error),
      );
    }

    return this.getOne(id);
  }

  async addNote(user: TenantContext, id: string, dto: CreateNoteDto) {
    const application = await this.applicationRepo.findById(id);
    if (!application) throw new NotFoundException('Application not found');
    return this.noteRepo.create({
      applicationId: id,
      authorUserId: user.userId,
      content: dto.content,
    });
  }

  listNotes(id: string) {
    return this.noteRepo.findByApplicationId(id);
  }
}
