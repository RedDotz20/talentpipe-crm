import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { CandidateAccountModule } from './modules/candidate-account/candidate-account.module';
import { HealthModule } from './modules/health/health.module';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RolesGuard } from './common/guards/roles.guard';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    CandidateAccountModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('{*path}');
  }
}
