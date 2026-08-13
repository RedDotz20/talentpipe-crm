import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlatformPermissionsService } from './platform-permissions.service';
import { PermissionRepository } from '../../repositories/permission.repository';
import { CompanyRepository } from '../../repositories/company.repository';
import { UserRepository } from '../../repositories/user.repository';
import { AuditService } from '../../common/audit/audit.service';

describe('PlatformPermissionsService', () => {
  let service: PlatformPermissionsService;
  const permissionRepo = {
    findDefaults: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    countUsersWithPreset: jest.fn(),
  };
  const tenantRepo = { findAll: jest.fn() };
  const userRepo = { findById: jest.fn(), revertPreset: jest.fn() };
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
});
