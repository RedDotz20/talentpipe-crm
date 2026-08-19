import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PlatformPermissionsService } from '@/modules/platform/platform-permissions.service';
import { PermissionRepository } from '@/repositories/permission.repository';
import { CompanyRepository } from '@/repositories/company.repository';
import { UserRepository } from '@/repositories/user.repository';
import { AuditService } from '@/common/audit/audit.service';

describe('PlatformPermissionsService', () => {
  let service: PlatformPermissionsService;
  const permissionRepo = {
    findDefaults: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    countUsersWithPreset: jest.fn(),
    setEnabled: jest.fn(),
  };
  const tenantRepo = { findAll: jest.fn() };
  const userRepo = {
    findById: jest.fn(),
    updatePreset: jest.fn(),
    revertPreset: jest.fn(),
  };
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantRepo.findAll.mockResolvedValue([]);
    service = new PlatformPermissionsService(
      permissionRepo as unknown as PermissionRepository,
      tenantRepo as unknown as CompanyRepository,
      userRepo as unknown as UserRepository,
      audit as unknown as AuditService,
    );
  });

  it('rejects editing a default preset', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'd1',
      isDefault: true,
      name: 'Recruiter Default',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(service.update('d1', { name: 'Hacked' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects editing a company-scoped preset (404)', async () => {
    permissionRepo.findById.mockResolvedValue(null);
    await expect(service.update('p1', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a global with permissions outside the role default', async () => {
    await expect(
      service.create({
        name: 'G',
        role: 'Interviewer',
        permissions: ['jobs.create_edit'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('bulk remove rejects when any id is a default preset', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'd1',
      isDefault: true,
      name: 'Recruiter Default',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(service.bulkRemove(['d1'])).rejects.toThrow(
      BadRequestException,
    );
    expect(permissionRepo.remove).not.toHaveBeenCalled();
  });

  it('bulk remove deletes globals (no companies, nothing to revert)', async () => {
    permissionRepo.findById
      .mockResolvedValueOnce({
        id: 'g1',
        isDefault: false,
        name: 'G1',
        role: 'Recruiter',
        permissions: [],
        createdBy: null,
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'g2',
        isDefault: false,
        name: 'G2',
        role: 'Recruiter',
        permissions: [],
        createdBy: null,
        createdAt: new Date(),
      });
    const result = await service.bulkRemove(['g1', 'g2']);
    expect(result).toEqual({ deleted: 2, revertedUsers: 0 });
    expect(permissionRepo.remove).toHaveBeenCalledTimes(2);
  });

  it('bulk remove dedupes duplicate ids', async () => {
    permissionRepo.findById.mockResolvedValueOnce({
      id: 'g1',
      isDefault: false,
      name: 'G1',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    const result = await service.bulkRemove(['g1', 'g1']);
    expect(result).toEqual({ deleted: 1, revertedUsers: 0 });
    expect(permissionRepo.findById).toHaveBeenCalledTimes(1);
    expect(permissionRepo.remove).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('rejects a global whose name matches a default', async () => {
    permissionRepo.findByName.mockResolvedValue({
      id: 'def',
      isDefault: true,
      name: 'Company Admin Default',
      role: 'CompanyAdmin',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(
      service.create({
        name: 'Company Admin Default',
        role: 'CompanyAdmin',
        permissions: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows a global update that keeps its own name', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'g1',
      isDefault: false,
      name: 'Global Light',
      role: 'Recruiter',
      permissions: ['jobs.view'],
      createdBy: null,
      createdAt: new Date(),
    });
    permissionRepo.findByName.mockResolvedValue({
      id: 'g1',
      isDefault: false,
      name: 'Global Light',
      role: 'Recruiter',
      permissions: ['jobs.view'],
      createdBy: null,
      createdAt: new Date(),
    });
    permissionRepo.update.mockResolvedValue({
      id: 'g1',
      isDefault: false,
      name: 'Global Light',
      role: 'Recruiter',
      permissions: ['jobs.view'],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(
      service.update('g1', { name: 'global light' }),
    ).resolves.toBeTruthy();
  });

  it('disable rejects defaults (400)', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'd1',
      isDefault: true,
      name: 'Recruiter Default',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(service.disable('d1')).rejects.toThrow(BadRequestException);
    expect(permissionRepo.setEnabled).not.toHaveBeenCalled();
  });

  it('disable reverts across companies', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'g1',
      isDefault: false,
      isEnabled: true,
      name: 'G1',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    tenantRepo.findAll.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    userRepo.revertPreset.mockResolvedValue(1);
    const result = await service.disable('g1');
    expect(result).toEqual({ id: 'g1', revertedUsers: 2 });
    expect(userRepo.revertPreset).toHaveBeenCalledTimes(2);
    expect(userRepo.revertPreset).toHaveBeenCalledWith('g1', 'company_c1');
    expect(userRepo.revertPreset).toHaveBeenCalledWith('g1', 'company_c2');
    expect(permissionRepo.setEnabled).toHaveBeenCalledWith(
      'g1',
      false,
      'public',
    );
    expect(audit.log).toHaveBeenCalledWith(
      'platform.permissions.preset.disable',
      'g1',
      expect.anything(),
    );
  });

  it('assign rejects a disabled global', async () => {
    userRepo.findById.mockResolvedValue({
      id: 't1',
      role: 'Recruiter',
      email: 'r@acme.com',
    });
    permissionRepo.findById.mockResolvedValue({
      id: 'g1',
      isDefault: false,
      isEnabled: false,
      name: 'G1',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(service.assign('c1', 't1', 'g1')).rejects.toThrow(
      BadRequestException,
    );
    expect(userRepo.updatePreset).not.toHaveBeenCalled();
  });

  it('bulkSetEnabled with a default → 400 (atomic)', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'd1',
      isDefault: true,
      name: 'Recruiter Default',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(service.bulkSetEnabled(['d1', 'g1'], false)).rejects.toThrow(
      BadRequestException,
    );
    expect(permissionRepo.setEnabled).not.toHaveBeenCalled();
    expect(userRepo.revertPreset).not.toHaveBeenCalled();
  });
});
