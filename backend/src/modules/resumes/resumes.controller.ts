import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SkipEnvelope } from '@/common/decorators/skip-envelope.decorator';
import { CandidateRepository } from '@/repositories/candidate.repository';
import { ResumesService } from '@/modules/resumes/resumes.service';

const VIEW_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager'];

@Controller('candidates/:candidateId/resume')
export class ResumesController {
  constructor(
    private readonly resumesService: ResumesService,
    private readonly candidateRepo: CandidateRepository,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('candidates.view')
  async get(@Param('candidateId', new ParseUUIDPipe()) candidateId: string) {
    const candidate = await this.candidateRepo.findById(candidateId);
    if (!candidate?.candidateAccountId) {
      throw new NotFoundException('Candidate resume not found');
    }
    return this.resumesService.get(candidate.candidateAccountId);
  }

  @Get('file')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  @Permissions('candidates.view')
  @SkipEnvelope()
  async downloadFile(
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @Res() res: Response,
  ) {
    const candidate = await this.candidateRepo.findById(candidateId);
    if (!candidate?.candidateAccountId) {
      throw new NotFoundException('Candidate resume not found');
    }
    const file = await this.resumesService.getFile(
      candidate.candidateAccountId,
    );
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    res.send(file.buffer);
  }
}
