import { Injectable } from '@nestjs/common';
import { applications } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class ApplicationRepository extends BaseRepository {
  async create(
    data: { candidateId: string; jobPostingId: string; currentStageId: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(applications)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
