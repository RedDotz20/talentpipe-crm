import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SkipEnvelope } from '@/common/decorators/skip-envelope.decorator';
import { sendCsv } from '@/common/csv.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CompanyContext } from '@/common/context/company-context';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { ListQuerySchema, ListQueryDto } from '@/common/dto/list-query.dto';
import { InterviewsService } from '@/modules/interviews/interviews.service';
import {
  CreateInterviewSchema,
  CreateInterviewDto,
} from '@/modules/interviews/dto/create-interview.dto';
import {
  UpdateInterviewSchema,
  UpdateInterviewDto,
} from '@/modules/interviews/dto/update-interview.dto';
import {
  SubmitFeedbackSchema,
  SubmitFeedbackDto,
} from '@/modules/interviews/dto/submit-feedback.dto';

const VIEW_ROLES = [
  'CompanyAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
];
const SCHEDULER_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager'];

@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('interviews.view')
  list(
    @CurrentUser() user: CompanyContext,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('status') status?: string,
    @Query('assignedToMe') assignedToMe?: string,
  ) {
    return this.interviewsService.list(user, {
      ...query,
      status,
      assignedToMe,
    });
  }

  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('interviews.view')
  @SkipEnvelope()
  async exportCsv(
    @Res() res: Response,
    @CurrentUser() user: CompanyContext,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('status') status?: string,
    @Query('assignedToMe') assignedToMe?: string,
  ) {
    const csv = await this.interviewsService.exportCsv(user, {
      ...query,
      status,
      assignedToMe,
    });
    sendCsv(res, csv, 'interviews');
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('interviews.view')
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.interviewsService.getOne(user, id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...SCHEDULER_ROLES)
  @Permissions('interviews.schedule')
  schedule(
    @Body(new ZodValidationPipe(CreateInterviewSchema)) dto: CreateInterviewDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.interviewsService.schedule(user, dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...SCHEDULER_ROLES)
  @Permissions('interviews.schedule')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateInterviewSchema)) dto: UpdateInterviewDto,
  ) {
    return this.interviewsService.update(id, dto);
  }

  @Post(':id/feedback')
  @UseGuards(AuthGuard('jwt'))
  @Roles('Interviewer')
  @Permissions('interviews.feedback')
  submitFeedback(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(SubmitFeedbackSchema)) dto: SubmitFeedbackDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.interviewsService.submitFeedback(user, id, dto);
  }
}
