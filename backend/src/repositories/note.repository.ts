import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { notes } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class NoteRepository extends BaseRepository {
  async findByApplicationId(applicationId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      return db
        .select()
        .from(notes)
        .where(eq(notes.applicationId, applicationId))
        .orderBy(desc(notes.createdAt))
        .execute();
    });
  }

  async create(data: {
    applicationId: string;
    authorUserId: string;
    content: string;
  }) {
    return this.withDb('current', async (db) => {
      const rows = await db.insert(notes).values(data).returning().execute();
      return rows[0];
    });
  }
}
