import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ResumeRepository } from '../../repositories/resume.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { CreateCandidateDto } from './dto/create-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly candidateRepo: CandidateRepository,
    private readonly resumeRepo: ResumeRepository,
    private readonly applicationRepo: ApplicationRepository,
  ) {}

  list() {
    return this.candidateRepo.findAll();
  }

  async getOne(id: string) {
    const candidate = await this.candidateRepo.findById(id);
    if (!candidate) throw new NotFoundException('Candidate not found');

    const resume = await this.resumeRepo.findByCandidateId(id);
    const applications = await this.applicationRepo.findByCandidateId(id);

    return {
      ...candidate,
      resume: resume
        ? {
            ...resume,
            skills: resume
              ? await this.resumeRepo.findSkillsByResumeId(resume.id)
              : [],
          }
        : null,
      applications,
    };
  }

  create(dto: CreateCandidateDto) {
    return this.candidateRepo.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
    });
  }
}
