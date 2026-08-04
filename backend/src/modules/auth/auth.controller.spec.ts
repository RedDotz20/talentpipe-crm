import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RedisService } from '../../common/redis/redis.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimiterGuard } from '../../common/middlewares/login-rate-limiter.guard';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            orgSignup: jest.fn(),
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
    const signinPath = Reflect.getMetadata(
      PATH_METADATA,
      AuthController.prototype.signin,
    );
    const signinGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthController.prototype.signin,
    );
    const signupGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthController.prototype.signup,
    );
    const refreshGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthController.prototype.refresh,
    );

    expect(signinPath).toBe('signin');
    expect(signinGuards).toEqual([LoginRateLimiterGuard]);
    expect(signupGuards).toBeUndefined();
    expect(refreshGuards).toBeUndefined();
  });
});
