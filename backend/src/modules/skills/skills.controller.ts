import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkillsService } from '@/modules/skills/skills.service';

@Controller('skills')
@UseGuards(AuthGuard('jwt'))
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  search(@Query('search') search?: string) {
    return this.skillsService.search(search);
  }
}
