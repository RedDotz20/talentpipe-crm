import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/common/auth/auth-core.module';
import { StorageModule } from '@/common/storage/storage.module';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { ResumesController } from '@/modules/resumes/resumes.controller';
import { ResumesService } from '@/modules/resumes/resumes.service';

@Module({
  imports: [AuthCoreModule, StorageModule, RepositoriesModule],
  controllers: [ResumesController],
  providers: [ResumesService],
  exports: [ResumesService],
})
export class ResumesModule {}
