import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_PROVIDER } from '@/common/redis/redis.constants';

export const redisProvider = {
  provide: REDIS_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    }),
};
