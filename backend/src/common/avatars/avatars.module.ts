import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/common/auth/auth-core.module';
import { StorageModule } from '@/common/storage/storage.module';
import { AvatarsController } from '@/common/avatars/avatars.controller';
import { AvatarsService } from '@/common/avatars/avatars.service';

@Module({
  imports: [AuthCoreModule, StorageModule],
  controllers: [AvatarsController],
  providers: [AvatarsService],
  exports: [AvatarsService],
})
export class AvatarsModule {}
