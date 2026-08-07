import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CandidatesService } from './candidates.service';
import {
  CreateCandidateSchema,
  CreateCandidateDto,
} from './dto/create-candidate.dto';

const VIEW_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager'];
const EDIT_ROLES = ['OrgAdmin', 'Recruiter'];

@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  list() {
    return this.candidatesService.list();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  create(
    @Body(new ZodValidationPipe(CreateCandidateSchema)) dto: CreateCandidateDto,
  ) {
    return this.candidatesService.create(dto);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.candidatesService.getOne(id);
  }
}
