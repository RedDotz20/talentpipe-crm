import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { PermissionRepository } from '../../repositories/permission.repository';
import type { PermissionPresetRow } from '../../repositories/permission.repository';
import { CompanyRepository } from '../../repositories/company.repository';
import { UserRepository } from '../../repositories/user.repository';
import { permissionsSubsetOfRole } from '../../common/permissions/permissions';
import type { InternalRole } from '../../common/permissions/permissions';
import type { CreatePlatformPresetDto } from './dto/create-platform-preset.dto';
import type { UpdatePlatformPresetDto } from './dto/update-platform-preset.dto';

@Injectable()
export class PlatformPermissionsService {
  constructor(
    private readonly permissionRepo: PermissionRepository,
    private readonly tenantRepo: CompanyRepository,
    private readonly userRepo: UserRepository,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    const defaults = await this.permissionRepo.findDefaults();
    const globals = await this.permissionRepo.findAll('public');
    const companies = await this.tenantRepo.findAll();
    const companyPresets: unknown[] = [];
    for (const tenant of companies) {
      const schema = `company_${tenant.id}`;
      for (const p of await this.permissionRepo.findAll(schema)) {
        companyPresets.push({
          id: p.id,
          name: p.name,
          role: p.role,
          permissions: p.permissions,
          isDefault: false,
          companyId: tenant.id,
          companyName: tenant.name,
          usageCount: await this.permissionRepo.countUsersWithPreset(
            p.id,
            schema,
          ),
        });
      }
    }
    return {
      presets: [
        ...defaults.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          permissions: p.permissions,
          isDefault: true,
          companyId: null,
          companyName: null,
          usageCount: 0,
        })),
        ...globals.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          permissions: p.permissions,
          isDefault: false,
          companyId: null,
          companyName: null,
          usageCount: 0,
        })),
        ...companyPresets,
      ],
    };
  }

  async create(dto: CreatePlatformPresetDto) {
    if (!permissionsSubsetOfRole(dto.role, dto.permissions)) {
      throw new BadRequestException(
        'Permissions must be a subset of the role default',
      );
    }
    const preset = await this.permissionRepo.create(
      { name: dto.name, role: dto.role, permissions: dto.permissions },
      'public',
    );
    await this.auditService.log(
      'platform.permissions.preset.create',
      preset.id,
      {
        name: preset.name,
        role: preset.role,
      },
    );
    return {
      id: preset.id,
      name: preset.name,
      role: preset.role,
      permissions: preset.permissions,
    };
  }

  async update(id: string, dto: UpdatePlatformPresetDto) {
    const existing = await this.permissionRepo.findById(id, 'public');
    if (!existing) throw new NotFoundException('Preset not found');
    if (existing.isDefault) {
      throw new BadRequestException('Default presets cannot be modified');
    }
    if (
      dto.permissions !== undefined &&
      !permissionsSubsetOfRole(existing.role as InternalRole, dto.permissions)
    ) {
      throw new BadRequestException(
        'Permissions must be a subset of the role default',
      );
    }
    const updated = await this.permissionRepo.update(id, dto, 'public');
    await this.auditService.log('platform.permissions.preset.update', id, {
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
    const existing = await this.permissionRepo.findById(id, 'public');
    if (!existing) throw new NotFoundException('Preset not found');
    if (existing.isDefault) {
      throw new BadRequestException('Default presets cannot be deleted');
    }
    const companies = await this.tenantRepo.findAll();
    for (const tenant of companies) {
      const usage = await this.permissionRepo.countUsersWithPreset(
        id,
        `company_${tenant.id}`,
      );
      if (usage > 0) {
        throw new ConflictException(
          'This preset is assigned to users — reassign them before deleting',
        );
      }
    }
    await this.permissionRepo.remove(id, 'public');
    await this.auditService.log('platform.permissions.preset.delete', id, {
      name: existing.name,
    });
    return { id };
  }

  async bulkRemove(ids: string[]) {
    const presets: PermissionPresetRow[] = [];
    for (const id of ids) {
      const existing = await this.permissionRepo.findById(id, 'public');
      if (!existing) throw new NotFoundException('Preset not found');
      if (existing.isDefault) {
        throw new BadRequestException('Default presets cannot be deleted');
      }
      presets.push(existing);
    }
    const companies = await this.tenantRepo.findAll();
    const reverted: Record<string, number> = {};
    for (const id of ids) {
      let count = 0;
      for (const tenant of companies) {
        count += await this.userRepo.revertPreset(id, `company_${tenant.id}`);
      }
      reverted[id] = count;
    }
    for (const id of ids) {
      await this.permissionRepo.remove(id, 'public');
    }
    for (const p of presets) {
      await this.auditService.log('platform.permissions.preset.delete', p.id, {
        name: p.name,
        revertedUsers: reverted[p.id] ?? 0,
      });
    }
    const revertedUsers = Object.values(reverted).reduce((a, b) => a + b, 0);
    return { deleted: ids.length, revertedUsers };
  }

  async assign(companyId: string, userId: string, presetId: string | null) {
    const schema = `company_${companyId}`;
    const target = await this.userRepo.findById(userId, schema);
    if (!target) throw new NotFoundException('User not found');

    if (presetId !== null) {
      const local = await this.permissionRepo.findById(presetId, schema);
      const preset =
        local ?? (await this.permissionRepo.findById(presetId, 'public'));
      if (!preset) throw new NotFoundException('Preset not found');
      if (preset.role !== target.role) {
        throw new BadRequestException('Preset role must match the user role');
      }
    }

    await this.userRepo.updatePreset(userId, presetId, schema);
    await this.auditService.log(
      'platform.permissions.preset.assign',
      userId,
      { email: target.email, presetId, role: target.role },
      companyId,
    );
    return { id: userId, presetId };
  }
}
