import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CompanyRepository } from '../../repositories/company.repository';
import { UserRepository } from '../../repositories/user.repository';
import { UsageRepository } from '../../repositories/usage.repository';
import { toCsv } from '../../common/csv.helper';
import type { ListQueryDto } from '../../common/dto/list-query.dto';

@Injectable()
export class PlatformService {
  constructor(
    private readonly tenantRepo: CompanyRepository,
    private readonly usageRepo: UsageRepository,
    private readonly userRepo: UserRepository,
    private readonly auditService: AuditService,
  ) {}

  async listCompanies(query: ListQueryDto & { status?: string }) {
    return this.tenantRepo.findPaginated(query);
  }

  async exportCompanies(query: ListQueryDto & { status?: string }) {
    const rows = await this.tenantRepo.findAllFiltered(query);
    return toCsv(['name', 'slug', 'plan', 'status', 'createdAt'], rows);
  }

  async getCompany(id: string) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new NotFoundException('Company not found');

    const schema = `company_${id}`;
    const [users, applications] = await Promise.all([
      this.usageRepo.countUsers(schema),
      this.usageRepo.countApplications(schema),
    ]);
    return { ...tenant, users, applications };
  }

  async setCompanyStatus(id: string, status: 'active' | 'suspended') {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new NotFoundException('Company not found');
    if (tenant.status === status) {
      throw new ConflictException(
        `Tenant is already ${status === 'active' ? 'active' : 'suspended'}`,
      );
    }

    const updated = await this.tenantRepo.updateStatus(id, status);
    await this.userRepo.setAllStatus(status, `company_${id}`);
    await this.auditService.log(
      status === 'suspended' ? 'company.suspend' : 'company.reactivate',
      id,
      { name: tenant.name, slug: tenant.slug },
      id,
    );
    return updated;
  }

  async getStats() {
    const companies = await this.tenantRepo.findAll();
    let totalUsers = 0;
    let totalApplications = 0;
    for (const tenant of companies) {
      const schema = `company_${tenant.id}`;
      const [users, applications] = await Promise.all([
        this.usageRepo.countUsers(schema),
        this.usageRepo.countApplications(schema),
      ]);
      totalUsers += users;
      totalApplications += applications;
    }
    return {
      companies: companies.length,
      users: totalUsers,
      applications: totalApplications,
    };
  }
}
