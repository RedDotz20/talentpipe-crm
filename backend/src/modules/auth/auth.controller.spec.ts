import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RedisService } from '@/common/redis/redis.service';
import { AuthController } from '@/modules/auth/auth.controller';
import { AuthService } from '@/modules/auth/auth.service';
import { LoginRateLimiterGuard } from '@/common/middlewares/login-rate-limiter.guard';

type AuthControllerMethodName =
  'signin' | 'signup' | 'refresh' | 'companySignup' | 'logout';
type ControllerMethod = (...args: never[]) => unknown;

const getControllerMethod = (
  methodName: AuthControllerMethodName,
): ControllerMethod => {
  const method = Object.getOwnPropertyDescriptor(
    AuthController.prototype,
    methodName,
  )?.value as unknown;
  if (typeof method !== 'function') {
    throw new Error(`AuthController method ${methodName} was not found`);
  }
  return method as ControllerMethod;
};

const getMetadata = <T>(metadataKey: string, target: object): T | undefined => {
  const metadata: unknown = Reflect.getMetadata(metadataKey, target);
  return metadata as T | undefined;
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            companySignup: jest.fn(),
            signin: jest.fn(),
            candidateSignup: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: { incrementWithWindow: jest.fn() },
        },
        LoginRateLimiterGuard,
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('applies the login rate limiter only to sign-in', () => {
    const signinMethod = getControllerMethod('signin');
    const signinPath = getMetadata<string>(PATH_METADATA, signinMethod);
    const signinGuards = getMetadata<unknown[]>(GUARDS_METADATA, signinMethod);
    const signupGuards = getMetadata<unknown[]>(
      GUARDS_METADATA,
      getControllerMethod('signup'),
    );
    const refreshGuards = getMetadata<unknown[]>(
      GUARDS_METADATA,
      getControllerMethod('refresh'),
    );
    const companySignupGuards = getMetadata<unknown[]>(
      GUARDS_METADATA,
      getControllerMethod('companySignup'),
    );
    const logoutGuards = getMetadata<unknown[]>(
      GUARDS_METADATA,
      getControllerMethod('logout'),
    );

    expect(signinPath).toBe('signin');
    expect(signinGuards).toEqual([LoginRateLimiterGuard]);
    expect(signupGuards).toBeUndefined();
    expect(refreshGuards).toBeUndefined();
    expect(companySignupGuards).toBeUndefined();
    expect(logoutGuards).not.toContain(LoginRateLimiterGuard);
  });
});
