import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantId } from '../../common/context/tenant-context';
import { TenantRepository } from '../../repositories/tenant.repository';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { UpdateOrgDto } from './dto/update-org.dto';

@Injectable()
export class OrgService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
  ) {}

  async getSettings() {
    const tenant = await this.tenantRepo.findById(getTenantId());
    if (!tenant) throw new NotFoundException('Tenant not found');
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
    };
  }

  async updateSettings(dto: UpdateOrgDto) {
    const tenant = await this.tenantRepo.updateName(getTenantId(), dto.name);
    if (!tenant) throw new NotFoundException('Tenant not found');
    await this.resyncListings(tenant);
    return { id: tenant.id, name: tenant.name };
  }

  private async resyncListings(tenant: {
    id: string;
    name: string;
    slug: string;
  }) {
    const postings = await this.jobPostingRepo.findAll();
    for (const posting of postings) {
      if (posting.status === 'draft') continue;
      await this.jobListingsIndexRepo.upsert({
        tenantId: tenant.id,
        jobPostingId: posting.id,
        title: posting.title,
        description: posting.description ?? '',
        companyName: tenant.name,
        companySlug: tenant.slug,
        status: posting.status,
      });
    }
  }
}
