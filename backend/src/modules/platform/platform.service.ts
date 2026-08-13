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

  async getDashboard() {
    const tenants = await this.tenantRepo.findAll();

    const [overTime, perCompany] = await Promise.all([
      this.tenantRepo.findCompaniesOverTime(),
      this.collectPerCompany(tenants),
    ]);

    const totalApplications = perCompany.reduce(
      (sum, tenant) => sum + tenant.applications,
      0,
    );
    const totalUsers = perCompany.reduce(
      (sum, tenant) => sum + tenant.users,
      0,
    );
    const totalJobs = perCompany.reduce(
      (sum, tenant) => sum + tenant.totalJobs,
      0,
    );
    const activeCompanies = tenants.filter(
      (tenant) => tenant.status === 'active',
    ).length;

    return {
      companies: tenants.length,
      activeCompanies,
      suspendedCompanies: tenants.length - activeCompanies,
      users: totalUsers,
      applications: totalApplications,
      jobs: totalJobs,
      companiesOverTime: overTime,
      applicationsPerCompany: perCompany
        .filter((tenant) => tenant.applications > 0)
        .sort((a, b) => b.applications - a.applications)
        .slice(0, 10)
        .map((tenant) => ({
          companyName: tenant.name,
          count: tenant.applications,
        })),
      usersPerCompany: perCompany
        .sort((a, b) => b.users - a.users)
        .slice(0, 10)
        .map((tenant) => ({ companyName: tenant.name, count: tenant.users })),
      jobsByStatusPerCompany: perCompany
        .sort((a, b) => b.totalJobs - a.totalJobs)
        .slice(0, 10)
        .map((tenant) => ({
          companyName: tenant.name,
          draft: tenant.jobsByStatus.draft ?? 0,
          open: tenant.jobsByStatus.open ?? 0,
          closed: tenant.jobsByStatus.closed ?? 0,
        })),
    };
  }

  private async collectPerCompany(
    tenants: Awaited<ReturnType<CompanyRepository['findAll']>>,
  ) {
    const rows: Array<{
      name: string;
      users: number;
      applications: number;
      totalJobs: number;
      jobsByStatus: Record<string, number>;
    }> = [];
    for (const tenant of tenants) {
      const schema = `company_${tenant.id}`;
      const [users, applications, jobStatuses] = await Promise.all([
        this.usageRepo.countUsers(schema),
        this.usageRepo.countApplications(schema),
        this.usageRepo.countJobsByStatus(schema),
      ]);
      const jobsByStatus = Object.fromEntries(
        jobStatuses.map((entry) => [entry.status, entry.count]),
      );
      rows.push({
        name: tenant.name,
        users,
        applications,
        totalJobs: jobStatuses.reduce((sum, entry) => sum + entry.count, 0),
        jobsByStatus,
      });
    }
    return rows;
  }
}
