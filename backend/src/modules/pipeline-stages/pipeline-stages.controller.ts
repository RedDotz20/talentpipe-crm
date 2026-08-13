import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
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
  'CompanyAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
];

@Controller('company/pipeline-stages')
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
  @Roles('CompanyAdmin')
  @Permissions('stages.manage')
  create(
    @Body(new ZodValidationPipe(CreatePipelineStageSchema))
    dto: CreatePipelineStageDto,
  ) {
    return this.pipelineStagesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  @Permissions('stages.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePipelineStageSchema))
    dto: UpdatePipelineStageDto,
  ) {
    return this.pipelineStagesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  @Permissions('stages.manage')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.pipelineStagesService.remove(id);
  }
}
