import {
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_PROVIDER } from './redis.constants';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_PROVIDER) private readonly redis: Redis) {}

  async incrementWithWindow(
    key: string,
    windowSeconds: number,
  ): Promise<number | null> {
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSeconds);
      }
      return count;
    } catch (error) {
      this.logger.error(`Redis increment failed for key "${key}"`, String(error));
      return null;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Redis read failed for key "${key}"`, String(error));
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.error(`Redis write failed for key "${key}"`, String(error));
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Redis delete failed for key "${key}"`, String(error));
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        cursor = nextCursor;
      } while (cursor !== '0');
    } catch (error) {
      this.logger.error(
        `Redis invalidation failed for pattern "${pattern}"`,
        String(error),
      );
    }
  }
}
