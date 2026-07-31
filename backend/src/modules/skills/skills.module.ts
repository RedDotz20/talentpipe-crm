import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  imports: [RepositoriesModule],
  controllers: [SkillsController],
  providers: [SkillsService],
})
export class SkillsModule {}
