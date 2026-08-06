import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { AuditModule } from '../../common/audit/audit.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, AuditModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
