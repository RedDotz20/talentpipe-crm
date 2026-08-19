import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/common/auth/auth-core.module';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { ApplicationsModule } from '@/modules/applications/applications.module';
import { InterviewsController } from '@/modules/interviews/interviews.controller';
import { InterviewsService } from '@/modules/interviews/interviews.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, ApplicationsModule],
  controllers: [InterviewsController],
  providers: [InterviewsService],
})
export class InterviewsModule {}
