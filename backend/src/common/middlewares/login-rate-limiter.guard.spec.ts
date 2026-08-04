import { ExecutionContext } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../redis/redis.service';
import {
  LoginRateLimiterGuard,
  TooManyRequestsException,
} from './login-rate-limiter.guard';

type LoginRequest = {
  body: { email: string };
  ip?: string;
};

type LoginResponse = {
  setHeader: jest.Mock;
};

function makeContext(
  request: LoginRequest,
  response: LoginResponse,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('LoginRateLimiterGuard', () => {
  let redis: { incrementWithWindow: jest.Mock };
  let guard: LoginRateLimiterGuard;
  let request: LoginRequest;
  let response: LoginResponse;
  let context: ExecutionContext;

  beforeEach(() => {
    redis = { incrementWithWindow: jest.fn() };
    guard = new LoginRateLimiterGuard(redis as unknown as RedisService);
    request = { body: { email: ' User@Example.com ' }, ip: '127.0.0.1' };
    response = { setHeader: jest.fn() };
    context = makeContext(request, response);
  });

  it('allows the fifth attempt', async () => {
    redis.incrementWithWindow.mockResolvedValue(5);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(redis.incrementWithWindow).toHaveBeenCalledWith(
      expect.any(String),
      900,
    );
  });

  it('rejects the sixth attempt with retry metadata', async () => {
    redis.incrementWithWindow.mockResolvedValue(6);

    await expect(guard.canActivate(context)).rejects.toThrow(
      TooManyRequestsException,
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', 900);
  });

  it('normalizes the email before hashing the key', async () => {
    redis.incrementWithWindow.mockResolvedValue(1);

    await guard.canActivate(context);

    const normalizedEmailHash = createHash('sha256')
      .update('user@example.com')
      .digest('hex');
    expect(redis.incrementWithWindow).toHaveBeenCalledWith(
      `ratelimit:login:${normalizedEmailHash}:127.0.0.1`,
      900,
    );
  });

  it('allows sign-in when Redis is unavailable', async () => {
    redis.incrementWithWindow.mockResolvedValue(null);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
