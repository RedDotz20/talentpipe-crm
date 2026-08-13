import { Injectable } from '@nestjs/common';
import { eq, count } from 'drizzle-orm';
import { companies } from '../database/schema';
import { BaseRepository } from './base.repository';
import {
  andConditions,
  listEnvelope,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import { timeBucketedCounts } from './time-series.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';

const COMPANY_TABLES = [
  'users',
  'job_postings',
  'candidates',
  'pipeline_stages',
  'applications',
  'job_required_skills',
  'interviews',
  'interview_feedbacks',
  'notes',
];

@Injectable()
export class CompanyRepository extends BaseRepository {
  async findBySlug(slug: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(companies)
        .where(eq(companies.slug, slug))
        .execute();
      return rows[0] ?? null;
    });
  }

  async findAll() {
    return this.withDb('public', async (db) => {
      return db.select().from(companies).orderBy(companies.createdAt).execute();
    });
  }

  async findCompaniesOverTime() {
    return this.withDb('public', (db) =>
      timeBucketedCounts(db, 'companies', 'created_at'),
    );
  }

  async findPaginated(query: ListQueryDto & { status?: string }) {
    return this.withDb('public', async (db) => {
      const conditions = andConditions(
        query.status ? [eq(companies.status, query.status)] : [],
        toWhere(query, [companies.name, companies.slug]),
      );
      const sortOptions = {
        sortMap: {
          name: companies.name,
          createdAt: companies.createdAt,
        },
        defaultSortBy: 'createdAt',
      };
      const { offset, limit } = toPagination(query);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(companies)
          .where(conditions)
          .orderBy(toOrderBy(query, sortOptions))
          .limit(limit)
          .offset(offset)
          .execute(),
        db
          .select({ value: count() })
          .from(companies)
          .where(conditions)
          .execute(),
      ]);
      return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
    });
  }

  async findAllFiltered(query: ListQueryDto & { status?: string }) {
    return this.withDb('public', async (db) => {
      const conditions = andConditions(
        query.status ? [eq(companies.status, query.status)] : [],
        toWhere(query, [companies.name, companies.slug]),
      );
      return db
        .select()
        .from(companies)
        .where(conditions)
        .orderBy(companies.createdAt)
        .execute();
    });
  }

  async findSuspendedIds() {
    return this.withDb('public', (db) =>
      db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.status, 'suspended'))
        .execute(),
    );
  }

  async updateStatus(id: string, status: 'active' | 'suspended') {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(companies)
        .set({ status })
        .where(eq(companies.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async remove(id: string) {
    return this.withDb('public', (db) =>
      db.delete(companies).where(eq(companies.id, id)).execute(),
    );
  }

  async dropSchema(companyId: string) {
    return this.withDb('public', (db) =>
      db.execute(`DROP SCHEMA IF EXISTS "company_${companyId}" CASCADE`),
    );
  }

  async updateName(id: string, name: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(companies)
        .set({ name })
        .where(eq(companies.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async findById(id: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(companies)
        .where(eq(companies.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: { id: string; name: string; slug: string }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(companies)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async provisionSchema(companyId: string) {
    const schemaName = `company_${companyId}`;
    return this.withDb('public', async (db) => {
      await db.execute(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      for (const table of COMPANY_TABLES) {
        await db.execute(
          `CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" (LIKE template."${table}" INCLUDING ALL)`,
        );
      }
      // LIKE never copies FK constraints; re-apply the platform cascade rules
      // (names must match 20260808100000_platform_account_cascades).
      const cascadeFks = [
        `ALTER TABLE "${schemaName}"."interview_feedbacks" ADD CONSTRAINT interview_feedbacks_interview_id_interviews_id_fkey FOREIGN KEY (interview_id) REFERENCES "${schemaName}"."interviews"(id) ON DELETE CASCADE`,
        `ALTER TABLE "${schemaName}"."interviews" ADD CONSTRAINT interviews_application_id_applications_id_fkey FOREIGN KEY (application_id) REFERENCES "${schemaName}"."applications"(id) ON DELETE CASCADE`,
        `ALTER TABLE "${schemaName}"."notes" ADD CONSTRAINT notes_application_id_applications_id_fkey FOREIGN KEY (application_id) REFERENCES "${schemaName}"."applications"(id) ON DELETE CASCADE`,
        `ALTER TABLE "${schemaName}"."notes" ADD CONSTRAINT notes_author_user_id_users_id_fkey FOREIGN KEY (author_user_id) REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE`,
        `ALTER TABLE "${schemaName}"."job_postings" ADD CONSTRAINT job_postings_created_by_user_id_users_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "${schemaName}"."users"(id) ON DELETE SET NULL`,
      ];
      for (const fk of cascadeFks) {
        await db.execute(fk);
      }
    });
  }
}
