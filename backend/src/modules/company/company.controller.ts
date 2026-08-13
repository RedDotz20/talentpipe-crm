import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyService } from './company.service';
import {
  UpdateCompanyDto,
  UpdateCompanySchema,
} from './dto/update-company.dto';

const INTERNAL_ROLES = [
  'CompanyAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
];

@Controller('company')
export class CompanyController {
  constructor(private readonly orgService: CompanyService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...INTERNAL_ROLES)
  getSettings() {
    return this.orgService.getSettings();
  }

  @Patch()
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  @Permissions('settings.manage')
  updateSettings(
    @Body(new ZodValidationPipe(UpdateCompanySchema)) dto: UpdateCompanyDto,
  ) {
    return this.orgService.updateSettings(dto);
  }
}
