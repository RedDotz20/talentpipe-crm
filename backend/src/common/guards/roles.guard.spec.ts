import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

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

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows when no @Roles metadata is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
  });

  it('allows when req.user.role is in the allowed roles', async () => {
    reflector.getAllAndOverride.mockReturnValue(['OrgAdmin']);
    const ctx = makeContext({ user: { role: 'OrgAdmin' } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('denies when req.user.role is not in the allowed roles', async () => {
    reflector.getAllAndOverride.mockReturnValue(['OrgAdmin']);
    const ctx = makeContext({ user: { role: 'HiringManager' } });
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('authenticates via JWT when req.user is missing (no strategy registered -> rejects)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['OrgAdmin']);
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Unknown authentication strategy',
    );
  });
});
