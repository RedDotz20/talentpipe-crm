import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantId } from '../../common/context/tenant-context';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UpdateOrgDto } from './dto/update-org.dto';

@Injectable()
export class OrgService {
  constructor(private readonly tenantRepo: TenantRepository) {}

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
    return { id: tenant.id, name: tenant.name };
  }
}
