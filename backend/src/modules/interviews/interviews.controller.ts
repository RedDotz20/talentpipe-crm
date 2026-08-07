import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantContext } from '../../common/context/tenant-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
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

const VIEW_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager', 'Interviewer'];
const SCHEDULER_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager'];

@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  list(
    @Query('assignedToMe') assignedToMe: string | undefined,
    @CurrentUser() user: TenantContext,
  ) {
    return this.interviewsService.list(user, assignedToMe);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: TenantContext,
  ) {
    return this.interviewsService.getOne(user, id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...SCHEDULER_ROLES)
  schedule(
    @Body(new ZodValidationPipe(CreateInterviewSchema)) dto: CreateInterviewDto,
    @CurrentUser() user: TenantContext,
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
    @CurrentUser() user: TenantContext,
  ) {
    return this.interviewsService.submitFeedback(user, id, dto);
  }
}
