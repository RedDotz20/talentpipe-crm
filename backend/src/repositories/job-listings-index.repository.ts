import { Injectable } from '@nestjs/common';
import { eq, and, count, inArray, sql } from 'drizzle-orm';
import { jobListingsIndex, companies } from '../database/schema';
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
export class JobListingsIndexRepository extends BaseRepository {
  async findAll(
    query: ListQueryDto & { employmentType?: string; workSetup?: string },
  ) {
    return this.withDb('public', async (db) => {
      const searchColumns = [
        jobListingsIndex.title,
        jobListingsIndex.companyName,
        jobListingsIndex.location,
      ];
      const conditions = andConditions(
        [
          eq(jobListingsIndex.status, 'open'),
          // SQL-side exclusion keeps pagination totals correct: index rows of
          // suspended (or hard-deleted) companies never match. Cast the uuid
          // to varchar: index company_id is varchar and Postgres has no
          // varchar = uuid operator.
          inArray(
            jobListingsIndex.companyId,
            db
              .select({ id: sql<string>`${companies.id}::varchar` })
              .from(companies)
              .where(eq(companies.status, 'active')),
          ),
        ],
        query.employmentType
          ? [eq(jobListingsIndex.employmentType, query.employmentType)]
          : [],
        query.workSetup
          ? [eq(jobListingsIndex.workSetup, query.workSetup)]
          : [],
        toWhere(query, searchColumns),
      );
      const sortOptions = {
        sortMap: {
          createdAt: jobListingsIndex.createdAt,
          title: jobListingsIndex.title,
          companyName: jobListingsIndex.companyName,
        },
        defaultSortBy: 'createdAt',
      };
      const { offset, limit } = toPagination(query);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(jobListingsIndex)
          .where(conditions)
          .orderBy(toOrderBy(query, sortOptions))
          .limit(limit)
          .offset(offset)
          .execute(),
        db
          .select({ value: count() })
          .from(jobListingsIndex)
          .where(conditions)
          .execute(),
      ]);
      return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
    });
  }

  async findOpenByCompany(
    companyId: string,
    query: ListQueryDto & { employmentType?: string; workSetup?: string },
  ) {
    return this.withDb('public', async (db) => {
      const conditions = andConditions(
        [
          eq(jobListingsIndex.companyId, companyId),
          eq(jobListingsIndex.status, 'open'),
        ],
        query.employmentType
          ? [eq(jobListingsIndex.employmentType, query.employmentType)]
          : [],
        query.workSetup
          ? [eq(jobListingsIndex.workSetup, query.workSetup)]
          : [],
        toWhere(query, [jobListingsIndex.title]),
      );
      const sortOptions = {
        sortMap: {
          createdAt: jobListingsIndex.createdAt,
          title: jobListingsIndex.title,
        },
        defaultSortBy: 'createdAt',
      };
      const { offset, limit } = toPagination(query);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(jobListingsIndex)
          .where(conditions)
          .orderBy(toOrderBy(query, sortOptions))
          .limit(limit)
          .offset(offset)
          .execute(),
        db
          .select({ value: count() })
          .from(jobListingsIndex)
          .where(conditions)
          .execute(),
      ]);
      return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
    });
  }

  async findOpenByCompanyAndJob(companyId: string, jobPostingId: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, companyId),
            eq(jobListingsIndex.jobPostingId, jobPostingId),
            eq(jobListingsIndex.status, 'open'),
          ),
        )
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async findById(companyId: string, jobPostingId: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, companyId),
            eq(jobListingsIndex.jobPostingId, jobPostingId),
          ),
        )
        .execute();
      return rows[0] ?? null;
    });
  }

  async upsert(data: {
    companyId: string;
    jobPostingId: string;
    title: string;
    description: string;
    employmentType: string | null;
    location: string | null;
    workSetup: string | null;
    companyName: string;
    companySlug: string;
    status: string;
  }) {
    return this.withDb('public', async (db) => {
      const existing = await db
        .select()
        .from(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, data.companyId),
            eq(jobListingsIndex.jobPostingId, data.jobPostingId),
          ),
        )
        .execute();

      if (existing.length > 0) {
        const rows = await db
          .update(jobListingsIndex)
          .set({
            title: data.title,
            description: data.description,
            employmentType: data.employmentType,
            location: data.location,
            workSetup: data.workSetup,
            companyName: data.companyName,
            companySlug: data.companySlug,
            status: data.status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(jobListingsIndex.companyId, data.companyId),
              eq(jobListingsIndex.jobPostingId, data.jobPostingId),
            ),
          )
          .returning()
          .execute();
        return rows[0];
      } else {
        const rows = await db
          .insert(jobListingsIndex)
          .values(data)
          .returning()
          .execute();
        return rows[0];
      }
    });
  }

  async delete(companyId: string, jobPostingId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(jobListingsIndex)
        .where(
          and(
            eq(jobListingsIndex.companyId, companyId),
            eq(jobListingsIndex.jobPostingId, jobPostingId),
          ),
        )
        .execute(),
    );
  }

  async deleteByCompany(companyId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(jobListingsIndex)
        .where(eq(jobListingsIndex.companyId, companyId))
        .execute(),
    );
  }
}
