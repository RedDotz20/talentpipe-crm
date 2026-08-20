import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '@/database/schema';
import { BaseRepository } from '@/repositories/base.repository';

@Injectable()
export class UserRepository extends BaseRepository {
  async findAll(schema = 'current') {
    return this.withDb(schema, async (db) => {
      return db
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
          presetId: users.presetId,
          name: users.name,
          avatarUrl: users.avatarUrl,
          createdAt: users.createdAt,
        })
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
    data: {
      id: string;
      email: string;
      passwordHash: string;
      role: string;
      presetId?: string | null;
      name?: string | null;
    },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db.insert(users).values(data).returning().execute();
      return rows[0];
    });
  }

  async updateName(id: string, name: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ name })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateAvatarUrl(
    id: string,
    avatarUrl: string | null,
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ avatarUrl })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateRole(id: string, role: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ role, presetId: null })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async updatePreset(id: string, presetId: string | null, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ presetId })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async revertPreset(presetId: string, schema = 'current'): Promise<number> {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ presetId: null })
        .where(eq(users.presetId, presetId))
        .returning({ id: users.id })
        .execute();
      return rows.length;
    });
  }

  async updateStatus(
    id: string,
    status: 'active' | 'suspended',
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ status })
        .where(eq(users.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async setAllStatus(status: 'active' | 'suspended', schema = 'current') {
    return this.withDb(schema, (db) =>
      db.update(users).set({ status }).execute(),
    );
  }

  async resetPassword(id: string, passwordHash: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(users)
        .set({ passwordHash })
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
