import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../redis/redis.service';

type SigninRequest = {
  body?: { email?: unknown };
  ip?: string;
};

type ResponseWithHeaders = {
  setHeader: (name: string, value: number) => void;
};

export class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class LoginRateLimiterGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<SigninRequest>();
    const response = http.getResponse<ResponseWithHeaders>();
    const rawEmail = request.body?.email;
    const normalizedEmail =
      typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const emailHash = createHash('sha256')
      .update(normalizedEmail)
      .digest('hex');
    const ip = request.ip ?? 'unknown';
    const key = `ratelimit:login:${emailHash}:${ip}`;
    let count: number | null;

    try {
      count = await this.redis.incrementWithWindow(key, 900);
    } catch {
      return true;
    }

    if (count === null) {
      return true;
    }

    if (count > 5) {
      response.setHeader('Retry-After', 900);
      throw new TooManyRequestsException('Too many sign-in attempts');
    }

    return true;
  }
}
