import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { pipelineStages, applications } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class PipelineStageRepository extends BaseRepository {
  async findAll(schema = 'current') {
    return this.withDb(schema, async (db) => {
      return db
        .select()
        .from(pipelineStages)
        .orderBy(pipelineStages.order)
        .execute();
    });
  }

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

  async findById(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(pipelineStages)
        .where(eq(pipelineStages.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: { name: string; order: number }, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(pipelineStages)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async update(
    id: string,
    data: Partial<{ name: string; order: number }>,
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(pipelineStages)
        .set(data)
        .where(eq(pipelineStages.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async delete(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      await db
        .delete(pipelineStages)
        .where(eq(pipelineStages.id, id))
        .execute();
    });
  }

  async countApplicationsForStage(stageId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.currentStageId, stageId))
        .limit(1)
        .execute();
      return rows.length > 0;
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
