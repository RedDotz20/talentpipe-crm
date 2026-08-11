import { Injectable } from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';
import { candidateApplicationsIndex } from '../database/schema';
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
export class CandidateApplicationsIndexRepository extends BaseRepository {
  async findByCandidate(
    candidateAccountId: string,
    query: ListQueryDto & { status?: string },
  ) {
    return this.withDb('public', async (db) => {
      const conditions = andConditions(
        [eq(candidateApplicationsIndex.candidateAccountId, candidateAccountId)],
        query.status
          ? [eq(candidateApplicationsIndex.status, query.status)]
          : [],
        toWhere(query, [
          candidateApplicationsIndex.jobTitle,
          candidateApplicationsIndex.companyName,
        ]),
      );
      const sortOptions = {
        sortMap: {
          appliedAt: candidateApplicationsIndex.appliedAt,
          jobTitle: candidateApplicationsIndex.jobTitle,
          companyName: candidateApplicationsIndex.companyName,
        },
        defaultSortBy: 'appliedAt',
      };
      const { offset, limit } = toPagination(query);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(candidateApplicationsIndex)
          .where(conditions)
          .orderBy(toOrderBy(query, sortOptions))
          .limit(limit)
          .offset(offset)
          .execute(),
        db
          .select({ value: count() })
          .from(candidateApplicationsIndex)
          .where(conditions)
          .execute(),
      ]);
      return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
    });
  }

  async findAllByCandidate(candidateAccountId: string) {
    return this.withDb('public', (db) =>
      db
        .select()
        .from(candidateApplicationsIndex)
        .where(
          eq(candidateApplicationsIndex.candidateAccountId, candidateAccountId),
        )
        .orderBy(desc(candidateApplicationsIndex.appliedAt))
        .execute(),
    );
  }

  async findByJob(
    candidateAccountId: string,
    companyId: string,
    jobPostingId: string,
  ) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateApplicationsIndex)
        .where(
          and(
            eq(
              candidateApplicationsIndex.candidateAccountId,
              candidateAccountId,
            ),
            eq(candidateApplicationsIndex.companyId, companyId),
            eq(candidateApplicationsIndex.jobPostingId, jobPostingId),
          ),
        )
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async findByCandidateAndApplication(
    candidateAccountId: string,
    applicationId: string,
  ) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateApplicationsIndex)
        .where(
          and(
            eq(
              candidateApplicationsIndex.candidateAccountId,
              candidateAccountId,
            ),
            eq(candidateApplicationsIndex.applicationId, applicationId),
          ),
        )
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async findByApplication(applicationId: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateApplicationsIndex)
        .where(eq(candidateApplicationsIndex.applicationId, applicationId))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async deleteById(id: string) {
    return this.withDb('public', (db) =>
      db
        .delete(candidateApplicationsIndex)
        .where(eq(candidateApplicationsIndex.id, id))
        .execute(),
    );
  }

  async create(data: {
    candidateAccountId: string;
    companyId: string;
    jobPostingId: string;
    applicationId: string;
    jobTitle: string;
    companyName: string;
    status: string;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(candidateApplicationsIndex)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async updateStatus(applicationId: string, companyId: string, status: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(candidateApplicationsIndex)
        .set({ status })
        .where(
          and(
            eq(candidateApplicationsIndex.applicationId, applicationId),
            eq(candidateApplicationsIndex.companyId, companyId),
          ),
        )
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async cancelByCompany(companyId: string) {
    return this.withDb('public', (db) =>
      db
        .update(candidateApplicationsIndex)
        .set({ status: 'cancelled' })
        .where(eq(candidateApplicationsIndex.companyId, companyId))
        .execute(),
    );
  }
}
