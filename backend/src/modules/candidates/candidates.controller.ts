import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { sendCsv } from '../../common/csv.helper';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';
import { CandidatesService } from './candidates.service';
import {
  CreateCandidateSchema,
  CreateCandidateDto,
} from './dto/create-candidate.dto';

const VIEW_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager'];
const EDIT_ROLES = ['CompanyAdmin', 'Recruiter'];

@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('candidates.view')
  list(@Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto) {
    return this.candidatesService.list(query);
  }

  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('candidates.view')
  @SkipEnvelope()
  async exportCsv(
    @Res() res: Response,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  ) {
    const csv = await this.candidatesService.exportCsv(query);
    sendCsv(res, csv, 'candidates');
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  @Permissions('candidates.manage')
  create(
    @Body(new ZodValidationPipe(CreateCandidateSchema)) dto: CreateCandidateDto,
  ) {
    return this.candidatesService.create(dto);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('candidates.view')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.candidatesService.getOne(id);
  }
}
