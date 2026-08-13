import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { RedisModule } from '../../common/redis/redis.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { CompanyProvisioningService } from './services/company-provisioning.service';
import { LoginRateLimiterGuard } from '../../common/middlewares/login-rate-limiter.guard';

@Module({
  imports: [AuthCoreModule, RepositoriesModule, RedisModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    CompanyProvisioningService,
    LoginRateLimiterGuard,
  ],
})
export class AuthModule {}
