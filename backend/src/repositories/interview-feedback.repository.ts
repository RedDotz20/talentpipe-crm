import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { interviewFeedbacks } from '@/database/schema';
import { BaseRepository } from '@/repositories/base.repository';

@Injectable()
export class InterviewFeedbackRepository extends BaseRepository {
  async findByInterviewId(interviewId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(interviewFeedbacks)
        .where(eq(interviewFeedbacks.interviewId, interviewId))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(
    data: { interviewId: string; rating: number; comments: string | null },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(interviewFeedbacks)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
