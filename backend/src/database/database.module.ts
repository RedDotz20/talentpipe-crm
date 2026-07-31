import { Module } from '@nestjs/common';
import { DrizzleSchemaService } from './drizzle-schema.service';
import { drizzleProvider } from './drizzle.provider';

@Module({
  providers: [DrizzleSchemaService, drizzleProvider],
  exports: [DrizzleSchemaService, drizzleProvider],
})
export class DatabaseModule {}
