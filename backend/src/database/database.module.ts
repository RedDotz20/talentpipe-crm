import { Module } from '@nestjs/common';
import { DrizzleSchemaService } from '@/database/drizzle-schema.service';
import { drizzleProvider } from '@/database/drizzle.provider';

@Module({
  providers: [DrizzleSchemaService, drizzleProvider],
  exports: [DrizzleSchemaService, drizzleProvider],
})
export class DatabaseModule {}
