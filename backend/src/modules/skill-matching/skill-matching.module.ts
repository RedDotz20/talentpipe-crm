import { Module } from '@nestjs/common';
import { SkillMatchingService } from './skill-matching.service';

@Module({
  providers: [SkillMatchingService],
  exports: [SkillMatchingService],
})
export class SkillMatchingModule {}
