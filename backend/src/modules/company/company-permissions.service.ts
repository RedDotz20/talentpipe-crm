import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  getCurrentUser,
  getSchema,
} from '../../common/context/company-context';
import { AuditService } from '../../common/audit/audit.service';
import { PermissionRepository } from '../../repositories/permission.repository';
import { UserRepository } from '../../repositories/user.repository';
import { permissionsSubsetOfRole } from '../../common/permissions/permissions';
import type { InternalRole } from '../../common/permissions/permissions';
import type { CreatePermissionPresetDto } from './dto/create-permission-preset.dto';
import type { UpdatePermissionPresetDto } from './dto/update-permission-preset.dto';
import type { AssignPresetDto } from './dto/assign-preset.dto';

@Injectable()
export class CompanyPermissionsService {
  constructor(
    private readonly permissionRepo: PermissionRepository,
    private readonly userRepo: UserRepository,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    const schema = getSchema();
    const defaults = await this.permissionRepo.findDefaults();
    const globals = await this.permissionRepo.findAll('public');
    const customs = await this.permissionRepo.findAll(schema);
    const withUsage = await Promise.all(
      customs.map(async (p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        permissions: p.permissions,
        isDefault: false,
        isGlobal: false,
        usageCount: await this.permissionRepo.countUsersWithPreset(
          p.id,
          schema,
        ),
      })),
    );
    return {
      presets: [
        ...defaults.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          permissions: p.permissions,
          isDefault: true,
          isGlobal: false,
          usageCount: 0,
        })),
        ...globals.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          permissions: p.permissions,
          isDefault: false,
          isGlobal: true,
          usageCount: 0,
        })),
        ...withUsage,
      ],
    };
  }

  async create(dto: CreatePermissionPresetDto) {
    if (!permissionsSubsetOfRole(dto.role, dto.permissions)) {
      throw new BadRequestException(
        'Permissions must be a subset of the role default',
      );
    }
    const me = getCurrentUser();
    const preset = await this.permissionRepo.create(
      {
        name: dto.name,
        role: dto.role,
        permissions: dto.permissions,
        createdBy: me.userId,
      },
      getSchema(),
    );
    await this.auditService.log('permissions.preset.create', preset.id, {
      name: preset.name,
      role: preset.role,
      permissions: preset.permissions,
    });
    return {
      id: preset.id,
      name: preset.name,
      role: preset.role,
      permissions: preset.permissions,
    };
  }

  async update(id: string, dto: UpdatePermissionPresetDto) {
    const schema = getSchema();
    const existing = await this.permissionRepo.findById(id, schema);
    if (!existing) throw new NotFoundException('Preset not found');
    if (
      dto.permissions !== undefined &&
      !permissionsSubsetOfRole(existing.role as InternalRole, dto.permissions)
    ) {
      throw new BadRequestException(
        'Permissions must be a subset of the role default',
      );
    }
    const updated = await this.permissionRepo.update(id, dto, schema);
    await this.auditService.log('permissions.preset.update', id, {
      name: updated?.name,
      permissions: updated?.permissions,
    });
    return {
      id,
      name: updated?.name,
      role: updated?.role,
      permissions: updated?.permissions,
    };
  }

  async remove(id: string) {
    const schema = getSchema();
    const existing = await this.permissionRepo.findById(id, schema);
    if (!existing) throw new NotFoundException('Preset not found');
    const usage = await this.permissionRepo.countUsersWithPreset(id, schema);
    if (usage > 0) {
      throw new ConflictException(
        'This preset is assigned to users — reassign them before deleting',
      );
    }
    await this.permissionRepo.remove(id, schema);
    await this.auditService.log('permissions.preset.delete', id, {
      name: existing.name,
    });
    return { id };
  }

  async assign(userId: string, dto: AssignPresetDto) {
    const schema = getSchema();
    const target = await this.userRepo.findById(userId);
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'CompanyAdmin') {
      throw new ForbiddenException(
        'Company admins cannot change permissions of admin accounts',
      );
    }

    if (dto.presetId !== null) {
      const local = await this.permissionRepo.findById(dto.presetId, schema);
      const preset =
        local ?? (await this.permissionRepo.findById(dto.presetId, 'public'));
      if (!preset) throw new NotFoundException('Preset not found');
      if (preset.role !== target.role) {
        throw new BadRequestException('Preset role must match the user role');
      }
    }

    await this.userRepo.updatePreset(userId, dto.presetId, schema);
    await this.auditService.log('permissions.preset.assign', userId, {
      email: target.email,
      presetId: dto.presetId,
      role: target.role,
    });
    return { id: userId, presetId: dto.presetId };
  }
}
