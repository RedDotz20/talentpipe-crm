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
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { csvFilename } from '../../common/csv.helper';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyContext } from '../../common/context/company-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';
import { InterviewsService } from './interviews.service';
import {
  CreateInterviewSchema,
  CreateInterviewDto,
} from './dto/create-interview.dto';
import {
  UpdateInterviewSchema,
  UpdateInterviewDto,
} from './dto/update-interview.dto';
import {
  SubmitFeedbackSchema,
  SubmitFeedbackDto,
} from './dto/submit-feedback.dto';

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
  @SkipEnvelope()
  async exportCsv(
    @CurrentUser() user: CompanyContext,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('assignedToMe') assignedToMe?: string,
  ) {
    const csv = await this.interviewsService.exportCsv(user, {
      ...query,
      status,
      assignedToMe,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('interviews')}"`,
    );
    res.send(csv);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.interviewsService.getOne(user, id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...SCHEDULER_ROLES)
  schedule(
    @Body(new ZodValidationPipe(CreateInterviewSchema)) dto: CreateInterviewDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.interviewsService.schedule(user, dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...SCHEDULER_ROLES)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateInterviewSchema)) dto: UpdateInterviewDto,
  ) {
    return this.interviewsService.update(id, dto);
  }

  @Post(':id/feedback')
  @UseGuards(AuthGuard('jwt'))
  @Roles('Interviewer')
  submitFeedback(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(SubmitFeedbackSchema)) dto: SubmitFeedbackDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.interviewsService.submitFeedback(user, id, dto);
  }
}
