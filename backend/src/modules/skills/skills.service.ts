import { Injectable } from '@nestjs/common';
import { SkillRepository } from '@/repositories/skill.repository';

@Injectable()
export class SkillsService {
  constructor(private readonly skillRepo: SkillRepository) {}

  search(query?: string) {
    return this.skillRepo.search(query);
  }
}
