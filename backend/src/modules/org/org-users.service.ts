import {
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
  getTenantId,
} from '../../common/context/tenant-context';
import { AuditService } from '../../common/audit/audit.service';
import { UserRepository } from '../../repositories/user.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class OrgUsersService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly userEmailRepo: UserEmailRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly interviewRepo: InterviewRepository,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    return this.userRepo.findAll();
  }

  async invite(dto: InviteUserDto) {
    const existing = await this.userEmailRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await hashPassword(dto.password);
    const id = randomUUID();
    const schema = getSchema();
    await this.userRepo.create(
      { id, email: dto.email, passwordHash, role: dto.role },
      schema,
    );
    await this.userEmailRepo.create({
      email: dto.email,
      tenantId: getTenantId(),
      userId: id,
    });

    await this.auditService.log('user.invite', id, {
      email: dto.email,
      role: dto.role,
    });

    return { id, email: dto.email, role: dto.role };
  }

  async updateRole(userId: string, dto: UpdateRoleDto) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const me = getCurrentUser();
    if (userId === me.userId) {
      throw new ForbiddenException('You cannot change your own role');
    }
    await this.ensureOrgAdminRemains(userId);

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
    await this.ensureOrgAdminRemains(userId);

    await this.interviewRepo.deleteByInterviewer(userId);
    await this.userRepo.remove(userId);
    await this.userEmailRepo.deleteByUserId(userId);
    await this.refreshTokenRepo.deleteByUser(userId);

    await this.auditService.log('user.remove', userId, { email: user.email });
    return { id: userId };
  }

  private async ensureOrgAdminRemains(userId: string) {
    const users = await this.userRepo.findAll();
    const adminCount = users.filter((u) => u.role === 'OrgAdmin').length;
    const targetIsAdmin =
      users.find((u) => u.id === userId)?.role === 'OrgAdmin';
    if (targetIsAdmin && adminCount <= 1) {
      throw new ForbiddenException('Cannot change or remove the last OrgAdmin');
    }
  }
}
