import { Controller, Get, Param } from '@nestjs/common';
import { PublicCareersService } from './public-careers.service';

@Controller('public/:tenantSlug/jobs')
export class PublicCareersController {
  constructor(private readonly service: PublicCareersService) {}

  @Get()
  list(@Param('tenantSlug') tenantSlug: string) {
    return this.service.list(tenantSlug);
  }

  @Get(':id')
  getOne(@Param('tenantSlug') tenantSlug: string, @Param('id') id: string) {
    return this.service.getOne(tenantSlug, id);
  }
}
