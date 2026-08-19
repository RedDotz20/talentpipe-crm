import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE_PROVIDER } from '@/database/drizzle.provider';
import { getSchema } from '@/common/context/company-context';

export type DrizzleDB = NodePgDatabase;

@Injectable()
export class DrizzleSchemaService {
  constructor(@Inject(DRIZZLE_PROVIDER) private pool: Pool) {}

  async forCurrentCompany(): Promise<{ db: DrizzleDB; release: () => void }> {
    const schemaName = getSchema();
    const client = await this.pool.connect();
    await client.query(`SET search_path TO "${schemaName}", public`);
    const db = drizzle({ client });
    return { db, release: () => client.release() };
  }

  async forSchema(
    schemaName: string,
  ): Promise<{ db: DrizzleDB; release: () => void }> {
    const client = await this.pool.connect();
    await client.query(`SET search_path TO "${schemaName}", public`);
    const db = drizzle({ client });
    return { db, release: () => client.release() };
  }

  async forPublic(): Promise<{ db: DrizzleDB; release: () => void }> {
    const client = await this.pool.connect();
    await client.query('SET search_path TO public');
    const db = drizzle({ client });
    return { db, release: () => client.release() };
  }
}
