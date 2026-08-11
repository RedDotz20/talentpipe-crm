import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicCareersService } from './public-careers.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';

@Controller('public/:companySlug/jobs')
export class PublicCareersController {
  constructor(private readonly service: PublicCareersService) {}

  @Get()
  list(
    @Param('companySlug') companySlug: string,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('employmentType') employmentType?: string,
    @Query('workSetup') workSetup?: string,
  ) {
    return this.service.list(companySlug, {
      ...query,
      employmentType,
      workSetup,
    });
  }

  @Get(':id')
  getOne(@Param('companySlug') companySlug: string, @Param('id') id: string) {
    return this.service.getOne(companySlug, id);
  }
}
