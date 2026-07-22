import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { tenants } from '../database/schema';

@Injectable()
export class TenantRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findBySlug(slug: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db.select().from(tenants).where(eq(tenants.slug, slug)).execute();
    } finally {
      release();
    }
  }

  async findById(id: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db.select().from(tenants).where(eq(tenants.id, id)).execute();
    } finally {
      release();
    }
  }

  async create(data: { name: string; slug: string }) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db.insert(tenants).values(data).returning().execute();
    } finally {
      release();
    }
  }
}
