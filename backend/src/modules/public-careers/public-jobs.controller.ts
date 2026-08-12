import { Controller, Get, Query } from '@nestjs/common';
import { PublicCareersService } from './public-careers.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';

@Controller('public/jobs')
export class PublicJobsController {
  constructor(private readonly service: PublicCareersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('employmentType') employmentType?: string,
    @Query('workSetup') workSetup?: string,
  ) {
    return this.service.listAll({ ...query, employmentType, workSetup });
  }
}
