import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PipelineStagesService } from './pipeline-stages.service';
import {
  CreatePipelineStageSchema,
  CreatePipelineStageDto,
} from './dto/create-pipeline-stage.dto';
import {
  UpdatePipelineStageSchema,
  UpdatePipelineStageDto,
} from './dto/update-pipeline-stage.dto';

const INTERNAL_ROLES = [
  'OrgAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
];

@Controller('org/pipeline-stages')
export class PipelineStagesController {
  constructor(private readonly pipelineStagesService: PipelineStagesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...INTERNAL_ROLES)
  list() {
    return this.pipelineStagesService.list();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles('OrgAdmin')
  create(
    @Body(new ZodValidationPipe(CreatePipelineStageSchema))
    dto: CreatePipelineStageDto,
  ) {
    return this.pipelineStagesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('OrgAdmin')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePipelineStageSchema))
    dto: UpdatePipelineStageDto,
  ) {
    return this.pipelineStagesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('OrgAdmin')
  remove(@Param('id') id: string) {
    return this.pipelineStagesService.remove(id);
  }
}
