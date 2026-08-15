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
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyProfileService } from './company-profile.service';
import {
  UpdateCompanyProfileSchema,
  UpdateCompanyProfileDto,
} from './dto/update-profile.dto';

const INTERNAL_ROLES = [
  'CompanyAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
];

@Controller('company/profile')
@UseGuards(AuthGuard('jwt'))
@Roles(...INTERNAL_ROLES)
export class CompanyProfileController {
  constructor(private readonly profileService: CompanyProfileService) {}

  @Get()
  get() {
    return this.profileService.get();
  }

  @Put()
  update(
    @Body(new ZodValidationPipe(UpdateCompanyProfileSchema))
    dto: UpdateCompanyProfileDto,
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
