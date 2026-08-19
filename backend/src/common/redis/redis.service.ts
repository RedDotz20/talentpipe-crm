import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_PROVIDER } from '@/common/redis/redis.constants';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_PROVIDER) private readonly redis: Redis) {}

  async incrementWithWindow(
    key: string,
    windowSeconds: number,
  ): Promise<number | null> {
    try {
      const result = await this.redis.eval(
        `local created = redis.call('SET', KEYS[1], '1', 'EX', ARGV[1], 'NX')
if created then
  return 1
end
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count`,
        1,
        key,
        windowSeconds,
      );
      return result === null || result === undefined ? null : Number(result);
    } catch (error) {
      this.logger.error(
        `Redis increment failed for key "${key}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  async advanceDashboardGeneration(
    generationKey: string,
    summaryKey: string,
  ): Promise<number | null> {
    try {
      const result = await this.redis.eval(
        `local generation = redis.call('INCR', KEYS[1])
redis.call('DEL', KEYS[2])
return generation`,
        2,
        generationKey,
        summaryKey,
      );
      return result === null || result === undefined ? null : Number(result);
    } catch (error) {
      this.logger.error(
        `Redis dashboard invalidation failed for key "${summaryKey}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  async setIfGenerationMatches(
    generationKey: string,
    summaryKey: string,
    expectedGeneration: number,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const result = await this.redis.eval(
        `local generation = redis.call('GET', KEYS[1])
if generation == ARGV[1] or (not generation and ARGV[1] == '0') then
  redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`,
        2,
        generationKey,
        summaryKey,
        expectedGeneration,
        value,
        ttlSeconds,
      );
      return Number(result) === 1;
    } catch (error) {
      this.logger.error(
        `Redis compare-and-set failed for key "${summaryKey}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(
        `Redis read failed for key "${key}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.error(
        `Redis write failed for key "${key}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(
        `Redis delete failed for key "${key}"`,
        error instanceof Error ? error.stack : String(error),
      );
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
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
