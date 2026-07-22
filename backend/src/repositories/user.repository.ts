import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { users } from '../database/schema';

@Injectable()
export class UserRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findByEmail(email: string) {
    const { db, release } = await this.drizzleSchema.forCurrentTenant();
    try {
      return db.select().from(users).where(eq(users.email, email)).execute();
    } finally {
      release();
    }
  }

  async findById(id: string) {
    const { db, release } = await this.drizzleSchema.forCurrentTenant();
    try {
      return db.select().from(users).where(eq(users.id, id)).execute();
    } finally {
      release();
    }
  }

  async create(data: { email: string; passwordHash: string; role: string }) {
    const { db, release } = await this.drizzleSchema.forCurrentTenant();
    try {
      return db.insert(users).values(data).returning().execute();
    } finally {
      release();
    }
  }
}
