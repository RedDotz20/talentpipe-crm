import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CandidateAuthGuard } from '../../common/guards/candidate-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantContext } from '../../common/context/tenant-context';
import { CandidateAccountService } from './candidate-account.service';
import { BookmarkJobSchema, BookmarkJobDto } from './dto/bookmark.dto';
import { ApplyJobSchema, ApplyJobDto } from './dto/apply.dto';
import {
  SetCandidateSkillsSchema,
  SetCandidateSkillsDto,
} from './dto/skills.dto';

@Controller('candidate')
export class CandidateAccountController {
  constructor(
    private readonly candidateAccountService: CandidateAccountService,
  ) {}

  @Get('jobs')
  async listJobs(@Query('search') search?: string) {
    return this.candidateAccountService.getJobs(search);
  }

  @Get('jobs/:tenantId/:jobId')
  async getJobDetail(
    @Param('tenantId') tenantId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.candidateAccountService.getJobDetail(tenantId, jobId);
  }

  @Post('jobs/:tenantId/:jobId/apply')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async apply(
    @Param('tenantId') tenantId: string,
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(ApplyJobSchema)) body: ApplyJobDto,
    @CurrentUser() user: TenantContext,
  ) {
    return this.candidateAccountService.apply(
      user.userId,
      tenantId,
      jobId,
      body.phone,
      body.skillIds,
    );
  }

  @Get('applications')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getApplications(@CurrentUser() user: TenantContext) {
    return this.candidateAccountService.getApplications(user.userId);
  }

  @Get('skills')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getSkills(@CurrentUser() user: TenantContext) {
    return this.candidateAccountService.getSkills(user.userId);
  }

  @Put('skills')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async setSkills(
    @Body(new ZodValidationPipe(SetCandidateSkillsSchema))
    body: SetCandidateSkillsDto,
    @CurrentUser() user: TenantContext,
  ) {
    return this.candidateAccountService.setSkills(user.userId, body.skillIds);
  }

  @Post('bookmarks')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async addBookmark(
    @Body(new ZodValidationPipe(BookmarkJobSchema)) body: BookmarkJobDto,
    @CurrentUser() user: TenantContext,
  ) {
    return this.candidateAccountService.addBookmark(
      user.userId,
      body.tenantId,
      body.jobPostingId,
    );
  }

  @Delete('bookmarks/:id')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async removeBookmark(
    @Param('id') id: string,
    @CurrentUser() user: TenantContext,
  ) {
    return this.candidateAccountService.removeBookmark(user.userId, id);
  }

  @Get('bookmarks')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getBookmarks(@CurrentUser() user: TenantContext) {
    return this.candidateAccountService.getBookmarks(user.userId);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getProfile(@CurrentUser() user: TenantContext) {
    return this.candidateAccountService.getProfile(user.userId);
  }
}
