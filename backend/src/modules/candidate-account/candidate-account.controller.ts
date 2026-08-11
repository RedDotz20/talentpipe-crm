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
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';
import { CompanyContext } from '../../common/context/company-context';
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
  async listJobs(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('employmentType') employmentType?: string,
    @Query('workSetup') workSetup?: string,
  ) {
    return this.candidateAccountService.getJobs({
      ...query,
      employmentType,
      workSetup,
    });
  }

  @Get('jobs/:companyId/:jobId')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getJobDetail(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.getAppliedJobDetail(
      user.userId,
      companyId,
      jobId,
    );
  }

  @Post('jobs/:companyId/:jobId/apply')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async apply(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body(new ZodValidationPipe(ApplyJobSchema)) body: ApplyJobDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.apply(user.userId, companyId, jobId, {
      phone: body.phone,
      skillIds: body.skillIds,
      coverLetter: body.coverLetter,
    });
  }

  @Get('applications')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getApplications(@CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.getApplications(user.userId);
  }

  @Get('applications/:id')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getApplicationDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.getApplicationDetail(user.userId, id);
  }

  @Delete('applications/:id')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async withdrawApplication(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.withdraw(user.userId, id);
  }

  @Get('skills')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getSkills(@CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.getSkills(user.userId);
  }

  @Put('skills')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async setSkills(
    @Body(new ZodValidationPipe(SetCandidateSkillsSchema))
    body: SetCandidateSkillsDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.setSkills(user.userId, body.skillIds);
  }

  @Post('bookmarks')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async addBookmark(
    @Body(new ZodValidationPipe(BookmarkJobSchema)) body: BookmarkJobDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.addBookmark(
      user.userId,
      body.companyId,
      body.jobPostingId,
    );
  }

  @Delete('bookmarks/:id')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async removeBookmark(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.removeBookmark(user.userId, id);
  }

  @Get('bookmarks')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getBookmarks(@CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.getBookmarks(user.userId);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getProfile(@CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.getProfile(user.userId);
  }

  @Put('profile')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async updateProfile(
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileDto,
    @CurrentUser() user: CompanyContext,
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
    @CurrentUser() user: CompanyContext,
  ) {
    return this.candidateAccountService.uploadResumeFile(user.userId, file);
  }

  @Delete('resume')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async removeResume(@CurrentUser() user: CompanyContext) {
    return this.candidateAccountService.removeResume(user.userId);
  }
}
