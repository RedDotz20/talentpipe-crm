import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UsageRepository } from '../../repositories/usage.repository';

@Injectable()
export class PlatformService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly usageRepo: UsageRepository,
    private readonly auditService: AuditService,
  ) {}

  async listTenants() {
    return this.tenantRepo.findAll();
  }

  async getTenant(id: string) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');

    const schema = `tenant_${id}`;
    const [users, applications] = await Promise.all([
      this.usageRepo.countUsers(schema),
      this.usageRepo.countApplications(schema),
    ]);
    return { ...tenant, users, applications };
  }

  async setTenantStatus(id: string, status: 'active' | 'suspended') {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.status === status) {
      throw new ConflictException(
        `Tenant is already ${status === 'active' ? 'active' : 'suspended'}`,
      );
    }

    const updated = await this.tenantRepo.updateStatus(id, status);
    await this.auditService.log(
      status === 'suspended' ? 'tenant.suspend' : 'tenant.reactivate',
      id,
      { name: tenant.name, slug: tenant.slug },
      id,
    );
    return updated;
  }

  async getStats() {
    const tenants = await this.tenantRepo.findAll();
    let totalUsers = 0;
    let totalApplications = 0;
    for (const tenant of tenants) {
      const schema = `tenant_${tenant.id}`;
      const [users, applications] = await Promise.all([
        this.usageRepo.countUsers(schema),
        this.usageRepo.countApplications(schema),
      ]);
      totalUsers += users;
      totalApplications += applications;
    }
    return { tenants: tenants.length, users: totalUsers, applications: totalApplications };
  }
}
