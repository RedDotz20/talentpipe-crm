import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { PublicCareersController } from './public-careers.controller';
import { PublicJobsController } from './public-jobs.controller';
import { PublicCareersService } from './public-careers.service';

@Module({
  imports: [RepositoriesModule],
  controllers: [PublicCareersController, PublicJobsController],
  providers: [PublicCareersService],
})
export class PublicCareersModule {}
