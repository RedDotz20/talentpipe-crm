import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/common/auth/auth-core.module';
import { AuditModule } from '@/common/audit/audit.module';
import { AvatarsModule } from '@/common/avatars/avatars.module';
import { CacheModule } from '@/common/cache/cache.module';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { PlatformController } from '@/modules/platform/platform.controller';
import { PlatformProfileController } from '@/modules/platform/platform-profile.controller';
import { PlatformProfileService } from '@/modules/platform/platform-profile.service';
import { PlatformService } from '@/modules/platform/platform.service';
import { PlatformAccountsController } from '@/modules/platform/platform-accounts.controller';
import { PlatformAccountsService } from '@/modules/platform/platform-accounts.service';
import { PlatformDataController } from '@/modules/platform/platform-data.controller';
import { PlatformDataService } from '@/modules/platform/platform-data.service';
import { PlatformPermissionsController } from '@/modules/platform/platform-permissions.controller';
import { PlatformPermissionsService } from '@/modules/platform/platform-permissions.service';

@Module({
  imports: [
    AuthCoreModule,
    RepositoriesModule,
    AuditModule,
    CacheModule,
    AvatarsModule,
  ],
  controllers: [
    PlatformController,
    PlatformAccountsController,
    PlatformDataController,
    PlatformPermissionsController,
    PlatformProfileController,
  ],
  providers: [
    PlatformService,
    PlatformAccountsService,
    PlatformDataService,
    PlatformPermissionsService,
    PlatformProfileService,
  ],
})
export class PlatformModule {}
