import { Module } from '@nestjs/common';
import { RedisModule } from '@/common/redis/redis.module';
import { CacheService } from '@/common/cache/cache.service';

@Module({
  imports: [RedisModule],
  providers: [CacheService],
  exports: [RedisModule, CacheService],
})
export class CacheModule {}
