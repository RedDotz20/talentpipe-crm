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

  async invalidateCompanyDashboard(companyId: string): Promise<void> {
    try {
      await this.redis.advanceDashboardGeneration(
        dashboardGenerationKey(companyId),
        dashboardSummaryKey(companyId),
      );
    } catch (error) {
      this.logger.error(
        `Company dashboard cache invalidation failed for company "${companyId}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async getCompanyDashboardGeneration(
    companyId: string,
  ): Promise<number | null> {
    try {
      const value = await this.redis.get(dashboardGenerationKey(companyId));
      if (value === null) return 0;

      const generation = Number(value);
      return Number.isFinite(generation) ? generation : null;
    } catch (error) {
      this.logger.error(
        `Company dashboard generation read failed for company "${companyId}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  async setCompanyDashboardIfGeneration<T>(
    companyId: string,
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
        dashboardGenerationKey(companyId),
        dashboardSummaryKey(companyId),
        generation,
        serialized,
        ttlSeconds,
      );
    } catch (error) {
      this.logger.error(
        `Company dashboard compare-and-set failed for company "${companyId}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}
