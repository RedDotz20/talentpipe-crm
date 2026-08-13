import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
    findByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    countUsersWithPreset: jest.fn(),
  };
  const userRepo = {
    findById: jest.fn(),
    updatePreset: jest.fn(),
    revertPreset: jest.fn(),
  };
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

  const presetRow = (id: string) => ({
    id,
    isDefault: false,
    name: `Preset ${id}`,
    role: 'Recruiter',
    permissions: [],
    createdBy: null,
    createdAt: new Date(),
  });

  it('bulk remove reverts assigned users then deletes', async () => {
    permissionRepo.findById
      .mockResolvedValueOnce(presetRow('p1'))
      .mockResolvedValueOnce(presetRow('p2'));
    userRepo.revertPreset.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const result = await service.bulkRemove(['p1', 'p2']);
    expect(result).toEqual({ deleted: 2, revertedUsers: 2 });
    expect(permissionRepo.remove).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledTimes(2);
  });

  it('bulk remove rejects when any id is missing (atomic)', async () => {
    permissionRepo.findById
      .mockResolvedValueOnce(presetRow('p1'))
      .mockResolvedValueOnce(null);
    await expect(service.bulkRemove(['p1', 'missing'])).rejects.toThrow(
      NotFoundException,
    );
    expect(permissionRepo.remove).not.toHaveBeenCalled();
    expect(userRepo.revertPreset).not.toHaveBeenCalled();
  });

  it('bulk remove dedupes duplicate ids', async () => {
    permissionRepo.findById.mockResolvedValueOnce(presetRow('p1'));
    userRepo.revertPreset.mockResolvedValue(0);
    const result = await service.bulkRemove(['p1', 'p1']);
    expect(result).toEqual({ deleted: 1, revertedUsers: 0 });
    expect(permissionRepo.findById).toHaveBeenCalledTimes(1);
    expect(userRepo.revertPreset).toHaveBeenCalledTimes(1);
    expect(permissionRepo.remove).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('rejects a preset name that matches a company custom', async () => {
    permissionRepo.findById.mockResolvedValue(null);
    permissionRepo.findByName.mockResolvedValueOnce({
      id: 'other',
      isDefault: false,
      name: 'Recruiter Light',
      role: 'Recruiter',
      permissions: [],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(
      service.create({
        name: 'recruiter light',
        role: 'Recruiter',
        permissions: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a preset name that matches a public default', async () => {
    permissionRepo.findByName
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'def',
        isDefault: true,
        name: 'Recruiter Default',
        role: 'Recruiter',
        permissions: [],
        createdBy: null,
        createdAt: new Date(),
      });
    await expect(
      service.create({
        name: 'Recruiter Default',
        role: 'Recruiter',
        permissions: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows an update that keeps its own name', async () => {
    permissionRepo.findById.mockResolvedValue({
      id: 'p1',
      isDefault: false,
      name: 'Recruiter Light',
      role: 'Recruiter',
      permissions: ['jobs.view'],
      createdBy: null,
      createdAt: new Date(),
    });
    permissionRepo.findByName
      .mockResolvedValueOnce({
        id: 'p1',
        isDefault: false,
        name: 'Recruiter Light',
        role: 'Recruiter',
        permissions: ['jobs.view'],
        createdBy: null,
        createdAt: new Date(),
      })
      .mockResolvedValueOnce(null);
    permissionRepo.update.mockResolvedValue({
      id: 'p1',
      isDefault: false,
      name: 'Recruiter Light',
      role: 'Recruiter',
      permissions: ['jobs.view'],
      createdBy: null,
      createdAt: new Date(),
    });
    await expect(
      service.update('p1', { name: 'recruiter light' }),
    ).resolves.toBeTruthy();
  });
});
