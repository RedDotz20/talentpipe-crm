import { Module } from '@nestjs/common';
import { CandidateAccountController } from './candidate-account.controller';
import { CandidateAccountService } from './candidate-account.service';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';
import { drizzleProvider } from '../../database/drizzle.provider';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateBookmarkRepository } from '../../repositories/candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';

@Module({
  controllers: [CandidateAccountController],
  providers: [
    CandidateAccountService,
    DrizzleSchemaService,
    drizzleProvider,
    CandidateAccountRepository,
    CandidateBookmarkRepository,
    CandidateApplicationsIndexRepository,
    JobListingsIndexRepository,
  ],
})
export class CandidateAccountModule {}
