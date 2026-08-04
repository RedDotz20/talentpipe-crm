import { Injectable, Logger } from '@nestjs/common';
import { dashboardSummaryKey } from './cache.constants';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error) {
      this.logger.error(`Cache read failed for key "${key}"`, String(error));
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error('Cache value could not be serialized');
      }
      await this.redis.set(key, serialized, ttlSeconds);
    } catch (error) {
      this.logger.error(`Cache write failed for key "${key}"`, String(error));
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      await this.redis.invalidate(pattern);
    } catch (error) {
      this.logger.error(
        `Cache invalidation failed for pattern "${pattern}"`,
        String(error),
      );
    }
  }

  async invalidateTenantDashboard(tenantId: string): Promise<void> {
    try {
      await this.redis.del(dashboardSummaryKey(tenantId));
    } catch (error) {
      this.logger.error(
        `Tenant dashboard cache invalidation failed for tenant "${tenantId}"`,
        String(error),
      );
    }
  }
}
