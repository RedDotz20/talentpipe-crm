import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { tenants } from '../database/schema';
import { BaseRepository } from './base.repository';

const TENANT_TABLES = [
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
export class TenantRepository extends BaseRepository {
  async findBySlug(slug: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .execute();
      return rows[0] ?? null;
    });
  }

  async findAll() {
    return this.withDb('public', async (db) => {
      return db.select().from(tenants).orderBy(tenants.createdAt).execute();
    });
  }

  async findSuspendedIds() {
    return this.withDb('public', (db) =>
      db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.status, 'suspended'))
        .execute(),
    );
  }

  async updateStatus(id: string, status: 'active' | 'suspended') {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(tenants)
        .set({ status })
        .where(eq(tenants.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateName(id: string, name: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(tenants)
        .set({ name })
        .where(eq(tenants.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async findById(id: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: { id: string; name: string; slug: string }) {
    return this.withDb('public', async (db) => {
      const rows = await db.insert(tenants).values(data).returning().execute();
      return rows[0];
    });
  }

  async provisionSchema(tenantId: string) {
    const schemaName = `tenant_${tenantId}`;
    return this.withDb('public', async (db) => {
      await db.execute(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      for (const table of TENANT_TABLES) {
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
