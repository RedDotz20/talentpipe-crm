import { Module } from '@nestjs/common';
import { StorageService } from '@/common/storage/storage.service';
import { storageProvider } from '@/common/storage/storage.provider';

@Module({
  providers: [StorageService, storageProvider],
  exports: [StorageService],
})
export class StorageModule {}
