import { Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { NoteRepository } from '../../repositories/note.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import {
  getTenantId,
  TenantContext,
} from '../../common/context/tenant-context';
import { CacheService } from '../../common/cache/cache.service';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateNoteDto } from './dto/create-note.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly noteRepo: NoteRepository,
    private readonly candidateApplicationsIndexRepo: CandidateApplicationsIndexRepository,
    private readonly cacheService: CacheService,
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
    await this.candidateApplicationsIndexRepo.updateStatus(id, tenantId, stage.name);
    await this.cacheService.invalidateTenantDashboard(getTenantId());
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
