import { Module } from '@nestjs/common';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { SkillsController } from '@/modules/skills/skills.controller';
import { SkillsService } from '@/modules/skills/skills.service';

@Module({
  imports: [RepositoriesModule],
  controllers: [SkillsController],
  providers: [SkillsService],
})
export class SkillsModule {}
