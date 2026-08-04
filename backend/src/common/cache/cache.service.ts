import { Injectable, Logger } from '@nestjs/common';
import { dashboardGenerationKey, dashboardSummaryKey } from './cache.constants';
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
      this.logger.error(
        `Cache read failed for key "${key}"`,
        error instanceof Error ? error.stack : String(error),
      );
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
      this.logger.error(
        `Cache write failed for key "${key}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      await this.redis.invalidate(pattern);
    } catch (error) {
      this.logger.error(
        `Cache invalidation failed for pattern "${pattern}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async invalidateTenantDashboard(tenantId: string): Promise<void> {
    try {
      await this.redis.advanceDashboardGeneration(
        dashboardGenerationKey(tenantId),
        dashboardSummaryKey(tenantId),
      );
    } catch (error) {
      this.logger.error(
        `Tenant dashboard cache invalidation failed for tenant "${tenantId}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async getTenantDashboardGeneration(tenantId: string): Promise<number | null> {
    try {
      const value = await this.redis.get(dashboardGenerationKey(tenantId));
      if (value === null) return 0;

      const generation = Number(value);
      return Number.isFinite(generation) ? generation : null;
    } catch (error) {
      this.logger.error(
        `Tenant dashboard generation read failed for tenant "${tenantId}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  async setTenantDashboardIfGeneration<T>(
    tenantId: string,
    generation: number,
    value: T,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error('Cache value could not be serialized');
      }
      return await this.redis.setIfGenerationMatches(
        dashboardGenerationKey(tenantId),
        dashboardSummaryKey(tenantId),
        generation,
        serialized,
        ttlSeconds,
      );
    } catch (error) {
      this.logger.error(
        `Tenant dashboard compare-and-set failed for tenant "${tenantId}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}
