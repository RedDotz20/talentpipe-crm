import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { applications, users } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class UsageRepository extends BaseRepository {
  async countUsers(schema: string) {
    return this.withDb(schema, async (db) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .execute();
      return Number(row?.count ?? 0);
    });
  }

  async countApplications(schema: string) {
    return this.withDb(schema, async (db) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(applications)
        .execute();
      return Number(row?.count ?? 0);
    });
  }
}
