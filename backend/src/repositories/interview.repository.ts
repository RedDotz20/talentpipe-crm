import { Injectable } from '@nestjs/common';
import { eq, asc, and } from 'drizzle-orm';
import {
  interviews,
  applications,
  candidates,
  jobPostings,
  users,
  interviewFeedbacks,
} from '../database/schema';
import { BaseRepository } from './base.repository';

const selectInterviewRow = {
  id: interviews.id,
  applicationId: interviews.applicationId,
  interviewerId: interviews.interviewerId,
  scheduledAt: interviews.scheduledAt,
  status: interviews.status,
  candidateName: candidates.name,
  candidateEmail: candidates.email,
  jobTitle: jobPostings.title,
  interviewerEmail: users.email,
  rating: interviewFeedbacks.rating,
  comments: interviewFeedbacks.comments,
  submittedAt: interviewFeedbacks.submittedAt,
};

@Injectable()
export class InterviewRepository extends BaseRepository {
  async findAll(
    filters?: { interviewerId?: string; applicationId?: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const conditions = [];
      if (filters?.interviewerId) {
        conditions.push(eq(interviews.interviewerId, filters.interviewerId));
      }
      if (filters?.applicationId) {
        conditions.push(eq(interviews.applicationId, filters.applicationId));
      }
      return db
        .select(selectInterviewRow)
        .from(interviews)
        .innerJoin(applications, eq(interviews.applicationId, applications.id))
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .innerJoin(users, eq(interviews.interviewerId, users.id))
        .leftJoin(
          interviewFeedbacks,
          eq(interviews.id, interviewFeedbacks.interviewId),
        )
        .where(and(...conditions))
        .orderBy(asc(interviews.scheduledAt))
        .execute();
    });
  }

  async findById(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select(selectInterviewRow)
        .from(interviews)
        .innerJoin(applications, eq(interviews.applicationId, applications.id))
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .innerJoin(users, eq(interviews.interviewerId, users.id))
        .leftJoin(
          interviewFeedbacks,
          eq(interviews.id, interviewFeedbacks.interviewId),
        )
        .where(eq(interviews.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(
    data: {
      applicationId: string;
      interviewerId: string;
      scheduledAt: Date;
    },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(interviews)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async update(
    id: string,
    data: { scheduledAt?: Date; status?: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(interviews)
        .set(data)
        .where(eq(interviews.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
}
