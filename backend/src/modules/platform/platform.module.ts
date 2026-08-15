import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { AuditModule } from '../../common/audit/audit.module';
import { AvatarsModule } from '../../common/avatars/avatars.module';
import { CacheModule } from '../../common/cache/cache.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { PlatformController } from './platform.controller';
import { PlatformProfileController } from './platform-profile.controller';
import { PlatformProfileService } from './platform-profile.service';
import { PlatformService } from './platform.service';
import { PlatformAccountsController } from './platform-accounts.controller';
import { PlatformAccountsService } from './platform-accounts.service';
import { PlatformDataController } from './platform-data.controller';
import { PlatformDataService } from './platform-data.service';
import { PlatformPermissionsController } from './platform-permissions.controller';
import { PlatformPermissionsService } from './platform-permissions.service';

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
