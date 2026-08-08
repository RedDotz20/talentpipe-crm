import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hashPassword } from '../../../common/password';
import { TenantRepository } from '../../../repositories/tenant.repository';
import { UserRepository } from '../../../repositories/user.repository';
import { UserEmailRepository } from '../../../repositories/user-email.repository';
import { PipelineStageRepository } from '../../../repositories/pipeline-stage.repository';

const DEFAULT_STAGES = [
  'Applied',
  'Screening',
  'Interview',
  'Offer',
  'Hired',
  'Rejected',
];

export interface CreateTenantDto {
  companyName: string;
  slug: string;
  email: string;
  password: string;
}

@Injectable()
export class TenantProvisioningService {
  constructor(
    private tenantRepo: TenantRepository,
    private userRepo: UserRepository,
    private userEmailRepo: UserEmailRepository,
    private pipelineStageRepo: PipelineStageRepository,
  ) {}

  async createTenant(dto: CreateTenantDto) {
    const existing = await this.tenantRepo.findBySlug(dto.slug);
    if (existing) throw new ConflictException('Slug already taken');
    const emailOwner = await this.userEmailRepo.findByEmail(dto.email);
    if (emailOwner) throw new ConflictException('Email already taken');

    const tenantId = randomUUID();
    const schemaName = `tenant_${tenantId}`;

    await this.tenantRepo.create({
      id: tenantId,
      name: dto.companyName,
      slug: dto.slug,
    });
    await this.tenantRepo.provisionSchema(tenantId);

    const passwordHash = await hashPassword(dto.password);
    const userId = randomUUID();

    await this.userRepo.create(
      { id: userId, email: dto.email, passwordHash, role: 'OrgAdmin' },
      schemaName,
    );
    await this.pipelineStageRepo.createMany(DEFAULT_STAGES, schemaName);
    await this.userEmailRepo.create({ email: dto.email, tenantId, userId });

    return { tenantId, userId };
  }
}
