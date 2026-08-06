import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class UserRepository extends BaseRepository {
  async findAll(schema = 'current') {
    return this.withDb(schema, async (db) => {
      return db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .orderBy(users.email)
        .execute();
    });
  }

  async findByEmail(email: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async findById(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(
    data: { id: string; email: string; passwordHash: string; role: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db.insert(users).values(data).returning().execute();
      return rows[0];
    });
  }

  async updateRole(id: string, role: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ role })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async remove(id: string, schema = 'current') {
    return this.withDb(schema, (db) =>
      db.delete(users).where(eq(users.id, id)).execute(),
    );
  }
}
