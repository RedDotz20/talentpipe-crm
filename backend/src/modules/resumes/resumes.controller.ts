import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ResumesService } from './resumes.service';

const VIEW_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager'];

@Controller('candidates/:candidateId/resume')
export class ResumesController {
  constructor(
    private readonly resumesService: ResumesService,
    private readonly candidateRepo: CandidateRepository,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  async get(@Param('candidateId') candidateId: string) {
    const candidate = await this.candidateRepo.findById(candidateId);
    if (!candidate?.candidateAccountId) {
      throw new NotFoundException('Candidate resume not found');
    }
    return this.resumesService.get(candidate.candidateAccountId);
  }
}
