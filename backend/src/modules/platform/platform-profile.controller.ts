import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '@/common/decorators/roles.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { PlatformProfileService } from '@/modules/platform/platform-profile.service';
import {
  UpdatePlatformProfileSchema,
  UpdatePlatformProfileDto,
} from '@/modules/platform/dto/update-profile.dto';

@Controller('platform/profile')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformProfileController {
  constructor(private readonly profileService: PlatformProfileService) {}

  @Get()
  get() {
    return this.profileService.get();
  }

  @Put()
  update(
    @Body(new ZodValidationPipe(UpdatePlatformProfileSchema))
    dto: UpdatePlatformProfileDto,
  ) {
    return this.profileService.update(dto);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    return this.profileService.uploadAvatar(file);
  }

  @Delete('avatar')
  removeAvatar() {
    return this.profileService.removeAvatar();
  }
}
