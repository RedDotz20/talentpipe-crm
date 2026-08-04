import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { CacheService } from './cache.service';
import { dashboardSummaryKey } from './cache.constants';
import { CacheModule } from './cache.module';
import { RedisService } from '../redis/redis.service';

describe('CacheService', () => {
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    invalidate: jest.Mock;
  };
  let cache: CacheService;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      invalidate: jest.fn(),
    };
    cache = new CacheService(redis as unknown as RedisService);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerError.mockRestore();
  });

  it('parses JSON cache values', async () => {
    redis.get.mockResolvedValue('{"count":2}');

    await expect(cache.get<{ count: number }>('key')).resolves.toEqual({
      count: 2,
    });
  });

  it('returns null when cache reads fail', async () => {
    redis.get.mockRejectedValue(new Error('redis down'));

    await expect(cache.get('key')).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalled();
  });

  it('returns null when cached JSON is invalid', async () => {
    redis.get.mockResolvedValue('{invalid');

    await expect(cache.get('key')).resolves.toBeNull();
  });

  it('serializes values before writing them', async () => {
    redis.set.mockResolvedValue(undefined);

    await expect(cache.set('key', { count: 2 }, 60)).resolves.toBeUndefined();

    expect(redis.set).toHaveBeenCalledWith('key', '{"count":2}', 60);
  });

  it('does not throw when cache writes fail', async () => {
    redis.set.mockRejectedValue(new Error('redis down'));

    await expect(cache.set('key', { count: 2 }, 60)).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });

  it('delegates invalidation to RedisService', async () => {
    redis.invalidate.mockResolvedValue(undefined);

    await expect(cache.invalidate('tenant:*')).resolves.toBeUndefined();

    expect(redis.invalidate).toHaveBeenCalledWith('tenant:*');
  });

  it('does not throw when cache invalidation fails', async () => {
    redis.invalidate.mockRejectedValue(new Error('redis down'));

    await expect(cache.invalidate('tenant:*')).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });

  it('invalidates a tenant dashboard summary key', async () => {
    redis.del.mockResolvedValue(undefined);

    await expect(cache.invalidateTenantDashboard('tenant-1')).resolves.toBeUndefined();

    expect(redis.del).toHaveBeenCalledWith(dashboardSummaryKey('tenant-1'));
  });

  it('does not throw and logs when tenant dashboard invalidation fails', async () => {
    redis.del.mockRejectedValue(new Error('redis down'));

    await expect(
      cache.invalidateTenantDashboard('tenant-1'),
    ).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalled();
  });
});

describe('CacheModule', () => {
  it('imports RedisModule and exports RedisModule plus CacheService', () => {
    const imports = Reflect.getMetadata('imports', CacheModule) as unknown[];
    const exports = Reflect.getMetadata('exports', CacheModule) as unknown[];

    expect(imports).toContain(RedisModule);
    expect(exports).toEqual(
      expect.arrayContaining([RedisModule, CacheService]),
    );
  });
});
