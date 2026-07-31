import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  getTenantId,
  TenantContext,
} from '../../common/context/tenant-context';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { CreateJobPostingDto } from './dto/create-job-posting.dto';
import { UpdateJobPostingDto } from './dto/update-job-posting.dto';

@Injectable()
export class JobPostingsService {
  constructor(
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly skillRepo: SkillRepository,
    private readonly tenantRepo: TenantRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
  ) {}

  list(status?: string) {
    return this.jobPostingRepo.findAll(status);
  }

  async getOne(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    const requiredSkillIds = await this.jobPostingRepo.getRequiredSkillIds(id);
    return { ...posting, requiredSkillIds };
  }

  async create(user: TenantContext, dto: CreateJobPostingDto) {
    if (dto.requiredSkillIds?.length) {
      await this.assertSkillsExist(dto.requiredSkillIds);
    }
    const posting = await this.jobPostingRepo.create({
      title: dto.title,
      description: dto.description,
      createdByUserId: user.userId,
    });
    if (dto.requiredSkillIds?.length) {
      await this.jobPostingRepo.setRequiredSkills(
        posting.id,
        dto.requiredSkillIds,
      );
    }
    return this.getOne(posting.id);
  }

  async update(id: string, dto: UpdateJobPostingDto) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (dto.requiredSkillIds) {
      await this.assertSkillsExist(dto.requiredSkillIds);
    }
    const patch: Partial<{
      title: string;
      description: string | null;
      status: string;
    }> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (Object.keys(patch).length > 0) {
      const updated = await this.jobPostingRepo.update(id, patch);
      if (posting.status !== 'draft' && updated) {
        await this.syncListing(updated);
      }
    }
    if (dto.requiredSkillIds) {
      await this.jobPostingRepo.setRequiredSkills(id, dto.requiredSkillIds);
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
    if (updated) await this.syncListing(updated);
    return this.getOne(id);
  }

  async close(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (posting.status === 'closed') return this.getOne(id);
    const updated = await this.jobPostingRepo.update(id, { status: 'closed' });
    if (updated) await this.syncListing(updated);
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
    const tenantId = getTenantId();
    await this.jobPostingRepo.delete(id);
    await this.jobListingsIndexRepo.delete(tenantId, id);
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
    status: string;
  }) {
    const tenantId = getTenantId();
    const tenant = await this.tenantRepo.findById(tenantId);
    await this.jobListingsIndexRepo.upsert({
      tenantId,
      jobPostingId: posting.id,
      title: posting.title,
      description: posting.description ?? '',
      companyName: tenant?.name ?? '',
      companySlug: tenant?.slug ?? '',
      status: posting.status,
    });
  }
}
