import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { UserRepository } from '@/repositories/user.repository';
import { CompanyRepository } from '@/repositories/company.repository';
import { RefreshTokenRepository } from '@/repositories/refresh-token.repository';
import { CandidateRepository } from '@/repositories/candidate.repository';
import { ApplicationRepository } from '@/repositories/application.repository';
import { PipelineStageRepository } from '@/repositories/pipeline-stage.repository';
import { SuperAdminRepository } from '@/repositories/super-admin.repository';
import { UserEmailRepository } from '@/repositories/user-email.repository';
import { CandidateAccountRepository } from '@/repositories/candidate-account.repository';
import { CandidateBookmarkRepository } from '@/repositories/candidate-bookmark.repository';
import { CandidateApplicationsIndexRepository } from '@/repositories/candidate-applications-index.repository';
import { JobListingsIndexRepository } from '@/repositories/job-listings-index.repository';
import { JobPostingRepository } from '@/repositories/job-posting.repository';
import { SkillRepository } from '@/repositories/skill.repository';
import { NoteRepository } from '@/repositories/note.repository';
import { CandidateSkillRepository } from '@/repositories/candidate-skill.repository';
import { DashboardRepository } from '@/repositories/dashboard.repository';
import { AuditLogRepository } from '@/repositories/audit-log.repository';
import { InterviewRepository } from '@/repositories/interview.repository';
import { InterviewFeedbackRepository } from '@/repositories/interview-feedback.repository';
import { UsageRepository } from '@/repositories/usage.repository';
import { PermissionRepository } from '@/repositories/permission.repository';

const REPOSITORIES = [
  UserRepository,
  CompanyRepository,
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
  JobPostingRepository,
  SkillRepository,
  NoteRepository,
  CandidateSkillRepository,
  DashboardRepository,
  AuditLogRepository,
  InterviewRepository,
  InterviewFeedbackRepository,
  UsageRepository,
  PermissionRepository,
];

@Module({
  imports: [DatabaseModule],
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoriesModule {}
