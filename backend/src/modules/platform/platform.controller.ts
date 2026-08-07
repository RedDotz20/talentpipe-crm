import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { PlatformService } from './platform.service';

@Controller('platform')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('tenants')
  listTenants() {
    return this.platformService.listTenants();
  }

  @Get('tenants/:id')
  getTenant(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.platformService.getTenant(id);
  }

  @Patch('tenants/:id/suspend')
  suspendTenant(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.platformService.setTenantStatus(id, 'suspended');
  }

  @Patch('tenants/:id/reactivate')
  reactivateTenant(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.platformService.setTenantStatus(id, 'active');
  }

  @Get('stats')
  getStats() {
    return this.platformService.getStats();
  }
}
