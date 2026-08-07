import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformDataService } from './platform-data.service';
import {
  MoveApplicationStageSchema,
  MoveApplicationStageDto,
} from './dto/move-application-stage.dto';
import {
  RescheduleInterviewSchema,
  RescheduleInterviewDto,
} from './dto/reschedule-interview.dto';

@Controller('platform')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformDataController {
  constructor(private readonly dataService: PlatformDataService) {}

  @Get('applications')
  listApplications(
    @Query('tenantId', new ParseUUIDPipe({ optional: true }))
    tenantId?: string,
    @Query('status') status?: string,
  ) {
    return this.dataService.listApplications({
      tenantId: tenantId || undefined,
      status: status || undefined,
    });
  }

  @Patch('applications/:id/stage')
  moveApplicationStage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(MoveApplicationStageSchema))
    body: MoveApplicationStageDto,
  ) {
    return this.dataService.moveApplicationStage(id, body);
  }

  @Get('interviews')
  listInterviews(
    @Query('tenantId', new ParseUUIDPipe({ optional: true }))
    tenantId?: string,
    @Query('status') status?: string,
  ) {
    return this.dataService.listInterviews({
      tenantId: tenantId || undefined,
      status: status || undefined,
    });
  }

  @Patch('interviews/:id')
  rescheduleInterview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RescheduleInterviewSchema))
    body: RescheduleInterviewDto,
  ) {
    return this.dataService.rescheduleInterview(id, body);
  }
}
