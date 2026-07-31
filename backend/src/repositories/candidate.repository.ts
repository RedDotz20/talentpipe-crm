import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { candidates } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateRepository extends BaseRepository {
  async findAll() {
    return this.withDb('current', async (db) => {
      return db
        .select()
        .from(candidates)
        .orderBy(desc(candidates.createdAt))
        .execute();
    });
  }

  async findById(id: string) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async findByEmail(email: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(
    data: { name: string; email?: string | null; phone?: string | null },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(candidates)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
