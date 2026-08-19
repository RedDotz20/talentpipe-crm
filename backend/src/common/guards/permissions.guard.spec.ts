import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '@/common/decorators/permissions.decorator';
import { PermissionRepository } from '@/repositories/permission.repository';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let repo: { findEffectivePermissions: jest.Mock };
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    repo = { findEffectivePermissions: jest.fn() };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      repo as unknown as PermissionRepository,
    );
  });

  it('allows when no @Permissions metadata is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('allows SuperAdmin without a DB lookup', async () => {
    reflector.getAllAndOverride.mockReturnValue(['jobs.create_edit']);
    const ctx = makeContext({
      user: { userId: 'sa', companyId: null, role: 'SuperAdmin' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(repo.findEffectivePermissions).not.toHaveBeenCalled();
  });

  it('allows a company user holding the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['jobs.create_edit']);
    repo.findEffectivePermissions.mockResolvedValue([
      'jobs.view',
      'jobs.create_edit',
    ]);
    const ctx = makeContext({
      user: { userId: 'u1', companyId: 'c1', role: 'Recruiter' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(repo.findEffectivePermissions).toHaveBeenCalledWith(
      'u1',
      'company_c1',
    );
  });

  it('denies a company user missing the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['jobs.create_edit']);
    repo.findEffectivePermissions.mockResolvedValue(['jobs.view']);
    const ctx = makeContext({
      user: { userId: 'u1', companyId: 'c1', role: 'Recruiter' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('requires ALL listed permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'applications.view',
      'applications.move',
    ]);
    repo.findEffectivePermissions.mockResolvedValue(['applications.view']);
    const ctx = makeContext({
      user: { userId: 'u1', companyId: 'c1', role: 'HiringManager' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
