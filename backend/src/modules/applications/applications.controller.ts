import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantContext } from '../../common/context/tenant-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApplicationsService } from './applications.service';
import { UpdateStageSchema, UpdateStageDto } from './dto/update-stage.dto';
import { CreateNoteSchema, CreateNoteDto } from './dto/create-note.dto';

const VIEW_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager'];

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  list(
    @Query('jobPostingId') jobPostingId?: string,
    @Query('stageId') stageId?: string,
  ) {
    return this.applicationsService.list({ jobPostingId, stageId });
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  getOne(@Param('id') id: string) {
    return this.applicationsService.getOne(id);
  }

  @Patch(':id/stage')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  updateStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStageSchema)) dto: UpdateStageDto,
    @CurrentUser() user: TenantContext,
  ) {
    return this.applicationsService.updateStage(id, dto, user.tenantId);
  }

  @Post(':id/notes')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  addNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateNoteSchema)) dto: CreateNoteDto,
    @CurrentUser() user: TenantContext,
  ) {
    return this.applicationsService.addNote(user, id, dto);
  }

  @Get(':id/notes')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  listNotes(@Param('id') id: string) {
    return this.applicationsService.listNotes(id);
  }
}
