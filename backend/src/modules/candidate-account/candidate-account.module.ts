import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { SkillMatchingModule } from '../skill-matching/skill-matching.module';
import { CandidateAccountController } from './candidate-account.controller';
import { CandidateAccountService } from './candidate-account.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, SkillMatchingModule],
  controllers: [CandidateAccountController],
  providers: [CandidateAccountService],
})
export class CandidateAccountModule {}
