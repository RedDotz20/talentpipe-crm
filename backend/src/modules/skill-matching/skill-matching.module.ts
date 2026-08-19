import { Module } from '@nestjs/common';
import { SkillMatchingService } from '@/modules/skill-matching/skill-matching.service';

@Module({
  providers: [SkillMatchingService],
  exports: [SkillMatchingService],
})
export class SkillMatchingModule {}
