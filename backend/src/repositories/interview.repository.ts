import { Injectable } from '@nestjs/common';
import { eq, asc, and, count, desc, ilike, or, type SQL } from 'drizzle-orm';
import {
  interviews,
  applications,
  candidates,
  jobPostings,
  users,
  interviewFeedbacks,
} from '../database/schema';
import { BaseRepository } from './base.repository';
import { listEnvelope, toPagination } from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';
import type { DrizzleDB } from '../database/drizzle-schema.service';

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

  private buildConditions(
    filters: {
      interviewerId?: string;
      applicationId?: string;
      status?: string;
    },
    query: ListQueryDto,
  ): SQL[] {
    const conditions: SQL[] = [];
    if (filters?.interviewerId) {
      conditions.push(eq(interviews.interviewerId, filters.interviewerId));
    }
    if (filters?.applicationId) {
      conditions.push(eq(interviews.applicationId, filters.applicationId));
    }
    if (filters?.status) {
      conditions.push(eq(interviews.status, filters.status));
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(candidates.name, `%${query.search}%`),
          ilike(jobPostings.title, `%${query.search}%`),
        ) as SQL,
      );
    }
    return conditions;
  }

  private orderByFor(query: ListQueryDto): SQL {
    const sortBy = query.sortBy ?? 'scheduledAt';
    const sortDir = query.sortDir ?? 'asc';
    return sortDir === 'asc'
      ? asc(
          sortBy === 'candidateName' ? candidates.name : interviews.scheduledAt,
        )
      : desc(
          sortBy === 'candidateName' ? candidates.name : interviews.scheduledAt,
        );
  }

  private selectWithJoins(db: DrizzleDB, conditions: SQL[], orderBy: SQL) {
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
      .orderBy(orderBy);
  }

  async findPaginated(
    filters: {
      interviewerId?: string;
      applicationId?: string;
      status?: string;
    },
    query: ListQueryDto,
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const conditions = this.buildConditions(filters, query);
      const { offset, limit } = toPagination(query);
      const base = () =>
        this.selectWithJoins(db, conditions, this.orderByFor(query));
      const [rows, totalRows] = await Promise.all([
        base().limit(limit).offset(offset).execute(),
        db
          .select({ value: count() })
          .from(interviews)
          .innerJoin(
            applications,
            eq(interviews.applicationId, applications.id),
          )
          .innerJoin(candidates, eq(applications.candidateId, candidates.id))
          .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
          .innerJoin(users, eq(interviews.interviewerId, users.id))
          .where(and(...conditions))
          .execute(),
      ]);
      return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
    });
  }

  async findAllFiltered(
    filters: {
      interviewerId?: string;
      applicationId?: string;
      status?: string;
    },
    query: ListQueryDto,
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const conditions = this.buildConditions(filters, query);
      return this.selectWithJoins(
        db,
        conditions,
        this.orderByFor(query),
      ).execute();
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

  async deleteByInterviewer(interviewerId: string, schema = 'current') {
    return this.withDb(schema, (db) =>
      db
        .delete(interviews)
        .where(eq(interviews.interviewerId, interviewerId))
        .execute(),
    );
  }
}
