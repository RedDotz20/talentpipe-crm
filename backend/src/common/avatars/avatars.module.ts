import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { StorageModule } from '../storage/storage.module';
import { AvatarsController } from './avatars.controller';
import { AvatarsService } from './avatars.service';

@Module({
  imports: [AuthCoreModule, StorageModule],
  controllers: [AvatarsController],
  providers: [AvatarsService],
  exports: [AvatarsService],
})
export class AvatarsModule {}
