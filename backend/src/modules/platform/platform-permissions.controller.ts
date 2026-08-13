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
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformPermissionsService } from './platform-permissions.service';
import {
  CreatePlatformPresetSchema,
  CreatePlatformPresetDto,
} from './dto/create-platform-preset.dto';
import {
  UpdatePlatformPresetSchema,
  UpdatePlatformPresetDto,
} from './dto/update-platform-preset.dto';

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
}
