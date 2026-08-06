import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgService } from './org.service';
import { UpdateOrgDto, UpdateOrgSchema } from './dto/update-org.dto';

const INTERNAL_ROLES = [
  'OrgAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
];

@Controller('org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...INTERNAL_ROLES)
  getSettings() {
    return this.orgService.getSettings();
  }

  @Patch()
  @UseGuards(AuthGuard('jwt'))
  @Roles('OrgAdmin')
  updateSettings(
    @Body(new ZodValidationPipe(UpdateOrgSchema)) dto: UpdateOrgDto,
  ) {
    return this.orgService.updateSettings(dto);
  }
}
