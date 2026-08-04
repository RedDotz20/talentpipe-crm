import { Injectable } from '@nestjs/common';
import { eq, desc, and } from 'drizzle-orm';
import {
  applications,
  candidates,
  jobPostings,
  pipelineStages,
} from '../database/schema';
import { BaseRepository } from './base.repository';

const selectAppRow = {
  id: applications.id,
  candidateId: applications.candidateId,
  jobPostingId: applications.jobPostingId,
  currentStageId: applications.currentStageId,
  matchScore: applications.matchScore,
  appliedAt: applications.appliedAt,
  candidateName: candidates.name,
  candidateEmail: candidates.email,
  jobTitle: jobPostings.title,
  stageName: pipelineStages.name,
  // Snapshot fields
  applicationCandidateName: applications.candidateName,
  applicationCandidateEmail: applications.candidateEmail,
  applicationCandidatePhone: applications.candidatePhone,
  appliedSkillIds: applications.appliedSkillIds,
  coverLetter: applications.coverLetter,
};

@Injectable()
export class ApplicationRepository extends BaseRepository {
  async create(
    data: {
      candidateId: string;
      jobPostingId: string;
      currentStageId: string;
      candidateName: string;
      candidateEmail: string;
      candidatePhone: string | null;
      appliedSkillIds: string[];
      coverLetter: string | null;
      matchScore: number;
    },
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

  async findAll(
    filters?: { jobPostingId?: string; stageId?: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const conditions = [];
      if (filters?.jobPostingId) {
        conditions.push(eq(applications.jobPostingId, filters.jobPostingId));
      }
      if (filters?.stageId) {
        conditions.push(eq(applications.currentStageId, filters.stageId));
      }
      return db
        .select(selectAppRow)
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .leftJoin(
          pipelineStages,
          eq(applications.currentStageId, pipelineStages.id),
        )
        .where(and(...conditions))
        .orderBy(desc(applications.appliedAt))
        .execute();
    });
  }

  async findById(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select(selectAppRow)
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .leftJoin(
          pipelineStages,
          eq(applications.currentStageId, pipelineStages.id),
        )
        .where(eq(applications.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async findByIdForCandidate(id: string, schema: string) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select(selectAppRow)
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .leftJoin(
          pipelineStages,
          eq(applications.currentStageId, pipelineStages.id),
        )
        .where(eq(applications.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateStage(id: string, stageId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(applications)
        .set({ currentStageId: stageId })
        .where(eq(applications.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async findByCandidateId(candidateId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      return db
        .select(selectAppRow)
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .leftJoin(
          pipelineStages,
          eq(applications.currentStageId, pipelineStages.id),
        )
        .where(eq(applications.candidateId, candidateId))
        .orderBy(desc(applications.appliedAt))
        .execute();
    });
  }

  async updateMatchScore(id: string, matchScore: number, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(applications)
        .set({ matchScore })
        .where(eq(applications.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async delete(id: string, schema = 'current') {
    return this.withDb(schema, (db) =>
      db.delete(applications).where(eq(applications.id, id)).execute(),
    );
  }
}
