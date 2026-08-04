import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { CacheModule } from '../../common/cache/cache.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, CacheModule],
  controllers: [CandidatesController],
  providers: [CandidatesService],
})
export class CandidatesModule {}
