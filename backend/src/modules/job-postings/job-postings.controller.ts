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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyContext } from '../../common/context/company-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';
import { JobPostingsService } from './job-postings.service';
import {
  CreateJobPostingSchema,
  CreateJobPostingDto,
} from './dto/create-job-posting.dto';
import {
  UpdateJobPostingSchema,
  UpdateJobPostingDto,
} from './dto/update-job-posting.dto';

const VIEW_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager'];
const EDIT_ROLES = ['CompanyAdmin', 'Recruiter'];

@Controller('job-postings')
export class JobPostingsController {
  constructor(private readonly jobPostingsService: JobPostingsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  list(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('status') status?: string,
  ) {
    return this.jobPostingsService.list(status, query);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
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
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobPostingsService.getOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
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
  publish(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobPostingsService.publish(id);
  }

  @Post(':id/close')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  close(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobPostingsService.close(id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobPostingsService.remove(id);
  }
}
