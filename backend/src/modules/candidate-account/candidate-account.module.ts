import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { CacheModule } from '../../common/cache/cache.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { SkillMatchingModule } from '../skill-matching/skill-matching.module';
import { ResumesModule } from '../resumes/resumes.module';
import { CandidateAccountController } from './candidate-account.controller';
import { CandidateAccountService } from './candidate-account.service';

@Module({
  imports: [
    AuthCoreModule,
    CacheModule,
    RepositoriesModule,
    SkillMatchingModule,
    ResumesModule,
  ],
  controllers: [CandidateAccountController],
  providers: [CandidateAccountService],
})
export class CandidateAccountModule {}
