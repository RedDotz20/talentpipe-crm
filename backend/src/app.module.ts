import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { CandidateAccountModule } from './modules/candidate-account/candidate-account.module';
import { JobPostingsModule } from './modules/job-postings/job-postings.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { SkillsModule } from './modules/skills/skills.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { PipelineStagesModule } from './modules/pipeline-stages/pipeline-stages.module';
import { PublicCareersModule } from './modules/public-careers/public-careers.module';
import { HealthModule } from './modules/health/health.module';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RolesGuard } from './common/guards/roles.guard';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { CacheModule } from './common/cache/cache.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { QueuesModule } from './queues/queues.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    CandidateAccountModule,
    JobPostingsModule,
    CandidatesModule,
    SkillsModule,
    ApplicationsModule,
    ResumesModule,
    PipelineStagesModule,
    PublicCareersModule,
    HealthModule,
    CacheModule,
    DashboardModule,
    QueuesModule,
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
