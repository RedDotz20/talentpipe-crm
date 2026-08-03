import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { resumes, resumeSkills, skills } from '../database/schema';
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

  async setResumeSkills(resumeId: string, skillIds: string[]) {
    return this.withDb('current', async (db) => {
      await db
        .delete(resumeSkills)
        .where(eq(resumeSkills.resumeId, resumeId))
        .execute();
      if (skillIds.length > 0) {
        await db
          .insert(resumeSkills)
          .values(skillIds.map((skillId) => ({ resumeId, skillId })))
          .execute();
      }
    });
  }

  async findSkillsByResumeId(resumeId: string) {
    return this.withDb('current', async (db) => {
      return db
        .select({
          id: skills.id,
          name: skills.name,
          category: skills.category,
        })
        .from(resumeSkills)
        .innerJoin(skills, eq(resumeSkills.skillId, skills.id))
        .where(eq(resumeSkills.resumeId, resumeId))
        .execute();
    });
  }
}
