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
  const userRepo = { findById: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
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
});
