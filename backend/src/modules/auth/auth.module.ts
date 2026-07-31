import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { TenantProvisioningService } from './services/tenant-provisioning.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, TenantProvisioningService],
})
export class AuthModule {}
