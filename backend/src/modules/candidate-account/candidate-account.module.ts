import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/common/auth/auth-core.module';
import { CacheModule } from '@/common/cache/cache.module';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { SkillMatchingModule } from '@/modules/skill-matching/skill-matching.module';
import { ResumesModule } from '@/modules/resumes/resumes.module';
import { AvatarsModule } from '@/modules/avatars/avatars.module';
import { CandidateAccountController } from '@/modules/candidate-account/candidate-account.controller';
import { CandidateAccountService } from '@/modules/candidate-account/candidate-account.service';

@Module({
  imports: [
    AuthCoreModule,
    CacheModule,
    RepositoriesModule,
    SkillMatchingModule,
    ResumesModule,
    AvatarsModule,
  ],
  controllers: [CandidateAccountController],
  providers: [CandidateAccountService],
})
export class CandidateAccountModule {}
