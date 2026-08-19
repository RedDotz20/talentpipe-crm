import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/common/auth/auth-core.module';
import { CacheModule } from '@/common/cache/cache.module';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { PipelineStagesController } from '@/modules/pipeline-stages/pipeline-stages.controller';
import { PipelineStagesService } from '@/modules/pipeline-stages/pipeline-stages.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, CacheModule],
  controllers: [PipelineStagesController],
  providers: [PipelineStagesService],
})
export class PipelineStagesModule {}
