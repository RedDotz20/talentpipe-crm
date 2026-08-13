import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { applications, jobPostings, users } from '../database/schema';
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

  async countJobsByStatus(schema: string) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select({
          status: jobPostings.status,
          count: sql<number>`count(*)::int`,
        })
        .from(jobPostings)
        .groupBy(jobPostings.status)
        .execute();
      return rows.map((row) => ({
        status: row.status,
        count: Number(row.count ?? 0),
      }));
    });
  }
}
