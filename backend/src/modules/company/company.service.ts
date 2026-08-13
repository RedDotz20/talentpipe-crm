import { Injectable, NotFoundException } from '@nestjs/common';
import { getCompanyId } from '../../common/context/company-context';
import { CompanyRepository } from '../../repositories/company.repository';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(
    private readonly tenantRepo: CompanyRepository,
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
  ) {}

  async getSettings() {
    const tenant = await this.tenantRepo.findById(getCompanyId());
    if (!tenant) throw new NotFoundException('Company not found');
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
    };
  }

  async updateSettings(dto: UpdateCompanyDto) {
    const tenant = await this.tenantRepo.updateName(getCompanyId(), dto.name);
    if (!tenant) throw new NotFoundException('Company not found');
    await this.resyncListings(tenant);
    return { id: tenant.id, name: tenant.name };
  }

  private async resyncListings(company: {
    id: string;
    name: string;
    slug: string;
  }) {
    const postings = await this.jobPostingRepo.findAll();
    for (const posting of postings) {
      if (posting.status === 'draft') continue;
      await this.jobListingsIndexRepo.upsert({
        companyId: company.id,
        jobPostingId: posting.id,
        title: posting.title,
        description: posting.description ?? '',
        employmentType: posting.employmentType ?? null,
        location: posting.location ?? null,
        workSetup: posting.workSetup ?? null,
        companyName: company.name,
        companySlug: company.slug,
        status: posting.status,
      });
    }
  }
}
