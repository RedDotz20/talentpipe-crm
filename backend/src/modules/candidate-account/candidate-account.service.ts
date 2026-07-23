import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateBookmarkRepository } from '../../repositories/candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import {
  candidates,
  applications,
  pipelineStages,
} from '../../database/schema';

@Injectable()
export class CandidateAccountService {
  constructor(
    private readonly drizzleSchema: DrizzleSchemaService,
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly candidateBookmarkRepo: CandidateBookmarkRepository,
    private readonly candidateApplicationsIndexRepo: CandidateApplicationsIndexRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
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
    // 1. Check job exists and is open
    const job = await this.jobListingsIndexRepo.findById(
      tenantId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');

    // 2. Get candidate account info
    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate account not found');

    // 3-7. Switch to tenant schema, find/create candidate, create application
    let application: { id: string };
    let stageName: string;

    const { db, release } = await this.drizzleSchema.forSchema(
      `tenant_${tenantId}`,
    );
    try {
      // 4. Find or create candidates record by matching email
      let candidate = await db
        .select()
        .from(candidates)
        .where(eq(candidates.email, account.email))
        .execute()
        .then((rows) => rows[0] ?? null);

      if (!candidate) {
        const [newCandidate] = await db
          .insert(candidates)
          .values({
            name: `${account.firstName} ${account.lastName}`,
            email: account.email,
            phone: phone || account.phone,
          })
          .returning()
          .execute();
        candidate = newCandidate;
      }

      // 5. Get first pipeline stage (ordered by stage order)
      const [firstStage] = await db
        .select()
        .from(pipelineStages)
        .orderBy(pipelineStages.order)
        .limit(1)
        .execute();

      if (!firstStage) {
        throw new NotFoundException('No pipeline stages configured');
      }

      stageName = firstStage.name;

      // 6. Create applications record
      const [app] = await db
        .insert(applications)
        .values({
          candidateId: candidate.id,
          jobPostingId,
          currentStageId: firstStage.id,
        })
        .returning()
        .execute();
      application = app;
    } finally {
      // 7. Release tenant DB client
      release();
    }

    // 8. Create index entry in public schema
    await this.candidateApplicationsIndexRepo.create({
      candidateAccountId,
      tenantId,
      jobPostingId,
      applicationId: application.id,
      jobTitle: job.title,
      companyName: job.companyName,
      status: stageName,
    });

    // 9. Return applicationId
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
    // 1. Check if already bookmarked (idempotent)
    const existing = await this.candidateBookmarkRepo.findByJob(
      candidateAccountId,
      tenantId,
      jobPostingId,
    );
    if (existing) return existing;

    // 2. Get job details
    const job = await this.jobListingsIndexRepo.findById(
      tenantId,
      jobPostingId,
    );
    if (!job) throw new NotFoundException('Job posting not found');

    // 3. Create bookmark
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
    return profile;
  }

  async updateProfile(
    candidateAccountId: string,
    _data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
    },
  ) {
    // Stub — just return current profile for now
    return this.getProfile(candidateAccountId);
  }
}
