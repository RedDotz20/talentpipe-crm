import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { ApplicationsModule } from '../applications/applications.module';
import { InterviewsController } from './interviews.controller';
import { OrgUsersController } from './org-users.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, ApplicationsModule],
  controllers: [InterviewsController, OrgUsersController],
  providers: [InterviewsService],
})
export class InterviewsModule {}
