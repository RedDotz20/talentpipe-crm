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
import { JobPostingsService } from '@/modules/job-postings/job-postings.service';
import {
  CreateJobPostingSchema,
  CreateJobPostingDto,
} from '@/modules/job-postings/dto/create-job-posting.dto';
import {
  UpdateJobPostingSchema,
  UpdateJobPostingDto,
} from '@/modules/job-postings/dto/update-job-posting.dto';

const VIEW_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager'];
const EDIT_ROLES = ['CompanyAdmin', 'Recruiter'];

@Controller('job-postings')
export class JobPostingsController {
  constructor(private readonly jobPostingsService: JobPostingsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('jobs.view')
  list(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('status') status?: string,
  ) {
    return this.jobPostingsService.list(status, query);
  }

  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('jobs.view')
  @SkipEnvelope()
  async exportCsv(
    @Res() res: Response,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('status') status?: string,
  ) {
    const csv = await this.jobPostingsService.exportCsv(status, query);
    sendCsv(res, csv, 'job-postings');
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  @Permissions('jobs.create_edit')
  create(
    @Body(new ZodValidationPipe(CreateJobPostingSchema))
    dto: CreateJobPostingDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.jobPostingsService.create(user, dto);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('jobs.view')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobPostingsService.getOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  @Permissions('jobs.create_edit')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateJobPostingSchema))
    dto: UpdateJobPostingDto,
  ) {
    return this.jobPostingsService.update(id, dto);
  }

  @Post(':id/publish')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  @Permissions('jobs.publish_close')
  publish(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobPostingsService.publish(id);
  }

  @Post(':id/close')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  @Permissions('jobs.publish_close')
  close(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobPostingsService.close(id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  @Permissions('jobs.delete')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobPostingsService.remove(id);
  }
}
