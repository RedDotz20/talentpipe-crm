import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { AuditModule } from '../../common/audit/audit.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyUsersController } from './company-users.controller';
import { CompanyUsersService } from './company-users.service';
import { CompanyPermissionsController } from './company-permissions.controller';
import { CompanyPermissionsService } from './company-permissions.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, AuditModule],
  controllers: [
    CompanyController,
    CompanyUsersController,
    CompanyPermissionsController,
  ],
  providers: [CompanyService, CompanyUsersService, CompanyPermissionsService],
})
export class CompanyModule {}
