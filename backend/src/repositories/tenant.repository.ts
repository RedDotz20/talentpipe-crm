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
  'resumes',
  'resume_skills',
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
    });
  }
}
