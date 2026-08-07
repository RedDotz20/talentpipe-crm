import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import {
  UpdateProfileSchema,
  UpdateProfileDto,
} from './dto/profile-update.dto';

@Controller('candidate')
export class CandidateAccountController {
  constructor(
    private readonly candidateAccountService: CandidateAccountService,
  ) {}

  @Get('jobs')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async listJobs(@Query('search') search?: string) {
    return this.candidateAccountService.getJobs(search);
  }

  @Get('jobs/:tenantId/:jobId')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getJobDetail(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
  ) {
    return this.candidateAccountService.getJobDetail(tenantId, jobId);
  }

  @Post('jobs/:tenantId/:jobId/apply')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async apply(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body(new ZodValidationPipe(ApplyJobSchema)) body: ApplyJobDto,
    @CurrentUser() user: TenantContext,
  ) {
    return this.candidateAccountService.apply(user.userId, tenantId, jobId, {
      phone: body.phone,
      skillIds: body.skillIds,
      coverLetter: body.coverLetter,
    });
  }

  @Get('applications')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getApplications(@CurrentUser() user: TenantContext) {
    return this.candidateAccountService.getApplications(user.userId);
  }

  @Get('applications/:id')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getApplicationDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: TenantContext,
  ) {
    return this.candidateAccountService.getApplicationDetail(user.userId, id);
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
    @Param('id', new ParseUUIDPipe()) id: string,
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

  @Put('profile')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async updateProfile(
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileDto,
    @CurrentUser() user: TenantContext,
  ) {
    return this.candidateAccountService.updateProfile(user.userId, body);
  }

  @Post('resume')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadResume(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: TenantContext,
  ) {
    return this.candidateAccountService.uploadResumeFile(user.userId, file);
  }

  @Delete('resume')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async removeResume(@CurrentUser() user: TenantContext) {
    return this.candidateAccountService.removeResume(user.userId);
  }
}
