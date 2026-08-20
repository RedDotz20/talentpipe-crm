import { Module } from '@nestjs/common';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { PublicCareersController } from '@/modules/public-careers/public-careers.controller';
import { PublicJobsController } from '@/modules/public-careers/public-jobs.controller';
import { PublicCareersService } from '@/modules/public-careers/public-careers.service';

@Module({
  imports: [RepositoriesModule],
  controllers: [PublicCareersController, PublicJobsController],
  providers: [PublicCareersService],
})
export class PublicCareersModule {}
