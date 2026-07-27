import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CandidateAuthGuard } from '../../shared/candidate-auth.guard';
import { CandidateAccountService } from './candidate-account.service';
import {
  BookmarkJobSchema,
  UpdateProfileSchema,
} from './dto/candidate-apply.dto';
import { getCurrentUser } from '../../interceptors/tenant-context';

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
    @Body() body: { phone?: string },
  ) {
    const { userId } = getCurrentUser();
    return this.candidateAccountService.apply(
      userId,
      tenantId,
      jobId,
      body.phone,
    );
  }

  @Get('applications')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getApplications() {
    const { userId } = getCurrentUser();
    return this.candidateAccountService.getApplications(userId);
  }

  @Post('bookmarks')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async addBookmark(@Body() body: unknown) {
    const { tenantId, jobPostingId } = BookmarkJobSchema.parse(body);
    const { userId } = getCurrentUser();
    return this.candidateAccountService.addBookmark(
      userId,
      tenantId,
      jobPostingId,
    );
  }

  @Delete('bookmarks/:id')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async removeBookmark(@Param('id') id: string) {
    const { userId } = getCurrentUser();
    return this.candidateAccountService.removeBookmark(userId, id);
  }

  @Get('bookmarks')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getBookmarks() {
    const { userId } = getCurrentUser();
    return this.candidateAccountService.getBookmarks(userId);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'), CandidateAuthGuard)
  async getProfile() {
    const { userId } = getCurrentUser();
    return this.candidateAccountService.getProfile(userId);
  }
}
