import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';

@Injectable()
export class PipelineStagesService {
  constructor(private readonly pipelineStageRepo: PipelineStageRepository) {}

  list() {
    return this.pipelineStageRepo.findAll();
  }

  async create(dto: CreatePipelineStageDto) {
    const stages = await this.pipelineStageRepo.findAll();
    return this.pipelineStageRepo.create({
      name: dto.name,
      order: stages.length,
    });
  }

  async update(id: string, dto: UpdatePipelineStageDto) {
    const stage = await this.pipelineStageRepo.findById(id);
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    return this.pipelineStageRepo.update(id, dto);
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
    return { id };
  }
}
