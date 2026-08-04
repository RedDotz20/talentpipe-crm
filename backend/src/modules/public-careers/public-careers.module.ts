import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { PublicCareersController } from './public-careers.controller';
import { PublicCareersService } from './public-careers.service';

@Module({
  imports: [RepositoriesModule],
  controllers: [PublicCareersController],
  providers: [PublicCareersService],
})
export class PublicCareersModule {}
