import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_PROVIDER } from '@/common/redis/redis.constants';
import { redisProvider } from '@/common/redis/redis.provider';
import { RedisService } from '@/common/redis/redis.service';

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
