import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { storageProvider } from './storage.provider';

@Module({
  providers: [StorageService, storageProvider],
  exports: [StorageService],
})
export class StorageModule {}
