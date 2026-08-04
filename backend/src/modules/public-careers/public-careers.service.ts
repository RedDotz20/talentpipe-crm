import { Injectable, NotFoundException } from '@nestjs/common';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { TenantRepository } from '../../repositories/tenant.repository';

export interface PublicSkill {
  id: string;
  name: string;
  category: string | null;
}

export interface PublicJobListing {
  id: string;
  tenantId: string;
  tenantSlug: string;
  companyName: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicJobDetail extends PublicJobListing {
  requiredSkills: PublicSkill[];
}

@Injectable()
export class PublicCareersService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly indexRepo: JobListingsIndexRepository,
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly skillRepo: SkillRepository,
  ) {}

  async list(tenantSlug: string): Promise<PublicJobListing[]> {
    const tenant = await this.tenantRepo.findBySlug(tenantSlug);
    if (!tenant) throw new NotFoundException('Tenant not found');

    const rows = await this.indexRepo.findOpenByTenant(tenant.id);
    return rows.map((row) => this.toPublicListing(row, tenant.id, tenant.slug));
  }

  async getOne(tenantSlug: string, jobId: string): Promise<PublicJobDetail> {
    const tenant = await this.tenantRepo.findBySlug(tenantSlug);
    if (!tenant) throw new NotFoundException('Job posting not found');

    const indexed = await this.indexRepo.findOpenByTenantAndJob(
      tenant.id,
      jobId,
    );
    if (!indexed) throw new NotFoundException('Job posting not found');

    const schema = `tenant_${tenant.id}`;
    const posting = await this.jobPostingRepo.findById(jobId, schema);
    if (!posting || posting.status !== 'open') {
      throw new NotFoundException('Job posting not found');
    }

    const requiredSkillIds = await this.jobPostingRepo.getRequiredSkillIds(
      jobId,
      schema,
    );
    const skills = await this.skillRepo.findByIds(requiredSkillIds);

    return {
      ...this.toPublicListing(indexed, tenant.id, tenant.slug),
      requiredSkills: skills.map(({ id, name, category }) => ({
        id,
        name,
        category,
      })),
    };
  }

  private toPublicListing(
    row: Awaited<
      ReturnType<JobListingsIndexRepository['findOpenByTenant']>
    >[number],
    tenantId: string,
    tenantSlug: string,
  ): PublicJobListing {
    return {
      id: row.jobPostingId,
      tenantId,
      tenantSlug,
      companyName: row.companyName,
      title: row.title,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
