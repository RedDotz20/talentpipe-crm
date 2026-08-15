import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { AuditModule } from '../../common/audit/audit.module';
import { AvatarsModule } from '../../common/avatars/avatars.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';
import { CompanyUsersController } from './company-users.controller';
import { CompanyUsersService } from './company-users.service';
import { CompanyPermissionsController } from './company-permissions.controller';
import { CompanyPermissionsService } from './company-permissions.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, AuditModule, AvatarsModule],
  controllers: [
    CompanyController,
    CompanyUsersController,
    CompanyPermissionsController,
    CompanyProfileController,
  ],
  providers: [
    CompanyService,
    CompanyUsersService,
    CompanyPermissionsService,
    CompanyProfileService,
  ],
})
export class CompanyModule {}
