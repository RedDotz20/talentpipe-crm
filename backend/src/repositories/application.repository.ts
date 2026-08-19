import { Injectable } from '@nestjs/common';
import { eq, desc, and, count, asc, ilike, or } from 'drizzle-orm';
import {
  applications,
  candidates,
  jobPostings,
  pipelineStages,
} from '@/database/schema';
import { BaseRepository } from '@/repositories/base.repository';

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
  candidateAccountId: candidates.candidateAccountId,
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

  async findAllFiltered(
    filters: {
      jobPostingId?: string;
      stageId?: string;
      search?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
    },
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
      if (filters?.search) {
        conditions.push(
          or(
            ilike(candidates.name, `%${filters.search}%`),
            ilike(jobPostings.title, `%${filters.search}%`),
          ),
        );
      }
      const sortDir = filters?.sortDir ?? 'desc';
      const orderBy =
        filters?.sortBy === 'candidateName'
          ? sortDir === 'asc'
            ? asc(candidates.name)
            : desc(candidates.name)
          : sortDir === 'asc'
            ? asc(applications.appliedAt)
            : desc(applications.appliedAt);
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
        .orderBy(orderBy)
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

  async updateStage(
    id: string,
    stageId: string | null,
    schema = 'current',
    expectedCurrentStageId?: string,
  ) {
    return this.withDb(schema, async (db) => {
      const where = expectedCurrentStageId
        ? and(
            eq(applications.id, id),
            eq(applications.currentStageId, expectedCurrentStageId),
          )
        : eq(applications.id, id);
      const rows = await db
        .update(applications)
        .set({ currentStageId: stageId })
        .where(where)
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

  async countByJobPosting(jobPostingId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select({ value: count() })
        .from(applications)
        .where(eq(applications.jobPostingId, jobPostingId))
        .execute();
      return Number(rows[0]?.value ?? 0);
    });
  }

  async delete(id: string, schema = 'current') {
    return this.withDb(schema, (db) =>
      db.delete(applications).where(eq(applications.id, id)).execute(),
    );
  }
}
