import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CacheService } from '@/common/cache/cache.service';
import { getCompanyId } from '@/common/context/company-context';
import { PipelineStageRepository } from '@/repositories/pipeline-stage.repository';
import { CreatePipelineStageDto } from '@/modules/pipeline-stages/dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from '@/modules/pipeline-stages/dto/update-pipeline-stage.dto';

@Injectable()
export class PipelineStagesService {
  constructor(
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly cacheService: CacheService,
  ) {}

  list() {
    return this.pipelineStageRepo.findAll();
  }

  async create(dto: CreatePipelineStageDto) {
    const stages = await this.pipelineStageRepo.findAll();
    const stage = await this.pipelineStageRepo.create({
      name: dto.name,
      order: stages.length,
    });
    if (stage) {
      await this.cacheService.invalidateCompanyDashboard(getCompanyId());
    }
    return stage;
  }

  async update(id: string, dto: UpdatePipelineStageDto) {
    const stage = await this.pipelineStageRepo.findById(id);
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    const updated = await this.pipelineStageRepo.update(id, dto);
    if (updated) {
      await this.cacheService.invalidateCompanyDashboard(getCompanyId());
    }
    return updated;
  }

  async remove(id: string) {
    const stage = await this.pipelineStageRepo.findById(id);
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    const referenced =
      await this.pipelineStageRepo.countApplicationsForStage(id);
    if (referenced) {
      throw new ConflictException(
        'Cannot delete a stage that has applications',
      );
    }
    await this.pipelineStageRepo.delete(id);
    await this.cacheService.invalidateCompanyDashboard(getCompanyId());
    return { id };
  }
}
