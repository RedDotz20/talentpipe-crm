import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  getCompanyId,
  CompanyContext,
} from '../../common/context/company-context';
import { CacheService } from '../../common/cache/cache.service';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { CompanyRepository } from '../../repositories/company.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { toCsv } from '../../common/csv.helper';
import { CreateJobPostingDto } from './dto/create-job-posting.dto';
import { UpdateJobPostingDto } from './dto/update-job-posting.dto';
import type { ListQueryDto } from '../../common/dto/list-query.dto';

@Injectable()
export class JobPostingsService {
  constructor(
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly skillRepo: SkillRepository,
    private readonly tenantRepo: CompanyRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly cacheService: CacheService,
  ) {}

  list(status: string | undefined, query: ListQueryDto) {
    return this.jobPostingRepo.findPaginated({ ...query, status });
  }

  async exportCsv(status: string | undefined, query: ListQueryDto) {
    const rows = await this.jobPostingRepo.findAllFiltered({
      ...query,
      status,
    });
    return toCsv(['title', 'status', 'createdAt'], rows);
  }

  async getOne(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    const requiredSkillIds = await this.jobPostingRepo.getRequiredSkillIds(id);
    return { ...posting, requiredSkillIds };
  }

  async create(user: CompanyContext, dto: CreateJobPostingDto) {
    if (dto.requiredSkillIds?.length) {
      await this.assertSkillsExist(dto.requiredSkillIds);
    }
    const posting = await this.jobPostingRepo.create({
      title: dto.title,
      description: dto.description,
      employmentType: dto.employmentType,
      location: dto.location,
      workSetup: dto.workSetup,
      createdByUserId: user.userId,
    });
    if (dto.requiredSkillIds?.length) {
      await this.jobPostingRepo.setRequiredSkills(
        posting.id,
        dto.requiredSkillIds,
      );
    }
    await this.cacheService.invalidateCompanyDashboard(getCompanyId());
    return this.getOne(posting.id);
  }

  async update(id: string, dto: UpdateJobPostingDto) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (dto.requiredSkillIds) {
      await this.assertSkillsExist(dto.requiredSkillIds);
    }
    let didWrite = false;
    const patch: Partial<{
      title: string;
      description: string | null;
      employmentType: string;
      location: string;
      workSetup: string;
      status: string;
    }> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.employmentType !== undefined)
      patch.employmentType = dto.employmentType;
    if (dto.location !== undefined) patch.location = dto.location;
    if (dto.workSetup !== undefined) patch.workSetup = dto.workSetup;
    if (Object.keys(patch).length > 0) {
      const updated = await this.jobPostingRepo.update(id, patch);
      if (updated) {
        didWrite = true;
      }
      if (posting.status !== 'draft' && updated) {
        await this.syncListing(updated);
      }
    }
    if (dto.requiredSkillIds) {
      await this.jobPostingRepo.setRequiredSkills(id, dto.requiredSkillIds);
      didWrite = true;
    }
    if (didWrite) {
      await this.cacheService.invalidateCompanyDashboard(getCompanyId());
    }
    return this.getOne(id);
  }

  async publish(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (posting.status !== 'draft') {
      throw new ConflictException('Only draft postings can be published');
    }
    const updated = await this.jobPostingRepo.update(id, { status: 'open' });
    if (updated) {
      await this.syncListing(updated);
      await this.cacheService.invalidateCompanyDashboard(getCompanyId());
    }
    return this.getOne(id);
  }

  async close(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (posting.status === 'closed') return this.getOne(id);
    const updated = await this.jobPostingRepo.update(id, { status: 'closed' });
    if (updated) {
      await this.syncListing(updated);
      await this.cacheService.invalidateCompanyDashboard(getCompanyId());
    }
    return this.getOne(id);
  }

  async remove(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (posting.status === 'open') {
      throw new ConflictException(
        'Open postings must be closed before deletion',
      );
    }
    const applicationCount = await this.applicationRepo.countByJobPosting(id);
    if (applicationCount > 0) {
      throw new ConflictException(
        'Cannot delete a job posting that has applications',
      );
    }
    const companyId = getCompanyId();
    await this.jobPostingRepo.delete(id);
    await this.jobListingsIndexRepo.delete(companyId, id);
    await this.cacheService.invalidateCompanyDashboard(companyId);
  }

  private async assertSkillsExist(skillIds: string[]) {
    const found = await this.skillRepo.findByIds(skillIds);
    if (found.length !== skillIds.length) {
      throw new NotFoundException('One or more skills do not exist');
    }
  }

  private async syncListing(posting: {
    id: string;
    title: string;
    description: string | null;
    employmentType: string | null;
    location: string | null;
    workSetup: string | null;
    status: string;
  }) {
    const companyId = getCompanyId();
    const tenant = await this.tenantRepo.findById(companyId);
    await this.jobListingsIndexRepo.upsert({
      companyId,
      jobPostingId: posting.id,
      title: posting.title,
      description: posting.description ?? '',
      employmentType: posting.employmentType,
      location: posting.location,
      workSetup: posting.workSetup,
      companyName: tenant?.name ?? '',
      companySlug: tenant?.slug ?? '',
      status: posting.status,
    });
  }
}
