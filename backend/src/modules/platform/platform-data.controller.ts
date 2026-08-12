import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { sendCsv } from '../../common/csv.helper';
import { PlatformDataService } from './platform-data.service';
import {
  MoveApplicationStageSchema,
  MoveApplicationStageDto,
} from './dto/move-application-stage.dto';
import {
  RescheduleInterviewSchema,
  RescheduleInterviewDto,
} from './dto/reschedule-interview.dto';
import {
  CreatePlatformJobSchema,
  CreatePlatformJobDto,
} from './dto/create-platform-job.dto';
import {
  UpdatePlatformJobSchema,
  UpdatePlatformJobDto,
} from './dto/update-platform-job.dto';
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';

@Controller('platform')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformDataController {
  constructor(private readonly dataService: PlatformDataService) {}

  @Get('applications')
  listApplications(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('status') status?: string,
  ) {
    return this.dataService.listApplications(
      { companyId: companyId || undefined, status: status || undefined },
      query,
    );
  }

  @Get('applications/export')
  @SkipEnvelope()
  async exportApplications(
    @Res() res: Response,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('status') status?: string,
  ) {
    const csv = await this.dataService.exportApplications(
      { companyId: companyId || undefined, status: status || undefined },
      query.search,
    );
    sendCsv(res, csv, 'applications');
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
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('status') status?: string,
  ) {
    return this.dataService.listInterviews(
      { companyId: companyId || undefined, status: status || undefined },
      query,
    );
  }

  @Get('interviews/export')
  @SkipEnvelope()
  async exportInterviews(
    @Res() res: Response,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('status') status?: string,
  ) {
    const csv = await this.dataService.exportInterviews(
      { companyId: companyId || undefined, status: status || undefined },
      query.search,
    );
    sendCsv(res, csv, 'interviews');
  }

  @Patch('interviews/:id')
  rescheduleInterview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RescheduleInterviewSchema))
    body: RescheduleInterviewDto,
  ) {
    return this.dataService.rescheduleInterview(id, body);
  }

  @Get('jobs')
  listJobs(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('status') status?: string,
  ) {
    return this.dataService.listJobs(
      { companyId: companyId || undefined, status: status || undefined },
      query,
    );
  }

  @Get('jobs/export')
  @SkipEnvelope()
  async exportJobs(
    @Res() res: Response,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('status') status?: string,
  ) {
    const csv = await this.dataService.exportJobs(
      { companyId: companyId || undefined, status: status || undefined },
      query.search,
    );
    sendCsv(res, csv, 'jobs');
  }

  @Get('jobs/:id')
  getJob(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.dataService.getJob(id);
  }

  @Post('jobs')
  createJob(
    @Body(new ZodValidationPipe(CreatePlatformJobSchema))
    body: CreatePlatformJobDto,
  ) {
    return this.dataService.createJob(body);
  }

  @Patch('jobs/:id')
  updateJob(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePlatformJobSchema))
    body: UpdatePlatformJobDto,
  ) {
    return this.dataService.updateJob(id, body);
  }

  @Post('jobs/:id/publish')
  publishJob(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.dataService.publishJob(id);
  }

  @Post('jobs/:id/close')
  closeJob(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.dataService.closeJob(id);
  }

  @Delete('jobs/:id')
  deleteJob(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.dataService.deleteJob(id);
  }
}
