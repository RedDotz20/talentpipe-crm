import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/common/auth/auth-core.module';
import { AuditModule } from '@/common/audit/audit.module';
import { AvatarsModule } from '@/modules/avatars/avatars.module';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { CompanyController } from '@/modules/company/company.controller';
import { CompanyService } from '@/modules/company/company.service';
import { CompanyProfileController } from '@/modules/company/company-profile.controller';
import { CompanyProfileService } from '@/modules/company/company-profile.service';
import { CompanyUsersController } from '@/modules/company/company-users.controller';
import { CompanyUsersService } from '@/modules/company/company-users.service';
import { CompanyPermissionsController } from '@/modules/company/company-permissions.controller';
import { CompanyPermissionsService } from '@/modules/company/company-permissions.service';

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
