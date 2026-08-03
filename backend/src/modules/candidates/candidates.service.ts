import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ResumeRepository } from '../../repositories/resume.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { CandidateSkillRepository } from '../../repositories/candidate-skill.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { CreateCandidateDto } from './dto/create-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly candidateRepo: CandidateRepository,
    private readonly resumeRepo: ResumeRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly candidateSkillRepo: CandidateSkillRepository,
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly skillRepo: SkillRepository,
  ) {}

  list() {
    return this.candidateRepo.findAll();
  }

  async getOne(id: string) {
    const candidate = await this.candidateRepo.findById(id);
    if (!candidate) throw new NotFoundException('Candidate not found');

    const resume = await this.resumeRepo.findByCandidateId(id);
    const applications = await this.applicationRepo.findByCandidateId(id);

    let skills: { id: string; name: string; category: string | null }[] = [];

    if (candidate.email) {
      const account = await this.candidateAccountRepo.findByEmail(
        candidate.email,
      );
      if (account) {
        const skillIds = await this.candidateSkillRepo.findByCandidateAccountId(
          account.id,
        );
        if (skillIds.length > 0) {
          const allSkills = await this.skillRepo.findAll();
          const skillMap = new Map(allSkills.map((s) => [s.id, s]));
          skills = skillIds
            .map((sid) => skillMap.get(sid))
            .filter(
              (s): s is { id: string; name: string; category: string | null } =>
                s !== undefined,
            )
            .map((s) => ({ id: s.id, name: s.name, category: s.category }));
        }
      }
    }

    return {
      ...candidate,
      resume: resume
        ? {
            ...resume,
          }
        : null,
      skills,
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
