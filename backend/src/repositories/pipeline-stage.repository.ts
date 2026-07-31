import { Injectable } from '@nestjs/common';
import { pipelineStages } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class PipelineStageRepository extends BaseRepository {
  async findFirst(schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(pipelineStages)
        .orderBy(pipelineStages.order)
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async createMany(names: string[], schema = 'current') {
    return this.withDb(schema, async (db) => {
      await db
        .insert(pipelineStages)
        .values(names.map((name, order) => ({ name, order })))
        .execute();
    });
  }
}
