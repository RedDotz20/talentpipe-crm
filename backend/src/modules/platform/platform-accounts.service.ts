import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../common/password';
import { AuditService } from '../../common/audit/audit.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { UpdateTenantUserDto } from './dto/update-tenant-user.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class PlatformAccountsService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly userRepo: UserRepository,
    private readonly userEmailRepo: UserEmailRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly interviewRepo: InterviewRepository,
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly candidateRepo: CandidateRepository,
    private readonly candidateIndexRepo: CandidateApplicationsIndexRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly auditService: AuditService,
  ) {}

  private schemaOf(tenantId: string): string {
    return `tenant_${tenantId}`;
  }

  private async requireTenant(tenantId: string) {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async listTenantUsers(tenantId: string) {
    await this.requireTenant(tenantId);
    return this.userRepo.findAll(this.schemaOf(tenantId));
  }

  async createTenantUser(tenantId: string, dto: CreateTenantUserDto) {
    await this.requireTenant(tenantId);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userEmailRepo.findByEmail(email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const candidateAccount = await this.candidateAccountRepo.findByEmail(email);
    if (candidateAccount) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await hashPassword(dto.password);
    const id = randomUUID();
    await this.userRepo.create(
      { id, email, passwordHash, role: dto.role },
      this.schemaOf(tenantId),
    );
    await this.userEmailRepo.create({
      email,
      tenantId,
      userId: id,
    });
    await this.auditService.log(
      'platform.user.create',
      id,
      { email, role: dto.role },
      tenantId,
    );
    return { id, email, role: dto.role };
  }

  async updateTenantUser(
    tenantId: string,
    userId: string,
    dto: UpdateTenantUserDto,
  ) {
    const schema = this.schemaOf(tenantId);
    const user = await this.userRepo.findById(userId, schema);
    if (!user) throw new NotFoundException('User not found');
    const updates: { role?: string; passwordHash?: string } = {};
    if (dto.role !== undefined) updates.role = dto.role;
    if (dto.password !== undefined) {
      updates.passwordHash = await hashPassword(dto.password);
    }
    if (updates.role !== undefined) {
      await this.userRepo.updateRole(userId, updates.role, schema);
    }
    if (updates.passwordHash !== undefined) {
      await this.userRepo.resetPassword(userId, updates.passwordHash, schema);
    }
    await this.refreshTokenRepo.deleteByUser(userId);
    await this.auditService.log(
      'platform.user.update',
      userId,
      { email: user.email, role: updates.role ?? user.role },
      tenantId,
    );
    return { id: userId, email: user.email, role: updates.role ?? user.role };
  }

  async setTenantUserStatus(
    tenantId: string,
    userId: string,
    status: 'active' | 'suspended',
  ) {
    const schema = this.schemaOf(tenantId);
    const user = await this.userRepo.findById(userId, schema);
    if (!user) throw new NotFoundException('User not found');
    if (user.status === status) {
      throw new ConflictException(
        `User is already ${status === 'active' ? 'active' : 'suspended'}`,
      );
    }
    const updated = await this.userRepo.updateStatus(userId, status, schema);
    if (status === 'suspended') {
      await this.refreshTokenRepo.deleteByUser(userId);
    }
    await this.auditService.log(
      status === 'suspended'
        ? 'platform.user.suspend'
        : 'platform.user.reactivate',
      userId,
      { email: user.email },
      tenantId,
    );
    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
    };
  }

  async removeTenantUser(tenantId: string, userId: string) {
    const schema = this.schemaOf(tenantId);
    const user = await this.userRepo.findById(userId, schema);
    if (!user) throw new NotFoundException('User not found');
    await this.interviewRepo.deleteByInterviewer(userId, schema);
    await this.userRepo.remove(userId, schema);
    await this.userEmailRepo.deleteByUserId(userId);
    await this.refreshTokenRepo.deleteByUser(userId);
    await this.auditService.log(
      'platform.user.remove',
      userId,
      { email: user.email },
      tenantId,
    );
    return { id: userId };
  }

  async listTenantStages(tenantId: string) {
    await this.requireTenant(tenantId);
    return this.pipelineStageRepo.findAll(this.schemaOf(tenantId));
  }

  async listCandidates() {
    return this.candidateAccountRepo.findAll();
  }

  async createCandidate(dto: CreateCandidateDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.candidateAccountRepo.findByEmail(email);
    if (existing) throw new ConflictException('Email already in use');
    const orgOwner = await this.userEmailRepo.findByEmail(email);
    if (orgOwner) throw new ConflictException('Email already in use');
    const passwordHash = await hashPassword(dto.password);
    const account = await this.candidateAccountRepo.create({
      email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone || undefined,
    });
    await this.auditService.log('platform.candidate.create', account.id, {
      email,
    });
    return {
      id: account.id,
      email,
      firstName: account.firstName,
      lastName: account.lastName,
      phone: account.phone,
      createdAt: account.createdAt,
    };
  }

  async updateCandidate(id: string, dto: UpdateCandidateDto) {
    const account = await this.candidateAccountRepo.findById(id);
    if (!account) throw new NotFoundException('Candidate not found');
    const data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string | null;
      passwordHash?: string;
    } = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    };
    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const existing =
        await this.candidateAccountRepo.findByEmail(normalizedEmail);
      if (existing && existing.id !== id) {
        throw new ConflictException('Email already in use');
      }
      const orgOwner = await this.userEmailRepo.findByEmail(normalizedEmail);
      if (orgOwner) throw new ConflictException('Email already in use');
      data.email = normalizedEmail;
    }
    if (dto.password) {
      data.passwordHash = await hashPassword(dto.password);
    }
    const updated = await this.candidateAccountRepo.updateProfile(id, data);
    await this.auditService.log('platform.candidate.update', id, {
      email: updated.email,
    });
    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phone: updated.phone,
      createdAt: updated.createdAt,
    };
  }

  async removeCandidate(id: string) {
    const account = await this.candidateAccountRepo.findById(id);
    if (!account) throw new NotFoundException('Candidate not found');
    const tenants = await this.tenantRepo.findAll();
    const indexed = await this.candidateIndexRepo.findByCandidate(id);
    for (const row of indexed) {
      await this.candidateIndexRepo.deleteById(row.id);
      await this.applicationRepo.delete(
        row.applicationId,
        this.schemaOf(row.tenantId),
      );
    }
    for (const tenant of tenants) {
      const candidate = await this.candidateRepo.findByAccountId(
        id,
        this.schemaOf(tenant.id),
      );
      if (candidate) {
        await this.candidateRepo.delete(candidate.id, this.schemaOf(tenant.id));
      }
    }
    await this.candidateAccountRepo.remove(id);
    await this.auditService.log('platform.candidate.remove', id, {
      email: account.email,
    });
    return { id };
  }
}
