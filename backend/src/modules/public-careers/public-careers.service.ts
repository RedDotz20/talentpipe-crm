import { Injectable, NotFoundException } from '@nestjs/common';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { CompanyRepository } from '../../repositories/company.repository';
import type { ListQueryDto } from '../../common/dto/list-query.dto';

export interface PublicSkill {
  id: string;
  name: string;
  category: string | null;
}

export interface PublicJobListing {
  id: string;
  companyId: string;
  companySlug: string;
  companyName: string;
  title: string;
  description: string | null;
  employmentType: string | null;
  location: string | null;
  workSetup: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicJobDetail extends PublicJobListing {
  requiredSkills: PublicSkill[];
}

@Injectable()
export class PublicCareersService {
  constructor(
    private readonly tenantRepo: CompanyRepository,
    private readonly indexRepo: JobListingsIndexRepository,
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly skillRepo: SkillRepository,
  ) {}

  async list(
    companySlug: string,
    query: ListQueryDto & { employmentType?: string; workSetup?: string },
  ) {
    const tenant = await this.tenantRepo.findBySlug(companySlug);
    if (!tenant || tenant.status === 'suspended') {
      throw new NotFoundException('Company not found');
    }

    const result = await this.indexRepo.findOpenByCompany(tenant.id, query);
    return {
      ...result,
      data: result.data.map((row) => this.toPublicListing(row)),
    };
  }

  async listAll(
    query: ListQueryDto & { employmentType?: string; workSetup?: string },
  ) {
    const result = await this.indexRepo.findAll(query);
    return {
      ...result,
      data: result.data.map((row) => this.toPublicListing(row)),
    };
  }

  async getOne(companySlug: string, jobId: string): Promise<PublicJobDetail> {
    const tenant = await this.tenantRepo.findBySlug(companySlug);
    if (!tenant || tenant.status === 'suspended') {
      throw new NotFoundException('Job posting not found');
    }

    const indexed = await this.indexRepo.findOpenByCompanyAndJob(
      tenant.id,
      jobId,
    );
    if (!indexed) throw new NotFoundException('Job posting not found');

    const schema = `company_${tenant.id}`;
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
      ...this.toPublicListing(indexed),
      requiredSkills: skills.map(({ id, name, category }) => ({
        id,
        name,
        category,
      })),
    };
  }

  private toPublicListing(
    row: Awaited<
      ReturnType<JobListingsIndexRepository['findOpenByCompany']>
    >['data'][number],
  ): PublicJobListing {
    return {
      id: row.jobPostingId,
      companyId: row.companyId,
      companySlug: row.companySlug,
      companyName: row.companyName,
      title: row.title,
      description: row.description,
      employmentType: row.employmentType ?? null,
      location: row.location ?? null,
      workSetup: row.workSetup ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
