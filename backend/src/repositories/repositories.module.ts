import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { UserRepository } from './user.repository';
import { TenantRepository } from './tenant.repository';
import { RefreshTokenRepository } from './refresh-token.repository';
import { CandidateRepository } from './candidate.repository';
import { ApplicationRepository } from './application.repository';
import { PipelineStageRepository } from './pipeline-stage.repository';
import { SuperAdminRepository } from './super-admin.repository';
import { UserEmailRepository } from './user-email.repository';
import { CandidateAccountRepository } from './candidate-account.repository';
import { CandidateBookmarkRepository } from './candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from './candidate-applications-index.repository';
import { JobListingsIndexRepository } from './job-listings-index.repository';

const REPOSITORIES = [
  UserRepository,
  TenantRepository,
  RefreshTokenRepository,
  CandidateRepository,
  ApplicationRepository,
  PipelineStageRepository,
  SuperAdminRepository,
  UserEmailRepository,
  CandidateAccountRepository,
  CandidateBookmarkRepository,
  CandidateApplicationsIndexRepository,
  JobListingsIndexRepository,
];

@Module({
  imports: [DatabaseModule],
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoriesModule {}
