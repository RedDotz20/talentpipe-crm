import { Injectable } from '@nestjs/common';
import { eq, and, count } from 'drizzle-orm';
import { candidateBookmarks } from '../database/schema';
import { BaseRepository } from './base.repository';
import {
  andConditions,
  listEnvelope,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';

@Injectable()
export class CandidateBookmarkRepository extends BaseRepository {
  async findByCandidate(candidateAccountId: string, query: ListQueryDto) {
    return this.withDb('public', async (db) => {
      const conditions = andConditions(
        [eq(candidateBookmarks.candidateAccountId, candidateAccountId)],
        toWhere(query, [
          candidateBookmarks.jobTitle,
          candidateBookmarks.companyName,
        ]),
      );
      const sortOptions = {
        sortMap: {
          createdAt: candidateBookmarks.createdAt,
          jobTitle: candidateBookmarks.jobTitle,
          companyName: candidateBookmarks.companyName,
        },
        defaultSortBy: 'createdAt',
      };
      const { offset, limit } = toPagination(query);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(candidateBookmarks)
          .where(conditions)
          .orderBy(toOrderBy(query, sortOptions))
          .limit(limit)
          .offset(offset)
          .execute(),
        db
          .select({ value: count() })
          .from(candidateBookmarks)
          .where(conditions)
          .execute(),
      ]);
      return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
    });
  }

  async findByJob(
    candidateAccountId: string,
    companyId: string,
    jobPostingId: string,
  ) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateBookmarks)
        .where(
          and(
            eq(candidateBookmarks.candidateAccountId, candidateAccountId),
            eq(candidateBookmarks.companyId, companyId),
            eq(candidateBookmarks.jobPostingId, jobPostingId),
          ),
        )
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: {
    candidateAccountId: string;
    companyId: string;
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
