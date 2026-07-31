import { Injectable } from '@nestjs/common';
import {
  DrizzleSchemaService,
  DrizzleDB,
} from '../database/drizzle-schema.service';

@Injectable()
export abstract class BaseRepository {
  constructor(protected readonly drizzleSchema: DrizzleSchemaService) {}

  protected async withDb<T>(
    schema: string,
    fn: (db: DrizzleDB) => Promise<T>,
  ): Promise<T> {
    let handle: { db: DrizzleDB; release: () => void };
    if (schema === 'public') {
      handle = await this.drizzleSchema.forPublic();
    } else if (schema === 'current') {
      handle = await this.drizzleSchema.forCurrentTenant();
    } else {
      handle = await this.drizzleSchema.forSchema(schema);
    }
    try {
      return await fn(handle.db);
    } finally {
      handle.release();
    }
  }
}
