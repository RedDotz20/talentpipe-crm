import { Injectable } from '@nestjs/common';
import { ilike, inArray } from 'drizzle-orm';
import { skills } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class SkillRepository extends BaseRepository {
  async search(query?: string) {
    return this.withDb('public', async (db) => {
      if (query) {
        return db
          .select()
          .from(skills)
          .where(ilike(skills.name, `%${query}%`))
          .orderBy(skills.name)
          .limit(20)
          .execute();
      }
      return db.select().from(skills).orderBy(skills.name).limit(50).execute();
    });
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.withDb('public', async (db) => {
      return db.select().from(skills).where(inArray(skills.id, ids)).execute();
    });
  }

  async findAll() {
    return this.withDb('public', async (db) => {
      return db.select().from(skills).orderBy(skills.name).execute();
    });
  }
}
