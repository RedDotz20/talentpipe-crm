import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_PROVIDER } from './redis.constants';
import { redisProvider } from './redis.provider';
import { RedisService } from './redis.service';

@Module({
  providers: [redisProvider, RedisService],
  exports: [REDIS_PROVIDER, RedisService],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_PROVIDER) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
