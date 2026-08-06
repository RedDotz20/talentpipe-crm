import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { AuditModule } from '../../common/audit/audit.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { OrgUsersController } from './org-users.controller';
import { OrgUsersService } from './org-users.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, AuditModule],
  controllers: [OrgController, OrgUsersController],
  providers: [OrgService, OrgUsersService],
})
export class OrgModule {}
