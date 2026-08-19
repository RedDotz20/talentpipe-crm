import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/common/auth/auth-core.module';
import { CacheModule } from '@/common/cache/cache.module';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { JobPostingsController } from '@/modules/job-postings/job-postings.controller';
import { JobPostingsService } from '@/modules/job-postings/job-postings.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, CacheModule],
  controllers: [JobPostingsController],
  providers: [JobPostingsService],
})
export class JobPostingsModule {}
