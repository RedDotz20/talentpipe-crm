import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../common/password';
import {
  getCurrentUser,
  getSchema,
  getCompanyId,
} from '../../common/context/company-context';
import { AuditService } from '../../common/audit/audit.service';
import { UserRepository } from '../../repositories/user.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { PermissionRepository } from '../../repositories/permission.repository';
import { toCsv } from '../../common/csv.helper';
import { CreateUserDto } from './dto/invite-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class CompanyUsersService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly userEmailRepo: UserEmailRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly interviewRepo: InterviewRepository,
    private readonly permissionRepo: PermissionRepository,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    return this.userRepo.findAll();
  }

  async exportCsv() {
    const rows = await this.userRepo.findAll();
    return toCsv(['name', 'email', 'role', 'status', 'createdAt'], rows);
  }

  async create(dto: CreateUserDto) {
    const existing = await this.userEmailRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await hashPassword(dto.password);
    const id = randomUUID();
    const schema = getSchema();
    if (
      dto.role === 'CompanyAdmin' &&
      dto.presetId !== undefined &&
      dto.presetId !== null
    ) {
      throw new BadRequestException(
        'Company admins must use the role default preset',
      );
    }
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
    await this.userRepo.create(
      {
        id,
        email: dto.email,
        passwordHash,
        role: dto.role,
        presetId: dto.presetId ?? null,
      },
      schema,
    );
    await this.userEmailRepo.create({
      email: dto.email,
      companyId: getCompanyId(),
      userId: id,
    });

    await this.auditService.log('user.create', id, {
      email: dto.email,
      role: dto.role,
    });

    return { id, email: dto.email, role: dto.role };
  }

  async setStatus(userId: string, status: 'active' | 'suspended') {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.status === status) {
      throw new ConflictException(
        `User is already ${status === 'active' ? 'active' : 'suspended'}`,
      );
    }

    if (status === 'suspended') {
      const me = getCurrentUser();
      if (userId === me.userId) {
        throw new ForbiddenException('You cannot suspend your own account');
      }
      await this.ensureActiveAdminRemains(userId);
    }

    const updated = await this.userRepo.updateStatus(userId, status);
    if (status === 'suspended') {
      await this.refreshTokenRepo.deleteByUser(userId);
    }

    await this.auditService.log(
      status === 'suspended' ? 'user.suspend' : 'user.reactivate',
      userId,
      { email: user.email },
    );

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
    };
  }

  async resetPassword(userId: string, dto: ResetPasswordDto) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const me = getCurrentUser();
    if (userId === me.userId) {
      throw new ForbiddenException('You cannot reset your own password');
    }

    const passwordHash = await hashPassword(dto.password);
    await this.userRepo.resetPassword(userId, passwordHash);
    await this.refreshTokenRepo.deleteByUser(userId);

    await this.auditService.log('user.password_reset', userId, {
      email: user.email,
    });

    return { id: userId, email: user.email };
  }

  async updateRole(userId: string, dto: UpdateRoleDto) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const me = getCurrentUser();
    if (userId === me.userId) {
      throw new ForbiddenException('You cannot change your own role');
    }
    await this.ensureCompanyAdminRemains(userId);

    const updated = await this.userRepo.updateRole(userId, dto.role);
    if (!updated) throw new NotFoundException('User not found');
    await this.refreshTokenRepo.deleteByUser(userId);
    await this.auditService.log('user.role_change', userId, {
      fromRole: user.role,
      toRole: dto.role,
    });
    return { id: updated.id, email: updated.email, role: updated.role };
  }

  async remove(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const me = getCurrentUser();
    if (userId === me.userId) {
      throw new ForbiddenException('You cannot remove your own account');
    }
    await this.ensureCompanyAdminRemains(userId);

    await this.interviewRepo.deleteByInterviewer(userId);
    await this.userRepo.remove(userId);
    await this.userEmailRepo.deleteByUserId(userId);
    await this.refreshTokenRepo.deleteByUser(userId);

    await this.auditService.log('user.remove', userId, { email: user.email });
    return { id: userId };
  }

  private async ensureActiveAdminRemains(userId: string) {
    const users = await this.userRepo.findAll();
    const activeAdminCount = users.filter(
      (u) => u.role === 'CompanyAdmin' && u.status !== 'suspended',
    ).length;
    const target = users.find((u) => u.id === userId);
    if (
      target?.role === 'CompanyAdmin' &&
      target.status !== 'suspended' &&
      activeAdminCount <= 1
    ) {
      throw new ForbiddenException(
        'Cannot suspend the last active CompanyAdmin',
      );
    }
  }

  private async ensureCompanyAdminRemains(userId: string) {
    const users = await this.userRepo.findAll();
    const adminCount = users.filter((u) => u.role === 'CompanyAdmin').length;
    const targetIsAdmin =
      users.find((u) => u.id === userId)?.role === 'CompanyAdmin';
    if (targetIsAdmin && adminCount <= 1) {
      throw new ForbiddenException(
        'Cannot change or remove the last CompanyAdmin',
      );
    }
  }
}
