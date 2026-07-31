import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { candidateBookmarks } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateBookmarkRepository extends BaseRepository {
  async findByCandidate(candidateAccountId: string) {
    return this.withDb('public', async (db) => {
      return db
        .select()
        .from(candidateBookmarks)
        .where(eq(candidateBookmarks.candidateAccountId, candidateAccountId))
        .execute();
    });
  }

  async findByJob(
    candidateAccountId: string,
    tenantId: string,
    jobPostingId: string,
  ) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateBookmarks)
        .where(
          and(
            eq(candidateBookmarks.candidateAccountId, candidateAccountId),
            eq(candidateBookmarks.tenantId, tenantId),
            eq(candidateBookmarks.jobPostingId, jobPostingId),
          ),
        )
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: {
    candidateAccountId: string;
    tenantId: string;
    jobPostingId: string;
    jobTitle: string;
    companyName: string;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(candidateBookmarks)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async delete(id: string, candidateAccountId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(candidateBookmarks)
        .where(
          and(
            eq(candidateBookmarks.id, id),
            eq(candidateBookmarks.candidateAccountId, candidateAccountId),
          ),
        )
        .execute(),
    );
  }
}
