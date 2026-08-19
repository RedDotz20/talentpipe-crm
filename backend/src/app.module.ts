import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@/modules/auth/auth.module';
import { CandidateAccountModule } from '@/modules/candidate-account/candidate-account.module';
import { JobPostingsModule } from '@/modules/job-postings/job-postings.module';
import { CandidatesModule } from '@/modules/candidates/candidates.module';
import { SkillsModule } from '@/modules/skills/skills.module';
import { ApplicationsModule } from '@/modules/applications/applications.module';
import { ResumesModule } from '@/modules/resumes/resumes.module';
import { PipelineStagesModule } from '@/modules/pipeline-stages/pipeline-stages.module';
import { PublicCareersModule } from '@/modules/public-careers/public-careers.module';
import { HealthModule } from '@/modules/health/health.module';
import { CompanyContextInterceptor } from '@/common/interceptors/company-context.interceptor';
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor';
import { RolesGuard } from '@/common/guards/roles.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { ApiExceptionFilter } from '@/common/filters/api-exception.filter';
import { LoggerMiddleware } from '@/common/middlewares/logger.middleware';
import { CacheModule } from '@/common/cache/cache.module';
import { AvatarsModule } from '@/modules/avatars/avatars.module';
import { DashboardModule } from '@/modules/dashboard/dashboard.module';
import { QueuesModule } from '@/queues/queues.module';
import { InterviewsModule } from '@/modules/interviews/interviews.module';
import { CompanyModule } from '@/modules/company/company.module';
import { PlatformModule } from '@/modules/platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RepositoriesModule,
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
    AvatarsModule,
    DashboardModule,
    QueuesModule,
    InterviewsModule,
    CompanyModule,
    PlatformModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CompanyContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('{*path}');
  }
}
