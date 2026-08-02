import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { StorageModule } from '../../common/storage/storage.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { SkillMatchingModule } from '../skill-matching/skill-matching.module';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';

@Module({
  imports: [
    AuthCoreModule,
    StorageModule,
    RepositoriesModule,
    SkillMatchingModule,
  ],
  controllers: [ResumesController],
  providers: [ResumesService],
})
export class ResumesModule {}
