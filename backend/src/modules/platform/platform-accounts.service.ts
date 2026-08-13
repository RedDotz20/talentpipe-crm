import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../common/password';
import { toCsv } from '../../common/csv.helper';
import { AuditService } from '../../common/audit/audit.service';
import { CompanyRepository } from '../../repositories/company.repository';
import { UserRepository } from '../../repositories/user.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { PermissionRepository } from '../../repositories/permission.repository';
import {
  inMemorySearch,
  listEnvelope,
  sortAndPageInMemory,
} from '../../repositories/list-query.helper';
import type { ListQueryDto } from '../../common/dto/list-query.dto';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { UpdateCompanyUserDto } from './dto/update-company-user.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class PlatformAccountsService {
  constructor(
    private readonly tenantRepo: CompanyRepository,
    private readonly userRepo: UserRepository,
    private readonly userEmailRepo: UserEmailRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly interviewRepo: InterviewRepository,
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly candidateRepo: CandidateRepository,
    private readonly candidateIndexRepo: CandidateApplicationsIndexRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
    private readonly permissionRepo: PermissionRepository,
    private readonly auditService: AuditService,
  ) {}

  private schemaOf(companyId: string): string {
    return `company_${companyId}`;
  }

  private async requireCompany(companyId: string) {
    const tenant = await this.tenantRepo.findById(companyId);
    if (!tenant) throw new NotFoundException('Company not found');
    return tenant;
  }

  async listCompanyUsers(companyId: string) {
    await this.requireCompany(companyId);
    return this.userRepo.findAll(this.schemaOf(companyId));
  }

  async createCompanyUser(companyId: string, dto: CreateCompanyUserDto) {
    await this.requireCompany(companyId);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userEmailRepo.findByEmail(email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const candidateAccount = await this.candidateAccountRepo.findByEmail(email);
    if (candidateAccount) {
      throw new ConflictException('A user with this email already exists');
    }
    const schema = this.schemaOf(companyId);
    if (dto.presetId !== undefined && dto.presetId !== null) {
      const local = await this.permissionRepo.findById(dto.presetId, schema);
      const preset =
        local ?? (await this.permissionRepo.findById(dto.presetId, 'public'));
      if (!preset) throw new NotFoundException('Preset not found');
      if (preset.role !== dto.role) {
        throw new BadRequestException('Preset role must match the user role');
      }
      if (!preset.isEnabled) {
        throw new BadRequestException('This preset is disabled');
      }
    }
    const passwordHash = await hashPassword(dto.password);
    const id = randomUUID();
    await this.userRepo.create(
      {
        id,
        email,
        passwordHash,
        role: dto.role,
        presetId: dto.presetId ?? null,
      },
      schema,
    );
    await this.userEmailRepo.create({
      email,
      companyId,
      userId: id,
    });
    await this.auditService.log(
      'platform.user.create',
      id,
      { email, role: dto.role },
      companyId,
    );
    return { id, email, role: dto.role };
  }

  async updateCompanyUser(
    companyId: string,
    userId: string,
    dto: UpdateCompanyUserDto,
  ) {
    const schema = this.schemaOf(companyId);
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
      companyId,
    );
    return { id: userId, email: user.email, role: updates.role ?? user.role };
  }

  async setCompanyUserStatus(
    companyId: string,
    userId: string,
    status: 'active' | 'suspended',
  ) {
    const schema = this.schemaOf(companyId);
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
      if (user.role === 'CompanyAdmin') {
        await this.userRepo.setAllStatus('suspended', schema);
        await this.refreshTokenRepo.deleteByCompany(companyId);
      }
    }
    await this.auditService.log(
      status === 'suspended'
        ? 'platform.user.suspend'
        : 'platform.user.reactivate',
      userId,
      { email: user.email },
      companyId,
    );
    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
    };
  }

  async removeCompanyUser(companyId: string, userId: string) {
    const schema = this.schemaOf(companyId);
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
      companyId,
    );
    return { id: userId };
  }

  async listCompanyStages(companyId: string) {
    await this.requireCompany(companyId);
    return this.pipelineStageRepo.findAll(this.schemaOf(companyId));
  }

  async listCandidates() {
    return this.candidateAccountRepo.findAll();
  }

  async createCandidate(dto: CreateCandidateDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.candidateAccountRepo.findByEmail(email);
    if (existing) throw new ConflictException('Email already in use');
    const companyOwner = await this.userEmailRepo.findByEmail(email);
    if (companyOwner) throw new ConflictException('Email already in use');
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
      const companyOwner =
        await this.userEmailRepo.findByEmail(normalizedEmail);
      if (companyOwner) throw new ConflictException('Email already in use');
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

  async deleteCompany(companyId: string) {
    const tenant = await this.requireCompany(companyId);
    await this.candidateIndexRepo.cancelByCompany(companyId);
    await this.jobListingsIndexRepo.deleteByCompany(companyId);
    await this.userEmailRepo.deleteByCompany(companyId);
    await this.refreshTokenRepo.deleteByCompany(companyId);
    await this.tenantRepo.dropSchema(companyId);
    await this.tenantRepo.remove(companyId);
    await this.auditService.log(
      'company.delete',
      companyId,
      { name: tenant.name, slug: tenant.slug },
      companyId,
    );
    return { id: companyId };
  }

  private async collectAllUsers() {
    const companies = await this.tenantRepo.findAll();
    const companyUsers: Array<{
      type: 'company';
      id: string;
      email: string;
      role: string;
      status: string;
      presetId: string | null;
      companyId: string;
      companyName: string;
      firstName: null;
      lastName: null;
      createdAt: Date;
    }> = [];
    for (const tenant of companies) {
      const users = await this.userRepo.findAll(this.schemaOf(tenant.id));
      for (const user of users) {
        companyUsers.push({
          type: 'company',
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          presetId: user.presetId,
          companyId: tenant.id,
          companyName: tenant.name,
          firstName: null,
          lastName: null,
          createdAt: user.createdAt,
        });
      }
    }
    const candidates = await this.candidateAccountRepo.findAll();
    const candidateRows = candidates.map((c) => ({
      type: 'candidate' as const,
      id: c.id,
      email: c.email,
      role: 'Candidate',
      status: null,
      companyId: null,
      companyName: null,
      firstName: c.firstName,
      lastName: c.lastName,
      createdAt: c.createdAt,
    }));
    return [...companyUsers, ...candidateRows] as Array<
      (typeof companyUsers)[number] | (typeof candidateRows)[number]
    >;
  }

  async listAllUsers(
    query: ListQueryDto & { type?: string; companyId?: string; role?: string },
  ) {
    const rows = await this.collectAllUsers();
    let filtered = rows;
    if (query.type)
      filtered = filtered.filter((row) => row.type === query.type);
    if (query.companyId)
      filtered = filtered.filter((row) => row.companyId === query.companyId);
    if (query.role)
      filtered = filtered.filter((row) => row.role === query.role);
    filtered = inMemorySearch(filtered, query.search, [
      'email',
      'firstName',
      'lastName',
      'companyName',
    ]);
    const sorted = sortAndPageInMemory(
      filtered,
      query,
      (row, sortBy) =>
        sortBy === 'createdAt' ? row.createdAt : row.email.toLowerCase(),
      'email',
      'asc',
    );
    return listEnvelope(sorted.data, sorted.total, query);
  }

  async exportAllUsers(
    query: ListQueryDto & { type?: string; companyId?: string; role?: string },
  ) {
    const rows = await this.collectAllUsers();
    let filtered = rows;
    if (query.type)
      filtered = filtered.filter((row) => row.type === query.type);
    if (query.companyId)
      filtered = filtered.filter((row) => row.companyId === query.companyId);
    if (query.role)
      filtered = filtered.filter((row) => row.role === query.role);
    filtered = inMemorySearch(filtered, query.search, [
      'email',
      'firstName',
      'lastName',
      'companyName',
    ]);
    const displayRows = filtered.map((row) => ({
      name:
        row.type === 'candidate'
          ? `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim()
          : row.email,
      email: row.email,
      type: row.type,
      company: row.companyName ?? '',
      role: row.role,
      status: row.status ?? '',
      createdAt: row.createdAt,
    }));
    return toCsv(
      ['name', 'email', 'type', 'company', 'role', 'status', 'createdAt'],
      displayRows,
    );
  }

  async removeCandidate(id: string) {
    const account = await this.candidateAccountRepo.findById(id);
    if (!account) throw new NotFoundException('Candidate not found');
    const companies = await this.tenantRepo.findAll();
    const indexed = await this.candidateIndexRepo.findAllByCandidate(id);
    for (const row of indexed) {
      await this.candidateIndexRepo.deleteById(row.id);
      await this.applicationRepo.delete(
        row.applicationId,
        this.schemaOf(row.companyId),
      );
    }
    for (const tenant of companies) {
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
