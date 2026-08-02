import { Injectable } from '@nestjs/common';

@Injectable()
export class SkillMatchingService {
  computeScore(
    requiredSkillIds: string[],
    extractedSkillIds: string[],
  ): number {
    if (requiredSkillIds.length === 0) return 0;
    const required = new Set(requiredSkillIds);
    const matched = extractedSkillIds.filter((id) => required.has(id)).length;
    return matched / requiredSkillIds.length;
  }
}
