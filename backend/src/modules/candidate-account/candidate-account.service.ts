import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateBookmarkRepository } from '../../repositories/candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { UpdateProfileDto } from './dto/profile.dto';

@Injectable()
export class CandidateAccountService {
  constructor(
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly candidateBookmarkRepo: CandidateBookmarkRepository,
    private readonly candidateApplicationsIndexRepo: CandidateApplicationsIndexRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
    private readonly candidateRepo: CandidateRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
  ) {}

  async getJobs(search?: string) {
    return this.jobListingsIndexRepo.findAll(search);
  }

  async getJobDetail(tenantId: string, jobPostingId: string) {
    const job = await this.jobListingsIndexRepo.findById(
      tenantId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');
    return job;
  }

  async apply(
    candidateAccountId: string,
    tenantId: string,
    jobPostingId: string,
    phone?: string,
  ) {
    const job = await this.jobListingsIndexRepo.findById(
      tenantId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');

    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');

    const schemaName = `tenant_${tenantId}`;

    let candidate = await this.candidateRepo.findByEmail(
      account.email,
      schemaName,
    );
    if (!candidate) {
      candidate = await this.candidateRepo.create(
        {
          name: `${account.firstName} ${account.lastName}`,
          email: account.email,
          phone: phone || account.phone,
        },
        schemaName,
      );
    }

    const firstStage = await this.pipelineStageRepo.findFirst(schemaName);
    if (!firstStage) throw new NotFoundException('No pipeline stages configured');

    const application = await this.applicationRepo.create(
      {
        candidateId: candidate.id,
        jobPostingId,
        currentStageId: firstStage.id,
      },
      schemaName,
    );

    await this.candidateApplicationsIndexRepo.create({
      candidateAccountId,
      tenantId,
      jobPostingId,
      applicationId: application.id,
      jobTitle: job.title,
      companyName: job.companyName,
      status: firstStage.name,
    });

    return { applicationId: application.id };
  }

  async getApplications(candidateAccountId: string) {
    return this.candidateApplicationsIndexRepo.findByCandidate(
      candidateAccountId,
    );
  }

  async getBookmarks(candidateAccountId: string) {
    return this.candidateBookmarkRepo.findByCandidate(candidateAccountId);
  }

  async addBookmark(
    candidateAccountId: string,
    tenantId: string,
    jobPostingId: string,
  ) {
    const existing = await this.candidateBookmarkRepo.findByJob(
      candidateAccountId,
      tenantId,
      jobPostingId,
    );
    if (existing) return existing;

    const job = await this.jobListingsIndexRepo.findById(
      tenantId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');

    return this.candidateBookmarkRepo.create({
      candidateAccountId,
      tenantId,
      jobPostingId,
      jobTitle: job.title,
      companyName: job.companyName,
    });
  }

  async removeBookmark(candidateAccountId: string, bookmarkId: string) {
    await this.candidateBookmarkRepo.delete(bookmarkId, candidateAccountId);
  }

  async getProfile(candidateAccountId: string) {
    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');

    const { passwordHash, ...profile } = account;
    return { ...profile, role: 'Candidate' };
  }

  async updateProfile(
    candidateAccountId: string,
    _data: UpdateProfileDto,
  ) {
    return this.getProfile(candidateAccountId);
  }
}
