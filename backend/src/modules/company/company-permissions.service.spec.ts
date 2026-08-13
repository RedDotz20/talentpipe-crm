import { ForbiddenException } from '@nestjs/common';
import { CompanyPermissionsService } from './company-permissions.service';
import { PermissionRepository } from '../../repositories/permission.repository';
import { UserRepository } from '../../repositories/user.repository';
import { AuditService } from '../../common/audit/audit.service';

jest.mock('../../common/context/company-context', () => ({
  getCurrentUser: jest.fn(() => ({
    userId: 'actor',
    companyId: 'c1',
    role: 'CompanyAdmin',
  })),
  getSchema: jest.fn(() => 'company_c1'),
}));

describe('CompanyPermissionsService', () => {
  let service: CompanyPermissionsService;
  const permissionRepo = {
    findDefaults: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    countUsersWithPreset: jest.fn(),
  };
  const userRepo = { findById: jest.fn(), updatePreset: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CompanyPermissionsService(
      permissionRepo as unknown as PermissionRepository,
      userRepo as unknown as UserRepository,
      audit as unknown as AuditService,
    );
  });

  it('rejects a preset with permissions outside the role default', async () => {
    await expect(
      service.create({
        name: 'X',
        role: 'Interviewer',
        permissions: ['jobs.create_edit'],
      }),
    ).rejects.toThrow();
  });

  it('rejects assignment to a CompanyAdmin target', async () => {
    userRepo.findById.mockResolvedValue({ id: 't1', role: 'CompanyAdmin' });
    await expect(service.assign('t1', { presetId: null })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('assigning null resets to the role default', async () => {
    userRepo.findById.mockResolvedValue({
      id: 't1',
      role: 'Recruiter',
      email: 'r@acme.com',
    });
    await service.assign('t1', { presetId: null });
    expect(userRepo.updatePreset).toHaveBeenCalledWith(
      't1',
      null,
      'company_c1',
    );
    expect(audit.log).toHaveBeenCalledWith(
      'permissions.preset.assign',
      't1',
      expect.anything(),
    );
  });

  it('rejects deletion of a preset that is in use', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'p1',
      isDefault: false,
      name: 'X',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    permissionRepo.countUsersWithPreset.mockResolvedValue(2);
    await expect(service.remove('p1')).rejects.toThrow();
    expect(permissionRepo.remove).not.toHaveBeenCalled();
  });
});
