import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

const INTERNAL_ROLES = [
  'CompanyAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...INTERNAL_ROLES)
  getSummary() {
    return this.dashboardService.getSummary();
  }
}
