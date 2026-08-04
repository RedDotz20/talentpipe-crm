import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { CandidateSkillRepository } from '../../repositories/candidate-skill.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { CacheService } from '../../common/cache/cache.service';
import { getTenantId } from '../../common/context/tenant-context';
import { CreateCandidateDto } from './dto/create-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly candidateRepo: CandidateRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly candidateSkillRepo: CandidateSkillRepository,
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly skillRepo: SkillRepository,
    private readonly cacheService: CacheService,
  ) {}

  list() {
    return this.candidateRepo.findAll();
  }

  async getOne(id: string) {
    const candidate = await this.candidateRepo.findById(id);
    if (!candidate) throw new NotFoundException('Candidate not found');

    const applications = await this.applicationRepo.findByCandidateId(id);

    let skills: { id: string; name: string; category: string | null }[] = [];
    let resume: { fileUrl: string | null; uploadedAt: Date | null } | null =
      null;

    if (candidate.candidateAccountId) {
      const account = await this.candidateAccountRepo.findById(
        candidate.candidateAccountId,
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
        resume = {
          fileUrl: account.resumeFileUrl ?? null,
          uploadedAt: account.resumeUploadedAt ?? null,
        };
      }
    } else if (candidate.email) {
      // Fallback for legacy candidates without UUID link
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
        resume = {
          fileUrl: account.resumeFileUrl ?? null,
          uploadedAt: account.resumeUploadedAt ?? null,
        };
      }
    }

    return {
      ...candidate,
      resume,
      skills,
      applications,
    };
  }

  async create(dto: CreateCandidateDto) {
    const candidate = await this.candidateRepo.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
    });
    if (candidate) {
      await this.cacheService.invalidateTenantDashboard(getTenantId());
    }
    return candidate;
  }
}
