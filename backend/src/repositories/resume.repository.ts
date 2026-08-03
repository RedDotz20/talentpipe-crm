import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { resumes } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class ResumeRepository extends BaseRepository {
  async findByCandidateId(candidateId: string) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .select()
        .from(resumes)
        .where(eq(resumes.candidateId, candidateId))
        .orderBy(desc(resumes.uploadedAt))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: { candidateId: string; fileUrl: string }) {
    return this.withDb('current', async (db) => {
      const rows = await db.insert(resumes).values(data).returning().execute();
      return rows[0];
    });
  }
}
