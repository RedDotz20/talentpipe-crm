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
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyPermissionsService } from './company-permissions.service';
import {
  CreatePermissionPresetSchema,
  CreatePermissionPresetDto,
} from './dto/create-permission-preset.dto';
import {
  UpdatePermissionPresetSchema,
  UpdatePermissionPresetDto,
} from './dto/update-permission-preset.dto';
import {
  BulkDeletePresetsSchema,
  BulkDeletePresetsDto,
} from './dto/bulk-delete-presets.dto';

@Controller('company/permissions')
@UseGuards(AuthGuard('jwt'))
@Roles('CompanyAdmin')
@Permissions('permissions.manage')
export class CompanyPermissionsController {
  constructor(private readonly permissionsService: CompanyPermissionsService) {}

  @Get()
  list() {
    return this.permissionsService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreatePermissionPresetSchema))
    dto: CreatePermissionPresetDto,
  ) {
    return this.permissionsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePermissionPresetSchema))
    dto: UpdatePermissionPresetDto,
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
}
