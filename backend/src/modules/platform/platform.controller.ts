import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';
import { PlatformService } from './platform.service';

@Controller('platform')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('companies')
  listCompanies(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('status') status?: string,
  ) {
    return this.platformService.listCompanies({ ...query, status });
  }

  @Get('companies/:id')
  getCompany(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.platformService.getCompany(id);
  }

  @Patch('companies/:id/suspend')
  suspendTenant(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.platformService.setCompanyStatus(id, 'suspended');
  }

  @Patch('companies/:id/reactivate')
  reactivateTenant(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.platformService.setCompanyStatus(id, 'active');
  }

  @Get('stats')
  getStats() {
    return this.platformService.getStats();
  }
}
