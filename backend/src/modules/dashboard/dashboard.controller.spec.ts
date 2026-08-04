import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DashboardController } from './dashboard.controller';

const INTERNAL_ROLES = [
  'OrgAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
];

type DashboardControllerMethodName = 'getSummary';
type ControllerMethod = (...args: never[]) => unknown;

const getControllerMethod = (
  methodName: DashboardControllerMethodName,
): ControllerMethod => {
  const method = Object.getOwnPropertyDescriptor(
    DashboardController.prototype,
    methodName,
  )?.value as unknown;
  if (typeof method !== 'function') {
    throw new Error(`DashboardController method ${methodName} was not found`);
  }
  return method as ControllerMethod;
};

const getMetadata = <T>(metadataKey: string, target: object): T | undefined => {
  const metadata: unknown = Reflect.getMetadata(metadataKey, target);
  return metadata as T | undefined;
};

const makeContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getHandler: () => getControllerMethod('getSummary'),
    getClass: () => DashboardController,
  }) as unknown as ExecutionContext;

describe('DashboardController authorization', () => {
  const guard = new RolesGuard(new Reflector());

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires exactly the internal dashboard roles', () => {
    expect(
      getMetadata<string[]>(ROLES_KEY, getControllerMethod('getSummary')),
    ).toEqual(INTERNAL_ROLES);
  });

  it.each(INTERNAL_ROLES)('allows the %s role', async (role) => {
    await expect(
      guard.canActivate(makeContext({ user: { role } })),
    ).resolves.toBe(true);
  });

  it.each(['Candidate', 'SuperAdmin'])('denies the %s role', async (role) => {
    await expect(
      guard.canActivate(makeContext({ user: { role } })),
    ).resolves.toBe(false);
  });

  it('denies a request with no authenticated user', async () => {
    const jwtAuthGuard = AuthGuard('jwt');
    const authenticate = jest
      .spyOn(jwtAuthGuard.prototype, 'canActivate')
      .mockResolvedValue(false);

    await expect(guard.canActivate(makeContext({}))).resolves.toBe(false);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
});
