import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisModule } from '@/common/redis/redis.module';
import { RedisService } from '@/common/redis/redis.service';

type MockRedis = {
  eval: jest.Mock;
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  scan: jest.Mock;
  quit: jest.Mock;
  keys: jest.Mock;
};

function createRedisMock(): MockRedis {
  return {
    eval: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
    quit: jest.fn(),
    keys: jest.fn(),
  };
}

describe('RedisService', () => {
  let redis: MockRedis;
  let service: RedisService;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    redis = createRedisMock();
    service = new RedisService(redis as unknown as Redis);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerError.mockRestore();
  });

  it('sets the expiry only for the first increment', async () => {
    redis.eval.mockResolvedValue(1);

    await expect(service.incrementWithWindow('key', 900)).resolves.toBe(1);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining(
        "redis.call('SET', KEYS[1], '1', 'EX', ARGV[1], 'NX')",
      ),
      1,
      'key',
      900,
    );
  });

  it('does not set a second expiry for an existing counter', async () => {
    redis.eval.mockResolvedValue(2);

    await expect(service.incrementWithWindow('key', 900)).resolves.toBe(2);

    expect(redis.eval).toHaveBeenCalledTimes(1);
  });

  it('returns null when an increment fails', async () => {
    redis.eval.mockRejectedValue(new Error('redis down'));

    await expect(service.incrementWithWindow('key', 900)).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalled();
  });

  it('uses one atomic script for dashboard generation invalidation', async () => {
    redis.eval.mockResolvedValue(3);

    await expect(
      service.advanceDashboardGeneration('generation', 'summary'),
    ).resolves.toBe(3);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('DEL', KEYS[2])"),
      2,
      'generation',
      'summary',
    );
  });

  it('suppresses a dashboard write when the generation changed', async () => {
    redis.eval.mockResolvedValue(0);

    await expect(
      service.setIfGenerationMatches('generation', 'summary', 2, '{}', 60),
    ).resolves.toBe(false);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET', KEYS[1])"),
      2,
      'generation',
      'summary',
      2,
      '{}',
      60,
    );
  });

  it('returns the stored value from get', async () => {
    redis.get.mockResolvedValue('value');

    await expect(service.get('key')).resolves.toBe('value');
  });

  it('returns null when get fails', async () => {
    redis.get.mockRejectedValue(new Error('redis down'));

    await expect(service.get('key')).resolves.toBeNull();
  });

  it('sets values with an expiry', async () => {
    redis.set.mockResolvedValue('OK');

    await expect(service.set('key', 'value', 60)).resolves.toBeUndefined();

    expect(redis.set).toHaveBeenCalledWith('key', 'value', 'EX', 60);
  });

  it('deletes a key without exposing Redis errors', async () => {
    redis.del.mockRejectedValue(new Error('redis down'));

    await expect(service.del('key')).resolves.toBeUndefined();
  });

  it('invalidates keys with SCAN and DEL only', async () => {
    redis.scan
      .mockResolvedValueOnce(['1', ['key:1', 'key:2']])
      .mockResolvedValueOnce(['0', ['key:3']]);
    redis.del.mockResolvedValue(1);

    await expect(service.invalidate('key:*')).resolves.toBeUndefined();

    expect(redis.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'key:*',
      'COUNT',
      100,
    );
    expect(redis.scan).toHaveBeenNthCalledWith(
      2,
      '1',
      'MATCH',
      'key:*',
      'COUNT',
      100,
    );
    expect(redis.del).toHaveBeenNthCalledWith(1, 'key:1', 'key:2');
    expect(redis.del).toHaveBeenNthCalledWith(2, 'key:3');
    expect(redis.keys).not.toHaveBeenCalled();
  });
});

describe('RedisModule', () => {
  it('quits the injected client during module shutdown', async () => {
    const redis = createRedisMock();
    redis.quit.mockResolvedValue('OK');
    const module = new RedisModule(redis as unknown as Redis);

    await expect(module.onModuleDestroy()).resolves.toBeUndefined();
    expect(redis.quit).toHaveBeenCalledTimes(1);
  });
});
