import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '@/common/decorators/roles.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { PlatformPermissionsService } from '@/modules/platform/platform-permissions.service';
import {
  CreatePlatformPresetSchema,
  CreatePlatformPresetDto,
} from '@/modules/platform/dto/create-platform-preset.dto';
import {
  UpdatePlatformPresetSchema,
  UpdatePlatformPresetDto,
} from '@/modules/platform/dto/update-platform-preset.dto';
import {
  BulkDeletePresetsSchema,
  BulkDeletePresetsDto,
} from '@/modules/company/dto/bulk-delete-presets.dto';
import {
  BulkSetEnabledSchema,
  BulkSetEnabledDto,
} from '@/modules/company/dto/bulk-set-enabled.dto';

@Controller('platform/permissions')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformPermissionsController {
  constructor(
    private readonly permissionsService: PlatformPermissionsService,
  ) {}

  @Get()
  list() {
    return this.permissionsService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreatePlatformPresetSchema))
    dto: CreatePlatformPresetDto,
  ) {
    return this.permissionsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePlatformPresetSchema))
    dto: UpdatePlatformPresetDto,
  ) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.permissionsService.remove(id);
  }

  @Post('bulk-delete')
  bulkRemove(
    @Body(new ZodValidationPipe(BulkDeletePresetsSchema))
    dto: BulkDeletePresetsDto,
  ) {
    return this.permissionsService.bulkRemove(dto.ids);
  }

  @Patch(':id/disable')
  disable(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.permissionsService.disable(id);
  }

  @Patch(':id/enable')
  enable(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.permissionsService.enable(id);
  }

  @Post('bulk-status')
  bulkSetEnabled(
    @Body(new ZodValidationPipe(BulkSetEnabledSchema)) dto: BulkSetEnabledDto,
  ) {
    return this.permissionsService.bulkSetEnabled(dto.ids, dto.enabled);
  }
}
