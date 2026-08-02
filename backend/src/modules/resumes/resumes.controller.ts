import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ResumesService } from './resumes.service';

const VIEW_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager'];
const EDIT_ROLES = ['OrgAdmin', 'Recruiter'];

@Controller('candidates/:candidateId/resume')
export class ResumesController {
  constructor(private readonly resumesService: ResumesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  get(@Param('candidateId') candidateId: string) {
    return this.resumesService.get(candidateId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  upload(
    @Param('candidateId') candidateId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.resumesService.upload(candidateId, file);
  }
}
