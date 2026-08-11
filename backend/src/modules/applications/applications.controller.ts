import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyContext } from '../../common/context/company-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ListQuerySchema, ListQueryDto } from '../../common/dto/list-query.dto';
import { ApplicationsService } from './applications.service';
import { UpdateStageSchema, UpdateStageDto } from './dto/update-stage.dto';
import { CreateNoteSchema, CreateNoteDto } from './dto/create-note.dto';

const VIEW_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager'];

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  list(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('jobPostingId', new ParseUUIDPipe({ optional: true }))
    jobPostingId?: string,
    @Query('stageId', new ParseUUIDPipe({ optional: true })) stageId?: string,
  ) {
    return this.applicationsService.list({ jobPostingId, stageId }, query);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.applicationsService.getOne(id);
  }

  @Patch(':id/stage')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  updateStage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateStageSchema)) dto: UpdateStageDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.applicationsService.updateStage(id, dto, user.companyId);
  }

  @Post(':id/notes')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  addNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateNoteSchema)) dto: CreateNoteDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.applicationsService.addNote(user, id, dto);
  }

  @Get(':id/notes')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  listNotes(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.applicationsService.listNotes(id);
  }
}
